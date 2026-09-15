import { notFound } from 'next/navigation';
import { NAV } from '../../../components/navigation';
import { Screen } from '../../../components/screen';
export const dynamic = 'force-dynamic';
export default async function SectionPage({ params }: {
    params: Promise<{
        section: string;
    }>;
}) { const { section } = await params; if (!NAV.some(n => n.path === section))
    notFound(); return <Screen section={section}/>; }
