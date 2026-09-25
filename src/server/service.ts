import { randomUUID } from "node:crypto";
import { type DB, row, rows, tx, settings } from "./db.ts";
import { assert, AppError } from "./errors.ts";
import * as v from "./validate.ts";
import { createAccount, hashPassword, verifyPassword, USER_COLUMNS, sha256 } from "./auth.ts";
import { dateKey, dateTime, money } from "../shared/format.ts";
import { rentalGroupCatalog } from "../shared/rental-groups.ts";
import { isSignatureImage } from "../shared/signature.ts";
import type { CommandResult, Container, Customer, CustomerSite, Driver, Truck, User, Rental, Job, Payment, Maintenance, RentalEvent, Audit, Snapshot, Settings, RentalSignature, RentalSignatureRevision, BookingRequest } from "../shared/types.ts";
const OPEN = "('RESERVED','DELIVERING','ACTIVE','COLLECTING','RETURNING')";
const TABLES = ["containers", "customers", "customerSites", "drivers", "trucks", "rentals", "jobs", "payments", "maintenance", "users"] as const;
async function find<T>(db: DB, table: typeof TABLES[number], id: string): Promise<T> {
    const found = await row<T>(db, `SELECT * FROM ${table} WHERE id=?`, id);
    assert(found, "Registro não encontrado.", 404);
    return found;
}
async function audit(db: DB, user: User, action: string, id: string, detail: string, now: string) {
    await db.run("INSERT INTO audit(id,actorId,action,entityId,detail,createdAt) VALUES(?,?,?,?,?,?)", randomUUID(), user.id, action, id, detail, now);
}
function billing(p: Record<string, unknown>): { byMeasurement: number; priceCents: number } {
    const byMeasurement = p.byMeasurement === true || p.byMeasurement === 1;
    return byMeasurement ? { byMeasurement: 1, priceCents: 0 } : { byMeasurement: 0, priceCents: v.integer(p, "priceCents", 0, 100000000) };
}
function flagged(p: Record<string, unknown>, key: string): boolean {
    return p[key] === true || p[key] === 1;
}
function plannedPickup(p: Record<string, unknown>, deliveryAt: string, duration: number): { openEndedPickup: number; pickupAt: string | null } {
    if (flagged(p, "openEndedPickup"))
        return { openEndedPickup: 1, pickupAt: null };
    const pickupAt = v.iso(p, "pickupAt");
    assert(Date.parse(pickupAt) >= Date.parse(deliveryAt) + (duration + 15) * 60000, "A retirada deve ocorrer após a janela de entrega, com pelo menos 15 minutos de intervalo.");
    return { openEndedPickup: 0, pickupAt };
}
function placed(p: Record<string, unknown>) {
    const coords = v.coordinates(p);
    return { ...coords, locationPrecision: v.locationPrecision(p, coords) };
}
async function event(db: DB, user: User, rentalId: string, action: string, description: string, now: string, gps = { latitude: null as number | null, longitude: null as number | null }) {
    await db.run("INSERT INTO rentalEvents(id,rentalId,action,description,actorId,occurredAt,latitude,longitude) VALUES(?,?,?,?,?,?,?,?)", randomUUID(), rentalId, action, description, user.id, now, gps.latitude, gps.longitude);
}
async function paid(db: DB, rentalId: string) { return (await row<{
    total: number;
}>(db, "SELECT COALESCE(SUM(amountCents),0) total FROM payments WHERE rentalId=? AND voidedAt IS NULL", rentalId))!.total; }
function checkVersion(entity: {
    version: number;
}, input: Record<string, unknown>) {
    assert(entity.version === v.integer(input, "version", 1, 2147483647), "Este registro foi alterado por outra pessoa. Atualize a tela antes de continuar.", 409);
}
export async function checkResource(db: DB, driverId: string, truckId: string, at: string) {
    const driver = await find<Driver>(db, "drivers", driverId), truck = await find<Truck>(db, "trucks", truckId);
    assert(driver.active === 1, "O motorista está inativo.", 409);
    assert(driver.license && ["C", "D", "E"].includes(driver.category), "Complete o cadastro e confira a habilitação do motorista.");
    assert(driver.licenseExpiry && driver.licenseExpiry >= dateKey(at), "A validade da CNH deve cobrir a data da operação.");
    assert(truck.status === "AVAILABLE", "O caminhão não está disponível.", 409);
    assert(truck.plate, "Cadastre a placa real do caminhão antes de agendar.");
}
export async function checkSlot(db: DB, driverId: string, truckId: string, start: string, duration: number, exceptId = "") {
    const end = Date.parse(start) + duration * 60000;
    const candidates = await rows<Job>(db, "SELECT * FROM jobs WHERE status NOT IN ('DONE','CANCELLED') AND id!=? AND (driverId=? OR truckId=?)", exceptId, driverId, truckId);
    const conflict = candidates.find(j => Date.parse(start) < Date.parse(j.scheduledAt) + j.durationMinutes * 60000 && end > Date.parse(j.scheduledAt));
    assert(!conflict, `Conflito de agenda: motorista ou caminhão já possui serviço em ${conflict ? dateTime(conflict.scheduledAt) : "este horário"}. Reserve um intervalo sem sobreposição.`, 409);
}
async function assertTeamIdle(db: DB, driverId: string, truckId: string, exceptId = "") {
    assert(!await row(db, "SELECT id FROM jobs WHERE id!=? AND status IN ('IN_PROGRESS','RETURNING') AND (driverId=? OR truckId=?)", exceptId, driverId, truckId), "Caminhão ou motorista ainda possui uma operação em andamento. Finalize o retorno anterior.", 409);
}
async function optionalSite(db: DB, p: Record<string, unknown>, customerId: string): Promise<string | null> {
    const siteId = v.str(p, "siteId", 0);
    if (!siteId)
        return null;
    const site = await find<CustomerSite>(db, "customerSites", siteId);
    assert(site.customerId === customerId, "Este grupo não pertence ao cliente selecionado.");
    assert(site.active === 1, "Este grupo está inativo.");
    return site.id;
}
async function schedule(db: DB, rentalId: string, kind: Job['kind'], driverId: string, truckId: string, at: string, duration: number) {
    await checkResource(db, driverId, truckId, at);
    await checkSlot(db, driverId, truckId, at, duration);
    await db.run("INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes) VALUES(?,?,?,?,?,?,?)", randomUUID(), rentalId, kind, driverId, truckId, at, duration);
}
async function createRental(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const id = randomUUID(), containerId = v.str(p, "containerId", 1), customerId = v.str(p, "customerId", 1);
    const container = await find<Container>(db, "containers", containerId);
    assert(container.status === "AVAILABLE", "Esta caçamba não está disponível. Confira o pátio, a reserva ou a manutenção.", 409);
    assert(container.capacityM3, "Informe a capacidade da caçamba no inventário.");
    assert((await find<Customer>(db, "customers", customerId)).active === 1, "O cliente está inativo.");
    assert((await settings(db)).yardAddress.length >= 5, "Configure o endereço do pátio antes de iniciar a operação.");
    const deliveryAt = v.iso(p, "deliveryAt"), duration = v.integer(p, "durationMinutes", 15, 480, 60);
    assert(Date.parse(deliveryAt) >= Date.parse(now) - 300000, "A entrega deve ser agendada para agora ou para o futuro. Movimentações reais são registradas na execução.");
    const pickup = plannedPickup(p, deliveryAt, duration);
    const count = (await row<{
        n: number;
    }>(db, "SELECT COUNT(*) n FROM rentals"))!.n + 1;
    const code = `LOC-${String(count).padStart(5, "0")}`;
    const g = placed(p), bill = billing(p), siteId = await optionalSite(db, p, customerId);
    const values = [id, code, containerId, customerId, siteId, v.str(p, "address", 5, 240), v.str(p, "neighborhood", 2, 100), v.str(p, "city", 2, 100), v.str(p, "postalCode", 0, 12), v.str(p, "siteContact", 2, 120), v.phone(p, "sitePhone"), g.latitude, g.longitude, g.locationPrecision, v.str(p, "wasteType", 2, 100), v.str(p, "notes", 0, 2000), deliveryAt, pickup.pickupAt, bill.priceCents, bill.byMeasurement, pickup.openEndedPickup, u.id, now];
    await db.run("INSERT INTO rentals(id,code,containerId,customerId,siteId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,locationPrecision,wasteType,notes,deliveryAt,pickupAt,priceCents,byMeasurement,openEndedPickup,createdBy,createdAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED')", ...values);
    await schedule(db, id, "DELIVERY", v.str(p, "deliveryDriverId", 1), v.str(p, "deliveryTruckId", 1), deliveryAt, duration);
    if (!pickup.openEndedPickup && pickup.pickupAt)
        await schedule(db, id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), pickup.pickupAt, duration);
    await db.run("UPDATE containers SET status='RESERVED' WHERE id=?", containerId);
    const site = siteId ? await find<CustomerSite>(db, "customerSites", siteId) : null;
    await event(db, u, id, "created", `Reserva ${code} criada. Caçamba ${container.code} separada para este cliente.${site ? ` Local: ${site.name}.` : ''}${bill.byMeasurement ? ' Cobrança por medição, sem valor fechado.' : ''}${pickup.openEndedPickup ? ' Retirada sob solicitação, sem data combinada.' : ''}`, now);
    return { id, message: pickup.openEndedPickup ? `Locação ${code} agendada. A retirada fica sob solicitação até ser programada.` : `Locação ${code} agendada com entrega e retirada.` };
}
async function importActiveRental(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const id = randomUUID(), containerId = v.str(p, "containerId", 1), customerId = v.str(p, "customerId", 1), container = await find<Container>(db, "containers", containerId);
    assert(container.status === "INVENTORY", "A abertura só pode utilizar caçambas ainda não conferidas.", 409);
    assert(p.confirmed === true, "Confirme que esta caçamba já está fisicamente neste cliente.");
    assert((await find<Customer>(db, "customers", customerId)).active === 1, "O cliente está inativo.");
    assert((await settings(db)).yardAddress.length >= 5, "Configure o endereço do pátio.");
    const deliveryAt = v.iso(p, "deliveryAt"), duration = v.integer(p, "durationMinutes", 15, 480, 60), capacity = v.num(p, "capacityM3", 0.5, 50);
    assert(deliveryAt <= now, "Na abertura, informe a entrega que já aconteceu.");
    const pickup = plannedPickup(p, deliveryAt, duration);
    if (!pickup.openEndedPickup) {
        const pickupAt = pickup.pickupAt;
        assert(pickupAt != null && pickupAt > now, "Programe uma retirada futura, posterior à entrega.");
    }
    const deliveryDriver = v.str(p, "deliveryDriverId", 1), deliveryTruck = v.str(p, "deliveryTruckId", 1);
    await find<Driver>(db, "drivers", deliveryDriver);
    await find<Truck>(db, "trucks", deliveryTruck);
    const code = `LOC-${String((await row<{
        n: number;
    }>(db, "SELECT COUNT(*) n FROM rentals"))!.n + 1).padStart(5, "0")}`, g = placed(p), bill = billing(p), siteId = await optionalSite(db, p, customerId);
    const notes = `ABERTURA DE OPERAÇÃO: entrega passada declarada pelo administrador, não executada pelo aplicativo. A previsão de entrega utiliza a data declarada como referência. ${v.str(p, "notes", 0, 1800)}`;
    const values = [id, code, containerId, customerId, siteId, v.str(p, "address", 5, 240), v.str(p, "neighborhood", 2, 100), v.str(p, "city", 2, 100), v.str(p, "postalCode", 0, 12), v.str(p, "siteContact", 2, 120), v.phone(p, "sitePhone"), g.latitude, g.longitude, g.locationPrecision, v.str(p, "wasteType", 2, 100), notes, deliveryAt, pickup.pickupAt, deliveryAt, bill.priceCents, bill.byMeasurement, pickup.openEndedPickup, u.id, now];
    await db.run("INSERT INTO rentals(id,code,containerId,customerId,siteId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,locationPrecision,wasteType,notes,deliveryAt,pickupAt,deliveredAt,priceCents,byMeasurement,openEndedPickup,createdBy,createdAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE')", ...values);
    await db.run("INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes,status,completedAt) VALUES(?,?,'DELIVERY',?,?,?,?,'DONE',?)", randomUUID(), id, deliveryDriver, deliveryTruck, deliveryAt, duration, deliveryAt);
    if (!pickup.openEndedPickup && pickup.pickupAt)
        await schedule(db, id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), pickup.pickupAt, duration);
    await db.run("UPDATE containers SET capacityM3=?,status='ON_SITE' WHERE id=?", capacity, containerId);
    await event(db, u, id, "opening_import", `Abertura declarada por ${u.name}: ${container.code} já estava no cliente. Entrega informada: ${dateTime(deliveryAt)}. A saída real do caminhão não foi registrada neste sistema.`, now);
    return { id, message: "Locação existente registrada e retirada programada. Confira os recebimentos anteriores separadamente." };
}
async function transitionRental(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    let r = await find<Rental>(db, "rentals", v.str(p, "id", 1));
    checkVersion(r, p);
    const action = v.choice(p, "action", ["start_delivery", "complete_delivery", "start_pickup", "complete_pickup", "return_yard", "cancel", "abort_delivery", "abort_pickup"] as const);
    const notes = v.str(p, "notes", 0, 1000), gps = v.coordinates(p);
    const expected = { start_delivery: "RESERVED", complete_delivery: "DELIVERING", start_pickup: "ACTIVE", complete_pickup: "COLLECTING", return_yard: "RETURNING", cancel: "RESERVED", abort_delivery: "DELIVERING", abort_pickup: "COLLECTING" };
    assert(r.status === expected[action], "Esta ação não é permitida no estado atual da locação.", 409);
    if (action === "cancel") {
        assert(u.role !== "DRIVER", "Somente a operação pode cancelar.", 403);
        assert(notes.length >= 5, "Informe o motivo do cancelamento.");
        assert(await paid(db, r.id) === 0, "Estorne os recebimentos antes de cancelar esta locação.", 409);
        await db.run("UPDATE rentals SET status='CANCELLED',version=version+1 WHERE id=?", r.id);
        await db.run("UPDATE jobs SET status='CANCELLED',version=version+1 WHERE rentalId=?", r.id);
        await db.run("UPDATE containers SET status='AVAILABLE' WHERE id=?", r.containerId);
        await event(db, u, r.id, action, notes, now);
        return { id: r.id, message: "Locação cancelada; caçamba liberada." };
    }
    const kind = action.includes("delivery") ? "DELIVERY" : "PICKUP";
    let job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind=?", r.id, kind);
    if (!job && action === "start_pickup" && r.openEndedPickup) {
        const duration = v.integer(p, "durationMinutes", 15, 480, (await settings(db)).jobDurationMinutes);
        await schedule(db, r.id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), now, duration);
        await db.run("UPDATE rentals SET pickupAt=?,openEndedPickup=0,version=version+1 WHERE id=?", now, r.id);
        r = await find<Rental>(db, "rentals", r.id);
        job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind=?", r.id, kind);
    }
    assert(job, "Programe a retirada antes de executar esta etapa.", 409);
    assert(u.role !== "DRIVER" || job.driverId === u.driverId, "Este serviço está atribuído a outro motorista.", 403);
    if (action === "abort_delivery" || action === "abort_pickup") {
        assert(job.status === "IN_PROGRESS", "A tentativa de serviço não está em andamento.", 409);
        assert(notes.length >= 5, "Registre o motivo e confirme que o caminhão retornou ao pátio.");
        assert(p.returnConfirmed === true, "Confirme o retorno do caminhão e a situação física da caçamba.");
        await db.run("UPDATE jobs SET status='SCHEDULED',startedAt=NULL,completedAt=NULL,version=version+1 WHERE id=?", job.id);
        await db.run("UPDATE rentals SET status=?,version=version+1 WHERE id=?", action === "abort_delivery" ? "RESERVED" : "ACTIVE", r.id);
        await db.run("UPDATE containers SET status=? WHERE id=?", action === "abort_delivery" ? "RESERVED" : "ON_SITE", r.containerId);
        await event(db, u, r.id, action, `Tentativa sem conclusão; saída anterior ${dateTime(job.startedAt)}. Caminhão retornou ao pátio. ${action === "abort_delivery" ? "Caçamba voltou ao pátio e permanece reservada." : "Caçamba permanece no cliente."} Motivo: ${notes}. Reagendamento pendente.`, now, gps);
        return { id: r.id, message: "Tentativa registrada. Reagende o serviço antes de uma nova saída." };
    }
    if (action.startsWith("start_")) {
        assert(job.status === "SCHEDULED", "O serviço já foi iniciado.", 409);
        await checkResource(db, job.driverId, job.truckId, now);
        await assertTeamIdle(db, job.driverId, job.truckId, job.id);
        await checkSlot(db, job.driverId, job.truckId, now, job.durationMinutes, job.id);
        if (action === "start_delivery" && r.pickupAt)
            assert(Date.parse(r.pickupAt) > Date.parse(now) + job.durationMinutes * 60000, "A entrega atrasou. Reagende a retirada antes de sair.", 409);
        await db.run("UPDATE jobs SET status='IN_PROGRESS',startedAt=?,version=version+1 WHERE id=?", now, job.id);
        await db.run("UPDATE rentals SET status=?,version=version+1 WHERE id=?", action === "start_delivery" ? "DELIVERING" : "COLLECTING", r.id);
        if (action === "start_delivery")
            await db.run("UPDATE containers SET status='IN_TRANSIT' WHERE id=?", r.containerId);
    }
    else if (action === "complete_delivery") {
        assert(job.status === "IN_PROGRESS", "A entrega ainda não foi iniciada.", 409);
        const receiver = v.str(p, "receiver", 2, 120);
        if (r.pickupAt)
            assert(r.pickupAt > now, "Reagende a retirada: o prazo previsto já passou.", 409);
        await db.run("UPDATE jobs SET status='DONE',completedAt=?,version=version+1 WHERE id=?", now, job.id);
        await db.run("UPDATE rentals SET status='ACTIVE',deliveredAt=?,version=version+1 WHERE id=?", now, r.id);
        await db.run("UPDATE containers SET status='ON_SITE' WHERE id=?", r.containerId);
        await event(db, u, r.id, action, `Entrega confirmada. Recebido por: ${receiver}. ${notes}`, now, gps);
        return { id: r.id, message: "Entrega confirmada. Caçamba registrada no local." };
    }
    else if (action === "complete_pickup") {
        assert(job.status === "IN_PROGRESS", "A retirada ainda não foi iniciada.", 409);
        await db.run("UPDATE jobs SET status='RETURNING',version=version+1 WHERE id=?", job.id);
        await db.run("UPDATE rentals SET status='RETURNING',pickedUpAt=?,version=version+1 WHERE id=?", now, r.id);
        await db.run("UPDATE containers SET status='RETURNING' WHERE id=?", r.containerId);
    }
    else {
        assert(job.status === "RETURNING", "Confirme primeiro a coleta no cliente.", 409);
        assert((await settings(db)).yardAddress.length >= 5, "Configure o pátio de retorno.");
        const condition = v.choice(p, "condition", ["GOOD", "MAINTENANCE"] as const);
        if (condition === "MAINTENANCE")
            assert(notes.length >= 5, "Descreva o reparo necessário.");
        await db.run("UPDATE jobs SET status='DONE',completedAt=?,version=version+1 WHERE id=?", now, job.id);
        await db.run("UPDATE rentals SET status='COMPLETED',returnedAt=?,version=version+1 WHERE id=?", now, r.id);
        await db.run("UPDATE containers SET status=? WHERE id=?", condition === "GOOD" ? "AVAILABLE" : "MAINTENANCE", r.containerId);
        if (condition === "MAINTENANCE")
            await db.run("INSERT INTO maintenance(id,containerId,description,openedAt,createdBy) VALUES(?,?,?,?,?)", randomUUID(), r.containerId, notes, now, u.id);
    }
    const labels = { start_delivery: "Saída para entrega", start_pickup: "Saída para retirada", complete_pickup: "Coleta confirmada; retorno ao pátio pendente", return_yard: "Retorno ao pátio e conferência concluídos", complete_delivery: "Entrega confirmada" };
    const label = labels[action];
    await event(db, u, r.id, action, `${label}. ${notes}`, now, gps);
    return { id: r.id, message: label + "." };
}
async function startPickupNow(db: DB, job: Job, rentalId: string, now: string): Promise<Job> {
    assert(job.status === "SCHEDULED", "O serviço já foi iniciado.", 409);
    await checkResource(db, job.driverId, job.truckId, now);
    await assertTeamIdle(db, job.driverId, job.truckId, job.id);
    await checkSlot(db, job.driverId, job.truckId, now, job.durationMinutes, job.id);
    await db.run("UPDATE jobs SET status='IN_PROGRESS',startedAt=?,version=version+1 WHERE id=?", now, job.id);
    await db.run("UPDATE rentals SET status='COLLECTING',version=version+1 WHERE id=?", rentalId);
    return (await row<Job>(db, "SELECT * FROM jobs WHERE id=?", job.id))!;
}
async function confirmPickup(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    let r = await find<Rental>(db, "rentals", v.str(p, "id", 1));
    checkVersion(r, p);
    assert(p.confirmed === true, "Confirme o resumo da retirada antes de registrar a coleta.");
    assert(!r.pickedUpAt, "Esta caçamba já foi retirada.", 409);
    assert(["ACTIVE", "COLLECTING"].includes(r.status), "A retirada só pode ser registrada com a caçamba no cliente.", 409);
    let job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='PICKUP'", r.id);
    if (!job) {
        assert(u.role !== "DRIVER", "Programe a retirada antes de registrar a coleta.", 403);
        const driverId = v.str(p, "pickupDriverId", 1), truckId = v.str(p, "pickupTruckId", 1);
        const duration = v.integer(p, "durationMinutes", 15, 480, (await settings(db)).jobDurationMinutes);
        await schedule(db, r.id, "PICKUP", driverId, truckId, now, duration);
        await db.run("UPDATE rentals SET pickupAt=?,openEndedPickup=0,version=version+1 WHERE id=?", now, r.id);
        r = await find<Rental>(db, "rentals", r.id);
        job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='PICKUP'", r.id);
    }
    assert(job, "Programe a retirada antes de registrar a coleta.", 409);
    assert(u.role !== "DRIVER" || job.driverId === u.driverId, "Este serviço está atribuído a outro motorista.", 403);
    if (job.status === "SCHEDULED")
        job = await startPickupNow(db, job, r.id, now);
    assert(job.status === "IN_PROGRESS", "A retirada ainda não foi iniciada.", 409);
    await db.run("UPDATE jobs SET status='RETURNING',version=version+1 WHERE id=?", job.id);
    await db.run("UPDATE rentals SET status='RETURNING',pickedUpAt=?,version=version+1 WHERE id=?", now, r.id);
    await db.run("UPDATE containers SET status='RETURNING' WHERE id=?", r.containerId);
    await event(db, u, r.id, "complete_pickup", `Coleta confirmada com resumo da equipe. Retirada em ${dateTime(now)}. Retorno ao pátio pendente.`, now);
    return { id: r.id, message: `Retirada registrada em ${dateTime(now)}.` };
}
async function schedulePickup(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const r = await find<Rental>(db, "rentals", v.str(p, "id", 1));
    checkVersion(r, p);
    assert(["RESERVED", "DELIVERING", "ACTIVE"].includes(r.status), "Esta locação não pode receber programação de retirada.", 409);
    assert(!await row(db, "SELECT id FROM jobs WHERE rentalId=? AND kind='PICKUP'", r.id), "A retirada já está programada.", 409);
    const at = v.iso(p, "scheduledAt"), duration = v.integer(p, "durationMinutes", 15, 480, (await settings(db)).jobDurationMinutes);
    assert(at >= now, "Escolha um horário futuro para a retirada.");
    const minimum = r.deliveredAt ? Date.parse(r.deliveredAt) + 15 * 60000 : Date.parse(r.deliveryAt) + (duration + 15) * 60000;
    assert(Date.parse(at) >= minimum, "A retirada deve ser posterior à entrega.");
    await schedule(db, r.id, "PICKUP", v.str(p, "pickupDriverId", 1), v.str(p, "pickupTruckId", 1), at, duration);
    await db.run("UPDATE rentals SET pickupAt=?,openEndedPickup=0,version=version+1 WHERE id=?", at, r.id);
    await event(db, u, r.id, "pickup_scheduled", `Retirada programada para ${dateTime(at)}. A coleta ainda não foi executada.`, now);
    return { id: r.id, message: "Retirada programada. A caçamba permanece no cliente até a coleta." };
}
async function regularizePickup(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const r = await find<Rental>(db, "rentals", v.str(p, "id", 1));
    checkVersion(r, p);
    assert(u.role !== "DRIVER", "Somente a operação pode regularizar uma coleta já ocorrida.", 403);
    assert(!r.pickedUpAt, "Esta caçamba já foi retirada.", 409);
    assert(["ACTIVE", "COLLECTING"].includes(r.status), "A regularização só se aplica com a caçamba ainda no cliente.", 409);
    const reason = v.str(p, "reason", 8, 1000);
    const driverId = v.str(p, "pickupDriverId", 1), truckId = v.str(p, "pickupTruckId", 1);
    const duration = v.integer(p, "durationMinutes", 15, 480, (await settings(db)).jobDurationMinutes);
    await checkResource(db, driverId, truckId, now);
    const existingPickup = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='PICKUP'", r.id);
    await assertTeamIdle(db, driverId, truckId, existingPickup?.id ?? "");
    await checkSlot(db, driverId, truckId, now, duration, existingPickup?.id ?? "");
    let job = existingPickup;
    if (!job) {
        await db.run("INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes,status,startedAt) VALUES(?,?,?,?,?,?,?,'RETURNING',NULL)", randomUUID(), r.id, "PICKUP", driverId, truckId, now, duration);
        job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='PICKUP'", r.id);
    }
    else if (job.status === "SCHEDULED" || job.status === "IN_PROGRESS")
        await db.run("UPDATE jobs SET status='RETURNING',driverId=?,truckId=?,startedAt=COALESCE(startedAt, NULL),version=version+1 WHERE id=?", driverId, truckId, job.id);
    else
        assert(false, "Esta retirada já avançou para outra etapa.", 409);
    await db.run("UPDATE rentals SET status='RETURNING',pickupAt=COALESCE(pickupAt,?),openEndedPickup=0,pickedUpAt=?,version=version+1 WHERE id=?", now, now, r.id);
    await db.run("UPDATE containers SET status='RETURNING' WHERE id=?", r.containerId);
    await event(db, u, r.id, "pickup_regularized", `Coleta regularizada sem inventar horário de saída. Motivo: ${reason}. Retorno ao pátio pendente.`, now);
    return { id: r.id, message: "Coleta regularizada. Confira o retorno no pátio." };
}
async function saveRentalSignatures(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const r = await find<Rental>(db, "rentals", v.str(p, "rentalId", 1));
    assert(r.status !== "CANCELLED", "Locação cancelada não pode receber assinatura.", 409);
    const kind = v.choice(p, "kind", ["DELIVERY", "PICKUP"] as const);
    const job = await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind=?", r.id, kind)
        ?? await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='DELIVERY'", r.id);
    assert(u.role !== "DRIVER" || Boolean(job && job.driverId === u.driverId), "Este serviço está atribuído a outro motorista.", 403);
    const existing = await rows<RentalSignature>(db, "SELECT * FROM rentalSignatures WHERE rentalId=? AND kind=?", r.id, kind);
    assert(!existing.length || u.role !== "DRIVER", "As assinaturas desta etapa já foram registradas.", 409);
    const replaceReason = existing.length ? v.str(p, "replaceReason", 5, 500) : "";
    const responsibleName = v.str(p, "responsibleName", 2, 120), driverName = v.str(p, "driverName", 2, 120);
    const responsibleImage = v.str(p, "responsibleImage", 80, 60000), driverImage = v.str(p, "driverImage", 80, 60000);
    assert(isSignatureImage(responsibleImage) && isSignatureImage(driverImage), "A assinatura precisa ser um desenho PNG válido.");
    for (const previous of existing)
        await db.run("INSERT INTO rentalSignatureRevisions(id,rentalId,kind,role,signerName,image,signedAt,actorId,replacedAt,replacedBy,replaceReason) VALUES(?,?,?,?,?,?,?,?,?,?,?)", randomUUID(), previous.rentalId, previous.kind, previous.role, previous.signerName, previous.image, previous.signedAt, previous.actorId, now, u.id, replaceReason);
    await db.run("DELETE FROM rentalSignatures WHERE rentalId=? AND kind=?", r.id, kind);
    await db.run("INSERT INTO rentalSignatures(id,rentalId,kind,role,signerName,image,signedAt,actorId) VALUES(?,?,?,?,?,?,?,?)", randomUUID(), r.id, kind, "RESPONSIBLE", responsibleName, responsibleImage, now, u.id);
    await db.run("INSERT INTO rentalSignatures(id,rentalId,kind,role,signerName,image,signedAt,actorId) VALUES(?,?,?,?,?,?,?,?)", randomUUID(), r.id, kind, "DRIVER", driverName, driverImage, now, u.id);
    const label = kind === "DELIVERY" ? "entrega" : "retirada / troca";
    await event(db, u, r.id, kind === "DELIVERY" ? "sign_delivery" : "sign_pickup", existing.length
        ? `Assinaturas digitais da ${label} substituídas por ${u.name}. Motivo: ${replaceReason}. Novos signatários: ${responsibleName} e ${driverName}.`
        : `Assinaturas digitais da ${label} registradas: ${responsibleName} e ${driverName}.`, now);
    return { id: r.id, message: existing.length ? `Assinaturas da ${label} substituídas. A versão anterior foi preservada.` : `Assinaturas da ${label} salvas no sistema.` };
}
async function reschedule(db: DB, u: User, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const j = await find<Job>(db, "jobs", v.str(p, "id", 1));
    checkVersion(j, p);
    assert(j.status === "SCHEDULED", "Somente serviços ainda não iniciados podem ser reagendados.", 409);
    const r = await find<Rental>(db, "rentals", j.rentalId), at = v.iso(p, "scheduledAt"), duration = v.integer(p, "durationMinutes", 15, 480);
    assert(at >= now, "Escolha um horário futuro.");
    const driverId = v.str(p, "driverId", 1), truckId = v.str(p, "truckId", 1), reason = v.str(p, "reason", 5, 1000);
    if (j.kind === "DELIVERY") {
        if (r.pickupAt)
            assert(Date.parse(at) + (duration + 15) * 60000 <= Date.parse(r.pickupAt), "A nova entrega deve terminar antes da retirada, com 15 minutos de intervalo.");
    }
    else {
        const delivery = (await row<Job>(db, "SELECT * FROM jobs WHERE rentalId=? AND kind='DELIVERY'", r.id))!;
        const minimum = r.deliveredAt ? Date.parse(r.deliveredAt) + 15 * 60000 : Date.parse(delivery.scheduledAt) + (delivery.durationMinutes + 15) * 60000;
        assert(Date.parse(at) >= minimum, "A retirada deve ser posterior à entrega.");
    }
    await checkResource(db, driverId, truckId, at);
    await checkSlot(db, driverId, truckId, at, duration, j.id);
    await db.run("UPDATE jobs SET scheduledAt=?,driverId=?,truckId=?,durationMinutes=?,version=version+1 WHERE id=?", at, driverId, truckId, duration, j.id);
    await db.run(`UPDATE rentals SET ${j.kind === "DELIVERY" ? "deliveryAt" : "pickupAt"}=?,version=version+1 WHERE id=?`, at, r.id);
    const oldDriver = await find<Driver>(db, "drivers", j.driverId), newDriver = await find<Driver>(db, "drivers", driverId);
    const oldTruck = await find<Truck>(db, "trucks", j.truckId), newTruck = await find<Truck>(db, "trucks", truckId);
    await event(db, u, r.id, "rescheduled", `${j.kind === "DELIVERY" ? "Entrega" : "Retirada"}: ${dateTime(j.scheduledAt)} (${oldDriver.name}, ${oldTruck.code}) → ${dateTime(at)} (${newDriver.name}, ${newTruck.code}). Motivo: ${reason}. Valor contratado inalterado.`, now);
    return { id: r.id, message: "Agenda atualizada; valor contratado preservado." };
}
async function saveCustomer(db: DB, p: Record<string, unknown>, update: boolean, now: string): Promise<CommandResult> {
    const id = update ? v.str(p, "id", 1) : randomUUID();
    if (update)
        await find<Customer>(db, "customers", id);
    const active = v.integer(p, "active", 0, 1, 1);
    if (!active)
        assert(!await row(db, `SELECT id FROM rentals WHERE customerId=? AND status IN ${OPEN}`, id), "Cliente possui locação aberta.", 409);
    const document = v.str(p, "document", 0, 32).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || null;
    if (document)
        assert(!await row(db, "SELECT id FROM customers WHERE document=? AND id!=?", document, id), "Já existe um cliente com este documento.", 409);
    const values = [v.str(p, "name", 2, 160), v.str(p, "contact", 2, 120), v.phone(p, "phone"), v.email(p, "email"), document, v.str(p, "address", 0, 300), v.str(p, "notes", 0, 1000), active];
    if (update)
        await db.run("UPDATE customers SET name=?,contact=?,phone=?,email=?,document=?,address=?,notes=?,active=? WHERE id=?", ...values, id);
    else
        await db.run("INSERT INTO customers(name,contact,phone,email,document,address,notes,active,id,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)", ...values, id, now);
    return { id, message: "Cliente salvo." };
}
async function saveCustomerSite(db: DB, p: Record<string, unknown>, update: boolean, now: string): Promise<CommandResult> {
    const id = update ? v.str(p, "id", 1) : randomUUID();
    const existing = update ? await find<CustomerSite>(db, "customerSites", id) : null;
    const customerId = existing?.customerId ?? v.str(p, "customerId", 1);
    await find<Customer>(db, "customers", customerId);
    const name = v.str(p, "name", 2, 80);
    assert(!await row(db, "SELECT id FROM customerSites WHERE customerId=? AND LOWER(name)=LOWER(?) AND id!=?", customerId, name, id), "Já existe um grupo com este nome neste cliente.", 409);
    const g = placed(p), active = v.integer(p, "active", 0, 1, 1);
    const values = [name, v.str(p, "address", 5, 240), v.str(p, "neighborhood", 2, 100), v.str(p, "city", 2, 100), v.str(p, "postalCode", 0, 12), v.str(p, "contact", 0, 120), v.phone(p, "phone", false), g.latitude, g.longitude, g.locationPrecision, v.str(p, "notes", 0, 1000), active];
    if (update)
        await db.run("UPDATE customerSites SET name=?,address=?,neighborhood=?,city=?,postalCode=?,contact=?,phone=?,latitude=?,longitude=?,locationPrecision=?,notes=?,active=? WHERE id=?", ...values, id);
    else
        await db.run("INSERT INTO customerSites(name,address,neighborhood,city,postalCode,contact,phone,latitude,longitude,locationPrecision,notes,active,id,customerId,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ...values, id, customerId, now);
    return { id, message: "Grupo de locação salvo." };
}
async function importRentalGroups(db: DB, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const customerId = v.str(p, "customerId", 1);
    const customer = await find<Customer>(db, "customers", customerId);
    const catalog = rentalGroupCatalog(customer.document);
    assert(catalog.length > 0, "Este cliente não tem grupos oficiais publicados. Cadastre os locais um a um.", 404);
    let created = 0;
    for (const site of catalog) {
        if (await row(db, "SELECT id FROM customerSites WHERE customerId=? AND LOWER(name)=LOWER(?)", customerId, site.name))
            continue;
        await saveCustomerSite(db, { customerId, name: site.name, address: site.address, neighborhood: site.neighborhood, city: site.city, postalCode: site.postalCode, contact: customer.contact, phone: customer.phone, notes: site.notes, active: 1 }, false, now);
        created++;
    }
    return { id: customerId, message: created ? `${created} grupo(s) de locação cadastrado(s) a partir do endereço oficial da cooperativa.` : "Os grupos oficiais deste cliente já estavam cadastrados." };
}
async function saveDriver(db: DB, p: Record<string, unknown>, update: boolean, now: string): Promise<CommandResult> {
    const id = update ? v.str(p, "id", 1) : randomUUID();
    if (update)
        await find<Driver>(db, "drivers", id);
    const active = v.integer(p, "active", 0, 1, 1), expiry = v.str(p, "licenseExpiry", 10, 10);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(expiry) && Number.isFinite(Date.parse(expiry)) && new Date(expiry).toISOString().slice(0, 10) === expiry, "Data de validade da CNH inválida.");
    if (!active)
        assert(!await row(db, "SELECT id FROM jobs WHERE driverId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços pendentes antes de inativar o motorista.", 409);
    const values = [v.str(p, "name", 2, 120), v.phone(p, "phone"), v.str(p, "license", 3, 30), v.choice(p, "category", ["C", "D", "E"] as const), expiry, active];
    if (update)
        await db.run("UPDATE drivers SET name=?,phone=?,license=?,category=?,licenseExpiry=?,active=? WHERE id=?", ...values, id);
    else
        await db.run("INSERT INTO drivers(name,phone,license,category,licenseExpiry,active,id,createdAt) VALUES(?,?,?,?,?,?,?,?)", ...values, id, now);
    if (!active) {
        await db.run("DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE driverId=?)", id);
        await db.run("UPDATE users SET active=0 WHERE driverId=?", id);
    }
    return { id, message: "Motorista salvo. Confira presencialmente a habilitação e a categoria exigida pelo veículo." };
}
async function saveTruck(db: DB, p: Record<string, unknown>, update: boolean, now: string): Promise<CommandResult> {
    const id = update ? v.str(p, "id", 1) : randomUUID(), old = update ? await find<Truck>(db, "trucks", id) : null;
    const code = v.str(p, "code", 2, 24).toUpperCase(), plate = v.str(p, "plate", 0, 12).replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null;
    assert(!plate || /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate), "Informe uma placa brasileira válida (formato antigo ou Mercosul).");
    assert(!await row(db, "SELECT id FROM trucks WHERE (code=? OR (plate IS NOT NULL AND plate=?)) AND id!=?", code, plate, id), "Código ou placa já cadastrado.", 409);
    const desired = p.status ? v.choice(p, "status", ["AVAILABLE", "RETIRED"] as const) : old?.status ?? "AVAILABLE";
    if (desired !== old?.status && old) {
        assert(old.status !== "MAINTENANCE", "Encerre a manutenção para liberar o caminhão.");
        assert(!await row(db, "SELECT id FROM jobs WHERE truckId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços antes de inativar o caminhão.", 409);
    }
    const values = [code, plate, v.str(p, "model", 0, 100), desired, v.str(p, "notes", 0, 1000)];
    if (update)
        await db.run("UPDATE trucks SET code=?,plate=?,model=?,status=?,notes=? WHERE id=?", ...values, id);
    else
        await db.run("INSERT INTO trucks(code,plate,model,status,notes,id,createdAt) VALUES(?,?,?,?,?,?,?)", ...values, id, now);
    return { id, message: "Caminhão salvo." };
}
async function saveContainer(db: DB, p: Record<string, unknown>, update: boolean, now: string): Promise<CommandResult> {
    const id = update ? v.str(p, "id", 1) : randomUUID(), old = update ? await find<Container>(db, "containers", id) : null;
    const code = v.str(p, "code", 2, 24).toUpperCase();
    assert(/^[A-Z0-9-]+$/.test(code), "Use letras, números e hífen no código.");
    assert(!await row(db, "SELECT id FROM containers WHERE code=? AND id!=?", code, id), "Código de caçamba já cadastrado.", 409);
    const capacity = p.capacityM3 == null ? null : v.num(p, "capacityM3", 0.5, 50);
    let status = old?.status ?? "INVENTORY";
    if (p.status && p.status !== status) {
        assert(old && ["AVAILABLE", "RETIRED", "INVENTORY"].includes(old.status), "Não é permitido alterar manualmente uma caçamba em operação.", 409);
        status = v.choice(p, "status", ["RETIRED", "INVENTORY"] as const);
    }
    const values = [code, capacity, status, v.str(p, "notes", 0, 1000)];
    if (update)
        await db.run("UPDATE containers SET code=?,capacityM3=?,status=?,notes=? WHERE id=?", ...values, id);
    else
        await db.run("INSERT INTO containers(code,capacityM3,status,notes,id,createdAt) VALUES(?,?,?,?,?,?)", ...values, id, now);
    return { id, message: "Caçamba salva. A disponibilidade exige conferência no pátio." };
}
async function dispatch(db: DB, u: User, action: string, p: Record<string, unknown>, now: string): Promise<CommandResult> {
    const admin = ["importActiveRental", "createUser", "setUserActive", "saveSettings", "voidPayment"];
    if (admin.includes(action))
        assert(u.role === "ADMIN", "Acesso exclusivo do administrador.", 403);
    if (u.role === "DRIVER")
        assert(["transitionRental", "confirmPickup", "saveRentalSignatures", "changePassword"].includes(action), "O perfil motorista não pode executar esta ação.", 403);
    switch (action) {
        case "createRental": return createRental(db, u, p, now);
        case "importActiveRental": return importActiveRental(db, u, p, now);
        case "transitionRental": return transitionRental(db, u, p, now);
        case "confirmPickup": return confirmPickup(db, u, p, now);
        case "schedulePickup": return schedulePickup(db, u, p, now);
        case "regularizePickup": return regularizePickup(db, u, p, now);
        case "saveRentalSignatures": return saveRentalSignatures(db, u, p, now);
        case "rescheduleJob": return reschedule(db, u, p, now);
        case "createCustomer":
        case "updateCustomer": return saveCustomer(db, p, action === "updateCustomer", now);
        case "createCustomerSite":
        case "updateCustomerSite": return await saveCustomerSite(db, p, action === "updateCustomerSite", now);
        case "importRentalGroups": return importRentalGroups(db, p, now);
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
                const c = await find<Container>(db, "containers", raw);
                assert(c.status === "INVENTORY", `${c.code} não está aguardando conferência.`, 409);
                await db.run("UPDATE containers SET capacityM3=?,status='AVAILABLE' WHERE id=?", capacity, raw);
            }
            return { message: `${ids.length} caçamba(s) conferida(s) e liberada(s) no pátio.` };
        }
        case "addPayment": {
            const r = await find<Rental>(db, "rentals", v.str(p, "rentalId", 1));
            assert(r.status !== "CANCELLED", "Locação cancelada não pode receber pagamento.");
            const amount = v.integer(p, "amountCents", 1, 100000000), at = v.iso(p, "paidAt");
            assert(at <= now, "O recebimento não pode ter data futura.");
            if (!r.byMeasurement)
                assert(await paid(db, r.id) + amount <= r.priceCents, "O valor supera o saldo da locação.", 409);
            const note = v.str(p, "note", 0, 500);
            if (r.byMeasurement)
                assert(note.length >= 10, "Informe os motivos do valor diagnosticado, com pelo menos 10 caracteres: volume, tipo de resíduo, diárias extras ou o que formou o valor.");
            const id = randomUUID();
            await db.run("INSERT INTO payments(id,rentalId,amountCents,method,paidAt,note,createdBy) VALUES(?,?,?,?,?,?,?)", id, r.id, amount, v.choice(p, "method", ["PIX", "CASH", "TRANSFER", "CARD"] as const), at, note, u.id);
            await event(db, u, r.id, "payment", r.byMeasurement ? `Valor diagnosticado de ${money(amount)}. Motivos: ${note}` : "Recebimento manual registrado pela operação.", now);
            return { id, message: r.byMeasurement ? "Valor diagnosticado registrado com os motivos informados." : "Recebimento registrado. Nenhuma cobrança bancária foi executada." };
        }
        case "voidPayment": {
            const pmt = await find<Payment>(db, "payments", v.str(p, "id", 1));
            assert(!pmt.voidedAt, "Este recebimento já foi estornado.", 409);
            const reason = v.str(p, "reason", 5, 500);
            await db.run("UPDATE payments SET voidedAt=?,voidReason=? WHERE id=?", now, reason, pmt.id);
            await event(db, u, pmt.rentalId, "payment_voided", `Estorno contábil manual: ${reason}. A devolução bancária deve ser feita fora do sistema.`, now);
            return { id: pmt.id, message: "Registro estornado. A devolução do dinheiro não é automática." };
        }
        case "startMaintenance": {
            const resource = v.choice(p, "resource", ["container", "truck"] as const), id = v.str(p, "resourceId", 1), description = v.str(p, "description", 5, 1000);
            const item = resource === "container" ? await find<Container>(db, "containers", id) : await find<Truck>(db, "trucks", id);
            assert(item.status === "AVAILABLE", "O item deve estar livre para entrar em manutenção.", 409);
            if (resource === "truck")
                assert(!await row(db, "SELECT id FROM jobs WHERE truckId=? AND status NOT IN ('DONE','CANCELLED')", id), "Reatribua os serviços do caminhão antes de iniciar a manutenção.", 409);
            const mid = randomUUID();
            await db.run("INSERT INTO maintenance(id,containerId,truckId,description,costCents,openedAt,createdBy) VALUES(?,?,?,?,?,?,?)", mid, resource === "container" ? id : null, resource === "truck" ? id : null, description, v.integer(p, "costCents", 0, 100000000, 0), now, u.id);
            await db.run(`UPDATE ${resource === "container" ? "containers" : "trucks"} SET status='MAINTENANCE' WHERE id=?`, id);
            return { id: mid, message: "Manutenção aberta. O equipamento foi bloqueado para operações." };
        }
        case "finishMaintenance": {
            const m = await find<Maintenance>(db, "maintenance", v.str(p, "id", 1));
            assert(!m.closedAt, "Manutenção já encerrada.", 409);
            await db.run("UPDATE maintenance SET closedAt=?,resolution=?,costCents=? WHERE id=?", now, v.str(p, "resolution", 5, 1000), v.integer(p, "costCents", 0, 100000000), m.id);
            await db.run(`UPDATE ${m.containerId ? "containers" : "trucks"} SET status='AVAILABLE' WHERE id=?`, m.containerId ?? m.truckId!);
            return { id: m.id, message: "Manutenção concluída e equipamento liberado." };
        }
        case "updateBookingRequest": {
            const id = v.str(p, "id", 1);
            const request = await row<BookingRequest>(db, "SELECT * FROM bookingRequests WHERE id=?", id);
            assert(request, "Solicitação não encontrada.", 404);
            const status = v.choice(p, "status", ["NEW", "CONTACTED", "CONFIRMED", "DECLINED"] as const);
            const statusNote = v.str(p, "statusNote", 0, 500);
            if (status === "DECLINED")
                assert(statusNote.length >= 5, "Informe o motivo de não atender esta solicitação.");
            await db.run("UPDATE bookingRequests SET status=?,statusNote=?,handledBy=?,updatedAt=? WHERE id=?", status, statusNote, u.id, now, id);
            return { id, message: status === "CONFIRMED" ? "Solicitação marcada como confirmada. Crie a locação operacional após combinar os detalhes com o cliente." : "Situação da solicitação atualizada." };
        }
        case "createUser": {
            const role = v.choice(p, "role", ["ADMIN", "DISPATCHER", "DRIVER"] as const), mail = v.email(p, "email", true);
            assert(!await row(db, "SELECT id FROM users WHERE email=?", mail), "Este e-mail já está cadastrado.", 409);
            const driverId = role === "DRIVER" ? v.str(p, "driverId", 1) : null;
            if (driverId) {
                assert((await find<Driver>(db, "drivers", driverId)).active === 1, "Selecione um motorista ativo.");
                assert(!await row(db, "SELECT id FROM users WHERE driverId=?", driverId), "Este motorista já possui um usuário.", 409);
            }
            const id = await createAccount(db, { name: v.str(p, "name", 2, 120), email: mail, password: v.secret(p, "password", 12, 128), role, driverId }, now);
            return { id, message: "Usuário criado. Compartilhe a senha por um canal privado." };
        }
        case "setUserActive": {
            const target = await find<User>(db, "users", v.str(p, "id", 1)), active = v.integer(p, "active", 0, 1);
            assert(target.id !== u.id, "Você não pode desativar o próprio acesso.");
            if (active && target.driverId)
                assert((await find<Driver>(db, "drivers", target.driverId)).active === 1, "Reative o cadastro do motorista primeiro.");
            await db.run("UPDATE users SET active=? WHERE id=?", active, target.id);
            if (!active)
                await db.run("DELETE FROM sessions WHERE userId=?", target.id);
            return { id: target.id, message: active ? "Acesso reativado." : "Acesso desativado e sessões revogadas." };
        }
        case "changePassword": {
            const saved = (await row<{
                passwordHash: string;
            }>(db, "SELECT passwordHash FROM users WHERE id=?", u.id))!;
            assert(verifyPassword(v.secret(p, "currentPassword", 1, 128), saved.passwordHash), "A senha atual está incorreta.");
            const next = v.secret(p, "newPassword", 12, 128);
            assert(!verifyPassword(next, saved.passwordHash), "Escolha uma senha diferente da atual.");
            await db.run("UPDATE users SET passwordHash=? WHERE id=?", hashPassword(next), u.id);
            await db.run("DELETE FROM sessions WHERE userId=?", u.id);
            return { id: u.id, message: "Senha alterada. Entre novamente com a nova senha." };
        }
        case "saveSettings": {
            const s: Settings = { ...(await settings(db)), companyName: v.str(p, "companyName", 2, 120), companyPhone: v.phone(p, "companyPhone", false), yardAddress: v.str(p, "yardAddress", 5, 300), defaultDays: v.integer(p, "defaultDays", 1, 365), defaultPriceCents: v.integer(p, "defaultPriceCents", 0, 100000000), jobDurationMinutes: v.integer(p, "jobDurationMinutes", 15, 480) };
            await db.run("UPDATE settings SET json=? WHERE id=1", JSON.stringify(s));
            return { message: "Configurações salvas." };
        }
        default: throw new AppError("Comando desconhecido.", 400);
    }
}
export async function execute(db: DB, actor: User, raw: unknown, key: string, at = new Date()): Promise<CommandResult> {
    const data = v.object(raw), action = v.str(data, "action", 1, 60), payload = v.object(data.payload);
    assert(/^[a-zA-Z0-9_-]{16,100}$/.test(key), "Chave de operação inválida.");
    const now = at.toISOString(), bodyHash = sha256(JSON.stringify(raw));
    return await tx(db, async () => {
        const u = await row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, actor.id);
        assert(u, "Sessão inválida.", 401);
        const stored = await row<{
            userId: string;
            bodyHash: string;
            result: string;
        }>(db, "SELECT userId,bodyHash,result FROM commandReceipts WHERE key=?", key);
        if (stored) {
            assert(stored.userId === u.id && stored.bodyHash === bodyHash, "Chave de operação já utilizada com outros dados.", 409);
            return JSON.parse(stored.result) as CommandResult;
        }
        const result = await dispatch(db, u, action, payload, now);
        // Never log passwords or raw request bodies.
        await audit(db, u, action, result.id ?? "system", result.message, now);
        await db.run("INSERT INTO commandReceipts(key,userId,bodyHash,result,createdAt) VALUES(?,?,?,?,?)", key, u.id, bodyHash, JSON.stringify(result), now);
        return result;
    });
}
export async function snapshot(db: DB, actor: User): Promise<Snapshot> {
    return await tx(db, async () => {
        const u = await row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, actor.id);
        assert(u, "Sessão expirada.", 401);
        const driver = u.role === "DRIVER";
        const jobs = driver ? await rows<Job>(db, "SELECT * FROM jobs WHERE driverId=? ORDER BY scheduledAt", u.driverId!) : await rows<Job>(db, "SELECT * FROM jobs ORDER BY scheduledAt");
        const allowed = new Set(jobs.map(j => j.rentalId));
        // Related job metadata is needed for a full history; commands still check each assigned driver.
        const allRentals = driver ? await rows<Rental>(db, "SELECT r.* FROM rentals r WHERE EXISTS(SELECT 1 FROM jobs j WHERE j.rentalId=r.id AND j.driverId=?) ORDER BY r.createdAt DESC", u.driverId!) : await rows<Rental>(db, "SELECT * FROM rentals ORDER BY createdAt DESC");
        const rentals = allRentals.map(r => driver ? { ...r, priceCents: 0 } : r);
        const rentalIds = rentals.map(r => r.id);
        const containerIds = new Set(rentals.map(r => r.containerId)), customerIds = new Set(rentals.map(r => r.customerId)), truckIds = new Set(jobs.map(j => j.truckId));
        const rentalSignatures = rentalIds.length
            ? await rows<RentalSignature>(db, `SELECT id, rentalId, kind, role, signerName, '' AS image, signedAt, actorId FROM rentalSignatures WHERE rentalId IN (${rentalIds.map(() => "?").join(",")}) ORDER BY signedAt`, ...rentalIds)
            : [];
        const rentalSignatureRevisions = rentalIds.length
            ? await rows<RentalSignatureRevision>(db, `SELECT id, rentalId, kind, role, signerName, '' AS image, signedAt, actorId, replacedAt, replacedBy, replaceReason FROM rentalSignatureRevisions WHERE rentalId IN (${rentalIds.map(() => "?").join(",")}) ORDER BY replacedAt DESC`, ...rentalIds)
            : [];
        return {
            user: u, settings: driver ? { ...(await settings(db)), defaultPriceCents: 0 } : (await settings(db)), serverTime: new Date().toISOString(),
            containers: (await rows<Container>(db, "SELECT * FROM containers ORDER BY code")).filter(c => !driver || containerIds.has(c.id)),
            trucks: (await rows<Truck>(db, "SELECT * FROM trucks ORDER BY code")).filter(t => !driver || truckIds.has(t.id)),
            drivers: (await rows<Driver>(db, "SELECT * FROM drivers ORDER BY name")).filter(d => !driver || d.id === u.driverId),
            customers: (await rows<Customer>(db, "SELECT * FROM customers ORDER BY name")).filter(c => !driver || customerIds.has(c.id)).map(c => driver ? { ...c, document: null, email: "", address: "", notes: "" } : c),
            customerSites: driver ? [] : await rows<CustomerSite>(db, "SELECT * FROM customerSites ORDER BY name"),
            rentalSignatures, rentalSignatureRevisions,
            rentals, jobs,
            events: (await rows<RentalEvent>(db, "SELECT e.*,u.name actorName FROM rentalEvents e JOIN users u ON u.id=e.actorId ORDER BY occurredAt DESC")).filter(e => (!driver || allowed.has(e.rentalId)) && (!driver || !e.action.startsWith("payment"))),
            payments: driver ? [] : await rows<Payment>(db, "SELECT * FROM payments ORDER BY paidAt DESC"),
            maintenance: driver ? [] : await rows<Maintenance>(db, "SELECT * FROM maintenance ORDER BY openedAt DESC"),
            bookingRequests: driver ? [] : await rows<BookingRequest>(db, "SELECT * FROM bookingRequests ORDER BY createdAt DESC"),
            users: u.role === "ADMIN" ? await rows<User>(db, `SELECT ${USER_COLUMNS} FROM users ORDER BY createdAt`) : [],
            audit: u.role === "ADMIN" ? await rows<Audit>(db, "SELECT a.*,u.name actorName FROM audit a JOIN users u ON a.actorId=u.id ORDER BY a.createdAt DESC LIMIT 200") : []
        };
    }, true);
}

export async function rentalSignaturesFor(db: DB, actor: User, rentalId: string): Promise<{ signatures: RentalSignature[]; revisions: RentalSignatureRevision[] }> {
    return await tx(db, async () => {
        const u = await row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, actor.id);
        assert(u, "Sessão expirada.", 401);
        const rental = await find<Rental>(db, "rentals", rentalId);
        if (u.role === "DRIVER")
            assert(await row(db, "SELECT id FROM jobs WHERE rentalId=? AND driverId=?", rental.id, u.driverId), "Este serviço está atribuído a outro motorista.", 403);
        return {
            signatures: await rows<RentalSignature>(db, "SELECT * FROM rentalSignatures WHERE rentalId=? ORDER BY signedAt", rental.id),
            revisions: await rows<RentalSignatureRevision>(db, "SELECT * FROM rentalSignatureRevisions WHERE rentalId=? ORDER BY replacedAt DESC", rental.id),
        };
    }, true);
}
