import Link from 'next/link';
export default function NotFound() { return <div className="loading-screen"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao painel.</p><Link href="/painel" className="button primary">Voltar ao painel</Link></div>; }
