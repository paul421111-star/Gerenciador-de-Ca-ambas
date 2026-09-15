export type Role = 'ADMIN' | 'DISPATCHER' | 'DRIVER';
export type ContainerStatus = 'INVENTORY' | 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' | 'ON_SITE' | 'RETURNING' | 'MAINTENANCE' | 'RETIRED';
export type RentalStatus = 'RESERVED' | 'DELIVERING' | 'ACTIVE' | 'COLLECTING' | 'RETURNING' | 'COMPLETED' | 'CANCELLED';
export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    driverId: string | null;
    active: number;
    createdAt: string;
}
export interface Container {
    id: string;
    code: string;
    capacityM3: number | null;
    status: ContainerStatus;
    notes: string;
    createdAt: string;
}
export interface Truck {
    id: string;
    code: string;
    plate: string | null;
    model: string;
    status: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED';
    notes: string;
    createdAt: string;
}
export interface Driver {
    id: string;
    name: string;
    phone: string;
    license: string;
    category: string;
    licenseExpiry: string | null;
    active: number;
    createdAt: string;
}
export interface Customer {
    id: string;
    name: string;
    contact: string;
    phone: string;
    email: string;
    document: string | null;
    address: string;
    notes: string;
    active: number;
    createdAt: string;
}
export interface Rental {
    id: string;
    code: string;
    containerId: string;
    customerId: string;
    address: string;
    neighborhood: string;
    city: string;
    postalCode: string;
    siteContact: string;
    sitePhone: string;
    latitude: number | null;
    longitude: number | null;
    wasteType: string;
    notes: string;
    deliveryAt: string;
    pickupAt: string;
    deliveredAt: string | null;
    pickedUpAt: string | null;
    returnedAt: string | null;
    status: RentalStatus;
    priceCents: number;
    byMeasurement: number;
    version: number;
    createdBy: string;
    createdAt: string;
}
export interface Job {
    id: string;
    rentalId: string;
    kind: 'DELIVERY' | 'PICKUP';
    driverId: string;
    truckId: string;
    scheduledAt: string;
    durationMinutes: number;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'RETURNING' | 'DONE' | 'CANCELLED';
    startedAt: string | null;
    completedAt: string | null;
    version: number;
}
export interface Payment {
    id: string;
    rentalId: string;
    amountCents: number;
    method: 'PIX' | 'CASH' | 'TRANSFER' | 'CARD';
    paidAt: string;
    note: string;
    createdBy: string;
    voidedAt: string | null;
    voidReason: string | null;
}
export interface Maintenance {
    id: string;
    containerId: string | null;
    truckId: string | null;
    description: string;
    costCents: number;
    openedAt: string;
    closedAt: string | null;
    createdBy: string;
    resolution: string;
}
export interface RentalEvent {
    id: string;
    rentalId: string;
    action: string;
    description: string;
    actorId: string;
    actorName: string;
    occurredAt: string;
    latitude: number | null;
    longitude: number | null;
}
export interface Audit {
    id: string;
    actorId: string;
    actorName: string;
    action: string;
    entityId: string;
    detail: string;
    createdAt: string;
}
export interface Settings {
    companyName: string;
    companyPhone: string;
    yardAddress: string;
    defaultDays: number;
    defaultPriceCents: number;
    jobDurationMinutes: number;
    demo: boolean;
    timezone: string;
}
export interface Snapshot {
    user: User;
    settings: Settings;
    serverTime: string;
    containers: Container[];
    trucks: Truck[];
    drivers: Driver[];
    customers: Customer[];
    rentals: Rental[];
    jobs: Job[];
    events: RentalEvent[];
    payments: Payment[];
    maintenance: Maintenance[];
    users: User[];
    audit: Audit[];
}
export type CommandName = 'createRental' | 'importActiveRental' | 'transitionRental' | 'rescheduleJob' | 'createCustomer' | 'updateCustomer' | 'createDriver' | 'updateDriver' | 'createTruck' | 'updateTruck' | 'createContainer' | 'updateContainer' | 'confirmInventory' | 'addPayment' | 'voidPayment' | 'startMaintenance' | 'finishMaintenance' | 'createUser' | 'setUserActive' | 'changePassword' | 'saveSettings';
export interface Command {
    action: CommandName;
    payload: Record<string, unknown>;
}
export interface CommandResult {
    id?: string;
    message: string;
}
