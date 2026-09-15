import { assert } from './errors.ts';
export function object(value: unknown): Record<string, unknown> {
    assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'Dados da operação inválidos.');
    return value as Record<string, unknown>;
}
export function str(p: Record<string, unknown>, key: string, min = 0, max = 4000): string {
    const value = p[key] ?? '';
    assert(typeof value === 'string', `Campo ${key} deve ser um texto.`);
    const s = value.trim();
    assert(s.length >= min && s.length <= max, `Confira ${key}: utilize de ${min} a ${max} caracteres.`);
    return s;
}
export function num(p: Record<string, unknown>, key: string, min: number, max: number): number {
    const n = p[key];
    assert(typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max, `Valor inválido em ${key}.`);
    return n;
}
export function integer(p: Record<string, unknown>, key: string, min: number, max: number, fallback?: number): number {
    const n = num({ ...p, [key]: p[key] ?? fallback }, key, min, max);
    assert(Number.isSafeInteger(n), `O campo ${key} deve ser um número inteiro.`);
    return n;
}
export function choice<T extends string>(p: Record<string, unknown>, key: string, values: readonly T[]): T {
    const s = str(p, key, 1);
    assert(values.includes(s as T), `Opção inválida em ${key}.`);
    return s as T;
}
export function email(p: Record<string, unknown>, key: string, required = false): string {
    const s = str(p, key, required ? 3 : 0, 254).toLowerCase();
    assert(!s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Informe um e-mail válido.');
    return s;
}
export function phone(p: Record<string, unknown>, key: string, required = true): string {
    const s = str(p, key, 0, 30).replace(/\D/g, '');
    assert((!required && !s) || (s.length >= 10 && s.length <= 13), 'Informe um telefone com DDD.');
    return s;
}
export function iso(p: Record<string, unknown>, key: string): string {
    const s = str(p, key, 20, 40);
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(s), `Informe data, horário e fuso válidos em ${key}.`);
    const d = new Date(s);
    assert(Number.isFinite(d.getTime()), `Data inválida em ${key}.`);
    const day = s.slice(0, 10);
    assert(new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day, `Dia inválido em ${key}.`);
    return d.toISOString();
}
export function coordinates(p: Record<string, unknown>): {
    latitude: number | null;
    longitude: number | null;
} {
    const a = p.latitude ?? null, b = p.longitude ?? null;
    assert((a === null) === (b === null), 'Informe latitude e longitude juntas ou deixe ambas vazias.');
    return a === null ? { latitude: null, longitude: null } : { latitude: num(p, 'latitude', -90, 90), longitude: num(p, 'longitude', -180, 180) };
}
/** Passwords are opaque: never trim or normalize a user's secret. */
export function secret(p: Record<string, unknown>, key: string, min = 12, max = 128): string {
    const value = p[key];
    assert(typeof value === 'string' && value.length >= min && value.length <= max, `Campo ${key}: use de ${min} a ${max} caracteres.`);
    return value;
}
