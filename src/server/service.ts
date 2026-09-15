import { randomUUID } from "node:crypto";
import { type DB, row, rows, tx, settings } from "./db.ts";
import { assert, AppError } from "./errors.ts";
import * as v from "./validate.ts";
import { createAccount, hashPassword, verifyPassword, USER_COLUMNS, sha256 } from "./auth.ts";
import { dateKey, dateTime } from "../shared/format.ts";
import type { CommandResult, Container, Customer, Driver, Truck, User, Rental, Job, Payment, Maintenance, RentalEvent, Audit, Snapshot, Settings } from "../shared/types.ts";
const OPEN = "('RESERVED','DELIVERING','ACTIVE','COLLECTING','RETURNING')";
const TABLES = ["containers", "customers", "drivers", "trucks", "rentals", "jobs", "payments", "maintenance", "users"] as const;
function find<T>(db: DB, table: typeof TABLES[number], id: string): T {
    const found = row<T>(db, `SELECT * FROM ${table} WHERE id=?`, id);
    assert(found, "Registro não encontrado.", 404);
    return found;
}
function audit(db: DB, user: User, action: string, id: string, detail: string, now: string) {
    db.prepare("INSERT INTO audit(id,actorId,action,entityId,detail,createdAt) VALUES(?,?,?,?,?,?)").run(randomUUID(), user.id, action, id, detail, now);
}
function event(db: DB, user: User, rentalId: string, action: string, description: string, now: string, gps = { latitude: null as number | null, longitude: null as number | null }) {
    db.prepare("INSERT INTO rentalEvents(id,rentalId,action,description,actorId,occurredAt,latitude,longitude) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), rentalId, action, description, user.id, now, gps.latitude, gps.longitude);
}
function paid(db: DB, rentalId: string) { return row<{
    total: number;
}>(db, "SELECT COALESCE(SUM(amountCents),0) total FROM payments WHERE rentalId=? AND voidedAt IS NULL", rentalId)!.total; }
function checkVersion(entity: {
    version: number;
}, input: Record<string, unknown>) {
    assert(entity.version === v.integer(input, "version", 1, 2147483647), "Este registro foi alterado por outra pessoa. Atualize a tela antes de continuar.", 409);
}
export function checkResource(db: DB, driverId: string, truckId: string, at: string) {
    const driver = find<Driver>(db, "drivers", driverId), truck = find<Truck>(db, "trucks", truckId);
    assert(driver.active === 1, "O motorista está inativo.", 409);
    assert(driver.license && ["C", "D", "E"].includes(driver.category), "Complete o cadastro e confira a habilitação do motorista.");
    assert(driver.licenseExpiry && driver.licenseExpiry >= dateKey(at), "A validade da CNH deve cobrir a data da operação.");
    assert(truck.status === "AVAILABLE", "O caminhão não está disponível.", 409);
    assert(truck.plate, "Cadastre a placa real do caminhão antes de agendar.");
}
export function checkSlot(db: DB, driverId: string, truckId: string, start: string, duration: number, exceptId = "") {
    const end = Date.parse(start) + duration * 60000;
    const candidates = rows<Job>(db, "SELECT * FROM jobs WHERE status NOT IN ('DONE','CANCELLED') AND id!=? AND (driverId=? OR truckId=?)", exceptId, driverId, truckId);
    const conflict = candidates.find(j => Date.parse(start) < Date.parse(j.scheduledAt) + j.durationMinutes * 60000 && end > Date.parse(j.scheduledAt));
    assert(!conflict, `Conflito de agenda: motorista ou caminhão já possui serviço em ${conflict ? dateTime(conflict.scheduledAt) : "este horário"}. Reserve um intervalo sem sobreposição.`, 409);
}
function schedule(db: DB, rentalId: string, kind: Job['kind'], driverId: string, truckId: string, at: string, duration: number) {
    checkResource(db, driverId, truckId, at);
    checkSlot(db, driverId, truckId, at, duration);
    db.prepare("INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes) VALUES(?,?,?,?,?,?,?)").run(randomUUID(), rentalId, kind, driverId, truckId, at, duration);
}
function createRental(db: DB, u: User, p: Record<string, unknown>, now: string): CommandResult {
    const id = randomUUID(), containerId = v.str(p, "containerId", 1), customerId = v.str(p, "customerId", 1);
    const container = find<Container>(db, "containers", containerId);
    assert(container.status === "AVAILABLE", "Esta caçamba não está disponível. Confira o pátio, a reserva ou a manutenção.", 409);
    assert(container.capacityM3, "Informe a capacidade da caçamba no inventário.");
    assert(find<Customer>(db, "customers", customerId).active === 1, "O cliente está inativo.");
    assert(settings(db).yardAddress.length >= 5, "Configure o endereço do pátio antes de iniciar a operação.");
    const deliveryAt = v.iso(p, "deliveryAt"), pickupAt = v.iso(p, "pickupAt"), duration = v.integer(p, "durationMinutes", 15, 480, 60);
    assert(Date.parse(deliveryAt) >= Date.parse(now) - 300000, "A entrega deve ser agendada para agora ou para o futuro. Movimentações reais são registradas na execução.");
    assert(Date.parse(pickupAt) >= Date.parse(deliveryAt) + (duration + 15) * 60000, "A retirada deve ocorrer após a janela de entrega, com pelo menos 15 minutos de intervalo.");
    const count = row<{
        n: number;
    }>(db, "SELECT COUNT(*) n FROM rentals")!.n + 1;
    const code = `LOC-${String(count).padStart(5, "0")}`;
    const g = v.coordinates(p);
    const values = [id, code, containerId, customerId, v.str(p, "address", 5, 240), v.str(p, "neighborhood", 2, 100), v.str(p, "city", 2, 100), v.str(p, "postalCode", 0, 12), v.str(p, "siteContact", 2, 120), v.phone(p, "sitePhone"), g.latitude, g.longitude, v.str(p, "wasteType", 2, 100), v.str(p, "notes", 0, 2000), deliveryAt, pickupAt, v.integer(p, "priceCents", 0, 100000000), u.id, now];
    db.prepare("INSERT INTO rentals(id,code,containerId,customerId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,wasteType,notes,deliveryAt,pickupAt,priceCents,createdBy,createdAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED')").run(...values);
    schedule(db, id, "DELIVERY", v.str(p, "deliveryDriverId", 1), v.str(p, "deliveryTruckId", 1), deliveryAt, duration);
    schedule(db, id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), pickupAt, duration);
    db.prepare("UPDATE containers SET status='RESERVED' WHERE id=?").run(containerId);
    event(db, u, id, "created", `Reserva ${code} criada. Caçamba ${container.code} separada para este cliente.`, now);
    return { id, message: `Locação ${code} agendada com entrega e retirada.` };
}
function importActiveRental(db: DB, u: User, p: Record<string, unknown>, now: string): CommandResult {
    const id = randomUUID(), containerId = v.str(p, "containerId", 1), customerId = v.str(p, "customerId", 1), container = find<Container>(db, "containers", containerId);
    assert(container.status === "INVENTORY", "A abertura só pode utilizar caçambas ainda não conferidas.", 409);
    assert(p.confirmed === true, "Confirme que esta caçamba já está fisicamente neste cliente.");
    assert(find<Customer>(db, "customers", customerId).active === 1, "O cliente está inativo.");
    assert(settings(db).yardAddress.length >= 5, "Configure o endereço do pátio.");
    const deliveryAt = v.iso(p, "deliveryAt"), pickupAt = v.iso(p, "pickupAt"), duration = v.integer(p, "durationMinutes", 15, 480, 60), capacity = v.num(p, "capacityM3", 0.5, 50);
    assert(deliveryAt <= now, "Na abertura, informe a entrega que já aconteceu.");
    assert(pickupAt > now && Date.parse(pickupAt) > Date.parse(deliveryAt) + 15 * 60000, "Programe uma retirada futura, posterior à entrega.");
    const deliveryDriver = v.str(p, "deliveryDriverId", 1), deliveryTruck = v.str(p, "deliveryTruckId", 1);
    find<Driver>(db, "drivers", deliveryDriver);
    find<Truck>(db, "trucks", deliveryTruck);
    const code = `LOC-${String(row<{
        n: number;
    }>(db, "SELECT COUNT(*) n FROM rentals")!.n + 1).padStart(5, "0")}`, g = v.coordinates(p);
    const notes = `ABERTURA DE OPERAÇÃO: entrega passada declarada pelo administrador, não executada pelo aplicativo. A previsão de entrega utiliza a data declarada como referência. ${v.str(p, "notes", 0, 1800)}`;
    const values = [id, code, containerId, customerId, v.str(p, "address", 5, 240), v.str(p, "neighborhood", 2, 100), v.str(p, "city", 2, 100), v.str(p, "postalCode", 0, 12), v.str(p, "siteContact", 2, 120), v.phone(p, "sitePhone"), g.latitude, g.longitude, v.str(p, "wasteType", 2, 100), notes, deliveryAt, pickupAt, deliveryAt, v.integer(p, "priceCents", 0, 100000000), u.id, now];
    db.prepare("INSERT INTO rentals(id,code,containerId,customerId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,wasteType,notes,deliveryAt,pickupAt,deliveredAt,priceCents,createdBy,createdAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE')").run(...values);
    db.prepare("INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes,status,completedAt) VALUES(?,?,'DELIVERY',?,?,?,?,'DONE',?)").run(randomUUID(), id, deliveryDriver, deliveryTruck, deliveryAt, duration, deliveryAt);
    schedule(db, id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), pickupAt, duration);
    db.prepare("UPDATE containers SET capacityM3=?,status='ON_SITE' WHERE id=?").run(capacity, containerId);
    event(db, u, id, "opening_import", `Abertura declarada por ${u.name}: ${container.code} já estava no cliente. Entrega informada: ${dateTime(deliveryAt)}. A saída real do caminhão não foi registrada neste sistema.`, now);
    return { id, message: "Locação existente registrada e retirada programada. Confira os recebimentos anteriores separadamente." };
}
function transitionRental(db: DB, u: User, p: Record<string, unknown>, now: string): CommandResult {
    const r = find<Rental>(db, "rentals", v.str(p, "id", 1));
    checkVersion(r, p);
    const action = v.choice(p, "action", ["start_delivery", "complete_delivery", "start_pickup", "complete_pickup", "return_yard", "cancel", "abort_delivery", "abort_pickup"] as const);
    const notes = v.str(p, "notes", 0, 1000), gps = v.coordinates(p);
    const expected = { start_delivery: "RESERVED", complete_delivery: "DELIVERING", start_pickup: "ACTIVE", complete_pickup: "COLLECTING", return_yard: "RETURNING", cancel: "RESERVED", abort_delivery: "DELIVERING", abort_pickup: "COLLECTING" };
    assert(r.status === expected[action], "Esta ação não é permitida no estado atual da locação.", 409);
    if (action === "cancel") {
        assert(u.role !== "DRIVER", "Somente a operação pode cancelar.", 403);
        assert(notes.length >= 5, "Informe o motivo do cancelamento.");
        assert(paid(db, r.id) === 0, "Estorne os recebimentos antes de cancelar esta locação.", 409);
        db.prepare("UPDATE rentals SET status='CANCELLED',version=version+1 WHERE id=?").run(r.id);
        db.prepare("UPDATE jobs SET status='CANCELLED',version=version+1 WHERE rentalId=?").run(r.id);
        db.prepare("UPDATE containers SET status='AVAILABLE' WHERE id=?").run(r.containerId);
        event(db, u, r.id, action, notes, now);
        return { id: r.id, message: "Locação cancelada; caçamba liberada." };
    }
    const kind = action.includes("delivery") ? "DELIVERY" : "PICKUP";
    const job = row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind=?", r.id, kind)!;
    assert(u.role !== "DRIVER" || job.driverId === u.driverId, "Este serviço está atribuído a outro motorista.", 403);
    if (action === "abort_delivery" || action === "abort_pickup") {
        assert(job.status === "IN_PROGRESS", "A tentativa de serviço não está em andamento.", 409);
        assert(notes.length >= 5, "Registre o motivo e confirme que o caminhão retornou ao pátio.");
        assert(p.returnConfirmed === true, "Confirme o retorno do caminhão e a situação física da caçamba.");
        db.prepare("UPDATE jobs SET status='SCHEDULED',startedAt=NULL,completedAt=NULL,version=version+1 WHERE id=?").run(job.id);
        db.prepare("UPDATE rentals SET status=?,version=version+1 WHERE id=?").run(action === "abort_delivery" ? "RESERVED" : "ACTIVE", r.id);
        db.prepare("UPDATE containers SET status=? WHERE id=?").run(action === "abort_delivery" ? "RESERVED" : "ON_SITE", r.containerId);
        event(db, u, r.id, action, `Tentativa sem conclusão; saída anterior ${dateTime(job.startedAt)}. Caminhão retornou ao pátio. ${action === "abort_delivery" ? "Caçamba voltou ao pátio e permanece reservada." : "Caçamba permanece no cliente."} Motivo: ${notes}. Reagendamento pendente.`, now, gps);
        return { id: r.id, message: "Tentativa registrada. Reagende o serviço antes de uma nova saída." };
    }
    if (action.startsWith("start_")) {
        assert(job.status === "SCHEDULED", "O serviço já foi iniciado.", 409);
        checkResource(db, job.driverId, job.truckId, now);
        assert(!row(db, "SELECT id FROM jobs WHERE id!=? AND status IN ('IN_PROGRESS','RETURNING') AND (driverId=? OR truckId=?)", job.id, job.driverId, job.truckId), "Caminhão ou motorista ainda possui uma operação em andamento. Finalize o retorno anterior.", 409);
        checkSlot(db, job.driverId, job.truckId, now, job.durationMinutes, job.id);
        if (action === "start_delivery")
            assert(Date.parse(r.pickupAt) > Date.parse(now) + job.durationMinutes * 60000, "A entrega atrasou. Reagende a retirada antes de sair.", 409);
        db.prepare("UPDATE jobs SET status='IN_PROGRESS',startedAt=?,version=version+1 WHERE id=?").run(now, job.id);
        db.prepare("UPDATE rentals SET status=?,version=version+1 WHERE id=?").run(action === "start_delivery" ? "DELIVERING" : "COLLECTING", r.id);
        if (action === "start_delivery")
            db.prepare("UPDATE containers SET status='IN_TRANSIT' WHERE id=?").run(r.containerId);
    }
    else if (action === "complete_delivery") {
        assert(job.status === "IN_PROGRESS", "A entrega ainda não foi iniciada.", 409);
        const receiver = v.str(p, "receiver", 2, 120);
        assert(r.pickupAt > now, "Reagende a retirada: o prazo previsto já passou.", 409);
        db.prepare("UPDATE jobs SET status='DONE',completedAt=?,version=version+1 WHERE id=?").run(now, job.id);
        db.prepare("UPDATE rentals SET status='ACTIVE',deliveredAt=?,version=version+1 WHERE id=?").run(now, r.id);
        db.prepare("UPDATE containers SET status='ON_SITE' WHERE id=?").run(r.containerId);
        event(db, u, r.id, action, `Entrega confirmada. Recebido por: ${receiver}. ${notes}`, now, gps);
        return { id: r.id, message: "Entrega confirmada. Caçamba registrada no local." };
    }
    else if (action === "complete_pickup") {
        assert(job.status === "IN_PROGRESS", "A retirada ainda não foi iniciada.", 409);
        db.prepare("UPDATE jobs SET status='RETURNING',version=version+1 WHERE id=?").run(job.id);
        db.prepare("UPDATE rentals SET status='RETURNING',pickedUpAt=?,version=version+1 WHERE id=?").run(now, r.id);
        db.prepare("UPDATE containers SET status='RETURNING' WHERE id=?").run(r.containerId);
    }
    else {
        assert(job.status === "RETURNING", "Confirme primeiro a coleta no cliente.", 409);
        assert(settings(db).yardAddress.length >= 5, "Configure o pátio de retorno.");
        const condition = v.choice(p, "condition", ["GOOD", "MAINTENANCE"] as const);
        if (condition === "MAINTENANCE")
            assert(notes.length >= 5, "Descreva o reparo necessário.");
        db.prepare("UPDATE jobs SET status='DONE',completedAt=?,version=version+1 WHERE id=?").run(now, job.id);
        db.prepare("UPDATE rentals SET status='COMPLETED',returnedAt=?,version=version+1 WHERE id=?").run(now, r.id);
        db.prepare("UPDATE containers SET status=? WHERE id=?").run(condition === "GOOD" ? "AVAILABLE" : "MAINTENANCE", r.containerId);
        if (condition === "MAINTENANCE")
            db.prepare("INSERT INTO maintenance(id,containerId,description,openedAt,createdBy) VALUES(?,?,?,?,?)").run(randomUUID(), r.containerId, notes, now, u.id);
    }
    const labels = { start_delivery: "Saída para entrega", start_pickup: "Saída para retirada", complete_pickup: "Coleta confirmada; retorno ao pátio pendente", return_yard: "Retorno ao pátio e conferência concluídos", complete_delivery: "Entrega confirmada" };
    const label = labels[action];
    event(db, u, r.id, action, `${label}. ${notes}`, now, gps);
    return { id: r.id, message: label + "." };
}
function reschedule(db: DB, u: User, p: Record<string, unknown>, now: string): CommandResult {
    const j = find<Job>(db, "jobs", v.str(p, "id", 1));
    checkVersion(j, p);
    assert(j.status === "SCHEDULED", "Somente serviços ainda não iniciados podem ser reagendados.", 409);
    const r = find<Rental>(db, "rentals", j.rentalId), at = v.iso(p, "scheduledAt"), duration = v.integer(p, "durationMinutes", 15, 480);
    assert(at >= now, "Escolha um horário futuro.");
    const driverId = v.str(p, "driverId", 1), truckId = v.str(p, "truckId", 1), reason = v.str(p, "reason", 5, 1000);
    if (j.kind === "DELIVERY")
        assert(Date.parse(at) + (duration + 15) * 60000 <= Date.parse(r.pickupAt), "A nova entrega deve terminar antes da retirada, com 15 minutos de intervalo.");
    else {
        const delivery = row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='DELIVERY'", r.id)!;
        const minimum = r.deliveredAt ? Date.parse(r.deliveredAt) + 15 * 60000 : Date.parse(delivery.scheduledAt) + (delivery.durationMinutes + 15) * 60000;
        assert(Date.parse(at) >= minimum, "A retirada deve ser posterior à entrega.");
    }
    checkResource(db, driverId, truckId, at);
    checkSlot(db, driverId, truckId, at, duration, j.id);
    db.prepare("UPDATE jobs SET scheduledAt=?,driverId=?,truckId=?,durationMinutes=?,version=version+1 WHERE id=?").run(at, driverId, truckId, duration, j.id);
    db.prepare(`UPDATE rentals SET ${j.kind === "DELIVERY" ? "deliveryAt" : "pickupAt"}=?,version=version+1 WHERE id=?`).run(at, r.id);
    const oldDriver = find<Driver>(db, "drivers", j.driverId), newDriver = find<Driver>(db, "drivers", driverId);
    const oldTruck = find<Truck>(db, "trucks", j.truckId), newTruck = find<Truck>(db, "trucks", truckId);
    event(db, u, r.id, "rescheduled", `${j.kind === "DELIVERY" ? "Entrega" : "Retirada"}: ${dateTime(j.scheduledAt)} (${oldDriver.name}, ${oldTruck.code}) → ${dateTime(at)} (${newDriver.name}, ${newTruck.code}). Motivo: ${reason}. Valor contratado inalterado.`, now);
    return { id: r.id, message: "Agenda atualizada; valor contratado preservado." };
}
function saveCustomer(db: DB, p: Record<string, unknown>, update: boolean, now: string): CommandResult {
    const id = update ? v.str(p, "id", 1) : randomUUID();
    if (update)
        find<Customer>(db, "customers", id);
    const active = v.integer(p, "active", 0, 1, 1);
    if (!active)
        assert(!row(db, `SELECT id FROM rentals WHERE customerId=? AND status IN ${OPEN}`, id), "Cliente possui locação aberta.", 409);
    const document = v.str(p, "document", 0, 32).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || null;
    if (document)
        assert(!row(db, "SELECT id FROM customers WHERE document=? AND id!=?", document, id), "Já existe um cliente com este documento.", 409);
    const values = [v.str(p, "name", 2, 160), v.str(p, "contact", 2, 120), v.phone(p, "phone"), v.email(p, "email"), document, v.str(p, "address", 0, 300), v.str(p, "notes", 0, 1000), active];
    if (update)
        db.prepare("UPDATE customers SET name=?,contact=?,phone=?,email=?,document=?,address=?,notes=?,active=? WHERE id=?").run(...values, id);
    else
        db.prepare("INSERT INTO customers(name,contact,phone,email,document,address,notes,active,id,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)").run(...values, id, now);
    return { id, message: "Cliente salvo." };
}
function saveDriver(db: DB, p: Record<string, unknown>, update: boolean, now: string): CommandResult {
    const id = update ? v.str(p, "id", 1) : randomUUID();
    if (update)
        find<Driver>(db, "drivers", id);
    const active = v.integer(p, "active", 0, 1, 1), expiry = v.str(p, "licenseExpiry", 10, 10);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(expiry) && Number.isFinite(Date.parse(expiry)) && new Date(expiry).toISOString().slice(0, 10) === expiry, "Data de validade da CNH inválida.");
    if (!active)
        assert(!row(db, "SELECT id FROM jobs WHERE driverId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços pendentes antes de inativar o motorista.", 409);
    const values = [v.str(p, "name", 2, 120), v.phone(p, "phone"), v.str(p, "license", 3, 30), v.choice(p, "category", ["C", "D", "E"] as const), expiry, active];
    if (update)
        db.prepare("UPDATE drivers SET name=?,phone=?,license=?,category=?,licenseExpiry=?,active=? WHERE id=?").run(...values, id);
    else
        db.prepare("INSERT INTO drivers(name,phone,license,category,licenseExpiry,active,id,createdAt) VALUES(?,?,?,?,?,?,?,?)").run(...values, id, now);
    if (!active) {
        db.prepare("DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE driverId=?)").run(id);
        db.prepare("UPDATE users SET active=0 WHERE driverId=?").run(id);
    }
    return { id, message: "Motorista salvo. Confira presencialmente a habilitação e a categoria exigida pelo veículo." };
}
function saveTruck(db: DB, p: Record<string, unknown>, update: boolean, now: string): CommandResult {
    const id = update ? v.str(p, "id", 1) : randomUUID(), old = update ? find<Truck>(db, "trucks", id) : null;
    const code = v.str(p, "code", 2, 24).toUpperCase(), plate = v.str(p, "plate", 0, 12).replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null;
    assert(!plate || /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate), "Informe uma placa brasileira válida (formato antigo ou Mercosul).");
    assert(!row(db, "SELECT id FROM trucks WHERE (code=? OR (plate IS NOT NULL AND plate=?)) AND id!=?", code, plate, id), "Código ou placa já cadastrado.", 409);
    const desired = p.status ? v.choice(p, "status", ["AVAILABLE", "RETIRED"] as const) : old?.status ?? "AVAILABLE";
    if (desired !== old?.status && old) {
        assert(old.status !== "MAINTENANCE", "Encerre a manutenção para liberar o caminhão.");
        assert(!row(db, "SELECT id FROM jobs WHERE truckId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços antes de inativar o caminhão.", 409);
    }
    const values = [code, plate, v.str(p, "model", 0, 100), desired, v.str(p, "notes", 0, 1000)];
    if (update)
        db.prepare("UPDATE trucks SET code=?,plate=?,model=?,status=?,notes=? WHERE id=?").run(...values, id);
    else
        db.prepare("INSERT INTO trucks(code,plate,model,status,notes,id,createdAt) VALUES(?,?,?,?,?,?,?)").run(...values, id, now);
    return { id, message: "Caminhão salvo." };
}
function saveContainer(db: DB, p: Record<string, unknown>, update: boolean, now: string): CommandResult {
    const id = update ? v.str(p, "id", 1) : randomUUID(), old = update ? find<Container>(db, "containers", id) : null;
    const code = v.str(p, "code", 2, 24).toUpperCase();
    assert(/^[A-Z0-9-]+$/.test(code), "Use letras, números e hífen no código.");
    assert(!row(db, "SELECT id FROM containers WHERE code=? AND id!=?", code, id), "Código de caçamba já cadastrado.", 409);
    const capacity = p.capacityM3 == null ? null : v.num(p, "capacityM3", 0.5, 50);
    let status = old?.status ?? "INVENTORY";
    if (p.status && p.status !== status) {
        assert(old && ["AVAILABLE", "RETIRED", "INVENTORY"].includes(old.status), "Não é permitido alterar manualmente uma caçamba em operação.", 409);
        status = v.choice(p, "status", ["RETIRED", "INVENTORY"] as const);
    }
    const values = [code, capacity, status, v.str(p, "notes", 0, 1000)];
    if (update)
        db.prepare("UPDATE containers SET code=?,capacityM3=?,status=?,notes=? WHERE id=?").run(...values, id);
    else
        db.prepare("INSERT INTO containers(code,capacityM3,status,notes,id,createdAt) VALUES(?,?,?,?,?,?)").run(...values, id, now);
    return { id, message: "Caçamba salva. A disponibilidade exige conferência no pátio." };
}
function dispatch(db: DB, u: User, action: string, p: Record<string, unknown>, now: string): CommandResult {
    const admin = ["importActiveRental", "createUser", "setUserActive", "saveSettings", "voidPayment"];
    if (admin.includes(action))
        assert(u.role === "ADMIN", "Acesso exclusivo do administrador.", 403);
    if (u.role === "DRIVER")
        assert(["transitionRental", "changePassword"].includes(action), "O perfil motorista não pode executar esta ação.", 403);
    switch (action) {
        case "createRental": return createRental(db, u, p, now);
        case "importActiveRental": return importActiveRental(db, u, p, now);
        case "transitionRental": return transitionRental(db, u, p, now);
        case "rescheduleJob": return reschedule(db, u, p, now);
        case "createCustomer":
        case "updateCustomer": return saveCustomer(db, p, action === "updateCustomer", now);
        case "createDriver":
        case "updateDriver": return saveDriver(db, p, action === "updateDriver", now);
        case "createTruck":
        case "updateTruck": return saveTruck(db, p, action === "updateTruck", now);
        case "createContainer":
        case "updateContainer": return saveContainer(db, p, action === "updateContainer", now);
        case "confirmInventory": {
            assert(Array.isArray(p.ids) && p.ids.length > 0 && p.ids.length <= 500, "Selecione as caçambas conferidas no pátio.");
            assert(p.confirmed === true, "Confirme a presença física das caçambas selecionadas.");
            const capacity = v.num(p, "capacityM3", 0.5, 50);
            const ids = [...new Set(p.ids)];
            for (const raw of ids) {
                assert(typeof raw === "string", "Identificador inválido.");
                const c = find<Container>(db, "containers", raw);
                assert(c.status === "INVENTORY", `${c.code} não está aguardando conferência.`, 409);
                db.prepare("UPDATE containers SET capacityM3=?,status='AVAILABLE' WHERE id=?").run(capacity, raw);
            }
            return { message: `${ids.length} caçamba(s) conferida(s) e liberada(s) no pátio.` };
        }
        case "addPayment": {
            const r = find<Rental>(db, "rentals", v.str(p, "rentalId", 1));
            assert(r.status !== "CANCELLED", "Locação cancelada não pode receber pagamento.");
            const amount = v.integer(p, "amountCents", 1, 100000000), at = v.iso(p, "paidAt");
            assert(at <= now, "O recebimento não pode ter data futura.");
            assert(paid(db, r.id) + amount <= r.priceCents, "O valor supera o saldo da locação.", 409);
            const id = randomUUID();
            db.prepare("INSERT INTO payments(id,rentalId,amountCents,method,paidAt,note,createdBy) VALUES(?,?,?,?,?,?,?)").run(id, r.id, amount, v.choice(p, "method", ["PIX", "CASH", "TRANSFER", "CARD"] as const), at, v.str(p, "note", 0, 500), u.id);
            event(db, u, r.id, "payment", "Recebimento manual registrado pela operação.", now);
            return { id, message: "Recebimento registrado. Nenhuma cobrança bancária foi executada." };
        }
        case "voidPayment": {
            const pmt = find<Payment>(db, "payments", v.str(p, "id", 1));
            assert(!pmt.voidedAt, "Este recebimento já foi estornado.", 409);
            const reason = v.str(p, "reason", 5, 500);
            db.prepare("UPDATE payments SET voidedAt=?,voidReason=? WHERE id=?").run(now, reason, pmt.id);
            event(db, u, pmt.rentalId, "payment_voided", `Estorno contábil manual: ${reason}. A devolução bancária deve ser feita fora do sistema.`, now);
            return { id: pmt.id, message: "Registro estornado. A devolução do dinheiro não é automática." };
        }
        case "startMaintenance": {
            const resource = v.choice(p, "resource", ["container", "truck"] as const), id = v.str(p, "resourceId", 1), description = v.str(p, "description", 5, 1000);
            const item = resource === "container" ? find<Container>(db, "containers", id) : find<Truck>(db, "trucks", id);
            assert(item.status === "AVAILABLE", "O item deve estar livre para entrar em manutenção.", 409);
            if (resource === "truck")
                assert(!row(db, "SELECT id FROM jobs WHERE truckId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços do caminhão antes de iniciar a manutenção.", 409);
            const mid = randomUUID();
            db.prepare("INSERT INTO maintenance(id,containerId,truckId,description,costCents,openedAt,createdBy) VALUES(?,?,?,?,?,?,?)").run(mid, resource === "container" ? id : null, resource === "truck" ? id : null, description, v.integer(p, "costCents", 0, 100000000, 0), now, u.id);
            db.prepare(`UPDATE ${resource === "container" ? "containers" : "trucks"} SET status='MAINTENANCE' WHERE id=?`).run(id);
            return { id: mid, message: "Manutenção aberta. O equipamento foi bloqueado para operações." };
        }
        case "finishMaintenance": {
            const m = find<Maintenance>(db, "maintenance", v.str(p, "id", 1));
            assert(!m.closedAt, "Manutenção já encerrada.", 409);
            db.prepare("UPDATE maintenance SET closedAt=?,resolution=?,costCents=? WHERE id=?").run(now, v.str(p, "resolution", 5, 1000), v.integer(p, "costCents", 0, 100000000), m.id);
            db.prepare(`UPDATE ${m.containerId ? "containers" : "trucks"} SET status='AVAILABLE' WHERE id=?`).run(m.containerId ?? m.truckId!);
            return { id: m.id, message: "Manutenção concluída e equipamento liberado." };
        }
        case "createUser": {
            const role = v.choice(p, "role", ["ADMIN", "DISPATCHER", "DRIVER"] as const), mail = v.email(p, "email", true);
            assert(!row(db, "SELECT id FROM users WHERE email=?", mail), "Este e-mail já está cadastrado.", 409);
            const driverId = role === "DRIVER" ? v.str(p, "driverId", 1) : null;
            if (driverId) {
                assert(find<Driver>(db, "drivers", driverId).active === 1, "Selecione um motorista ativo.");
                assert(!row(db, "SELECT id FROM users WHERE driverId=?", driverId), "Este motorista já possui um usuário.", 409);
            }
            const id = createAccount(db, { name: v.str(p, "name", 2, 120), email: mail, password: v.secret(p, "password", 12, 128), role, driverId }, now);
            return { id, message: "Usuário criado. Compartilhe a senha por um canal privado." };
        }
        case "setUserActive": {
            const target = find<User>(db, "users", v.str(p, "id", 1)), active = v.integer(p, "active", 0, 1);
            assert(target.id !== u.id, "Você não pode desativar o próprio acesso.");
            if (active && target.driverId)
                assert(find<Driver>(db, "drivers", target.driverId).active === 1, "Reative o cadastro do motorista primeiro.");
            db.prepare("UPDATE users SET active=? WHERE id=?").run(active, target.id);
            if (!active)
                db.prepare("DELETE FROM sessions WHERE userId=?").run(target.id);
            return { id: target.id, message: active ? "Acesso reativado." : "Acesso desativado e sessões revogadas." };
        }
        case "changePassword": {
            const saved = row<{
                passwordHash: string;
            }>(db, "SELECT passwordHash FROM users WHERE id=?", u.id)!;
            assert(verifyPassword(v.secret(p, "currentPassword", 1, 128), saved.passwordHash), "A senha atual está incorreta.");
            const next = v.secret(p, "newPassword", 12, 128);
            assert(!verifyPassword(next, saved.passwordHash), "Escolha uma senha diferente da atual.");
            db.prepare("UPDATE users SET passwordHash=? WHERE id=?").run(hashPassword(next), u.id);
            db.prepare("DELETE FROM sessions WHERE userId=?").run(u.id);
            return { id: u.id, message: "Senha alterada. Entre novamente com a nova senha." };
        }
        case "saveSettings": {
            const s: Settings = { ...settings(db), companyName: v.str(p, "companyName", 2, 120), companyPhone: v.phone(p, "companyPhone", false), yardAddress: v.str(p, "yardAddress", 5, 300), defaultDays: v.integer(p, "defaultDays", 1, 365), defaultPriceCents: v.integer(p, "defaultPriceCents", 0, 100000000), jobDurationMinutes: v.integer(p, "jobDurationMinutes", 15, 480) };
            db.prepare("UPDATE settings SET json=? WHERE id=1").run(JSON.stringify(s));
            return { message: "Configurações salvas." };
        }
        default: throw new AppError("Comando desconhecido.", 400);
    }
}
export function execute(db: DB, actor: User, raw: unknown, key: string, at = new Date()): CommandResult {
    const data = v.object(raw), action = v.str(data, "action", 1, 60), payload = v.object(data.payload);
    assert(/^[a-zA-Z0-9_-]{16,100}$/.test(key), "Chave de operação inválida.");
    const now = at.toISOString(), bodyHash = sha256(JSON.stringify(raw));
    return tx(db, () => {
        const u = row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, actor.id);
        assert(u, "Sessão inválida.", 401);
        const stored = row<{
            userId: string;
            bodyHash: string;
            result: string;
        }>(db, "SELECT userId,bodyHash,result FROM commandReceipts WHERE key=?", key);
        if (stored) {
            assert(stored.userId === u.id && stored.bodyHash === bodyHash, "Chave de operação já utilizada com outros dados.", 409);
            return JSON.parse(stored.result) as CommandResult;
        }
        const result = dispatch(db, u, action, payload, now);
        // Never log passwords or raw request bodies.
        audit(db, u, action, result.id ?? "system", result.message, now);
        db.prepare("INSERT INTO commandReceipts(key,userId,bodyHash,result,createdAt) VALUES(?,?,?,?,?)").run(key, u.id, bodyHash, JSON.stringify(result), now);
        return result;
    });
}
export function snapshot(db: DB, actor: User): Snapshot {
    return tx(db, () => {
        const u = row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, actor.id);
        assert(u, "Sessão expirada.", 401);
        const driver = u.role === "DRIVER";
        const jobs = driver ? rows<Job>(db, "SELECT * FROM jobs WHERE driverId=? ORDER BY scheduledAt", u.driverId!) : rows<Job>(db, "SELECT * FROM jobs ORDER BY scheduledAt");
        const allowed = new Set(jobs.map(j => j.rentalId));
        // Related job metadata is needed for a full history; commands still check each assigned driver.
        const allRentals = driver ? rows<Rental>(db, "SELECT r.* FROM rentals r WHERE EXISTS(SELECT 1 FROM jobs j WHERE j.rentalId=r.id AND j.driverId=?) ORDER BY r.createdAt DESC", u.driverId!) : rows<Rental>(db, "SELECT * FROM rentals ORDER BY createdAt DESC");
        const rentals = allRentals.map(r => driver ? { ...r, priceCents: 0 } : r);
        const containerIds = new Set(rentals.map(r => r.containerId)), customerIds = new Set(rentals.map(r => r.customerId)), truckIds = new Set(jobs.map(j => j.truckId));
        return {
            user: u, settings: driver ? { ...settings(db), defaultPriceCents: 0 } : settings(db), serverTime: new Date().toISOString(),
            containers: rows<Container>(db, "SELECT * FROM containers ORDER BY code").filter(c => !driver || containerIds.has(c.id)),
            trucks: rows<Truck>(db, "SELECT * FROM trucks ORDER BY code").filter(t => !driver || truckIds.has(t.id)),
            drivers: rows<Driver>(db, "SELECT * FROM drivers ORDER BY name").filter(d => !driver || d.id === u.driverId),
            customers: rows<Customer>(db, "SELECT * FROM customers ORDER BY name").filter(c => !driver || customerIds.has(c.id)).map(c => driver ? { ...c, document: null, email: "", address: "", notes: "" } : c),
            rentals, jobs,
            events: rows<RentalEvent>(db, "SELECT e.*,u.name actorName FROM rentalEvents e JOIN users u ON u.id=e.actorId ORDER BY occurredAt DESC").filter(e => (!driver || allowed.has(e.rentalId)) && (!driver || !e.action.startsWith("payment"))),
            payments: driver ? [] : rows<Payment>(db, "SELECT * FROM payments ORDER BY paidAt DESC"),
            maintenance: driver ? [] : rows<Maintenance>(db, "SELECT * FROM maintenance ORDER BY openedAt DESC"),
            users: u.role === "ADMIN" ? rows<User>(db, `SELECT ${USER_COLUMNS} FROM users ORDER BY createdAt`) : [],
            audit: u.role === "ADMIN" ? rows<Audit>(db, "SELECT a.*,u.name actorName FROM audit a JOIN users u ON a.actorId=u.id ORDER BY a.createdAt DESC LIMIT 200") : []
        };
    }, true);
}
