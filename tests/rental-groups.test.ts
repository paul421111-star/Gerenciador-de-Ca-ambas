import test from 'node:test';
import assert from 'node:assert/strict';
import { CHVN_CNPJ, CHVN_RENTAL_GROUPS, deliveryPlaces, distinctAddresses, missingRentalGroups, rentalGroupCatalog, rentalGroupOption, requiresPickupSignature } from '../src/shared/rental-groups.ts';
import { groupSitesByCity } from '../src/shared/format.ts';

test('CHVN catalog has official groups 10 to 19 on three dumpster streets plus HQ', () => {
    assert.equal(rentalGroupCatalog('02.199.067/0001-22').length, 10);
    assert.equal(rentalGroupCatalog(CHVN_CNPJ), CHVN_RENTAL_GROUPS);
    assert.equal(rentalGroupCatalog('00000000000000').length, 0);
    assert.equal(new Set(CHVN_RENTAL_GROUPS.map(site => site.name)).size, 10);
    assert.equal(distinctAddresses(CHVN_RENTAL_GROUPS).length, 4);
    assert.equal(distinctAddresses(deliveryPlaces(CHVN_RENTAL_GROUPS)).length, 3);
    assert.ok(CHVN_RENTAL_GROUPS.every(site => site.notes.includes('chvn.com.br')));
    assert.equal(missingRentalGroups(CHVN_CNPJ, CHVN_RENTAL_GROUPS.slice(0, 2)).length, 8);
    assert.equal(rentalGroupOption(CHVN_RENTAL_GROUPS[1]), 'Grupo 11 · Jardim das Artes — Embu das Artes');
    const grouped = groupSitesByCity(CHVN_RENTAL_GROUPS);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0][0], 'Embu das Artes / SP');
    assert.equal(grouped[0][1].length, 8);
    assert.equal(requiresPickupSignature({ document: CHVN_CNPJ }), true);
    assert.equal(requiresPickupSignature({ name: 'COOPERATIVA HABITACIONAL VIDA NOVA' }), true);
    assert.equal(requiresPickupSignature({ name: 'Cliente Exemplo 01' }), false);
});
