export const SCHEMA = `
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drivers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
 licenseExpiry TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL COLLATE NOCASE, passwordHash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','DISPATCHER','DRIVER')), driverId TEXT UNIQUE REFERENCES drivers(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), createdAt TEXT NOT NULL,
 CHECK((role='DRIVER' AND driverId IS NOT NULL) OR (role!='DRIVER' AND driverId IS NULL))
);
CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_session_expiry ON sessions(expiresAt);
CREATE TABLE IF NOT EXISTS loginAttempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, updatedAt TEXT NOT NULL, blockedUntil TEXT);
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', document TEXT UNIQUE,
 address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customerSites (
 id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES customers(id), name TEXT NOT NULL, address TEXT NOT NULL, neighborhood TEXT NOT NULL,
 city TEXT NOT NULL, postalCode TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 latitude REAL, longitude REAL, notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), createdAt TEXT NOT NULL,
 UNIQUE(customerId, name COLLATE NOCASE), CHECK((latitude IS NULL) = (longitude IS NULL)),
 CHECK(latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS idx_customer_sites ON customerSites(customerId, active);
CREATE TABLE IF NOT EXISTS containers (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, capacityM3 REAL CHECK(capacityM3 > 0),
 status TEXT NOT NULL CHECK(status IN ('INVENTORY','AVAILABLE','RESERVED','IN_TRANSIT','ON_SITE','RETURNING','MAINTENANCE','RETIRED')),
 notes TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trucks (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, plate TEXT UNIQUE, model TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','MAINTENANCE','RETIRED')), notes TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rentals (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, containerId TEXT NOT NULL REFERENCES containers(id), customerId TEXT NOT NULL REFERENCES customers(id),
 siteId TEXT REFERENCES customerSites(id),
 address TEXT NOT NULL, neighborhood TEXT NOT NULL, city TEXT NOT NULL, postalCode TEXT NOT NULL DEFAULT '', siteContact TEXT NOT NULL, sitePhone TEXT NOT NULL,
 latitude REAL, longitude REAL, wasteType TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', deliveryAt TEXT NOT NULL, pickupAt TEXT NOT NULL,
 deliveredAt TEXT, pickedUpAt TEXT, returnedAt TEXT,
 status TEXT NOT NULL CHECK(status IN ('RESERVED','DELIVERING','ACTIVE','COLLECTING','RETURNING','COMPLETED','CANCELLED')),
 priceCents INTEGER NOT NULL CHECK(priceCents >= 0), byMeasurement INTEGER NOT NULL DEFAULT 0 CHECK(byMeasurement IN (0,1)), openEndedPickup INTEGER NOT NULL DEFAULT 0 CHECK(openEndedPickup IN (0,1)), version INTEGER NOT NULL DEFAULT 1, createdBy TEXT NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL,
 CHECK(pickupAt > deliveryAt), CHECK((latitude IS NULL) = (longitude IS NULL)),
 CHECK(latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
-- Final safety net: at most one open rental per physical container.
CREATE UNIQUE INDEX IF NOT EXISTS idx_container_open_rental ON rentals(containerId) WHERE status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_rental_pickup ON rentals(status,pickupAt);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), kind TEXT NOT NULL CHECK(kind IN ('DELIVERY','PICKUP')),
 driverId TEXT NOT NULL REFERENCES drivers(id), truckId TEXT NOT NULL REFERENCES trucks(id), scheduledAt TEXT NOT NULL,
 durationMinutes INTEGER NOT NULL CHECK(durationMinutes BETWEEN 15 AND 480),
 status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','RETURNING','DONE','CANCELLED')),
 startedAt TEXT, completedAt TEXT, version INTEGER NOT NULL DEFAULT 1, UNIQUE(rentalId,kind)
);
CREATE INDEX IF NOT EXISTS idx_job_time ON jobs(scheduledAt,status);
CREATE INDEX IF NOT EXISTS idx_job_driver ON jobs(driverId,status);
CREATE TABLE IF NOT EXISTS rentalEvents (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), action TEXT NOT NULL, description TEXT NOT NULL,
 actorId TEXT NOT NULL REFERENCES users(id), occurredAt TEXT NOT NULL, latitude REAL, longitude REAL
);
CREATE INDEX IF NOT EXISTS idx_event_rental ON rentalEvents(rentalId,occurredAt);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), amountCents INTEGER NOT NULL CHECK(amountCents>0),
 method TEXT NOT NULL CHECK(method IN ('PIX','CASH','TRANSFER','CARD')), paidAt TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 createdBy TEXT NOT NULL REFERENCES users(id), voidedAt TEXT, voidReason TEXT
);
CREATE TABLE IF NOT EXISTS maintenance (
 id TEXT PRIMARY KEY, containerId TEXT REFERENCES containers(id), truckId TEXT REFERENCES trucks(id), description TEXT NOT NULL,
 costCents INTEGER NOT NULL DEFAULT 0 CHECK(costCents>=0), openedAt TEXT NOT NULL, closedAt TEXT, createdBy TEXT NOT NULL REFERENCES users(id), resolution TEXT NOT NULL DEFAULT '',
 CHECK((containerId IS NULL) != (truckId IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_container ON maintenance(containerId) WHERE closedAt IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_truck ON maintenance(truckId) WHERE closedAt IS NULL;
CREATE TABLE IF NOT EXISTS audit (
 id TEXT PRIMARY KEY, actorId TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entityId TEXT NOT NULL, detail TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS commandReceipts (key TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), bodyHash TEXT NOT NULL, result TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rentalSignatures (
 id TEXT PRIMARY KEY, rentalId TEXT NOT NULL REFERENCES rentals(id), kind TEXT NOT NULL CHECK(kind IN ('DELIVERY','PICKUP')),
 role TEXT NOT NULL CHECK(role IN ('RESPONSIBLE','DRIVER')), signerName TEXT NOT NULL, image TEXT NOT NULL, signedAt TEXT NOT NULL,
 actorId TEXT NOT NULL REFERENCES users(id), UNIQUE(rentalId, kind, role)
);
CREATE INDEX IF NOT EXISTS idx_rental_signatures ON rentalSignatures(rentalId, kind);
`;
