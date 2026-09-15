'use client';
import { useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './provider';
import { Icon } from './icons';
import { NAV } from './navigation';
import { ROLE_LABEL } from '../shared/format';
import { FormDialog } from './form-dialog';
import { RentalDetail } from './rental-detail';
import { Button } from './ui';
export function Shell({ children }: {
    children: ReactNode;
}) {
    const { data, error, notice, refresh, notify, form, openForm, detail, openDetail } = useApp();
    const path = usePathname().split('/')[1], current = NAV.find(n => n.path === path);
    const [menu, setMenu] = useState(false), [query, setQuery] = useState('');
    const closeForm = useCallback(() => openForm(null), [openForm]);
    const closeDetail = useCallback(() => openDetail(null), [openDetail]);
    async function logout() { try {
        const res = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok && res.status !== 401)
            throw new Error('Falha ao sair. Tente novamente.');
        window.location.replace('/login');
    }
    catch (e) {
        notify(e instanceof Error ? e.message : 'Falha ao sair.');
    } }
    if (!data)
        return <div className="loading-screen"><div className="loading-brand"><img src="/brand-lockup.png" alt="JR Caçambas"/></div><Icon name="refresh" size={24} className="spin"/><h2>{error ? 'Não foi possível conectar' : 'Preparando sua operação...'}</h2><p>{error || 'Carregando dados do servidor com segurança.'}</p>{error && <Button onClick={() => void refresh()}>Tentar novamente</Button>}</div>;
    const items = NAV.filter(n => !n.roles || n.roles.includes(data.user.role));
    return <div className="app-shell"><a className="skip-link" href="#main">Pular para o conteúdo</a>{menu && <button className="nav-overlay is-open" aria-label="Fechar menu" onClick={() => setMenu(false)}/>}
 <aside className={`sidebar ${menu ? 'is-open' : ''}`}><Link href="/painel" className="brand" onClick={() => setMenu(false)}><div className="brand-logo"><img src="/brand-lockup.png" alt="JR Caçambas"/></div><div className="brand-system"><span />GESTÃO DE CAÇAMBAS</div></Link><nav aria-label="Navegação principal">{items.map((n, i) => <div key={n.path}>{(!i || items[i - 1].group !== n.group) && <div className="nav-group">{n.group}</div>}<Link href={`/${n.path}`} className={`nav-item ${path === n.path ? 'active' : ''}`} aria-current={path === n.path ? 'page' : undefined} onClick={() => setMenu(false)}><Icon name={n.icon} size={18}/>{n.label}{n.path === 'cacambas' && <em>{data.containers.length}</em>}</Link></div>)}</nav><div className="sidebar-bottom"><div className={`system-status ${error ? 'disconnected' : ''}`}><i />{error ? 'Conexão interrompida' : 'Conectado ao servidor'}</div><div className="profile"><span className="avatar">{data.user.name.slice(0, 2).toUpperCase()}</span><span><strong>{data.user.name}</strong><small>{ROLE_LABEL[data.user.role]}</small></span><button className="icon-button" onClick={logout} title="Sair" aria-label="Sair do sistema"><Icon name="logout" size={17}/></button></div></div></aside>
 <div className="workspace"><header className="topbar"><div className="row"><button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Abrir menu"><Icon name="menu"/></button><div className="breadcrumb">JR Caçambas <Icon name="chevron" size={12}/><strong>{current?.label ?? 'Ordem de serviço'}</strong></div></div><div className="top-actions">{data.user.role !== 'DRIVER' && <form className="global-search" action="/locacoes"><Icon name="search" size={15}/><input name="busca" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar caçamba ou cliente" placeholder="Buscar caçamba ou cliente..."/></form>}<button className="icon-button" onClick={() => void refresh()} title="Atualizar dados" aria-label="Atualizar dados"><Icon name="refresh" size={17}/></button><Link href="/conta" className="avatar" title="Minha conta">{data.user.name.slice(0, 2).toUpperCase()}</Link></div></header>
 {data.settings.demo && <div className="demo-banner"><Icon name="alert" size={14}/><b>MODO DEMONSTRATIVO</b> Dados fictícios, separados da operação real.</div>}{error && <div className="sync-error" role="alert"><Icon name="alert"/>{error} Os dados podem estar desatualizados.<button onClick={() => void refresh()}>Reconectar</button></div>}
 <main id="main" className="page-content">{children}</main><footer className="workspace-footer"><span>JR Caçambas <b>/</b> Controle operacional</span><span>Horários: São Paulo <b>/</b> v1.0.0</span></footer></div>
 {notice && <div className="toast" role="status"><Icon name="check" size={18}/><span>{notice}</span><button onClick={() => notify('')} aria-label="Fechar aviso">×</button></div>}{detail && <RentalDetail id={detail} onClose={closeDetail}/>}{form && <FormDialog key={form.title} config={form} onClose={closeForm}/>}</div>;
}
