import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { type DB, row, tx } from './db.ts';
import { assert, AppError } from './errors.ts';
import type { User, Role } from '../shared/types.ts';
export const USER_COLUMNS = 'id,name,email,role,driverId,active,createdAt';
export const SESSION_COOKIE = 'jr_session';
export const SESSION_SECONDS = 12 * 60 * 60;
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password: string): string {
    assert(password.length >= 12 && password.length <= 128, 'A senha deve ter de 12 a 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string): boolean {
    try {
        if (typeof password !== 'string' || password.length > 128)
            return false;
        const [kind, salt, digest] = hash.split(':');
        if (kind !== 'scrypt' || !salt || !digest || !/^[a-f0-9]{128}$/.test(digest))
            return false;
        return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(password, salt, 64));
    }
    catch {
        return false;
    }
}
export async function createAccount(db: DB, input: {
    name: string;
    email: string;
    password: string;
    role: Role;
    driverId: string | null;
}, now = new Date().toISOString()): Promise<string> {
    const id = randomUUID();
    await db.run('INSERT INTO users(id,name,email,passwordHash,role,driverId,createdAt) VALUES(?,?,?,?,?,?,?)', id, input.name, input.email.trim().toLowerCase(), hashPassword(input.password), input.role, input.driverId, now);
    return id;
}
const DUMMY_HASH = 'scrypt:706d2e3e2f163ff805d0918679511ac8:' + scryptSync('not-a-real-user-password', '706d2e3e2f163ff805d0918679511ac8', 64).toString('hex');
export async function authenticate(db: DB, email: string, password: string, at = new Date()): Promise<{ user: User; token: string; expiresAt: string; }> {
    const normalized = email.trim().toLowerCase();
    assert(normalized.length <= 254 && password.length <= 128, 'Credenciais inválidas.', 401);
    const key = sha256(normalized), now = at.toISOString();
    // Commit failed attempts rather than rolling them back with the login error.
    const result = await tx(db, async () => {
        const attempt = await row<{
            count: number;
            updatedAt: string;
            blockedUntil: string | null;
        }>(db, 'SELECT * FROM loginAttempts WHERE key=?', key);
        if (attempt?.blockedUntil && attempt.blockedUntil > now)
            return { error: new AppError('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.', 429) };
        const stored = await row<User & {
            passwordHash: string;
        }>(db, 'SELECT * FROM users WHERE email=?', normalized);
        const valid = verifyPassword(password, stored?.passwordHash ?? DUMMY_HASH);
        if (!stored || !stored.active || !valid) {
            const count = attempt && at.getTime() - Date.parse(attempt.updatedAt) < 15 * 60000 ? attempt.count + 1 : 1;
            await db.run('INSERT INTO loginAttempts(key,count,updatedAt,blockedUntil) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,updatedAt=excluded.updatedAt,blockedUntil=excluded.blockedUntil', key, count, now, count >= 5 ? new Date(at.getTime() + 15 * 60000).toISOString() : null);
            return { error: new AppError('E-mail ou senha incorretos.', 401) };
        }
        await db.run('DELETE FROM loginAttempts WHERE key=?', key);
        await db.run('DELETE FROM sessions WHERE expiresAt<=?', now);
        const token = randomBytes(32).toString('base64url'), expiresAt = new Date(at.getTime() + SESSION_SECONDS * 1000).toISOString();
        await db.run('INSERT INTO sessions(tokenHash,userId,expiresAt) VALUES(?,?,?)', sha256(token), stored.id, expiresAt);
        const { passwordHash: _, ...user } = stored;
        return { user, token, expiresAt };
    });
    if ('error' in result)
        throw result.error;
    return result;
}
export async function sessionUser(db: DB, token: string | undefined, at = new Date()): Promise<User | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        return null;
    const session = await row<{
        userId: string;
    }>(db, 'SELECT userId FROM sessions WHERE tokenHash=? AND expiresAt>?', sha256(token), at.toISOString());
    return session ? await row<User>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id=? AND active=1`, session.userId) ?? null : null;
}
export async function revokeSession(db: DB, token: string | undefined): Promise<void> { if (token)
    await db.run('DELETE FROM sessions WHERE tokenHash=?', sha256(token)); }
