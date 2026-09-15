import { AppError, assert } from './errors.ts';
import { digitsCep, lookupCepProviders, type CepAddress } from '../shared/cep.ts';
const cache = new Map<string, { at: number; value: CepAddress }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export async function lookupCep(raw: string, fetchImpl: typeof fetch = fetch): Promise<CepAddress> {
    const cep = digitsCep(raw);
    assert(/^\d{8}$/.test(cep), 'Informe um CEP com 8 dígitos.');
    const cached = cache.get(cep);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
        return cached.value;
    const found = await lookupCepProviders(cep, fetchImpl);
    if (found) {
        cache.set(cep, { at: Date.now(), value: found });
        return found;
    }
    throw new AppError('CEP não encontrado. Confira os números ou preencha o endereço manualmente.', 404);
}
