import { randomUUID } from 'node:crypto';
import { type DB, tx, row, DEFAULT_SETTINGS } from './db.ts';
import { assert } from './errors.ts';
import { createAccount } from './auth.ts';
import { AREA_SITES } from '../shared/geo.ts';
export function seed(db: DB, options: {
    email: string;
    password: string;
    name?: string;
    demo?: boolean;
}, at = new Date()): void {
    tx(db, () => {
        assert(row<{
            n: number;
        }>(db, 'SELECT COUNT(*) n FROM users')!.n === 0, 'Este banco já foi inicializado. Nenhum dado foi sobrescrito.');
        assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email), 'Informe um e-mail válido.');
        const now = at.toISOString(), demo = options.demo === true;
        const admin = createAccount(db, { name: options.name?.trim() || 'Administrador JR', email: options.email, password: options.password, role: 'ADMIN', driverId: null }, now);
        const bins: string[] = [];
        for (let i = 1; i <= 70; i++) {
            const id = randomUUID();
            bins.push(id);
            db.prepare('INSERT INTO containers(id,code,capacityM3,status,createdAt) VALUES(?,?,?,?,?)').run(id, `JR-${String(i).padStart(3, '0')}`, demo ? 5 : null, demo ? 'AVAILABLE' : 'INVENTORY', now);
        }
        const trucks: string[] = [];
        for (let i = 1; i <= 2; i++) {
            const id = randomUUID();
            trucks.push(id);
            db.prepare('INSERT INTO trucks(id,code,plate,model,createdAt) VALUES(?,?,?,?,?)').run(id, `CAM-0${i}`, demo ? `DEM1A0${i}` : null, demo ? 'Caminhão demonstrativo' : '', now);
        }
        db.prepare('UPDATE settings SET json=? WHERE id=1').run(JSON.stringify({ ...DEFAULT_SETTINGS, demo, ...(demo ? { yardAddress: 'Estrada São Francisco, 2100 - Taboão da Serra / Embu das Artes, SP', defaultPriceCents: 45000 } : {}) }));
        if (!demo)
            return;
        const drivers: string[] = [];
        for (let i = 1; i <= 2; i++) {
            const id = randomUUID();
            drivers.push(id);
            db.prepare('INSERT INTO drivers(id,name,phone,license,category,licenseExpiry,createdAt) VALUES(?,?,?,?,?,?,?)').run(id, `Motorista Demo ${i}`, '11000000000', `DEMO-${i}`, 'D', '2099-12-31', now);
        }
        const customers: string[] = [];
        for (let i = 1; i <= 10; i++) {
            const id = randomUUID();
            customers.push(id);
            db.prepare('INSERT INTO customers(id,name,contact,phone,notes,createdAt) VALUES(?,?,?,?,?,?)').run(id, `Cliente Exemplo ${String(i).padStart(2, '0')}`, `Responsável Demo ${i}`, '11000000000', 'DADO FICTÍCIO: não utilizar na operação real.', now);
        }
        const day = 86400000;
        for (let i = 0; i < 40; i++) {
            const id = randomUUID(), status = i < 26 ? 'ACTIVE' : i < 30 ? 'RESERVED' : 'COMPLETED';
            const delivery = new Date(at.getTime() + (status === 'RESERVED' ? 1 : -10) * day + (i % 4) * 3600000).toISOString();
            const pickup = new Date(at.getTime() + (status === 'COMPLETED' ? -2 : i < 5 ? -1 : 1 + Math.floor(i / 4)) * day + (i % 4) * 3600000).toISOString();
            const completed = status === 'COMPLETED' ? pickup : null;
            const site = AREA_SITES[i % AREA_SITES.length];
            db.prepare(`INSERT INTO rentals(id,code,containerId,customerId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,wasteType,notes,deliveryAt,pickupAt,deliveredAt,pickedUpAt,returnedAt,status,priceCents,createdBy,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, `LOC-${String(i + 1).padStart(5, '0')}`, bins[i], customers[i % 10], site.address, site.neighborhood, site.city, site.postalCode, 'Contato demonstrativo', '11000000000', site.lat, site.lon, 'Resíduo demonstrativo', 'Exemplo fictício, não representa um serviço real.', delivery, pickup, status === 'RESERVED' ? null : delivery, completed, completed, status, 45000, admin, now);
            db.prepare('UPDATE containers SET status=? WHERE id=?').run(status === 'ACTIVE' ? 'ON_SITE' : status === 'RESERVED' ? 'RESERVED' : 'AVAILABLE', bins[i]);
            for (const kind of ['DELIVERY', 'PICKUP'])
                db.prepare('INSERT INTO jobs(id,rentalId,kind,driverId,truckId,scheduledAt,durationMinutes,status,startedAt,completedAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), id, kind, drivers[i % 2], trucks[i % 2], kind === 'DELIVERY' ? delivery : pickup, 60, (kind === 'DELIVERY' && status !== 'RESERVED') || status === 'COMPLETED' ? 'DONE' : 'SCHEDULED', kind === 'DELIVERY' && status !== 'RESERVED' ? delivery : null, kind === 'DELIVERY' && status !== 'RESERVED' ? delivery : completed);
            db.prepare('INSERT INTO rentalEvents(id,rentalId,action,description,actorId,occurredAt) VALUES(?,?,?,?,?,?)').run(randomUUID(), id, 'demo', 'Registro fictício para explorar a interface.', admin, now);
            if (i % 3 !== 0)
                db.prepare('INSERT INTO payments(id,rentalId,amountCents,method,paidAt,note,createdBy) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), id, i % 2 ? 45000 : 22500, 'PIX', now, 'Recebimento fictício.', admin);
        }
        for (const idx of [68, 69]) {
            db.prepare("UPDATE containers SET status='MAINTENANCE' WHERE id=?").run(bins[idx]);
            db.prepare('INSERT INTO maintenance(id,containerId,description,openedAt,createdBy) VALUES(?,?,?,?,?)').run(randomUUID(), bins[idx], 'Reparo demonstrativo de pintura', now, admin);
        }
    });
}
