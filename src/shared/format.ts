export const TIMEZONE = 'America/Sao_Paulo';
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function toLocalInput(value: string | Date): string {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime()))
        return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const p = (key: string) => parts.find(x => x.type === key)?.value ?? '';
    return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
export function fromLocalInput(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
        throw new Error('Informe a data e o horário.');
    const utc = Date.parse(value + ':00Z');
    if (!Number.isFinite(utc))
        throw new Error('Data inválida.');
    let guess = utc;
    for (let i = 0; i < 3; i++) {
        const represented = Date.parse(toLocalInput(new Date(guess)) + ':00Z');
        guess += utc - represented;
    }
    const result = new Date(guess);
    if (toLocalInput(result) !== value)
        throw new Error('Data ou horário inexistente.');
    return result.toISOString();
}
export const dateKey = (value: string | Date = new Date()) => toLocalInput(value).slice(0, 10);
export function dateTime(value: string | null | undefined): string { return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Não registrado'; }
export const time = (value: string) => toLocalInput(value).slice(11, 16);
export function dateOnly(value: string): string { return new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'medium' }).format(new Date(value.includes('T') ? value : value + 'T12:00:00Z')); }
export function csvCell(value: unknown): string { let s = value == null ? '' : String(value); if (/^\s*[=+@-]/.test(s))
    s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
export const isOpen = (status: string) => !['COMPLETED', 'CANCELLED'].includes(status);
export function cents(value: string): number { const v = value.trim().replace(',', '.'); if (!/^\d+(\.\d{1,2})?$/.test(v))
    throw new Error('Informe um valor positivo com até duas casas decimais.'); return Math.round(Number(v) * 100); }
export const ROLE_LABEL = { ADMIN: 'Administrador', DISPATCHER: 'Operação', DRIVER: 'Motorista' } as const;
export const LABEL: Record<string, string> = { INVENTORY: 'A conferir', AVAILABLE: 'Disponível', RESERVED: 'Reservada', IN_TRANSIT: 'Em entrega', ON_SITE: 'No cliente', RETURNING: 'Retornando', MAINTENANCE: 'Manutenção', RETIRED: 'Inativa', DELIVERING: 'Em entrega', ACTIVE: 'No cliente', COLLECTING: 'Em retirada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada', SCHEDULED: 'Agendado', IN_PROGRESS: 'Em andamento', DONE: 'Concluído', DELIVERY: 'Entrega', PICKUP: 'Retirada', PIX: 'Pix', CASH: 'Dinheiro', TRANSFER: 'Transferência', CARD: 'Cartão' };
export const TONE: Record<string, string> = { INVENTORY: 'neutral', AVAILABLE: 'green', RESERVED: 'amber', IN_TRANSIT: 'blue', ON_SITE: 'green', RETURNING: 'purple', MAINTENANCE: 'red', RETIRED: 'neutral', DELIVERING: 'blue', ACTIVE: 'green', COLLECTING: 'amber', COMPLETED: 'neutral', CANCELLED: 'red', SCHEDULED: 'amber', IN_PROGRESS: 'blue', DONE: 'green' };
