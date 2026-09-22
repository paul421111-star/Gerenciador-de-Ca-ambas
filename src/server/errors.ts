export class AppError extends Error {
    readonly status: number;
    readonly code: string;
    requestId?: string;
    constructor(message: string, status = 400, code?: string) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code ?? errorCode(status);
    }
}

export function errorCode(status: number): string {
    if (status === 401)
        return 'UNAUTHENTICATED';
    if (status === 403)
        return 'FORBIDDEN';
    if (status === 404)
        return 'NOT_FOUND';
    if (status === 409)
        return 'CONFLICT';
    if (status === 413)
        return 'PAYLOAD_TOO_LARGE';
    if (status === 415)
        return 'UNSUPPORTED_MEDIA';
    if (status === 422)
        return 'UNPROCESSABLE';
    if (status === 405)
        return 'METHOD_NOT_ALLOWED';
    if (status === 429)
        return 'RATE_LIMITED';
    if (status === 503)
        return 'UNAVAILABLE';
    if (status >= 500)
        return 'INTERNAL';
    return 'VALIDATION';
}
export function assert(condition: unknown, message: string, status = 400): asserts condition {
    if (!condition)
        throw new AppError(message, status);
}
export function unavailableDatabase(error: unknown): AppError | null {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code ?? '') : '';
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /tenant\/user|getaddrinfo ENOTFOUND|CONNECT_TIMEOUT|timeout expired/i.test(message))
        return new AppError('Não foi possível conectar ao banco. Confira se o projeto do Supabase está ativo e se a conexão em .env está atualizada.', 503);
    return null;
}
