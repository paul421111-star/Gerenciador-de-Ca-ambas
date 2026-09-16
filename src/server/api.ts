import { type DB, database, row } from './db.ts';
import { authenticate, sessionUser, revokeSession } from './auth.ts';
import { execute, snapshot } from './service.ts';
import { assert, AppError } from './errors.ts';
import { object, secret, email } from './validate.ts';
import { cookieToken, sessionCookie, sameOrigin, readJson, json, errorResponse } from './http.ts';
import { lookupCep } from './cep.ts';
import { lookupCnpj } from './cnpj.ts';
import { geocodePayload, lookupGeocode } from './geocode.ts';
/** Shared Web API handler: exercised directly by tests and exposed through Next Route Handlers. */
export async function handleApi(request: Request, providedDB?: DB): Promise<Response> {
    try {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, '');
        if (path === '/api/health' && request.method === 'GET')
            return json({ status: 'ok', service: 'JR Caçambas' });
        if (request.method !== 'GET' && request.method !== 'POST')
            throw new AppError('Método não permitido.', 405);
        // Reject cross-origin mutations before reading data or creating a database connection.
        if (request.method === 'POST')
            sameOrigin(request);
        const db = providedDB ?? await database();
        if (path === '/api/login' && request.method === 'POST') {
            assert(Number((await row<{
                n: number | string;
            }>(db, 'SELECT COUNT(*) AS n FROM users'))?.n ?? 0) > 0, 'Sistema não inicializado. Execute npm run setup no servidor.', 503);
            const p = object(await readJson(request, 4096));
            const result = await authenticate(db, email(p, 'email', true), secret(p, 'password', 1, 128));
            return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(result.token) });
        }
        const token = cookieToken(request), user = await sessionUser(db, token);
        assert(user, 'Sua sessão expirou. Entre novamente.', 401);
        if (path === '/api/logout' && request.method === 'POST') {
            await revokeSession(db, token);
            return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', true) });
        }
        if (path === '/api/snapshot' && request.method === 'GET')
            return json(await snapshot(db, user));
        if (request.method === 'GET' && (path === '/api/cep' || path.startsWith('/api/cep/'))) {
            const cep = path.startsWith('/api/cep/') ? path.slice('/api/cep/'.length) : url.searchParams.get('cep') ?? '';
            return json(await lookupCep(cep));
        }
        if (request.method === 'GET' && (path === '/api/cnpj' || path.startsWith('/api/cnpj/'))) {
            const cnpj = path.startsWith('/api/cnpj/') ? path.slice('/api/cnpj/'.length) : url.searchParams.get('cnpj') ?? '';
            return json(await lookupCnpj(cnpj));
        }
        if (request.method === 'GET' && path === '/api/geocode') {
            const query = url.searchParams.get('q') ?? url.searchParams.get('address') ?? '';
            return json(await lookupGeocode(query, { city: url.searchParams.get('city') ?? '' }));
        }
        if (path === '/api/command' && request.method === 'POST') {
            const body = await readJson(request, 200000) as { action?: string; payload?: Record<string, unknown> };
            if ((body.action === 'createRental' || body.action === 'importActiveRental') && body.payload)
                body.payload = await geocodePayload(body.payload);
            const result = await execute(db, user, body, request.headers.get('idempotency-key') ?? '');
            return json(result);
        }
        throw new AppError('Recurso não encontrado.', 404);
    }
    catch (error) {
        return errorResponse(error);
    }
}
