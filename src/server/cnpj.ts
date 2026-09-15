import { AppError, assert } from './errors.ts';
import { digitsDocument, isValidCnpj, lookupCnpjProviders, type CompanyRecord } from '../shared/document.ts';
const cache = new Map<string, { at: number; value: CompanyRecord }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export async function lookupCnpj(raw: string, fetchImpl: typeof fetch = fetch): Promise<CompanyRecord> {
    const cnpj = digitsDocument(raw);
    assert(/^\d{14}$/.test(cnpj), 'Informe um CNPJ com 14 dígitos.');
    assert(isValidCnpj(cnpj), 'CNPJ inválido. Confira os números.');
    const cached = cache.get(cnpj);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
        return cached.value;
    const found = await lookupCnpjProviders(cnpj, fetchImpl);
    if (found) {
        cache.set(cnpj, { at: Date.now(), value: found });
        return found;
    }
    throw new AppError('CNPJ não encontrado. Confira os números ou preencha o nome manualmente.', 404);
}
