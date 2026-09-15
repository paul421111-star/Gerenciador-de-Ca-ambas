export interface CepAddress {
    cep: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
}
export function digitsCep(value: string): string {
    return String(value ?? '').replace(/\D/g, '').slice(0, 8);
}
export function formatCep(value: string): string {
    const digits = digitsCep(value);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
export function isCompleteCep(value: string): boolean {
    return digitsCep(value).length === 8;
}
export function isCepField(field: { name: string; label: string }): boolean {
    return field.name === 'postalCode' || field.name === 'cep' || /\bcep\b/i.test(field.label);
}
export function cityWithState(city: string, state: string): string {
    if (!city)
        return '';
    return state ? `${city} / ${state}` : city;
}
function finiteCoord(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}
export function parseBrasilApi(data: unknown): CepAddress | null {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return null;
    const record = data as Record<string, unknown>;
    if (typeof record.city !== 'string' || !record.city)
        return null;
    const location = record.location && typeof record.location === 'object' ? record.location as Record<string, unknown> : null;
    const coordinates = location?.coordinates && typeof location.coordinates === 'object' ? location.coordinates as Record<string, unknown> : null;
    return {
        cep: digitsCep(String(record.cep ?? '')),
        street: typeof record.street === 'string' ? record.street : '',
        neighborhood: typeof record.neighborhood === 'string' ? record.neighborhood : '',
        city: record.city,
        state: typeof record.state === 'string' ? record.state : '',
        latitude: finiteCoord(coordinates?.latitude),
        longitude: finiteCoord(coordinates?.longitude)
    };
}
export function parseViaCep(data: unknown): CepAddress | null {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return null;
    const record = data as Record<string, unknown>;
    if (record.erro === true || record.erro === 'true' || typeof record.localidade !== 'string' || !record.localidade)
        return null;
    return {
        cep: digitsCep(String(record.cep ?? '')),
        street: typeof record.logradouro === 'string' ? record.logradouro : '',
        neighborhood: typeof record.bairro === 'string' ? record.bairro : '',
        city: record.localidade,
        state: typeof record.uf === 'string' ? record.uf : '',
        latitude: null,
        longitude: null
    };
}
export function parseCepProvider(data: unknown): CepAddress | null {
    return parseBrasilApi(data) ?? parseViaCep(data);
}
export async function lookupCepProviders(cep: string, fetchImpl: typeof fetch = fetch): Promise<CepAddress | null> {
    const digits = digitsCep(cep);
    if (digits.length !== 8)
        return null;
    for (const url of [`https://brasilapi.com.br/api/cep/v2/${digits}`, `https://viacep.com.br/ws/${digits}/json/`]) {
        try {
            const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
            if (!response.ok)
                continue;
            const parsed = parseCepProvider(await response.json());
            if (parsed)
                return parsed;
        }
        catch {
            continue;
        }
    }
    return null;
}
export function applyCepResult(values: Record<string, unknown>, fields: { name: string }[], address: CepAddress): Record<string, unknown> {
    const names = new Set(fields.map(field => field.name));
    const next = { ...values };
    const formatted = formatCep(address.cep);
    if (names.has('postalCode'))
        next.postalCode = formatted;
    if (names.has('cep'))
        next.cep = formatted;
    if (names.has('neighborhood') && address.neighborhood)
        next.neighborhood = address.neighborhood;
    if (names.has('bairro') && address.neighborhood)
        next.bairro = address.neighborhood;
    const city = cityWithState(address.city, address.state);
    if (names.has('city') && city)
        next.city = city;
    if (names.has('cidade') && city)
        next.cidade = city;
    if (names.has('address') && !String(next.address ?? '').trim()) {
        next.address = names.has('neighborhood') || names.has('city')
            ? address.street
            : [address.street, address.neighborhood, city].filter(Boolean).join(', ');
    }
    if (names.has('yardAddress') && !String(next.yardAddress ?? '').trim())
        next.yardAddress = [address.street, address.neighborhood, city].filter(Boolean).join(', ');
    if (names.has('latitude') && names.has('longitude') && address.latitude != null && address.longitude != null) {
        if (next.latitude == null || next.latitude === '')
            next.latitude = address.latitude;
        if (next.longitude == null || next.longitude === '')
            next.longitude = address.longitude;
    }
    return next;
}
