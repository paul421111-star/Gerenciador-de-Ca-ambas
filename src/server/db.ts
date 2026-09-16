import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import postgres, { type Sql } from 'postgres';
import { SCHEMA } from './schema.ts';
import { POSTGRES_SCHEMA } from './schema.postgres.ts';
import type { Settings } from '../shared/types.ts';

export type SqlValue = string | number | bigint | boolean | null | Uint8Array | undefined;
export type Dialect = 'sqlite' | 'postgres';
export interface Statement {
    run(...args: SqlValue[]): unknown;
    get(...args: SqlValue[]): unknown;
    all(...args: SqlValue[]): unknown[];
}
export interface DB {
    dialect: Dialect;
    row<T = Record<string, unknown>>(sql: string, ...args: SqlValue[]): Promise<T | undefined>;
    rows<T = Record<string, unknown>>(sql: string, ...args: SqlValue[]): Promise<T[]>;
    run(sql: string, ...args: SqlValue[]): Promise<void>;
    exec(sql: string): Promise<void>;
    tx<T>(fn: () => Promise<T> | T, readOnly?: boolean): Promise<T>;
    prepare(sql: string): Statement;
    close(): Promise<void> | void;
}

export const DEFAULT_SETTINGS: Settings = { companyName: 'JR Caçambas', companyPhone: '', yardAddress: '', defaultDays: 7, defaultPriceCents: 0, jobDurationMinutes: 60, demo: false, timezone: 'America/Sao_Paulo' };
export const usesPostgres = () => Boolean(process.env.DATABASE_URL);
export const databasePath = () => resolve(process.env.DATABASE_PATH || './data/jr.sqlite');
export const postgresUrl = () => process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || '';

const CAMEL_COLUMNS = [
    'appliedAt', 'licenseExpiry', 'createdAt', 'passwordHash', 'driverId',
    'tokenHash', 'userId', 'expiresAt', 'updatedAt', 'blockedUntil',
    'customerId', 'postalCode', 'locationPrecision', 'capacityM3',
    'containerId', 'siteId', 'siteContact', 'sitePhone', 'wasteType',
    'deliveryAt', 'pickupAt', 'deliveredAt', 'pickedUpAt', 'returnedAt',
    'priceCents', 'byMeasurement', 'openEndedPickup', 'createdBy',
    'rentalId', 'scheduledAt', 'durationMinutes', 'startedAt', 'completedAt',
    'actorId', 'occurredAt', 'amountCents', 'paidAt', 'voidedAt', 'voidReason',
    'truckId', 'costCents', 'openedAt', 'closedAt', 'signerName', 'signedAt',
    'replacedAt', 'replacedBy', 'replaceReason'
] as const;
const COLUMN_ALIASES = Object.fromEntries(CAMEL_COLUMNS.map(name => [name.toLowerCase(), name]));
function normalizeValue(value: unknown): unknown {
    if (typeof value === 'bigint')
        return Number(value);
    return value;
}
function normalizeRow<T>(record: Record<string, unknown> | undefined | null): T | undefined {
    if (!record)
        return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record))
        out[COLUMN_ALIASES[key.toLowerCase()] ?? key] = normalizeValue(value);
    return out as T;
}
function normalizeRows<T>(records: Record<string, unknown>[]): T[] {
    return records.map(record => normalizeRow<T>(record)!);
}
function bindArgs(args: SqlValue[]): SQLInputValue[] {
    return args.map(value => value === undefined ? null : value as SQLInputValue);
}
export function parameterized(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}
function sqlStatements(sql: string): string[] {
    return sql.replace(/--[^\n]*/g, '').split(';').map(part => part.trim()).filter(Boolean);
}

class SqliteDB implements DB {
    dialect = 'sqlite' as const;
    private readonly raw: DatabaseSync;
    constructor(raw: DatabaseSync) {
        this.raw = raw;
    }
    async row<T>(sql: string, ...args: SqlValue[]): Promise<T | undefined> {
        return normalizeRow<T>(this.raw.prepare(sql).get(...bindArgs(args)) as Record<string, unknown> | undefined);
    }
    async rows<T>(sql: string, ...args: SqlValue[]): Promise<T[]> {
        return normalizeRows<T>(this.raw.prepare(sql).all(...bindArgs(args)) as Record<string, unknown>[]);
    }
    async run(sql: string, ...args: SqlValue[]): Promise<void> {
        this.raw.prepare(sql).run(...bindArgs(args));
    }
    async exec(sql: string): Promise<void> {
        this.raw.exec(sql);
    }
    async tx<T>(fn: () => Promise<T> | T, readOnly = false): Promise<T> {
        this.raw.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
        try {
            const value = await fn();
            this.raw.exec('COMMIT');
            return value;
        }
        catch (error) {
            this.raw.exec('ROLLBACK');
            throw error;
        }
    }
    prepare(sql: string): Statement {
        const statement = this.raw.prepare(sql);
        return {
            run: (...args) => statement.run(...bindArgs(args)),
            get: (...args) => statement.get(...bindArgs(args)),
            all: (...args) => statement.all(...bindArgs(args))
        };
    }
    close(): void {
        this.raw.close();
    }
}

const postgresTx = new AsyncLocalStorage<Sql>();
class PostgresDB implements DB {
    dialect = 'postgres' as const;
    private readonly pool: Sql;
    constructor(pool: Sql) {
        this.pool = pool;
    }
    private sql(): Sql {
        return postgresTx.getStore() ?? this.pool;
    }
    async row<T>(text: string, ...args: SqlValue[]): Promise<T | undefined> {
        const result = await this.sql().unsafe(parameterized(text), args.map(value => value === undefined ? null : value) as never[]);
        return normalizeRow<T>(result[0] as Record<string, unknown> | undefined);
    }
    async rows<T>(text: string, ...args: SqlValue[]): Promise<T[]> {
        const result = await this.sql().unsafe(parameterized(text), args.map(value => value === undefined ? null : value) as never[]);
        return normalizeRows<T>(result as unknown as Record<string, unknown>[]);
    }
    async run(text: string, ...args: SqlValue[]): Promise<void> {
        await this.sql().unsafe(parameterized(text), args.map(value => value === undefined ? null : value) as never[]);
    }
    async exec(text: string): Promise<void> {
        for (const statement of sqlStatements(text))
            await this.sql().unsafe(statement);
    }
    async tx<T>(fn: () => Promise<T> | T): Promise<T> {
        return this.pool.begin(sql => postgresTx.run(sql, fn)) as Promise<T>;
    }
    prepare(_sql: string): Statement {
        throw new Error('prepared statements do not run on the Supabase transaction pooler');
    }
    async close(): Promise<void> {
        await this.pool.end({ timeout: 5 });
    }
}

function migrateSqlite(db: DatabaseSync): void {
    db.exec(SCHEMA);
    db.prepare('INSERT OR IGNORE INTO settings(id,json) VALUES(1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
    db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(1,?)').run(new Date().toISOString());
    const columns = db.prepare('PRAGMA table_info(rentals)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'byMeasurement'))
        db.exec('ALTER TABLE rentals ADD COLUMN byMeasurement INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(2,?)').run(new Date().toISOString());
    if (!columns.some(column => column.name === 'openEndedPickup'))
        db.exec('ALTER TABLE rentals ADD COLUMN openEndedPickup INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(3,?)').run(new Date().toISOString());
    const rentalColumns = db.prepare('PRAGMA table_info(rentals)').all() as { name: string }[];
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
    const latestRentals = db.prepare('PRAGMA table_info(rentals)').all() as { name: string }[];
    const latestSites = db.prepare('PRAGMA table_info(customerSites)').all() as { name: string }[];
    if (!latestRentals.some(column => column.name === 'locationPrecision'))
        db.exec("ALTER TABLE rentals ADD COLUMN locationPrecision TEXT NOT NULL DEFAULT 'PENDING'");
    if (!latestSites.some(column => column.name === 'locationPrecision'))
        db.exec("ALTER TABLE customerSites ADD COLUMN locationPrecision TEXT NOT NULL DEFAULT 'PENDING'");
    db.exec(`UPDATE rentals SET locationPrecision='APPROXIMATE' WHERE latitude IS NOT NULL AND locationPrecision='PENDING'`);
    db.exec(`UPDATE customerSites SET locationPrecision='APPROXIMATE' WHERE latitude IS NOT NULL AND locationPrecision='PENDING'`);
    db.exec(`CREATE TABLE IF NOT EXISTS rentalSignatureRevisions (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), kind TEXT NOT NULL CHECK(kind IN ('DELIVERY','PICKUP')),
 role TEXT NOT NULL CHECK(role IN ('RESPONSIBLE','DRIVER')), signerName TEXT NOT NULL, image TEXT NOT NULL, signedAt TEXT NOT NULL,
 actorId TEXT NOT NULL REFERENCES users(id), replacedAt TEXT NOT NULL, replacedBy TEXT NOT NULL REFERENCES users(id), replaceReason TEXT NOT NULL
)`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_rental_signature_revisions ON rentalSignatureRevisions(rentalId, kind, replacedAt)');
    db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(6,?)').run(new Date().toISOString());
}

function sqlitePickupNotNull(db: DatabaseSync): boolean {
    const pickup = (db.prepare('PRAGMA table_info(rentals)').all() as { name: string; notnull: number }[]).find(column => column.name === 'pickupAt');
    return pickup?.notnull === 1;
}

function rebuildSqliteRentals(db: DatabaseSync): void {
    db.exec(`
CREATE TABLE rentals_mig (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, containerId TEXT NOT NULL REFERENCES containers(id), customerId TEXT NOT NULL REFERENCES customers(id),
 siteId TEXT REFERENCES customerSites(id),
 address TEXT NOT NULL, neighborhood TEXT NOT NULL, city TEXT NOT NULL, postalCode TEXT NOT NULL DEFAULT '', siteContact TEXT NOT NULL, sitePhone TEXT NOT NULL,
 latitude REAL, longitude REAL, locationPrecision TEXT NOT NULL DEFAULT 'PENDING',
 wasteType TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', deliveryAt TEXT NOT NULL, pickupAt TEXT,
 deliveredAt TEXT, pickedUpAt TEXT, returnedAt TEXT,
 status TEXT NOT NULL, priceCents INTEGER NOT NULL, byMeasurement INTEGER NOT NULL DEFAULT 0, openEndedPickup INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, createdBy TEXT NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL
);
INSERT INTO rentals_mig(id,code,containerId,customerId,siteId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,locationPrecision,wasteType,notes,deliveryAt,pickupAt,deliveredAt,pickedUpAt,returnedAt,status,priceCents,byMeasurement,openEndedPickup,version,createdBy,createdAt)
SELECT id,code,containerId,customerId,siteId,address,neighborhood,city,postalCode,siteContact,sitePhone,latitude,longitude,
 CASE WHEN latitude IS NULL THEN 'PENDING' ELSE locationPrecision END,
 wasteType,notes,deliveryAt,
 CASE WHEN openEndedPickup=1 AND pickedUpAt IS NULL THEN NULL ELSE pickupAt END,
 deliveredAt,pickedUpAt,returnedAt,status,priceCents,byMeasurement,openEndedPickup,version,createdBy,createdAt
FROM rentals;
DROP TABLE rentals;
ALTER TABLE rentals_mig RENAME TO rentals;
CREATE UNIQUE INDEX IF NOT EXISTS idx_container_open_rental ON rentals(containerId) WHERE status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_rental_pickup ON rentals(status,pickupAt);
`);
    db.prepare('INSERT OR IGNORE INTO migrations(version,appliedAt) VALUES(7,?)').run(new Date().toISOString());
}

export function openDatabase(path: string): DB {
    if (path !== ':memory:')
        mkdirSync(dirname(resolve(path)), { recursive: true });
    const raw = new DatabaseSync(path);
    raw.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    raw.exec('BEGIN IMMEDIATE');
    try {
        migrateSqlite(raw);
        raw.exec('COMMIT');
    }
    catch (error) {
        raw.exec('ROLLBACK');
        raw.close();
        throw error;
    }
    if (sqlitePickupNotNull(raw)) {
        raw.exec('PRAGMA foreign_keys=OFF');
        raw.exec('BEGIN IMMEDIATE');
        try {
            rebuildSqliteRentals(raw);
            raw.exec('COMMIT');
        }
        catch (error) {
            raw.exec('ROLLBACK');
            raw.close();
            throw error;
        }
        raw.exec('PRAGMA foreign_keys=ON');
    }
    if (path !== ':memory:') {
        try {
            chmodSync(path, 0o600);
        }
        catch { /* Windows permissions are managed by the OS. */ }
    }
    return new SqliteDB(raw);
}

async function migratePostgres(db: DB): Promise<void> {
    await db.exec(POSTGRES_SCHEMA);
    await db.run('INSERT INTO settings(id,json) VALUES(1,?) ON CONFLICT(id) DO NOTHING', JSON.stringify(DEFAULT_SETTINGS));
    const now = new Date().toISOString();
    for (const version of [1, 2, 3, 4, 5])
        await db.run('INSERT INTO migrations(version,appliedAt) VALUES(?,?) ON CONFLICT(version) DO NOTHING', version, now);
    await db.exec("ALTER TABLE rentals ADD COLUMN IF NOT EXISTS locationPrecision TEXT NOT NULL DEFAULT 'PENDING'");
    await db.exec("ALTER TABLE customerSites ADD COLUMN IF NOT EXISTS locationPrecision TEXT NOT NULL DEFAULT 'PENDING'");
    await db.exec("UPDATE rentals SET locationPrecision='APPROXIMATE' WHERE latitude IS NOT NULL AND locationPrecision='PENDING'");
    await db.exec("UPDATE customerSites SET locationPrecision='APPROXIMATE' WHERE latitude IS NOT NULL AND locationPrecision='PENDING'");
    try {
        await db.exec('ALTER TABLE rentals ALTER COLUMN pickupAt DROP NOT NULL');
    }
    catch { /* already nullable on new databases */ }
    const checks = await db.rows<{ conname: string; def: string }>('SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = \'rentals\'::regclass AND contype = \'c\'');
    for (const check of checks) {
        if (/pickupAt > deliveryAt/.test(check.def) && !/IS NULL/.test(check.def))
            await db.exec(`ALTER TABLE rentals DROP CONSTRAINT ${check.conname}`);
    }
    await db.exec('UPDATE rentals SET pickupAt=NULL WHERE openEndedPickup=1 AND pickedUpAt IS NULL');
    const after = await db.rows<{ def: string }>('SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = \'rentals\'::regclass AND contype = \'c\'');
    if (!after.some(check => /pickupAt IS NULL/i.test(check.def))) {
        try {
            await db.exec('ALTER TABLE rentals ADD CONSTRAINT rentals_pickup_at_open CHECK (pickupAt IS NULL OR pickupAt > deliveryAt)');
        }
        catch (error) {
            if (!String((error as { code?: string }).code || error).includes('42710'))
                throw error;
        }
    }
    await db.run('INSERT INTO migrations(version,appliedAt) VALUES(?,?) ON CONFLICT(version) DO NOTHING', 6, now);
    await db.run('INSERT INTO migrations(version,appliedAt) VALUES(?,?) ON CONFLICT(version) DO NOTHING', 7, now);
}

export async function openPostgres(url = postgresUrl()): Promise<DB> {
    if (!url)
        throw new Error('Defina DATABASE_URL com a conexão do Supabase.');
    const sql = postgres(url, {
        prepare: false,
        ssl: 'require',
        max: 8,
        idle_timeout: 20,
        connect_timeout: 30
    });
    const db = new PostgresDB(sql);
    await migratePostgres(db);
    return db;
}

export async function row<T = Record<string, unknown>>(db: DB, sql: string, ...args: SqlValue[]): Promise<T | undefined> {
    return db.row<T>(sql, ...args);
}
export async function rows<T = Record<string, unknown>>(db: DB, sql: string, ...args: SqlValue[]): Promise<T[]> {
    return db.rows<T>(sql, ...args);
}
export async function run(db: DB, sql: string, ...args: SqlValue[]): Promise<void> {
    return db.run(sql, ...args);
}
export async function tx<T>(db: DB, fn: () => Promise<T> | T, readOnly = false): Promise<T> {
    return db.tx(fn, readOnly);
}
export async function settings(db: DB): Promise<Settings> {
    const stored = await row<{ json: string }>(db, 'SELECT json FROM settings WHERE id=1');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored!.json) };
}

const state = globalThis as unknown as { jrDB?: DB };
export async function database(): Promise<DB> {
    if (state.jrDB)
        return state.jrDB;
    state.jrDB = usesPostgres() ? await openPostgres() : openDatabase(databasePath());
    return state.jrDB;
}
