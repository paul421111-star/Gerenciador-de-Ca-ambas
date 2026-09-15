export function isSignatureImage(value: string): boolean {
    return /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value) && value.length >= 80 && value.length <= 60000;
}
export function signatureOf<T extends { rentalId: string; kind: string; role: string }>(list: T[], rentalId: string, kind: string, role: string): T | undefined {
    return list.find(item => item.rentalId === rentalId && item.kind === kind && item.role === role);
}
export const SAMPLE_SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
