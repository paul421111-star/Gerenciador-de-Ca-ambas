import { AppError, assert } from './errors.ts';
import { addressQuery, geocodeAddress, inferCityCenter, type GeoPoint } from '../shared/geo.ts';
export async function lookupGeocode(raw: string, extra: { city?: string } = {}, fetchImpl: typeof fetch = fetch): Promise<GeoPoint> {
    const query = raw.trim();
    assert(query.length >= 3, 'Informe um endereço ou cidade para localizar no mapa.');
    const found = await geocodeAddress(query, fetchImpl);
    if (found)
        return found;
    const city = inferCityCenter(extra.city || query);
    if (city)
        return city;
    throw new AppError('Não foi possível localizar este endereço no mapa. Confira a cidade ou informe o CEP.', 404);
}
export async function geocodePayload(payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
    if (payload.latitude != null && payload.latitude !== '' && payload.longitude != null && payload.longitude !== '')
        return payload;
    const query = addressQuery({
        address: String(payload.address ?? ''),
        neighborhood: String(payload.neighborhood ?? ''),
        city: String(payload.city ?? ''),
        postalCode: String(payload.postalCode ?? '')
    });
    try {
        const point = await lookupGeocode(query, { city: String(payload.city ?? '') }, fetchImpl);
        return { ...payload, latitude: point.lat, longitude: point.lon };
    }
    catch {
        return payload;
    }
}
