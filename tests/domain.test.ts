import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openDatabase, row, rows, settings, type DB } from '../src/server/db.ts';
import { execute, snapshot, checkSlot } from '../src/server/service.ts';
import { seed } from '../src/server/seed.ts';
import { hashPassword, verifyPassword, authenticate, sessionUser, sha256 } from '../src/server/auth.ts';
import { AppError } from '../src/server/errors.ts';
import { fromLocalInput, toLocalInput, dateKey, csvCell } from '../src/shared/format.ts';
import type { User, Rental, Job, Container, CommandName } from '../src/shared/types.ts';
const NOW = '2026-09-15T10:00:00.000Z', DELIVERY = '2026-09-16T11:00:00.000Z', PICKUP = '2026-09-23T11:00:00.000Z';
const PASSWORD = 'Private-test-password-456!';
const HASH = hashPassword(PASSWORD);
function fixture(path = ':memory:') {
    const db = openDatabase(path);
    for (const n of [1, 2]) {
        db.prepare('INSERT INTO drivers(id,name,phone,license,category,licenseExpiry,createdAt) VALUES(?,?,?,?,?,?,?)').run(`d${n}`, `Driver ${n}`, '11912345678', `CNH-${n}`, 'D', '2099-12-31', NOW);
        db.prepare('INSERT INTO trucks(id,code,plate,model,createdAt) VALUES(?,?,?,?,?)').run(`t${n}`, `TR-0${n}`, `TST1A0${n}`, 'Test truck', NOW);
        db.prepare('INSERT INTO customers(id,name,contact,phone,createdAt) VALUES(?,?,?,?,?)').run(`c${n}`, `Customer ${n}`, `Contact ${n}`, '11912345678', NOW);
    }
    for (const [id, role, driver] of [['admin', 'ADMIN', null], ['ops', 'DISPATCHER', null], ['user1', 'DRIVER', 'd1'], ['user2', 'DRIVER', 'd2']] as const)
        db.prepare('INSERT INTO users(id,name,email,passwordHash,role,driverId,createdAt) VALUES(?,?,?,?,?,?,?)').run(id, id, `${id}@test.local`, HASH, role, driver, NOW);
    for (let n = 1; n <= 6; n++)
        db.prepare('INSERT INTO containers(id,code,capacityM3,status,createdAt) VALUES(?,?,?,?,?)').run(`b${n}`, `JR-00${n}`, n === 6 ? null : 5, n === 6 ? 'INVENTORY' : 'AVAILABLE', NOW);
    db.prepare('UPDATE settings SET json=? WHERE id=1').run(JSON.stringify({ ...settings(db), yardAddress: 'Test yard, 100 - Test City' }));
    const user = (id = 'admin') => row<User>(db, 'SELECT id,name,email,role,driverId,active,createdAt FROM users WHERE id=?', id)!;
    const run = (action: CommandName, payload: Record<string, unknown>, as = 'admin', at = NOW, key = randomUUID()) => execute(db, user(as), { action, payload }, key, new Date(at));
    const input = (overrides: Record<string, unknown> = {}) => ({ customerId: 'c1', containerId: 'b1', address: 'Test street, 100', neighborhood: 'Test neighborhood', city: 'Test City - SP', postalCode: '01000-000', siteContact: 'Recipient', sitePhone: '11912345678', latitude: -23.55, longitude: -46.63, wasteType: 'Test non-hazardous material', notes: 'Test data', deliveryAt: DELIVERY, pickupAt: PICKUP, deliveryDriverId: 'd1', pickupDriverId: 'd1', deliveryTruckId: 't1', pickupTruckId: 't1', durationMinutes: 60, priceCents: 45000, ...overrides });
    const rental = (id: string) => row<Rental>(db, 'SELECT * FROM rentals WHERE id=?', id)!;
    const bin = (id = 'b1') => row<Container>(db, 'SELECT * FROM containers WHERE id=?', id)!;
    const job = (id: string, kind = 'DELIVERY') => row<Job>(db, 'SELECT * FROM jobs WHERE rentalId=? AND kind=?', id, kind)!;
    const create = (overrides: Record<string, unknown> = {}) => run('createRental', input(overrides)).id!;
    const transition = (id: string, action: string, at = DELIVERY, extra: Record<string, unknown> = {}, as = 'admin') => run('transitionRental', { id, version: rental(id).version, action, receiver: 'Site recipient', condition: 'GOOD', notes: 'Test operation', ...extra }, as, at);
    return { db, user, run, input, rental, bin, job, create, transition, close: () => db.close() };
}
function rejects(fn: () => unknown, status?: number) { assert.throws(fn, (e: unknown) => e instanceof AppError && (!status || e.status === status)); }
function active(f: ReturnType<typeof fixture>, id: string) { f.transition(id, 'start_delivery', DELIVERY); f.transition(id, 'complete_delivery', '2026-09-16T11:15:00.000Z'); }
function returning(f: ReturnType<typeof fixture>, id: string) { active(f, id); f.transition(id, 'start_pickup', PICKUP); f.transition(id, 'complete_pickup', '2026-09-23T11:15:00.000Z'); }
test('operational seed: exactly 70 unknown-location bins and 2 unregistered trucks, no invented rentals', () => { const db = openDatabase(':memory:'); try {
    seed(db, { email: 'admin@test.local', password: PASSWORD });
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM containers')!.n, 70);
    assert.equal(row<{
        n: number;
    }>(db, "SELECT COUNT(*) n FROM containers WHERE status='INVENTORY' AND capacityM3 IS NULL")!.n, 70);
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM trucks WHERE plate IS NULL')!.n, 2);
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM rentals')!.n, 0);
    assert.equal(settings(db).demo, false);
}
finally {
    db.close();
} });
test('demo seed is isolated, explicit and cannot overwrite an existing setup', () => { const db = openDatabase(':memory:'); try {
    seed(db, { email: 'admin@test.local', password: PASSWORD, demo: true }, new Date(NOW));
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM containers')!.n, 70);
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM trucks')!.n, 2);
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM rentals')!.n, 40);
    assert.equal(settings(db).demo, true);
    assert.equal(rows(db, 'PRAGMA foreign_key_check').length, 0);
    rejects(() => seed(db, { email: 'other@test.local', password: PASSWORD }));
    assert.equal(row<{
        n: number;
    }>(db, 'SELECT COUNT(*) n FROM rentals')!.n, 40);
}
finally {
    db.close();
} });
test('create reserves physical bin and atomically schedules both services', () => { const f = fixture(); try {
    const id = f.create();
    assert.equal(f.bin().status, 'RESERVED');
    assert.equal(f.rental(id).status, 'RESERVED');
    assert.equal(rows(f.db, 'SELECT * FROM jobs WHERE rentalId=?', id).length, 2);
    assert.equal(f.job(id).driverId, 'd1');
    assert.equal(f.job(id, 'PICKUP').scheduledAt, PICKUP);
    assert.equal(rows(f.db, 'SELECT * FROM rentalEvents WHERE rentalId=?', id).length, 1);
}
finally {
    f.close();
} });
test('another open rental cannot reserve the same bin', () => { const f = fixture(); try {
    f.create();
    rejects(() => f.create({ deliveryAt: '2026-10-01T11:00:00Z', pickupAt: '2026-10-08T11:00:00Z' }), 409);
    assert.equal(rows(f.db, 'SELECT * FROM rentals').length, 1);
}
finally {
    f.close();
} });
test('partial unique SQL index protects against bypassing service checks', () => { const f = fixture(); try {
    const id = f.create();
    const r = f.rental(id);
    const columns = Object.keys(r).filter(k => !['id', 'code'].includes(k));
    assert.throws(() => f.db.prepare(`INSERT INTO rentals(id,code,${columns.join(',')}) SELECT 'duplicate','LOC-DUP',${columns.join(',')} FROM rentals WHERE id=?`).run(id), /UNIQUE/);
}
finally {
    f.close();
} });
test('truck conflicts and driver conflicts are checked independently', () => { const f = fixture(); try {
    f.create();
    rejects(() => f.create({ containerId: 'b2', deliveryDriverId: 'd2', deliveryTruckId: 't1' }), 409);
    rejects(() => f.create({ containerId: 'b2', deliveryDriverId: 'd1', deliveryTruckId: 't2' }), 409);
    assert.equal(f.bin('b2').status, 'AVAILABLE');
    assert.equal(rows(f.db, 'SELECT * FROM rentals').length, 1);
}
finally {
    f.close();
} });
test('adjacent nonoverlapping windows are allowed on the same resources', () => { const f = fixture(); try {
    f.create();
    const id = f.create({ containerId: 'b2', deliveryAt: '2026-09-16T12:00:00Z', pickupAt: '2026-09-23T12:00:00Z' });
    assert.equal(f.rental(id).status, 'RESERVED');
    assert.doesNotThrow(() => checkSlot(f.db, 'd1', 't1', '2026-09-16T13:00:00Z', 60));
}
finally {
    f.close();
} });
test('failure in the pickup schedule rolls back rental, delivery job, event and bin reservation', () => { const f = fixture(); try {
    f.create();
    rejects(() => f.create({ containerId: 'b2', deliveryAt: '2026-09-16T15:00:00Z' }), 409);
    assert.equal(rows(f.db, 'SELECT * FROM rentals').length, 1);
    assert.equal(rows(f.db, 'SELECT * FROM jobs').length, 2);
    assert.equal(f.bin('b2').status, 'AVAILABLE');
}
finally {
    f.close();
} });
test('expired or inactive drivers and missing plates block assignments', () => { const f = fixture(); try {
    f.db.prepare("UPDATE drivers SET licenseExpiry='2026-09-15' WHERE id='d1'").run();
    rejects(() => f.create());
    f.db.prepare("UPDATE drivers SET licenseExpiry='2099-12-31',active=0 WHERE id='d1'").run();
    rejects(() => f.create(), 409);
    f.db.prepare("UPDATE drivers SET active=1 WHERE id='d1'").run();
    f.db.prepare("UPDATE trucks SET plate=NULL WHERE id='t1'").run();
    rejects(() => f.create());
}
finally {
    f.close();
} });
test('inventory, yard and paired-coordinate validations protect incomplete onboarding', () => { const f = fixture(); try {
    rejects(() => f.create({ containerId: 'b6' }), 409);
    rejects(() => f.create({ latitude: -23.55, longitude: null }));
    f.db.prepare('UPDATE settings SET json=? WHERE id=1').run(JSON.stringify({ ...settings(f.db), yardAddress: '' }));
    rejects(() => f.create());
}
finally {
    f.close();
} });
test('future planning cannot use a past delivery or pickup before delivery window ends', () => { const f = fixture(); try {
    rejects(() => f.create({ deliveryAt: '2026-09-14T10:00:00Z' }));
    rejects(() => f.create({ pickupAt: '2026-09-16T11:30:00Z' }));
}
finally {
    f.close();
} });
test('full physical lifecycle keeps bin unavailable until yard return', () => { const f = fixture(); try {
    const id = f.create();
    f.transition(id, 'start_delivery');
    assert.equal(f.bin().status, 'IN_TRANSIT');
    f.transition(id, 'complete_delivery', '2026-09-16T11:15:00.000Z');
    assert.equal(f.bin().status, 'ON_SITE');
    assert.equal(f.rental(id).deliveredAt, '2026-09-16T11:15:00.000Z');
    f.transition(id, 'start_pickup', PICKUP);
    assert.equal(f.bin().status, 'ON_SITE');
    f.transition(id, 'complete_pickup', '2026-09-23T11:15:00.000Z');
    assert.equal(f.bin().status, 'RETURNING');
    assert.equal(f.job(id, 'PICKUP').status, 'RETURNING');
    f.transition(id, 'return_yard', '2026-09-23T11:45:00.000Z');
    assert.equal(f.rental(id).status, 'COMPLETED');
    assert.equal(f.bin().status, 'AVAILABLE');
    assert.equal(f.job(id, 'PICKUP').status, 'DONE');
    assert.equal(f.rental(id).returnedAt, '2026-09-23T11:45:00.000Z');
}
finally {
    f.close();
} });
test('damaged return automatically creates maintenance and blocks availability', () => { const f = fixture(); try {
    const id = f.create();
    returning(f, id);
    f.transition(id, 'return_yard', '2026-09-23T11:45:00.000Z', { condition: 'MAINTENANCE', notes: 'Damaged side panel requires repair' });
    assert.equal(f.bin().status, 'MAINTENANCE');
    const m = row<{
        id: string;
    }>(f.db, 'SELECT id FROM maintenance WHERE containerId=?', 'b1')!;
    assert.ok(m);
    f.run('finishMaintenance', { id: m.id, resolution: 'Repaired and inspected', costCents: 9500 }, 'admin', '2026-09-24T12:00:00Z');
    assert.equal(f.bin().status, 'AVAILABLE');
}
finally {
    f.close();
} });
test('out-of-order steps, invalid return inspection and stale versions are rejected', () => { const f = fixture(); try {
    const id = f.create();
    rejects(() => f.transition(id, 'complete_delivery'), 409);
    f.transition(id, 'start_delivery');
    rejects(() => f.run('transitionRental', { id, version: 1, action: 'complete_delivery', receiver: 'Receiver' }, 'admin', DELIVERY), 409);
    f.transition(id, 'complete_delivery', '2026-09-16T11:15:00Z');
    f.transition(id, 'start_pickup', PICKUP);
    f.transition(id, 'complete_pickup', '2026-09-23T11:15:00Z');
    rejects(() => f.transition(id, 'return_yard', '2026-09-23T11:30:00Z', { condition: 'MAINTENANCE', notes: '' }));
    assert.equal(f.bin().status, 'RETURNING');
}
finally {
    f.close();
} });
test('the assigned driver only may perform a field step', () => { const f = fixture(); try {
    const id = f.create();
    rejects(() => f.transition(id, 'start_delivery', DELIVERY, {}, 'user2'), 403);
    f.transition(id, 'start_delivery', DELIVERY, {}, 'user1');
    assert.equal(f.rental(id).status, 'DELIVERING');
    rejects(() => f.run('createRental', f.input({ containerId: 'b2' }), 'user1'), 403);
}
finally {
    f.close();
} });
test('a live job overrun still blocks truck even beyond the original schedule', () => { const f = fixture(); try {
    const a = f.create(), b = f.create({ containerId: 'b2', deliveryAt: '2026-09-16T13:00:00Z', pickupAt: '2026-09-23T13:00:00Z' });
    f.transition(a, 'start_delivery');
    rejects(() => f.transition(b, 'start_delivery', '2026-09-16T13:00:00Z'), 409);
    assert.equal(f.rental(b).status, 'RESERVED');
}
finally {
    f.close();
} });
test('snapshot redacts finance, documents, other clients and administrative users from drivers', () => { const f = fixture(); try {
    const id = f.create();
    f.create({ containerId: 'b2', customerId: 'c2', deliveryDriverId: 'd2', pickupDriverId: 'd2', deliveryTruckId: 't2', pickupTruckId: 't2' });
    f.db.prepare("UPDATE customers SET document='12345678900' WHERE id='c1'").run();
    f.run('addPayment', { rentalId: id, amountCents: 5000, method: 'PIX', paidAt: NOW, note: 'manual' });
    const s = snapshot(f.db, f.user('user1'));
    assert.equal(s.rentals.length, 1);
    assert.equal(s.rentals[0].priceCents, 0);
    assert.equal(s.customers.length, 1);
    assert.equal(s.customers[0].document, null);
    assert.equal(s.payments.length, 0);
    assert.equal(s.users.length, 0);
    assert.equal(s.audit.length, 0);
    assert.equal(s.events.some(e => e.action.startsWith('payment')), false);
}
finally {
    f.close();
} });
test('rescheduling preserves old and new assignments in history and never changes price', () => { const f = fixture(); try {
    const id = f.create(), j = f.job(id);
    f.run('rescheduleJob', { id: j.id, version: j.version, scheduledAt: '2026-09-17T11:00:00Z', driverId: 'd2', truckId: 't2', durationMinutes: 90, reason: 'Client requested another day' });
    assert.equal(f.rental(id).priceCents, 45000);
    assert.equal(f.rental(id).deliveryAt, '2026-09-17T11:00:00.000Z');
    assert.equal(f.job(id).driverId, 'd2');
    const ev = row<{
        description: string;
    }>(f.db, "SELECT description FROM rentalEvents WHERE action='rescheduled'")!;
    assert.match(ev.description, /Driver 1/);
    assert.match(ev.description, /Driver 2/);
    rejects(() => f.run('rescheduleJob', { id: j.id, version: j.version, scheduledAt: '2026-09-18T11:00:00Z', driverId: 'd2', truckId: 't2', durationMinutes: 60, reason: 'Another reschedule' }), 409);
}
finally {
    f.close();
} });
test('open-ended pickup skips a scheduled collection and records the real time later', () => { const f = fixture(); try {
    const id = f.create({ openEndedPickup: true });
    const rental = f.rental(id);
    assert.equal(rental.openEndedPickup, 1);
    assert.equal(rows(f.db, "SELECT * FROM jobs WHERE rentalId=? AND kind='PICKUP'", id).length, 0);
    f.transition(id, 'start_delivery');
    f.transition(id, 'complete_delivery');
    assert.equal(f.rental(id).status, 'ACTIVE');
    f.transition(id, 'start_pickup', '2026-09-18T14:00:00.000Z', { pickupDriverId: 'd1', pickupTruckId: 't1', durationMinutes: 60 });
    assert.equal(f.rental(id).status, 'COLLECTING');
    f.transition(id, 'complete_pickup', '2026-09-18T14:30:00.000Z');
    assert.equal(f.rental(id).pickedUpAt, '2026-09-18T14:30:00.000Z');
}
finally {
    f.close();
} });
test('measurement billing stores no contracted price and still accepts receipts', () => { const f = fixture(); try {
    const id = f.create({ byMeasurement: true, priceCents: 99999 });
    const rental = f.rental(id);
    assert.equal(rental.byMeasurement, 1);
    assert.equal(rental.priceCents, 0);
    f.run('addPayment', { rentalId: id, amountCents: 12345, method: 'PIX', paidAt: NOW, note: 'medicao' });
    f.run('addPayment', { rentalId: id, amountCents: 8000, method: 'CASH', paidAt: NOW, note: '' });
    assert.equal(row<{
        n: number;
    }>(f.db, 'SELECT SUM(amountCents) n FROM payments')!.n, 20345);
}
finally {
    f.close();
} });
test('received values are integer cents; partial payments and overpayment protection', () => { const f = fixture(); try {
    const id = f.create();
    f.run('addPayment', { rentalId: id, amountCents: 20000, method: 'PIX', paidAt: NOW, note: '' });
    rejects(() => f.run('addPayment', { rentalId: id, amountCents: 25001, method: 'CASH', paidAt: NOW, note: '' }), 409);
    rejects(() => f.run('addPayment', { rentalId: id, amountCents: 1.5, method: 'CASH', paidAt: NOW, note: '' }));
    f.run('addPayment', { rentalId: id, amountCents: 25000, method: 'TRANSFER', paidAt: NOW, note: '' });
    assert.equal(row<{
        n: number;
    }>(f.db, 'SELECT SUM(amountCents) n FROM payments')!.n, 45000);
}
finally {
    f.close();
} });
test('paid reservation requires admin reversal before cancellation', () => { const f = fixture(); try {
    const id = f.create(), p = f.run('addPayment', { rentalId: id, amountCents: 10000, method: 'PIX', paidAt: NOW, note: '' }).id!;
    rejects(() => f.transition(id, 'cancel', NOW), 409);
    rejects(() => f.run('voidPayment', { id: p, reason: 'Customer cancellation' }, 'ops'), 403);
    f.run('voidPayment', { id: p, reason: 'Customer cancellation' });
    f.transition(id, 'cancel', NOW);
    assert.equal(f.bin().status, 'AVAILABLE');
    assert.equal(f.rental(id).status, 'CANCELLED');
    assert.equal(rows(f.db, "SELECT * FROM jobs WHERE status='CANCELLED'").length, 2);
    assert.ok(row<{
        voidedAt: string;
    }>(f.db, 'SELECT voidedAt FROM payments WHERE id=?', p)!.voidedAt);
}
finally {
    f.close();
} });
test('idempotent retry cannot duplicate a receipt; a changed payload using the key conflicts', () => { const f = fixture(); try {
    const id = f.create(), key = randomUUID(), payload = { rentalId: id, amountCents: 10000, method: 'PIX', paidAt: NOW, note: '' };
    const a = f.run('addPayment', payload, 'admin', NOW, key), b = f.run('addPayment', payload, 'admin', NOW, key);
    assert.deepEqual(a, b);
    assert.equal(rows(f.db, 'SELECT * FROM payments').length, 1);
    rejects(() => f.run('addPayment', { ...payload, amountCents: 20000 }, 'admin', NOW, key), 409);
}
finally {
    f.close();
} });
test('resource maintenance refuses booked bins and trucks and releases after closure', () => { const f = fixture(); try {
    f.create();
    rejects(() => f.run('startMaintenance', { resource: 'container', resourceId: 'b1', description: 'Repair required' }), 409);
    rejects(() => f.run('startMaintenance', { resource: 'truck', resourceId: 't1', description: 'Service required' }), 409);
    const id = f.run('startMaintenance', { resource: 'truck', resourceId: 't2', description: 'Service required', costCents: 0 }).id!;
    assert.equal(row<{
        status: string;
    }>(f.db, "SELECT status FROM trucks WHERE id='t2'")!.status, 'MAINTENANCE');
    f.run('finishMaintenance', { id, resolution: 'Inspected and repaired', costCents: 13000 });
    assert.equal(row<{
        status: string;
    }>(f.db, "SELECT status FROM trucks WHERE id='t2'")!.status, 'AVAILABLE');
}
finally {
    f.close();
} });
test('physical inventory must be explicitly confirmed and only works on pending bins', () => { const f = fixture(); try {
    rejects(() => f.run('confirmInventory', { ids: ['b6'], capacityM3: 5, confirmed: false }));
    f.run('confirmInventory', { ids: ['b6', 'b6'], capacityM3: 4, confirmed: true });
    assert.equal(f.bin('b6').status, 'AVAILABLE');
    assert.equal(f.bin('b6').capacityM3, 4);
    rejects(() => f.run('confirmInventory', { ids: ['b6'], capacityM3: 5, confirmed: true }), 409);
}
finally {
    f.close();
} });
test('customer deactivation and driver deactivation reject outstanding operations', () => { const f = fixture(); try {
    f.create();
    rejects(() => f.run('updateCustomer', { id: 'c1', name: 'Customer 1', contact: 'Contact 1', phone: '11912345678', active: 0 }), 409);
    rejects(() => f.run('updateDriver', { id: 'd1', name: 'Driver 1', phone: '11912345678', license: 'CNH-1', category: 'D', licenseExpiry: '2099-12-31', active: 0 }), 409);
}
finally {
    f.close();
} });
test('administrator cannot deactivate own session; operators cannot edit permissions', () => { const f = fixture(); try {
    rejects(() => f.run('setUserActive', { id: 'admin', active: 0 }));
    rejects(() => f.run('setUserActive', { id: 'user1', active: 0 }, 'ops'), 403);
    f.run('setUserActive', { id: 'user1', active: 0 });
    rejects(() => snapshot(f.db, f.user('user1')), 401);
}
finally {
    f.close();
} });
test('password hashing uses random salts, verifies correctly and does not store cleartext', () => { const other = hashPassword(PASSWORD); assert.notEqual(HASH, other); assert.equal(verifyPassword(PASSWORD, HASH), true); assert.equal(verifyPassword('wrong password', HASH), false); assert.equal(verifyPassword(PASSWORD, 'invalid'), false); assert.equal(HASH.includes(PASSWORD), false); });
test('login creates opaque hashed sessions; deactivation revokes them', () => { const f = fixture(); try {
    const login = authenticate(f.db, ' ADMIN@TEST.LOCAL ', PASSWORD);
    assert.equal(login.user.id, 'admin');
    assert.equal('passwordHash' in login.user, false);
    assert.equal(sessionUser(f.db, login.token)?.id, 'admin');
    const s = row<{
        tokenHash: string;
    }>(f.db, 'SELECT tokenHash FROM sessions')!;
    assert.equal(s.tokenHash, sha256(login.token));
    assert.notEqual(s.tokenHash, login.token);
    const second = authenticate(f.db, 'user1@test.local', PASSWORD);
    f.run('setUserActive', { id: 'user1', active: 0 });
    assert.equal(sessionUser(f.db, second.token), null);
}
finally {
    f.close();
} });
test('brute-force throttling blocks a sixth login, then unlocks after timeout', () => { const f = fixture(); try {
    const at = new Date();
    for (let n = 0; n < 5; n++)
        rejects(() => authenticate(f.db, 'admin@test.local', 'wrong', at), 401);
    rejects(() => authenticate(f.db, 'admin@test.local', PASSWORD, at), 429);
    assert.equal(authenticate(f.db, 'admin@test.local', PASSWORD, new Date(at.getTime() + 16 * 60000)).user.id, 'admin');
}
finally {
    f.close();
} });
test('password change revokes all sessions and audit does not leak passwords', () => { const f = fixture(); try {
    const first = authenticate(f.db, 'admin@test.local', PASSWORD), second = authenticate(f.db, 'admin@test.local', PASSWORD);
    f.run('changePassword', { currentPassword: PASSWORD, newPassword: 'Another-private-password-789!' });
    assert.equal(sessionUser(f.db, first.token), null);
    assert.equal(sessionUser(f.db, second.token), null);
    assert.equal(JSON.stringify(rows(f.db, 'SELECT * FROM audit')).includes('Another-private'), false);
}
finally {
    f.close();
} });
test('UTC conversions are independent of runtime locale and round-trip Sao Paulo wall clock', () => { assert.equal(fromLocalInput('2026-09-15T08:30'), '2026-09-15T11:30:00.000Z'); assert.equal(toLocalInput('2026-09-15T02:00:00Z'), '2026-09-14T23:00'); assert.equal(dateKey('2026-09-15T02:00:00Z'), '2026-09-14'); assert.throws(() => fromLocalInput('2026-02-30T08:30')); });
test('CSV cells escape quotes and neutralize leading spreadsheet formulas', () => { assert.equal(csvCell('a"b'), '"a""b"'); assert.equal(csvCell(' =CMD()'), '"\' =CMD()"'); assert.equal(csvCell('+formula'), '"\'+formula"'); assert.equal(csvCell(null), '""'); });
test('on-disk persistence and consistent SQLite backup are readable after reopening', () => { const dir = mkdtempSync(join(tmpdir(), 'jr-persist-')), path = join(dir, 'jr.sqlite'), copy = join(dir, 'backup.sqlite'); let f: ReturnType<typeof fixture> | undefined; try {
    f = fixture(path);
    const id = f.create();
    f.db.prepare('VACUUM INTO ?').run(copy);
    f.close();
    f = undefined;
    const reopened = openDatabase(path), backup = openDatabase(copy);
    try {
        assert.equal(row<Rental>(reopened, 'SELECT * FROM rentals WHERE id=?', id)?.status, 'RESERVED');
        assert.equal(rows(backup, 'SELECT * FROM rentals').length, 1);
        assert.deepEqual(rows(backup, 'PRAGMA foreign_key_check'), []);
        assert.equal(row<{
            integrity_check: string;
        }>(backup, 'PRAGMA integrity_check')!.integrity_check, 'ok');
    }
    finally {
        reopened.close();
        backup.close();
    }
}
finally {
    f?.close();
    rmSync(dir, { recursive: true, force: true });
} });
test('two simultaneous processes racing for one bin: exactly one reservation commits', async () => { const dir = mkdtempSync(join(tmpdir(), 'jr-race-')), path = join(dir, 'jr.sqlite'), f = fixture(path), input = f.input(); f.close(); const service = new URL('../src/server/service.ts', import.meta.url).href, dbModule = new URL('../src/server/db.ts', import.meta.url).href; const script = `import {openDatabase,row} from ${JSON.stringify(dbModule)};import {execute} from ${JSON.stringify(service)};import {randomUUID} from 'node:crypto';const db=openDatabase(process.env.TEST_DB);const u=row(db,'SELECT * FROM users WHERE id=?','admin');try{execute(db,u,{action:'createRental',payload:JSON.parse(process.env.TEST_PAYLOAD)},randomUUID(),new Date(${JSON.stringify(NOW)}));console.log('OK');}catch(e){console.log(e.status===409?'CONFLICT':'ERROR:'+e.message);}finally{db.close();}`; function child() { return new Promise<string>((resolve, reject) => { const p = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { env: { ...process.env, TEST_DB: path, TEST_PAYLOAD: JSON.stringify(input) } }); let output = ''; p.stdout.on('data', d => output += d); p.on('error', reject); p.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('Worker exit ' + code))); }); } try {
    const result = (await Promise.all([child(), child()])).sort();
    assert.deepEqual(result, ['CONFLICT', 'OK']);
    const db = openDatabase(path);
    try {
        assert.equal(rows(db, 'SELECT * FROM rentals').length, 1);
        assert.equal(rows(db, 'SELECT * FROM jobs').length, 2);
    }
    finally {
        db.close();
    }
}
finally {
    rmSync(dir, { recursive: true, force: true });
} });
test('opening existing rentals declares historical delivery and schedules pickup without fake dispatch', () => { const f = fixture(); try {
    const id = f.run('importActiveRental', f.input({ containerId: 'b6', capacityM3: 4, confirmed: true, deliveryAt: '2026-09-10T11:00:00Z' })).id!;
    assert.equal(f.rental(id).status, 'ACTIVE');
    assert.equal(f.bin('b6').status, 'ON_SITE');
    assert.equal(f.bin('b6').capacityM3, 4);
    assert.equal(f.job(id).status, 'DONE');
    assert.equal(f.job(id).startedAt, null);
    assert.equal(f.rental(id).deliveredAt, '2026-09-10T11:00:00.000Z');
    assert.equal(f.job(id, 'PICKUP').status, 'SCHEDULED');
    assert.ok(row(f.db, "SELECT id FROM rentalEvents WHERE action='opening_import'"));
}
finally {
    f.close();
} });
test('opening cannot be performed by operator or use a confirmed/leased bin', () => { const f = fixture(); try {
    const input = f.input({ containerId: 'b6', capacityM3: 5, confirmed: true, deliveryAt: '2026-09-10T11:00:00Z' });
    rejects(() => f.run('importActiveRental', input, 'ops'), 403);
    rejects(() => f.run('importActiveRental', { ...input, confirmed: false }));
    rejects(() => f.run('importActiveRental', { ...input, containerId: 'b1' }), 409);
    rejects(() => f.run('importActiveRental', { ...input, deliveryAt: DELIVERY }));
    assert.equal(f.bin('b6').status, 'INVENTORY');
}
finally {
    f.close();
} });
test('unsuccessful delivery requires confirmed physical return and preserves reserved bin', () => { const f = fixture(); try {
    const id = f.create();
    f.transition(id, 'start_delivery');
    rejects(() => f.transition(id, 'abort_delivery', '2026-09-16T12:00:00Z', { notes: 'Site closed, returned to yard' }));
    f.transition(id, 'abort_delivery', '2026-09-16T12:00:00Z', { notes: 'Site closed, returned to yard', returnConfirmed: true }, 'user1');
    assert.equal(f.bin().status, 'RESERVED');
    assert.equal(f.rental(id).status, 'RESERVED');
    assert.equal(f.job(id).status, 'SCHEDULED');
    assert.equal(f.job(id).startedAt, null);
    const ev = row<{
        description: string;
    }>(f.db, "SELECT description FROM rentalEvents WHERE action='abort_delivery'")!;
    assert.match(ev.description, /16\/09\/2026/);
}
finally {
    f.close();
} });
test('unsuccessful pickup preserves bin location at client and records failed attempt', () => { const f = fixture(); try {
    const id = f.create();
    active(f, id);
    f.transition(id, 'start_pickup', PICKUP);
    f.transition(id, 'abort_pickup', '2026-09-23T12:00:00Z', { notes: 'Access blocked, truck returned to yard', returnConfirmed: true });
    assert.equal(f.bin().status, 'ON_SITE');
    assert.equal(f.rental(id).status, 'ACTIVE');
    assert.equal(f.rental(id).pickedUpAt, null);
    assert.equal(f.job(id, 'PICKUP').status, 'SCHEDULED');
}
finally {
    f.close();
} });
