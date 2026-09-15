import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, row } from '../src/server/db.ts';
import { seed } from '../src/server/seed.ts';
import { handleApi } from '../src/server/api.ts';
const password = 'Private-test-admin-password!';
function fixture() { const db = openDatabase(':memory:'); seed(db, { email: 'admin@test.local', password }); const req = (path: string, method = 'GET', body?: unknown, cookie?: string, headers: Record<string, string> = {}) => handleApi(new Request('http://localhost:3000' + path, { method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db); return { db, req, login: async () => { const r = await req('/api/login', 'POST', { email: 'admin@test.local', password }); assert.equal(r.status, 200); return r.headers.get('set-cookie')!.split(';')[0]; } }; }
test('API rejects anonymous access and never returns a password hash', async () => { const f = fixture(); try {
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
test('API writes persist and duplicate requests return one result', async () => { const f = fixture(); try {
    const c = await f.login(), key = randomUUID(), body = { action: 'createCustomer', payload: { name: 'API Customer', contact: 'Recipient', phone: '11912345678' } };
    const first = await f.req('/api/command', 'POST', body, c, { 'idempotency-key': key }), second = await f.req('/api/command', 'POST', body, c, { 'idempotency-key': key });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), await second.json());
    assert.equal(row<{
        n: number;
    }>(f.db, 'SELECT COUNT(*) n FROM customers')!.n, 1);
}
finally {
    f.db.close();
} });
test('API forbids cross-site writes even with a valid session cookie', async () => { const f = fixture(); try {
    const c = await f.login(), r = await f.req('/api/command', 'POST', { action: 'createCustomer', payload: {} }, c, { origin: 'https://evil.test', 'idempotency-key': randomUUID() });
    assert.equal(r.status, 403);
    assert.equal(row<{
        n: number;
    }>(f.db, 'SELECT COUNT(*) n FROM customers')!.n, 0);
}
finally {
    f.db.close();
} });
test('API logout invalidates server-side session', async () => { const f = fixture(); try {
    const c = await f.login();
    assert.equal((await f.req('/api/logout', 'POST', {}, c)).status, 200);
    assert.equal((await f.req('/api/snapshot', 'GET', undefined, c)).status, 401);
}
finally {
    f.db.close();
} });
test('API enforces idempotency and errors without exposing SQL or stack traces', async () => { const f = fixture(); try {
    const c = await f.login(), r = await f.req('/api/command', 'POST', { action: 'createCustomer', payload: {} }, c);
    assert.equal(r.status, 400);
    const s = await r.json();
    assert.equal('stack' in s, false);
    assert.equal('sql' in s, false);
}
finally {
    f.db.close();
} });
test('API preserves leading and trailing spaces in passwords during login and rotation', async () => {
    const db = openDatabase(':memory:');
    const original = '  test-secret-with-spaces  ', next = '  rotated-test-secret  ';
    seed(db, { email: 'spaces@test.local', password: original });
    const req = (path: string, body: unknown, cookie?: string) => handleApi(new Request('http://localhost:3000' + path, { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), db);
    try {
        const login = await req('/api/login', { email: 'spaces@test.local', password: original });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        const change = await req('/api/command', { action: 'changePassword', payload: { currentPassword: original, newPassword: next } }, cookie);
        assert.equal(change.status, 200);
        assert.equal((await req('/api/login', { email: 'spaces@test.local', password: next })).status, 200);
        assert.equal((await req('/api/login', { email: 'spaces@test.local', password: next.trim() })).status, 401);
    }
    finally {
        db.close();
    }
});
