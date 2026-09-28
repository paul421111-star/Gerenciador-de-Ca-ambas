import type { Settings } from './types';

/** Contatos públicos exibidos na página /agendar. Editáveis pelo administrador em Configurações. */
export interface PublicContact {
    companyName: string;
    /** Números de WhatsApp com DDD, somente dígitos (10 ou 11). */
    whatsapp: string[];
    /** URLs completas ou '' quando não configuradas. */
    instagram: string;
    facebook: string;
}

/** Valores usados enquanto o administrador não configurou nada (mesmos que estavam fixos na página). */
export const DEFAULT_WHATSAPP = ['11956292968', '11966150912'];

export function digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

/** (11) 95629-2968 ou (11) 5629-2968 a partir dos dígitos. */
export function formatBrPhone(digits: string): string {
    const n = digitsOnly(digits);
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return n;
}

export function whatsappLink(digits: string, text?: string): string {
    const base = `https://wa.me/55${digitsOnly(digits)}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Aceita "@jrcacambas", "jrcacambas" ou a URL completa; devolve a URL ou '' quando vazio. Lança em valores inválidos. */
export function socialUrl(network: 'instagram' | 'facebook', raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
        let url: URL;
        try {
            url = new URL(value);
        }
        catch {
            throw new Error(`Endereço de ${network === 'instagram' ? 'Instagram' : 'Facebook'} inválido.`);
        }
        const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
        const allowed = network === 'instagram' ? ['instagram.com', 'instagr.am'] : ['facebook.com', 'fb.com', 'fb.me'];
        if (!allowed.includes(host))
            throw new Error(`Use um endereço do ${network === 'instagram' ? 'Instagram' : 'Facebook'} (ex.: https://${allowed[0]}/suaempresa).`);
        return url.toString().replace(/\/$/, '');
    }
    const handle = value.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^facebook\.com\//i, '');
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(handle))
        throw new Error(`Informe o @ ou o endereço completo do ${network === 'instagram' ? 'Instagram' : 'Facebook'}.`);
    return `https://${network === 'instagram' ? 'instagram.com' : 'facebook.com'}/${handle}`;
}

/** Nome curto para exibição: "@jrcacambas" a partir da URL. */
export function socialHandle(url: string): string {
    if (!url) return '';
    try {
        const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
        return path ? `@${path.split('/')[0]}` : url;
    }
    catch {
        return url;
    }
}

export function publicContactFrom(settings: Pick<Settings, 'companyName' | 'whatsappNumbers' | 'instagramUrl' | 'facebookUrl'>): PublicContact {
    const whatsapp = settings.whatsappNumbers.map(digitsOnly).filter(n => n.length === 10 || n.length === 11);
    return {
        companyName: settings.companyName,
        whatsapp: whatsapp.length ? whatsapp : DEFAULT_WHATSAPP,
        instagram: settings.instagramUrl,
        facebook: settings.facebookUrl
    };
}

export const DEFAULT_PUBLIC_CONTACT: PublicContact = { companyName: 'JR Caçambas', whatsapp: DEFAULT_WHATSAPP, instagram: '', facebook: '' };
