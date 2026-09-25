import type { Metadata } from 'next';
import { PublicBooking } from '../../components/public-booking';
import './booking.css';

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

export default function BookingPage() {
    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'JR Caçambas',
        description: 'Locação, troca e retirada de caçambas em Taboão da Serra, Embu das Artes e região.',
        telephone: ['+55 11 95629-2968', '+55 11 96615-0912'],
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
        <PublicBooking/>
    </>;
}
