import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './components.css';
export const metadata: Metadata = { title: { default: 'JR Caçambas | Gestão operacional', template: '%s | JR Caçambas' }, description: 'Controle de caçambas, locações, entregas e retiradas.', robots: { index: false, follow: false }, icons: { icon: '/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#181d1a' };
export default function RootLayout({ children }: {
    children: ReactNode;
}) { return <html lang="pt-BR"><body>{children}</body></html>; }
