import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCnpjResult, digitsDocument, formatDocument, isCompleteCnpj, isDocumentField, isValidCnpj, parseBrasilApiCnpj, parseReceitaWs } from '../src/shared/document.ts';
import { lookupCnpj } from '../src/server/cnpj.ts';
import { AppError } from '../src/server/errors.ts';
import { handleApi } from '../src/server/api.ts';
import { openDatabase } from '../src/server/db.ts';
import { seed } from '../src/server/seed.ts';
const password = 'Private-test-admin-password!';
const BB = '00000000000191';
test('document helpers normalize, format and detect CPF/CNPJ fields', () => {
    assert.equal(digitsDocument('11.222.333/0001-81'), '11222333000181');
    assert.equal(formatDocument('39053344705'), '390.533.447-05');
    assert.equal(formatDocument(BB), '00.000.000/0001-91');
    assert.equal(isValidCnpj(BB), true);
    assert.equal(isValidCnpj('11111111111111'), false);
    assert.equal(isCompleteCnpj('00.000.000/0001-91'), true);
    assert.equal(isCompleteCnpj('390.533.447-05'), false);
    assert.equal(isDocumentField({ name: 'document', label: 'CPF / CNPJ (opcional)' }), true);
    assert.equal(isDocumentField({ name: 'name', label: 'Nome / razão social' }), false);
});
test('CNPJ provider parsers accept BrasilAPI and ReceitaWS payloads', () => {
    const brasil = parseBrasilApiCnpj({ cnpj: BB, razao_social: 'BANCO DO BRASIL SA', nome_fantasia: 'BB', descricao_tipo_de_logradouro: 'QUADRA', logradouro: 'SAUN', numero: '5', bairro: 'ASA NORTE', cep: '70040912', municipio: 'BRASILIA', uf: 'DF' });
    assert.equal(brasil?.name, 'BANCO DO BRASIL SA');
    assert.equal(brasil?.street, 'QUADRA SAUN, 5');
    assert.equal(brasil?.city, 'BRASILIA');
    const receita = parseReceitaWs({ status: 'OK', cnpj: '00.000.000/0001-91', nome: 'BANCO DO BRASIL SA', logradouro: 'QUADRA SAUN', numero: '5', bairro: 'ASA NORTE', municipio: 'BRASILIA', uf: 'DF', cep: '70.040-912' });
    assert.equal(receita?.name, 'BANCO DO BRASIL SA');
    assert.equal(parseReceitaWs({ status: 'ERROR', message: 'CNPJ rejeitado' }), null);
});
test('CNPJ result fills company name and cadastral address', () => {
    const company = { cnpj: BB, name: 'BANCO DO BRASIL SA', tradeName: 'BB', street: 'QUADRA SAUN, 5', neighborhood: 'ASA NORTE', city: 'BRASILIA', state: 'DF', postalCode: '70040912' };
    const customer = applyCnpjResult({ name: 'Cliente antigo' }, [{ name: 'document' }, { name: 'name' }, { name: 'postalCode' }, { name: 'address' }], company);
    assert.equal(customer.name, 'BANCO DO BRASIL SA');
    assert.equal(customer.document, '00.000.000/0001-91');
    assert.equal(customer.postalCode, '70040-912');
    assert.equal(customer.address, 'QUADRA SAUN, 5, ASA NORTE, BRASILIA / DF');
});
test('lookupCnpj rejects incomplete or invalid values before calling the provider', async () => {
    await assert.rejects(() => lookupCnpj('123', async () => { throw new Error('should not fetch'); }), (e: unknown) => e instanceof AppError && e.status === 400);
    await assert.rejects(() => lookupCnpj('11111111111111', async () => { throw new Error('should not fetch'); }), (e: unknown) => e instanceof AppError && e.status === 400);
});
test('lookupCnpj uses BrasilAPI and falls back to ReceitaWS', async () => {
    const brasil = await lookupCnpj(BB, async () => new Response(JSON.stringify({ cnpj: BB, razao_social: 'BANCO DO BRASIL SA', municipio: 'BRASILIA', uf: 'DF' })));
    assert.equal(brasil.name, 'BANCO DO BRASIL SA');
    const receita = await lookupCnpj(BB, async (url) => {
        if (String(url).includes('brasilapi'))
            return new Response(JSON.stringify({ message: 'erro' }), { status: 404 });
        return new Response(JSON.stringify({ status: 'OK', nome: 'BANCO DO BRASIL SA', municipio: 'BRASILIA', uf: 'DF' }));
    });
    assert.equal(receita.name, 'BANCO DO BRASIL SA');
    await assert.rejects(() => lookupCnpj('33000167000101', async () => new Response(JSON.stringify({ status: 'ERROR' }))), (e: unknown) => e instanceof AppError && e.status === 404);
});
test('API cnpj route requires a session and validates the company document', async () => {
    const db = openDatabase(':memory:');
    seed(db, { email: 'admin@test.local', password });
    const req = (path: string, cookie?: string) => handleApi(new Request('http://localhost:3000' + path, { headers: { origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) } }), db);
    try {
        assert.equal((await req('/api/cnpj/' + BB)).status, 401);
        const login = await handleApi(new Request('http://localhost:3000/api/login', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password }) }), db);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        const invalid = await req('/api/cnpj/123', cookie);
        assert.equal(invalid.status, 400);
        const body = await invalid.json() as { error: string };
        assert.match(body.error, /14 dígitos/i);
    }
    finally {
        db.close();
    }
});
