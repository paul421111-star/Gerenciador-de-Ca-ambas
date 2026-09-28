import type { Metadata } from 'next';
import { PublicBooking } from '../../components/public-booking';
import { database, settings } from '../../server/db';
import { DEFAULT_PUBLIC_CONTACT, formatBrPhone, publicContactFrom, type PublicContact } from '../../shared/contact';
import './booking.css';

// Contatos e redes sociais vêm das Configurações do administrador: a página é renderizada a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Solicitar caçamba em Taboão da Serra e Embu das Artes',
    description: 'Solicite entrega, troca ou retirada de caçamba em Taboão da Serra, Embu das Artes e região. Atendimento da JR Caçambas.',
    robots: { index: true, follow: true },
    openGraph: {
        title: 'Solicite sua caçamba | JR Caçambas',
        description: 'Atendimento em Taboão da Serra, Embu das Artes e região.',
        type: 'website',
        locale: 'pt_BR'
    }
};

async function loadContact(): Promise<PublicContact> {
    try {
        return publicContactFrom(await settings(await database()));
    }
    catch {
        // Banco indisponível: a página pública continua no ar com os contatos padrão.
        return DEFAULT_PUBLIC_CONTACT;
    }
}

export default async function BookingPage() {
    const contact = await loadContact();
    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: contact.companyName,
        description: 'Locação, troca e retirada de caçambas em Taboão da Serra, Embu das Artes e região.',
        telephone: contact.whatsapp.map(n => `+55 ${formatBrPhone(n).replace(/[()]/g, '')}`),
        sameAs: [contact.instagram, contact.facebook].filter(Boolean),
        address: {
            '@type': 'PostalAddress',
            streetAddress: 'Rua Agelina, 424',
            addressLocality: 'Taboão da Serra',
            addressRegion: 'SP',
            addressCountry: 'BR'
        },
        areaServed: ['Taboão da Serra', 'Embu das Artes']
    };
    return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}/>
        <PublicBooking contact={contact}/>
    </>;
}
