import { PrintOrder } from '../../../../components/print-order';
export const dynamic = 'force-dynamic';
export default async function OrderPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; return <PrintOrder id={id}/>; }
