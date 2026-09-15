import test from 'node:test';
import assert from 'node:assert/strict';
import { isSignatureImage, SAMPLE_SIGNATURE_PNG, signatureOf } from '../src/shared/signature.ts';
test('signature images accept compact PNG data URLs and reject other payloads', () => {
    assert.equal(isSignatureImage(SAMPLE_SIGNATURE_PNG), true);
    assert.equal(isSignatureImage('data:image/jpeg;base64,aaaa'), false);
    assert.equal(isSignatureImage('data:image/png;base64,xxxx'), false);
    assert.equal(isSignatureImage('not-an-image'), false);
    assert.equal(signatureOf([{ rentalId: 'r1', kind: 'DELIVERY', role: 'DRIVER' }], 'r1', 'DELIVERY', 'DRIVER')?.role, 'DRIVER');
    assert.equal(signatureOf([{ rentalId: 'r1', kind: 'DELIVERY', role: 'DRIVER' }], 'r1', 'PICKUP', 'DRIVER'), undefined);
});
