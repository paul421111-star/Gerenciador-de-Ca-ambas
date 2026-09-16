export type LocationPrecision = 'CONFIRMED' | 'APPROXIMATE' | 'PENDING';
export interface GeoPoint {
    lat: number;
    lon: number;
}
export interface LocatedPoint {
    lat: number | null;
    lon: number | null;
    precision: LocationPrecision;
    source?: 'coordinates' | 'geocode' | 'city_center';
}
export interface AreaSite {
    address: string;
    neighborhood: string;
    city: string;
    postalCode: string;
    lat: number;
    lon: number;
}
export const REGION: GeoPoint & { zoom: number; label: string } = {
    lat: -23.637,
    lon: -46.822,
    zoom: 13,
    label: 'Taboão da Serra e Embu das Artes'
};
export const CITY_CENTERS: Array<GeoPoint & { match: RegExp; city: string }> = [
    { match: /tabo[aã]o/i, city: 'Taboão da Serra / SP', lat: -23.6258, lon: -46.7918 },
    { match: /embu/i, city: 'Embu das Artes / SP', lat: -23.6489, lon: -46.8523 }
];
export const AREA_SITES: AreaSite[] = [
    { address: 'Rua Osmar da Silva Ribeiro, 120', neighborhood: 'Jardim São Judas Tadeu', city: 'Taboão da Serra / SP', postalCode: '06786-050', lat: -23.62611, lon: -46.79167 },
    { address: 'Estrada São Francisco, 850', neighborhood: 'Jardim Record', city: 'Taboão da Serra / SP', postalCode: '06784-300', lat: -23.6124, lon: -46.7588 },
    { address: 'Avenida Ibirama, 540', neighborhood: 'Parque Pinheiros', city: 'Taboão da Serra / SP', postalCode: '06767-000', lat: -23.6098, lon: -46.7752 },
    { address: 'Rua das Palmeiras, 210', neighborhood: 'Jardim Wanda', city: 'Taboão da Serra / SP', postalCode: '06766-210', lat: -23.6182, lon: -46.7704 },
    { address: 'Rua Sete de Setembro, 95', neighborhood: 'Jardim Maria Rosa', city: 'Taboão da Serra / SP', postalCode: '06764-095', lat: -23.6236, lon: -46.7681 },
    { address: 'Rua do Comércio, 380', neighborhood: 'Centro', city: 'Taboão da Serra / SP', postalCode: '06753-000', lat: -23.6258, lon: -46.7918 },
    { address: 'Rua Antônio José de Carvalho, 70', neighborhood: 'Jardim Kuabara', city: 'Taboão da Serra / SP', postalCode: '06753-160', lat: -23.6151, lon: -46.7854 },
    { address: 'Estrada do Jaiminho, 1450', neighborhood: 'Sítio das Madres', city: 'Taboão da Serra / SP', postalCode: '06784-000', lat: -23.6304, lon: -46.8052 },
    { address: 'Rua Caminho do Engenho, 310', neighborhood: 'Jardim São Miguel', city: 'Taboão da Serra / SP', postalCode: '06760-310', lat: -23.6052, lon: -46.7826 },
    { address: 'Rua João Batista Soares, 48', neighborhood: 'Jardim Salete', city: 'Taboão da Serra / SP', postalCode: '06773-048', lat: -23.6013, lon: -46.7642 },
    { address: 'Rua Nossa Senhora do Rosário, 220', neighborhood: 'Centro', city: 'Embu das Artes / SP', postalCode: '06803-000', lat: -23.6489, lon: -46.8523 },
    { address: 'Estrada de Itapecerica, 1680', neighborhood: 'Jardim Independência', city: 'Embu das Artes / SP', postalCode: '06810-000', lat: -23.6402, lon: -46.8401 },
    { address: 'Rua da Matriz, 75', neighborhood: 'Jardim Santa Emília', city: 'Embu das Artes / SP', postalCode: '06820-075', lat: -23.6551, lon: -46.8604 },
    { address: 'Avenida Elias Yazbek, 900', neighborhood: 'Parque Industrial', city: 'Embu das Artes / SP', postalCode: '06813-000', lat: -23.6354, lon: -46.8356 },
    { address: 'Rua das Artes, 150', neighborhood: 'Jardim São Marcos', city: 'Embu das Artes / SP', postalCode: '06814-150', lat: -23.6621, lon: -46.8452 },
    { address: 'Rua dos Moraes, 410', neighborhood: 'Jardim dos Moraes', city: 'Embu das Artes / SP', postalCode: '06818-410', lat: -23.6453, lon: -46.8682 },
    { address: 'Rua Vila Real, 88', neighborhood: 'Vila Real', city: 'Embu das Artes / SP', postalCode: '06813-088', lat: -23.6522, lon: -46.8384 },
    { address: 'Rua Vista Alegre, 260', neighborhood: 'Jardim Vista Alegre', city: 'Embu das Artes / SP', postalCode: '06807-260', lat: -23.6584, lon: -46.8721 },
    { address: 'Rua Magali, 33', neighborhood: 'Jardim Magali', city: 'Embu das Artes / SP', postalCode: '06815-033', lat: -23.6386, lon: -46.8583 },
    { address: 'Estrada do Embu-Mirim, 720', neighborhood: 'Jardim Taima', city: 'Embu das Artes / SP', postalCode: '06823-720', lat: -23.6698, lon: -46.8506 }
];
export function inferCityCenter(city: string): GeoPoint | null {
    return CITY_CENTERS.find(item => item.match.test(city)) ?? null;
}
export function addressQuery(parts: { address?: string; neighborhood?: string; city?: string; postalCode?: string }): string {
    return [parts.address, parts.neighborhood, parts.city || REGION.label, 'SP', 'Brasil', parts.postalCode].filter(value => String(value ?? '').trim()).join(', ');
}
export function parseNominatim(data: unknown): GeoPoint | null {
    const first = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    if (!first)
        return null;
    const lat = Number(first.lat), lon = Number(first.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
export function nominatimUrl(query: string): string {
    const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '1',
        countrycodes: 'br',
        viewbox: '-46.90,-23.70,-46.73,-23.58',
        bounded: '0',
        q: query
    });
    return `https://nominatim.openstreetmap.org/search?${params}`;
}
export async function geocodeAddress(query: string, fetchImpl: typeof fetch = fetch): Promise<GeoPoint | null> {
    if (!query.trim())
        return null;
    try {
        const response = await fetchImpl(nominatimUrl(query), { headers: { Accept: 'application/json' } });
        if (!response.ok)
            return null;
        return parseNominatim(await response.json());
    }
    catch {
        return null;
    }
}
export function readCoordinates(value: Record<string, unknown>): GeoPoint | null {
    const lat = value.latitude == null || value.latitude === '' ? NaN : Number(value.latitude);
    const lon = value.longitude == null || value.longitude === '' ? NaN : Number(value.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
export async function resolveLocation(value: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<LocatedPoint> {
    const current = readCoordinates(value);
    if (current) {
        const marked = value.locationPrecision;
        return { ...current, precision: marked === 'APPROXIMATE' ? 'APPROXIMATE' : 'CONFIRMED', source: 'coordinates' };
    }
    const found = await geocodeAddress(addressQuery({
        address: String(value.address ?? ''),
        neighborhood: String(value.neighborhood ?? ''),
        city: String(value.city ?? ''),
        postalCode: String(value.postalCode ?? '')
    }), fetchImpl);
    if (found)
        return { ...found, precision: 'APPROXIMATE', source: 'geocode' };
    return { lat: null, lon: null, precision: 'PENDING' };
}
export async function resolveCoordinates(value: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<GeoPoint | null> {
    const located = await resolveLocation(value, fetchImpl);
    return located.lat == null || located.lon == null ? null : { lat: located.lat, lon: located.lon };
}
export function fitBounds(points: GeoPoint[], size: { w: number; h: number }, padding = 80): { center: GeoPoint; zoom: number } {
    if (!points.length)
        return { center: { lat: REGION.lat, lon: REGION.lon }, zoom: REGION.zoom };
    const minLat = Math.min(...points.map(point => point.lat)), maxLat = Math.max(...points.map(point => point.lat));
    const minLon = Math.min(...points.map(point => point.lon)), maxLon = Math.max(...points.map(point => point.lon));
    const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
    const TILE = 256;
    const projectX = (lon: number, z: number) => (lon + 180) / 360 * TILE * 2 ** z;
    const projectY = (lat: number, z: number) => {
        const sin = Math.sin(Math.min(85.0511, Math.max(-85.0511, lat)) * Math.PI / 180);
        return (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE * 2 ** z;
    };
    for (let zoom = 16; zoom >= 11; zoom--) {
        const width = Math.abs(projectX(maxLon, zoom) - projectX(minLon, zoom));
        const height = Math.abs(projectY(maxLat, zoom) - projectY(minLat, zoom));
        if (width < size.w - padding && height < size.h - padding)
            return { center, zoom };
    }
    return { center, zoom: 12 };
}
