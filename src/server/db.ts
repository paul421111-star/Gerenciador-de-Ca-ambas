import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA } from './schema.ts';
import type { Settings } from '../shared/types.ts';
export type DB = DatabaseSync;
export const DEFAULT_SETTINGS: Settings = { companyName: 'JR Caçambas', companyPhone: '', yardAddress: '', defaultDays: 7, defaultPriceCents: 0, jobDurationMinutes: 60, demo: false, timezone: 'America/Sao_Paulo' };
export function row<T = Record<string, unknown>>(db: DB, sql: string, ...args: SQLInputValue[]): T | undefined { return db.prepare(sql).get(...args) as T | undefined; }
export function rows<T = Record<string, unknown>>(db: DB, sql: string, ...args: SQLInputValue[]): T[] { return db.prepare(sql).all(...args) as unknown as T[]; }
export function tx<T>(db: DB, fn: () => T, readOnly = false): T { db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE'); try {
    const value = fn();
    db.exec('COMMIT');
    return value;
}
catch (e) {
    db.exec('ROLLBACK');
    throw e;
} }
export function openDatabase(path: string): DB {
    if (path !== ':memory:')
        mkdirSync(dirname(resolve(path)), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    tx(db, () => {
        db.exec(SCHEMA);
        db.prepare('INSERT OR IGNORE INTO settings(id,json) VALUES(1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
        db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(1,?)').run(new Date().toISOString());
        const columns = rows<{ name: string }>(db, 'PRAGMA table_info(rentals)');
        if (!columns.some(column => column.name === 'byMeasurement'))
            db.exec('ALTER TABLE rentals ADD COLUMN byMeasurement INTEGER NOT NULL DEFAULT 0');
        db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(2,?)').run(new Date().toISOString());
        if (!columns.some(column => column.name === 'openEndedPickup'))
            db.exec('ALTER TABLE rentals ADD COLUMN openEndedPickup INTEGER NOT NULL DEFAULT 0');
        db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(3,?)').run(new Date().toISOString());
        const rentalColumns = rows<{ name: string }>(db, 'PRAGMA table_info(rentals)');
        if (!rentalColumns.some(column => column.name === 'siteId'))
            db.exec('ALTER TABLE rentals ADD COLUMN siteId TEXT REFERENCES customerSites(id)');
        db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(4,?)').run(new Date().toISOString());
        db.exec(`CREATE TABLE IF NOT EXISTS rentalSignatures (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), kind TEXT NOT NULL CHECK(kind IN ('DELIVERY','PICKUP')),
 role TEXT NOT NULL CHECK(role IN ('RESPONSIBLE','DRIVER')), signerName TEXT NOT NULL, image TEXT NOT NULL, signedAt TEXT NOT NULL,
 actorId TEXT NOT NULL REFERENCES users(id), UNIQUE(rentalId, kind, role)
)`);
        db.exec('CREATE INDEX IF NOT EXISTS idx_rental_signatures ON rentalSignatures(rentalId, kind)');
        db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(5,?)').run(new Date().toISOString());
    });
    if (path !== ':memory:') {
        try {
            chmodSync(path, 0o600);
        }
        catch { /* Windows permissions are managed by the OS. */ }
    }
    return db;
}
export function settings(db: DB): Settings { return { ...DEFAULT_SETTINGS, ...JSON.parse(row<{
        json: string;
    }>(db, 'SELECT json FROM settings WHERE id=1')!.json) }; }
export const databasePath = () => resolve(process.env.DATABASE_PATH || './data/jr.sqlite');
const state = globalThis as unknown as {
    jrDB?: DB;
};
export function database(): DB { return state.jrDB ??= openDatabase(databasePath()); }
