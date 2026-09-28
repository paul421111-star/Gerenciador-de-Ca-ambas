import { randomUUID } from 'node:crypto';
import { type DB, row, rows, tx } from './db.ts';
import { assert } from './errors.ts';
import * as v from './validate.ts';
import { dateKey } from '../shared/format.ts';
import { verifyCaptcha } from './captcha.ts';

export interface PublicBookingResult {
    id: string;
    protocol: string;
    message: string;
}

function bookingDate(payload: Record<string, unknown>, at: Date): string {
    const value = v.str(payload, 'preferredDate', 10, 10);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(value), 'Informe uma data válida para o atendimento.');
    const parsed = new Date(value + 'T12:00:00Z');
    assert(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'Informe uma data válida para o atendimento.');
    const today = dateKey(at), lastDay = dateKey(new Date(at.getTime() + 180 * 86400000));
    assert(value >= today, 'A data desejada não pode estar no passado.');
    assert(value <= lastDay, 'Solicite uma data dentro dos próximos 180 dias.');
    return value;
}

export async function createPublicBooking(db: DB, raw: unknown, at = new Date()): Promise<PublicBookingResult> {
    const payload = v.object(raw);
    assert(v.str(payload, 'companyWebsite', 0, 0) === '', 'Solicitação inválida.');
    assert(payload.consent === true, 'Autorize o contato da JR Caçambas para enviar a solicitação.');

    const customerName = v.str(payload, 'customerName', 2, 120);
    const phone = v.phone(payload, 'phone');
    const email = v.email(payload, 'email', true);
    const serviceType = v.choice(payload, 'serviceType', ['RENTAL', 'EXCHANGE', 'PICKUP'] as const);
    const postalCode = v.str(payload, 'postalCode', 0, 12).replace(/\D/g, '');
    assert(!postalCode || postalCode.length === 8, 'Informe um CEP válido.');
    const address = v.str(payload, 'address', 5, 240);
    const neighborhood = v.str(payload, 'neighborhood', 2, 100);
    const city = v.str(payload, 'city', 2, 100);
    const preferredDate = bookingDate(payload, at);
    const preferredPeriod = v.choice(payload, 'preferredPeriod', ['MORNING', 'AFTERNOON', 'ANY'] as const);
    const wasteType = v.str(payload, 'wasteType', 2, 120);
    const notes = v.str(payload, 'notes', 0, 1000);
    verifyCaptcha(typeof payload.captchaId === 'string' ? payload.captchaId : '', typeof payload.captchaAnswer === 'string' ? payload.captchaAnswer : '', at);
    const now = at.toISOString();
    const recent = new Date(at.getTime() - 5 * 60000).toISOString();

    return tx(db, async () => {
        assert(!await row(db, 'SELECT id FROM bookingRequests WHERE phone=? AND address=? AND preferredDate=? AND createdAt>=?', phone, address, preferredDate, recent), 'Recebemos uma solicitação igual há poucos minutos. Aguarde nosso contato.', 409);
        const id = randomUUID();
        const protocol = `JR-${preferredDate.replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`;
        await db.run(
            `INSERT INTO bookingRequests(
                id,protocol,customerName,phone,email,serviceType,postalCode,address,neighborhood,city,
                preferredDate,preferredPeriod,wasteType,notes,status,createdAt,updatedAt
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,?)`,
            id, protocol, customerName, phone, email, serviceType,
            postalCode, address, neighborhood, city, preferredDate, preferredPeriod, wasteType, notes, now, now
        );
        return {
            id,
            protocol,
            message: 'Solicitação recebida. Nossa equipe confirmará disponibilidade, valor e horário pelo telefone informado. Guarde o e-mail e o telefone para consultar o andamento.'
        };
    });
}

const STATUS_SUMMARY = {
    NEW: 'Recebemos seu pedido. A equipe ainda vai confirmar disponibilidade, valor e horário.',
    CONTACTED: 'Nossa equipe já iniciou o contato para combinar os detalhes.',
    CONFIRMED: 'O atendimento foi confirmado. Os detalhes finais seguem pelo telefone informado.',
    DECLINED: 'Não foi possível atender este pedido. Fale com a equipe se quiser uma nova opção.'
} as const;

export interface PublicBookingStatus {
    protocol: string;
    customerName: string;
    serviceType: 'RENTAL' | 'EXCHANGE' | 'PICKUP';
    preferredDate: string;
    preferredPeriod: 'MORNING' | 'AFTERNOON' | 'ANY';
    neighborhood: string;
    city: string;
    status: keyof typeof STATUS_SUMMARY;
    summary: string;
    createdAt: string;
}

const lookupHits = new Map<string, number[]>();

export async function lookupPublicBookings(db: DB, raw: unknown, at = new Date()): Promise<{ requests: PublicBookingStatus[] }> {
    const payload = v.object(raw);
    const phone = v.phone(payload, 'phone');
    const email = v.email(payload, 'email', true);
    const recent = (lookupHits.get(phone) ?? []).filter(time => at.getTime() - time < 10 * 60000);
    assert(recent.length < 8, 'Muitas consultas seguidas. Aguarde alguns minutos e tente de novo.', 429);
    recent.push(at.getTime());
    lookupHits.set(phone, recent);
    const found = await rows<{
        protocol: string;
        customerName: string;
        serviceType: PublicBookingStatus['serviceType'];
        preferredDate: string;
        preferredPeriod: PublicBookingStatus['preferredPeriod'];
        neighborhood: string;
        city: string;
        status: PublicBookingStatus['status'];
        createdAt: string;
    }>(db, `SELECT protocol,customerName,serviceType,preferredDate,preferredPeriod,neighborhood,city,status,createdAt
        FROM bookingRequests WHERE phone=? AND email=? ORDER BY createdAt DESC LIMIT 10`, phone, email);
    return {
        requests: found.map(request => ({ ...request, summary: STATUS_SUMMARY[request.status] }))
    };
}
