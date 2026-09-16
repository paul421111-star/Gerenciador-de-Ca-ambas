import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_SITES, CITY_CENTERS, REGION, addressQuery, fitBounds, inferCityCenter, parseNominatim, readCoordinates, resolveLocation } from '../src/shared/geo.ts';
import { geocodePayload } from '../src/server/geocode.ts';
test('operational region is Taboão da Serra and Embu das Artes', () => {
    assert.match(REGION.label, /Taboão da Serra/);
    assert.match(REGION.label, /Embu das Artes/);
    assert.equal(CITY_CENTERS.length, 2);
    assert.ok(inferCityCenter('Taboao da Serra / SP'));
    assert.ok(inferCityCenter('Embu das Artes'));
    assert.equal(inferCityCenter('Campinas / SP'), null);
    assert.ok(AREA_SITES.every(site => /Taboão da Serra|Embu das Artes/.test(site.city)));
});
test('address query and coordinate helpers stay in the operational area', () => {
    assert.match(addressQuery({ address: 'Rua A, 10', neighborhood: 'Centro', city: 'Taboão da Serra / SP' }), /Taboão da Serra/);
    assert.deepEqual(readCoordinates({ latitude: -23.62, longitude: -46.79 }), { lat: -23.62, lon: -46.79 });
    assert.equal(readCoordinates({ latitude: '', longitude: '' }), null);
    const parsed = parseNominatim([{ lat: '-23.6489', lon: '-46.8523' }]);
    assert.deepEqual(parsed, { lat: -23.6489, lon: -46.8523 });
    const fitted = fitBounds(AREA_SITES.map(site => ({ lat: site.lat, lon: site.lon })), { w: 800, h: 530 });
    assert.ok(fitted.center.lat < -23.58 && fitted.center.lat > -23.70);
    assert.ok(fitted.center.lon < -46.73 && fitted.center.lon > -46.90);
    assert.ok(fitted.zoom >= 11 && fitted.zoom <= 16);
});
test('city center is not stored as an exact rental position', async () => {
    const empty = async () => new Response('[]', { status: 200 });
    const located = await resolveLocation({ address: 'Rua Inexistente, 0', neighborhood: 'Centro', city: 'Taboão da Serra / SP' }, empty);
    assert.equal(located.precision, 'PENDING');
    assert.equal(located.lat, null);
    const payload = await geocodePayload({ address: 'Rua Inexistente, 0', neighborhood: 'Centro', city: 'Taboão da Serra / SP' }, empty);
    assert.equal(payload.locationPrecision, 'PENDING');
    assert.equal(payload.latitude, undefined);
    const typed = await resolveLocation({ latitude: -23.62, longitude: -46.79 });
    assert.equal(typed.precision, 'CONFIRMED');
    const cep = await resolveLocation({ latitude: -23.62, longitude: -46.79, locationPrecision: 'APPROXIMATE' });
    assert.equal(cep.precision, 'APPROXIMATE');
});
