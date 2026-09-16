import { AppError, assert } from './errors.ts';
import { addressQuery, geocodeAddress, inferCityCenter, type LocatedPoint } from '../shared/geo.ts';
export async function lookupGeocode(raw: string, extra: { city?: string } = {}, fetchImpl: typeof fetch = fetch): Promise<LocatedPoint> {
    const query = raw.trim();
    assert(query.length >= 3, 'Informe um endereço ou cidade para localizar no mapa.');
    const found = await geocodeAddress(query, fetchImpl);
    if (found)
        return { ...found, precision: 'APPROXIMATE', source: 'geocode' };
    const city = inferCityCenter(extra.city || query);
    if (city)
        return { ...city, precision: 'APPROXIMATE', source: 'city_center' };
    throw new AppError('Não foi possível localizar este endereço no mapa. Confira a cidade ou informe o CEP. A locação pode ser salva sem posição.', 404);
}
export async function geocodePayload(payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
    if (payload.latitude != null && payload.latitude !== '' && payload.longitude != null && payload.longitude !== '')
        return { ...payload, locationPrecision: payload.locationPrecision === 'APPROXIMATE' ? 'APPROXIMATE' : 'CONFIRMED' };
    const query = addressQuery({
        address: String(payload.address ?? ''),
        neighborhood: String(payload.neighborhood ?? ''),
        city: String(payload.city ?? ''),
        postalCode: String(payload.postalCode ?? '')
    });
    const found = await geocodeAddress(query, fetchImpl);
    if (found)
        return { ...payload, latitude: found.lat, longitude: found.lon, locationPrecision: 'APPROXIMATE' };
    return { ...payload, locationPrecision: 'PENDING' };
}
