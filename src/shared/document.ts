export interface CompanyRecord {
    cnpj: string;
    name: string;
    tradeName: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
}
export function digitsDocument(value: string): string {
    return String(value ?? '').replace(/\D/g, '').slice(0, 14);
}
export function formatDocument(value: string): string {
    const digits = digitsDocument(value);
    if (digits.length <= 11) {
        if (digits.length > 9)
            return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
        if (digits.length > 6)
            return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
        if (digits.length > 3)
            return `${digits.slice(0, 3)}.${digits.slice(3)}`;
        return digits;
    }
    const body = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}`;
    return digits.length > 12 ? `${body}-${digits.slice(12)}` : body;
}
export function isDocumentField(field: { name: string; label: string }): boolean {
    return field.name === 'document' || /\b(cpf|cnpj)\b/i.test(field.label);
}
function checkDigit(digits: string, factors: number[]): number {
    const sum = digits.split('').reduce((total, digit, index) => total + Number(digit) * factors[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
}
export function isValidCnpj(value: string): boolean {
    const digits = digitsDocument(value);
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits))
        return false;
    const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = checkDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return first === Number(digits[12]) && second === Number(digits[13]);
}
export function isCompleteCnpj(value: string): boolean {
    return isValidCnpj(value);
}
function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
function joinStreet(parts: string[]): string {
    return parts.filter(Boolean).join(', ').replace(/\s+,/g, ',').replace(/,\s*,/g, ', ').trim();
}
export function parseBrasilApiCnpj(data: unknown): CompanyRecord | null {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return null;
    const record = data as Record<string, unknown>;
    const name = text(record.razao_social) || text(record.nome_fantasia);
    if (!name)
        return null;
    const type = text(record.descricao_tipo_de_logradouro);
    const streetName = text(record.logradouro);
    const street = joinStreet([type ? `${type} ${streetName}`.trim() : streetName, text(record.numero), text(record.complemento)]);
    return {
        cnpj: digitsDocument(String(record.cnpj ?? '')),
        name,
        tradeName: text(record.nome_fantasia),
        street,
        neighborhood: text(record.bairro),
        city: text(record.municipio),
        state: text(record.uf),
        postalCode: digitsDocument(String(record.cep ?? '')).slice(0, 8)
    };
}
export function parseReceitaWs(data: unknown): CompanyRecord | null {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return null;
    const record = data as Record<string, unknown>;
    if (record.status === 'ERROR' || record.status === 'error')
        return null;
    const name = text(record.nome) || text(record.fantasia);
    if (!name)
        return null;
    return {
        cnpj: digitsDocument(String(record.cnpj ?? '')),
        name,
        tradeName: text(record.fantasia),
        street: joinStreet([text(record.logradouro), text(record.numero), text(record.complemento)]),
        neighborhood: text(record.bairro),
        city: text(record.municipio),
        state: text(record.uf),
        postalCode: digitsDocument(String(record.cep ?? '')).slice(0, 8)
    };
}
export function parseCnpjProvider(data: unknown): CompanyRecord | null {
    return parseBrasilApiCnpj(data) ?? parseReceitaWs(data);
}
export async function lookupCnpjProviders(cnpj: string, fetchImpl: typeof fetch = fetch): Promise<CompanyRecord | null> {
    const digits = digitsDocument(cnpj);
    if (!isValidCnpj(digits))
        return null;
    for (const url of [`https://brasilapi.com.br/api/cnpj/v1/${digits}`, `https://receitaws.com.br/v1/cnpj/${digits}`]) {
        try {
            const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
            if (!response.ok)
                continue;
            const parsed = parseCnpjProvider(await response.json());
            if (parsed)
                return parsed;
        }
        catch {
            continue;
        }
    }
    return null;
}
export function applyCnpjResult(values: Record<string, unknown>, fields: { name: string }[], company: CompanyRecord): Record<string, unknown> {
    const names = new Set(fields.map(field => field.name));
    const next = { ...values };
    if (names.has('document'))
        next.document = formatDocument(company.cnpj || digitsDocument(String(values.document ?? '')));
    if (names.has('name') && company.name)
        next.name = company.name;
    if (names.has('postalCode') && company.postalCode.length === 8)
        next.postalCode = company.postalCode.length > 5 ? `${company.postalCode.slice(0, 5)}-${company.postalCode.slice(5)}` : company.postalCode;
    const city = company.state ? `${company.city} / ${company.state}` : company.city;
    if (names.has('neighborhood') && company.neighborhood)
        next.neighborhood = company.neighborhood;
    if (names.has('city') && city)
        next.city = city;
    if (names.has('address')) {
        if (names.has('neighborhood') || names.has('city')) {
            if (company.street)
                next.address = company.street;
        }
        else {
            const full = [company.street, company.neighborhood, city].filter(Boolean).join(', ');
            if (full)
                next.address = full;
        }
    }
    return next;
}
