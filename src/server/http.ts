import { AppError, assert } from './errors.ts';
import { SESSION_COOKIE, SESSION_SECONDS } from './auth.ts';
export function expectedOrigin(request: Request): string {
    const configured = process.env.APP_URL;
    assert(configured || process.env.NODE_ENV !== 'production', 'APP_URL deve ser configurada no servidor.', 503);
    return new URL(configured || request.url).origin;
}
export function sameOrigin(request: Request): void {
    const origin = request.headers.get('origin');
    assert(origin && origin === expectedOrigin(request), 'Origem da requisição não autorizada.', 403);
    const site = request.headers.get('sec-fetch-site');
    assert(!site || site === 'same-origin' || site === 'none', 'Requisição entre sites bloqueada.', 403);
}
export async function readJson(request: Request, maxBytes = 65536): Promise<unknown> {
    assert(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'Envie dados no formato JSON.', 415);
    const length = request.headers.get('content-length');
    if (length)
        assert(Number(length) <= maxBytes, 'Requisição muito grande.', 413);
    const reader = request.body?.getReader();
    assert(reader, 'Corpo da requisição ausente.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            assert(size <= maxBytes, 'Requisição muito grande.', 413);
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new AppError('JSON inválido.', 400);
    }
}
export function cookieToken(request: Request): string | undefined {
    return (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
}
export function sessionCookie(token: string, clear = false): string {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function errorResponse(error: unknown): Response {
    if (error instanceof AppError)
        return json({ error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '900' } : {});
    // Only emit a generic error to clients; never expose SQL, credentials or filesystem paths.
    console.error('[JR API]', error instanceof Error ? error.name : 'UnexpectedError');
    return json({ error: 'Falha interna. Atualize a tela. Se persistir, consulte o administrador.' }, 500);
}
