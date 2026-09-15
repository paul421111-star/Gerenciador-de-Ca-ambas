export interface RentalGroupTemplate {
    name: string;
    address: string;
    neighborhood: string;
    city: string;
    postalCode: string;
    notes: string;
    headquarters?: boolean;
}

/** CNPJ da Cooperativa Habitacional Vida Nova, publicado em chvn.com.br. */
export const CHVN_CNPJ = '02199067000122';

const SEDE: Omit<RentalGroupTemplate, 'name' | 'notes'> = {
    address: 'Avenida Vida Nova, 28 - Térreo - Centro Empresarial Vida Nova',
    neighborhood: 'Jardim Maria Rosa',
    city: 'Taboão da Serra / SP',
    postalCode: '06764-045',
    headquarters: true
};

const JARDIM_DAS_ARTES: Omit<RentalGroupTemplate, 'name' | 'notes'> = {
    address: 'Avenida Isaltino Victor de Moraes, 281',
    neighborhood: 'Vila Bonfim',
    city: 'Embu das Artes / SP',
    postalCode: '06806-400'
};

const PARQUE_FIRENZE: Omit<RentalGroupTemplate, 'name' | 'notes'> = {
    address: 'Estrada São Judas, 190',
    neighborhood: 'Parque Esplanada do Embu',
    city: 'Embu das Artes / SP',
    postalCode: '06817-170'
};

const RECANTO_IRACEMA: Omit<RentalGroupTemplate, 'name' | 'notes'> = {
    address: 'Rua Maria Iracema Paiva Tristão, 144',
    neighborhood: 'Jardim Salete',
    city: 'Taboão da Serra / SP',
    postalCode: ''
};

const SOURCE = 'Endereços públicos dos empreendimentos da Cooperativa Habitacional Vida Nova (chvn.com.br).';

function group(name: string, place: Omit<RentalGroupTemplate, 'name' | 'notes'>, notes: string): RentalGroupTemplate {
    return { name, ...place, notes: `${notes} ${SOURCE}` };
}

/** Grupo 10 é a sede. 11, 12–18 e 19 são os três endereços de obra com caçamba própria. */
export const CHVN_RENTAL_GROUPS: RentalGroupTemplate[] = [
    group('Grupo 10 · Sede / Centro Empresarial', SEDE, 'Sede administrativa. Não é um dos três endereços de obra.'),
    group('Grupo 11 · Jardim das Artes', JARDIM_DAS_ARTES, 'Embu das Artes. Endereço próprio, distinto do Parque Firenze.'),
    ...[12, 13, 14, 15, 16, 17, 18].map(n => group(`Grupo ${n} · Parque Firenze`, PARQUE_FIRENZE, 'Mesmo endereço de entrega dos grupos 12 a 18. Cada grupo continua selecionável porque as caçambas são distintas.')),
    group('Grupo 19 · Recanto da Iracema', RECANTO_IRACEMA, 'Taboão da Serra, em endereço distinto da sede.')
];

const CATALOGS: Record<string, RentalGroupTemplate[]> = {
    [CHVN_CNPJ]: CHVN_RENTAL_GROUPS
};

function digitsCnpj(value: string): string {
    return String(value ?? '').replace(/\D/g, '').slice(0, 14);
}
export function rentalGroupCatalog(document?: string | null): RentalGroupTemplate[] {
    return CATALOGS[digitsCnpj(document ?? '')] ?? [];
}

export function deliveryPlaces(groups: RentalGroupTemplate[]): RentalGroupTemplate[] {
    return groups.filter(site => !site.headquarters);
}

export function distinctAddresses(groups: RentalGroupTemplate[]): string[] {
    return [...new Set(groups.map(site => site.address.toLocaleLowerCase('pt-BR')))];
}

export function rentalGroupOption(site: { name: string; city: string }): string {
    return `${site.name} — ${site.city.replace(/\s*\/\s*SP$/i, '')}`;
}

export function missingRentalGroups(document: string | null | undefined, existing: Array<{ name: string }>): RentalGroupTemplate[] {
    const names = new Set(existing.map(site => site.name.toLocaleLowerCase('pt-BR')));
    return rentalGroupCatalog(document).filter(site => !names.has(site.name.toLocaleLowerCase('pt-BR')));
}

/** A cooperativa exige recibo assinado na retirada/troca. Outros clientes usam o campo só quando pedirem. */
export function requiresPickupSignature(customer?: { document?: string | null; name?: string } | null): boolean {
    if (rentalGroupCatalog(customer?.document).length)
        return true;
    return /cooperativa habitacional vida nova/i.test(customer?.name ?? '');
}
