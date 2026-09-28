import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, row, usesPostgres } from '../src/server/db.ts';
import { seed } from '../src/server/seed.ts';
import { handleApi } from '../src/server/api.ts';
import { createCaptcha, createMathCaptcha } from '../src/server/captcha.ts';
const password = 'Private-test-admin-password!';
function solved<T extends Record<string, unknown>>(payload: T) {
    const captcha = createCaptcha();
    return { ...payload, captchaId: captcha.id, captchaAnswer: captcha.answer };
}
/** Login payload with the math captcha already solved (the login screen does the same through /api/login/captcha). */
export function credentials(login: string, pass: string) {
    const captcha = createMathCaptcha();
    return { login, password: pass, captchaId: captcha.id, captchaAnswer: captcha.answer };
}
async function fixture() { const db = openDatabase(':memory:'); await seed(db, { email: 'admin@test.local', password }); const req = (path: string, method = 'GET', body?: unknown, cookie?: string, headers: Record<string, string> = {}) => handleApi(new Request('http://localhost:3000' + path, { method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db); return { db, req, login: async () => { const r = await req('/api/login', 'POST', credentials('admin@test.local', password)); assert.equal(r.status, 200); return r.headers.get('set-cookie')!.split(';')[0]; } }; }
test('login accepts username or e-mail, requires the math captcha and rejects a reused challenge', async () => { const f = await fixture(); try {
    assert.equal((await f.req('/api/login', 'POST', { email: 'admin@test.local', password })).status, 400);
    const challenge = await f.req('/api/login/captcha');
    assert.equal(challenge.status, 200);
    const body = await challenge.json() as { id: string; question: string };
    assert.match(body.question, /^\d+ [+−] \d+$/);
    const [a, op, b] = body.question.split(' ');
    const answer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
    assert.ok(answer >= 0);
    const wrong = await f.req('/api/login', 'POST', { login: 'admin', password, captchaId: body.id, captchaAnswer: String(answer + 1) });
    assert.equal(wrong.status, 400);
    // A failed attempt consumes the challenge: the right answer no longer works with the same id.
    assert.equal((await f.req('/api/login', 'POST', { login: 'admin', password, captchaId: body.id, captchaAnswer: String(answer) })).status, 400);
    const byUsername = await f.req('/api/login', 'POST', credentials(' Admin ', password));
    assert.equal(byUsername.status, 200);
    assert.equal(((await byUsername.json()) as { user: { username: string } }).user.username, 'admin');
    assert.equal((await f.req('/api/login', 'POST', credentials('ADMIN@test.local', password))).status, 200);
    assert.equal((await f.req('/api/login', 'POST', credentials('someone-else', password))).status, 401);
}
finally {
    f.db.close();
} });
test('API rejects anonymous access and never returns a password hash', async () => { const f = await fixture(); try {
    assert.equal((await f.req('/api/snapshot')).status, 401);
    const c = await f.login(), r = await f.req('/api/snapshot', 'GET', undefined, c);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control')!, /no-store/);
    const s = await r.json();
    assert.equal(s.containers.length, 70);
    assert.equal(s.trucks.length, 2);
    assert.equal(JSON.stringify(s).includes('passwordHash'), false);
}
finally {
    f.db.close();
} });
test('API writes persist and duplicate requests return one result', async () => { const f = await fixture(); try {
    const c = await f.login(), key = randomUUID(), body = { action: 'createCustomer', payload: { name: 'API Customer', contact: 'Recipient', phone: '11912345678' } };
    const first = await f.req('/api/command', 'POST', body, c, { 'idempotency-key': key }), second = await f.req('/api/command', 'POST', body, c, { 'idempotency-key': key });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), await second.json());
    assert.equal((await row<{
        n: number;
    }>(f.db, 'SELECT COUNT(*) n FROM customers'))!.n, 1);
}
finally {
    f.db.close();
} });
test('public booking stores a request without creating an operational rental', async () => { const f = await fixture(); try {
    const preferredDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const payload = {
        customerName: 'Cliente Público',
        phone: '(11) 95629-2968',
        email: 'cliente@example.test',
        serviceType: 'RENTAL',
        postalCode: '06784-300',
        address: 'Rua Agelina, 424',
        neighborhood: 'Jardim Record',
        city: 'Taboão da Serra / SP',
        preferredDate,
        preferredPeriod: 'MORNING',
        wasteType: 'Entulho de obra / construção',
        notes: 'Portão lateral',
        companyWebsite: '',
        consent: true
    };
    const response = await f.req('/api/public/booking', 'POST', solved(payload));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.protocol, /^JR-\d{8}-[A-F0-9]{6}$/);
    assert.equal((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM bookingRequests'))!.n, 1);
    assert.equal((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM rentals'))!.n, 0);
    assert.equal((await f.req('/api/public/booking', 'POST', solved(payload))).status, 409);
    const cookie = await f.login();
    const snapshot = await (await f.req('/api/snapshot', 'GET', undefined, cookie)).json();
    assert.equal(snapshot.bookingRequests.length, 1);
    const update = await f.req('/api/command', 'POST', { action: 'updateBookingRequest', payload: { id: body.id, status: 'CONTACTED', statusNote: 'Contato iniciado pela equipe.' } }, cookie, { 'idempotency-key': randomUUID() });
    assert.equal(update.status, 200);
    assert.equal((await row<{ status: string }>(f.db, 'SELECT status FROM bookingRequests WHERE id=?', body.id))!.status, 'CONTACTED');
}
finally {
    f.db.close();
} });
test('public captcha hides the code and rejects a wrong or reused answer', async () => { const f = await fixture(); try {
    const issued = createCaptcha();
    assert.equal(issued.image.includes(issued.answer), false);
    assert.equal(issued.image.includes('<text'), false);
    const visible = await f.req('/api/public/captcha');
    assert.equal(visible.status, 200);
    assert.equal((await visible.json()).answer, undefined);
    const preferredDate = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
    const payload = { customerName: 'Cliente Captcha', phone: '11977776666', email: 'captcha@example.test', serviceType: 'RENTAL', postalCode: '', address: 'Rua do Teste, 8', neighborhood: 'Centro', city: 'Embu das Artes / SP', preferredDate, preferredPeriod: 'ANY', wasteType: 'Entulho', notes: '', companyWebsite: '', consent: true };
    const wrong = issued.answer.slice(0, 4) + (issued.answer.endsWith('A') ? 'B' : 'A');
    assert.equal((await f.req('/api/public/booking', 'POST', { ...payload, captchaId: issued.id, captchaAnswer: wrong })).status, 400);
    assert.equal((await f.req('/api/public/booking', 'POST', { ...payload, captchaId: issued.id, captchaAnswer: issued.answer })).status, 400);
    assert.equal((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM bookingRequests'))!.n, 0);
}
finally {
    f.db.close();
} });
test('public booking requires consent and rejects cross-site submissions', async () => { const f = await fixture(); try {
    const preferredDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const payload = { customerName: 'Cliente', phone: '11956292968', email: '', serviceType: 'RENTAL', postalCode: '', address: 'Rua de Teste, 10', neighborhood: 'Centro', city: 'Taboão da Serra / SP', preferredDate, preferredPeriod: 'ANY', wasteType: 'Entulho', notes: '', companyWebsite: '', consent: false };
    assert.equal((await f.req('/api/public/booking', 'POST', payload)).status, 400);
    assert.equal((await f.req('/api/public/booking', 'POST', { ...payload, consent: true }, undefined, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM bookingRequests'))!.n, 0);
}
finally {
    f.db.close();
} });
test('public booking status matches email and phone without exposing internal notes', async () => { const f = await fixture(); try {
    const preferredDate = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    const payload = { customerName: 'Cliente Consulta', phone: '(11) 98888-7777', email: 'Consulta@Example.Test', serviceType: 'EXCHANGE', postalCode: '', address: 'Rua Sigilosa, 50', neighborhood: 'Jardim Record', city: 'Taboão da Serra / SP', preferredDate, preferredPeriod: 'AFTERNOON', wasteType: 'Madeira', notes: 'Portão dos fundos', companyWebsite: '', consent: true };
    const created = await f.req('/api/public/booking', 'POST', solved(payload));
    assert.equal(created.status, 201);
    const protocol = (await created.json()).protocol;
    const byProtocol = await f.req('/api/public/booking/status', 'POST', { protocol: protocol.toLowerCase() });
    assert.equal(byProtocol.status, 200);
    assert.equal((await byProtocol.json()).requests[0].protocol, protocol);
    assert.equal((await (await f.req('/api/public/booking/status', 'POST', { protocol: 'JR-20260928-ABC123' })).json()).requests.length, 0);
    assert.equal((await f.req('/api/public/booking/status', 'POST', { protocol: 'pedido-123' })).status, 400);
    const found = await f.req('/api/public/booking/status', 'POST', { phone: '11988887777', email: 'consulta@example.test' });
    assert.equal(found.status, 200);
    const body = await found.json();
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].protocol, protocol);
    assert.equal(body.requests[0].status, 'NEW');
    assert.equal(body.requests[0].address, undefined);
    assert.equal(body.requests[0].notes, undefined);
    assert.equal(body.requests[0].statusNote, undefined);
    assert.equal((await f.req('/api/public/booking/status', 'POST', { phone: '11988887777', email: 'outro@example.test' })).status, 200);
    assert.equal((await (await f.req('/api/public/booking/status', 'POST', { phone: '11988887777', email: 'outro@example.test' })).json()).requests.length, 0);
    assert.equal((await f.req('/api/public/booking/status', 'POST', { phone: '11988887777', email: 'consulta@example.test' }, undefined, { origin: 'https://evil.test' })).status, 403);
}
finally {
    f.db.close();
} });
test('API forbids cross-site writes even with a valid session cookie', async () => { const f = await fixture(); try {
    const c = await f.login(), r = await f.req('/api/command', 'POST', { action: 'createCustomer', payload: {} }, c, { origin: 'https://evil.test', 'idempotency-key': randomUUID() });
    assert.equal(r.status, 403);
    assert.equal((await row<{
        n: number;
    }>(f.db, 'SELECT COUNT(*) n FROM customers'))!.n, 0);
}
finally {
    f.db.close();
} });
test('API logout invalidates server-side session', async () => { const f = await fixture(); try {
    const c = await f.login();
    assert.equal((await f.req('/api/logout', 'POST', {}, c)).status, 200);
    assert.equal((await f.req('/api/snapshot', 'GET', undefined, c)).status, 401);
}
finally {
    f.db.close();
} });
test('API enforces idempotency and errors without exposing SQL or stack traces', async () => { const f = await fixture(); try {
    const c = await f.login(), r = await f.req('/api/command', 'POST', { action: 'createCustomer', payload: {} }, c, { 'x-request-id': 'req-test-1' });
    assert.equal(r.status, 400);
    const s = await r.json();
    assert.equal(typeof s.error, 'string');
    assert.equal(s.code, 'VALIDATION');
    assert.equal(s.requestId, 'req-test-1');
    assert.deepEqual(s.fieldErrors, {});
    assert.equal(r.headers.get('x-request-id'), 'req-test-1');
    assert.equal('stack' in s, false);
    assert.equal('sql' in s, false);
}
finally {
    f.db.close();
} });
test('JR_FORCE_SQLITE keeps sqlite even if DATABASE_URL is present', () => {
    const previousUrl = process.env.DATABASE_URL, previousFlag = process.env.JR_FORCE_SQLITE;
    process.env.DATABASE_URL = 'postgresql://example.invalid/postgres';
    process.env.JR_FORCE_SQLITE = '1';
    try {
        assert.equal(usesPostgres(), false);
    }
    finally {
        if (previousUrl === undefined)
            delete process.env.DATABASE_URL;
        else
            process.env.DATABASE_URL = previousUrl;
        if (previousFlag === undefined)
            delete process.env.JR_FORCE_SQLITE;
        else
            process.env.JR_FORCE_SQLITE = previousFlag;
    }
});
test('API health is live-only and ready probes the database', async () => { const f = await fixture(); try {
    const health = await f.req('/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const ready = await f.req('/api/ready');
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, 'ready');
}
finally {
    f.db.close();
} });
test('API snapshot omits signature images and serves them on demand', async () => { const f = await fixture(); try {
    const c = await f.login();
    const created = await f.req('/api/command', 'POST', { action: 'createCustomer', payload: { name: 'Assinatura Cliente', contact: 'Obra', phone: '11912345678' } }, c, { 'idempotency-key': randomUUID() });
    assert.equal(created.status, 200);
    const denied = await f.req('/api/rentals/not-a-valid-id/signatures');
    assert.equal(denied.status, 401);
    const missing = await f.req('/api/rentals/00000000-0000-4000-8000-000000000000/signatures', 'GET', undefined, c);
    assert.equal(missing.status, 404);
    const body = await missing.json();
    assert.equal(body.code, 'NOT_FOUND');
    assert.equal(typeof body.error, 'string');
}
finally {
    f.db.close();
} });
test('API preserves leading and trailing spaces in passwords during login and rotation', async () => {
    const db = openDatabase(':memory:');
    const original = '  test-secret-with-spaces  ', next = '  rotated-test-secret  ';
    await seed(db, { email: 'spaces@test.local', password: original });
    const req = (path: string, body: unknown, cookie?: string) => handleApi(new Request('http://localhost:3000' + path, { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), db);
    try {
        const login = await req('/api/login', credentials('spaces@test.local', original));
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        const change = await req('/api/command', { action: 'changePassword', payload: { currentPassword: original, newPassword: next } }, cookie);
        assert.equal(change.status, 200);
        assert.equal((await req('/api/login', credentials('spaces@test.local', next))).status, 200);
        assert.equal((await req('/api/login', credentials('spaces@test.local', next.trim()))).status, 401);
    }
    finally {
        db.close();
    }
});
