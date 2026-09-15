import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCepResult, cityWithState, digitsCep, formatCep, isCepField, isCompleteCep, parseViaCep } from '../src/shared/cep.ts';
import { lookupCep } from '../src/server/cep.ts';
import { AppError } from '../src/server/errors.ts';
import { handleApi } from '../src/server/api.ts';
import { openDatabase } from '../src/server/db.ts';
import { seed } from '../src/server/seed.ts';
const password = 'Private-test-admin-password!';
test('CEP helpers normalize digits, format and detect fields', () => {
    assert.equal(digitsCep('06786-050'), '06786050');
    assert.equal(formatCep('06786050'), '06786-050');
    assert.equal(isCompleteCep('06786-050'), true);
    assert.equal(isCompleteCep('06786'), false);
    assert.equal(isCepField({ name: 'postalCode', label: 'CEP' }), true);
    assert.equal(isCepField({ name: 'yardPostal', label: 'CEP do pátio' }), true);
    assert.equal(isCepField({ name: 'address', label: 'Rua' }), false);
    assert.equal(cityWithState('Cotia', 'SP'), 'Cotia / SP');
});
test('CEP provider parsers accept BrasilAPI and ViaCEP payloads', () => {
    const via = parseViaCep({ cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
    assert.equal(via?.city, 'São Paulo');
    assert.equal(via?.neighborhood, 'Bela Vista');
    assert.equal(parseViaCep({ erro: true }), null);
});
test('CEP result fills neighborhood and city on any matching form fields', () => {
    const address = { cep: '06786050', street: 'Rua Exemplo', neighborhood: 'Granja Viana', city: 'Cotia', state: 'SP', latitude: -23.6, longitude: -46.8 };
    const filled = applyCepResult({}, [{ name: 'postalCode' }, { name: 'neighborhood' }, { name: 'city' }, { name: 'address' }, { name: 'latitude' }, { name: 'longitude' }], address);
    assert.equal(filled.postalCode, '06786-050');
    assert.equal(filled.neighborhood, 'Granja Viana');
    assert.equal(filled.city, 'Cotia / SP');
    assert.equal(filled.address, 'Rua Exemplo');
    assert.equal(filled.latitude, -23.6);
    const customer = applyCepResult({}, [{ name: 'postalCode' }, { name: 'address' }], address);
    assert.equal(customer.address, 'Rua Exemplo, Granja Viana, Cotia / SP');
});
test('lookupCep rejects incomplete values before calling the provider', async () => {
    await assert.rejects(() => lookupCep('123', async () => { throw new Error('should not fetch'); }), (e: unknown) => e instanceof AppError && e.status === 400);
});
test('lookupCep uses BrasilAPI and falls back to ViaCEP', async () => {
    const brasil = await lookupCep('06786050', async () => new Response(JSON.stringify({ cep: '06786050', state: 'SP', city: 'Cotia', neighborhood: 'Granja Viana', street: 'Rua Teste', location: { coordinates: { latitude: '-23.6', longitude: '-46.8' } } })));
    assert.equal(brasil.city, 'Cotia');
    assert.equal(brasil.neighborhood, 'Granja Viana');
    assert.equal(brasil.latitude, -23.6);
    const via = await lookupCep('01310100', async (url) => {
        if (url.includes('brasilapi'))
            return new Response(JSON.stringify({ message: 'erro' }), { status: 404 });
        return new Response(JSON.stringify({ cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }));
    });
    assert.equal(via.city, 'São Paulo');
    assert.equal(via.neighborhood, 'Bela Vista');
    await assert.rejects(() => lookupCep('00000000', async () => new Response(JSON.stringify({ erro: true }))), (e: unknown) => e instanceof AppError && e.status === 404);
});
test('API cep route requires a session and validates the postal code', async () => {
    const db = openDatabase(':memory:');
    seed(db, { email: 'admin@test.local', password });
    const req = (path: string, cookie?: string) => handleApi(new Request('http://localhost:3000' + path, { headers: { origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) } }), db);
    try {
        assert.equal((await req('/api/cep/06786050')).status, 401);
        const login = await handleApi(new Request('http://localhost:3000/api/login', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password }) }), db);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        const invalid = await req('/api/cep/123', cookie);
        assert.equal(invalid.status, 400);
        const body = await invalid.json() as { error: string };
        assert.match(body.error, /8 dígitos/i);
    }
    finally {
        db.close();
    }
});
