'use client';
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './provider';
import { Icon } from './icons';
import { NAV, PRIMARY_NAV, visibleNav } from './navigation';
import { ROLE_LABEL } from '../shared/format';
import { FormDialog } from './form-dialog';
import { RentalDetail } from './rental-detail';
import { Button } from './ui';

const NAV_LAYOUT_KEY = 'jr.navLayout';
type NavLayout = 'top' | 'side';

export function Shell({ children }: {
    children: ReactNode;
}) {
    const { data, error, notice, refresh, notify, form, openForm, detail, openDetail } = useApp();
    const path = usePathname().split('/')[1], current = NAV.find(n => n.path === path);
    const [menu, setMenu] = useState(false), [query, setQuery] = useState(''), [openGroup, setOpenGroup] = useState<string | null>(null);
    const [navLayout, setNavLayout] = useState<NavLayout>('top');
    const navRef = useRef<HTMLElement>(null);
    const closeForm = useCallback(() => openForm(null), [openForm]);
    const closeDetail = useCallback(() => openDetail(null), [openDetail]);
    useEffect(() => {
        const stored = localStorage.getItem(NAV_LAYOUT_KEY);
        if (stored === 'side' || stored === 'top')
            setNavLayout(stored);
    }, []);
    useEffect(() => { setOpenGroup(null); setMenu(false); }, [path]);
    useEffect(() => {
        if (!openGroup)
            return;
        const close = (event: MouseEvent) => {
            if (!navRef.current?.contains(event.target as Node))
                setOpenGroup(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [openGroup]);
    function setLayout(next: NavLayout) {
        setNavLayout(next);
        setMenu(false);
        setOpenGroup(null);
        localStorage.setItem(NAV_LAYOUT_KEY, next);
    }
    async function logout() {
        try {
            const res = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (!res.ok && res.status !== 401)
                throw new Error('Falha ao sair. Tente novamente.');
            window.location.replace('/login');
        }
        catch (e) {
            notify(e instanceof Error ? e.message : 'Falha ao sair.');
        }
    }
    if (!data)
        return <div className="loading-screen" suppressHydrationWarning><div className="loading-brand"><img src="/brand-lockup.png" alt="JR Caçambas"/></div><Icon name="refresh" size={24} className="spin"/><h2 suppressHydrationWarning>{error ? 'Não foi possível conectar' : 'Preparando sua operação...'}</h2><p suppressHydrationWarning>{error || 'Carregando dados do servidor com segurança.'}</p>{error && <Button onClick={() => void refresh()}>Tentar novamente</Button>}</div>;
    const items = visibleNav(data.user.role);
    const primary = items.filter(item => PRIMARY_NAV.includes(item.path));
    const groups = items.filter(item => !PRIMARY_NAV.includes(item.path)).reduce<{ label: string; items: typeof items }[]>((list, item) => {
        const found = list.find(entry => entry.label === item.group);
        if (found)
            found.items.push(item);
        else
            list.push({ label: item.group, items: [item] });
        return list;
    }, []);
    const initials = data.user.name.slice(0, 2).toUpperCase();
    const top = navLayout === 'top';
    const layoutButton = <button className="icon-button layout-toggle" onClick={() => setLayout(top ? 'side' : 'top')} title={top ? 'Colocar menu na lateral' : 'Colocar menu no topo'} aria-label={top ? 'Colocar menu na lateral' : 'Colocar menu no topo'}>
        <Icon name={top ? 'sidebar' : 'topbar'} size={17}/>
    </button>;
    return <div className={`app-shell ${top ? 'has-top-nav' : 'has-side-nav'}`}>
        <a className="skip-link" href="#main">Pular para o conteúdo</a>
        {menu && <button className="nav-overlay is-open" aria-label="Fechar menu" onClick={() => setMenu(false)}/>}
        {top && <header className="masthead">
            <button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Abrir menu"><Icon name="menu"/></button>
            <Link href="/painel" className="masthead-brand" onClick={() => setMenu(false)}><img src="/brand-lockup.png" alt="JR Caçambas"/></Link>
            <nav className="masthead-nav" aria-label="Navegação principal" ref={navRef}>
                {primary.map(item => <Link key={item.path} href={`/${item.path}`} className={`masthead-link ${path === item.path ? 'active' : ''}`} aria-current={path === item.path ? 'page' : undefined}>
                    {item.label}{item.path === 'cacambas' && <em>{data.containers.length}</em>}
                </Link>)}
                {groups.map(group => {
                    const active = group.items.some(item => item.path === path);
                    const open = openGroup === group.label;
                    return <div key={group.label} className={`masthead-drop ${active ? 'active' : ''} ${open ? 'open' : ''}`}>
                        <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpenGroup(open ? null : group.label)}>
                            {group.label[0] + group.label.slice(1).toLowerCase()}<Icon name="chevron" size={12}/>
                        </button>
                        {open && <div className="masthead-menu" role="menu">
                            {group.items.map(item => <Link key={item.path} href={`/${item.path}`} role="menuitem" className={path === item.path ? 'active' : ''} onClick={() => setOpenGroup(null)}>
                                <Icon name={item.icon} size={15}/>{item.label}
                            </Link>)}
                        </div>}
                    </div>;
                })}
            </nav>
            <div className="masthead-actions">
                {data.user.role !== 'DRIVER' && <form className="global-search" action="/locacoes"><Icon name="search" size={15}/><input name="busca" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar caçamba ou cliente" placeholder="Buscar caçamba ou cliente..."/></form>}
                {layoutButton}
                <button className="icon-button" onClick={() => void refresh()} title="Atualizar dados" aria-label="Atualizar dados"><Icon name="refresh" size={17}/></button>
                <Link href="/conta" className="masthead-user" title="Minha conta">
                    <span>{data.user.name.split(' ')[0]}</span>
                    <span className="avatar">{initials}</span>
                </Link>
            </div>
        </header>}
        <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
            <Link href="/painel" className="brand" onClick={() => setMenu(false)}><div className="brand-logo"><img src="/brand-lockup.png" alt="JR Caçambas"/></div></Link>
            <nav aria-label={top ? 'Menu do aparelho' : 'Navegação principal'}>{items.map((n, i) => <div key={n.path}>{(!i || items[i - 1].group !== n.group) && <div className="nav-group">{n.group}</div>}<Link href={`/${n.path}`} className={`nav-item ${path === n.path ? 'active' : ''}`} aria-current={path === n.path ? 'page' : undefined} onClick={() => setMenu(false)}><Icon name={n.icon} size={18}/>{n.label}{n.path === 'cacambas' && <em>{data.containers.length}</em>}</Link></div>)}</nav>
            <div className="sidebar-bottom">
                <div className={`system-status ${error ? 'disconnected' : ''}`}><i />{error ? 'Conexão interrompida' : 'Conectado ao servidor'}</div>
                <button type="button" className="sidebar-layout-toggle" onClick={() => setLayout('top')}><Icon name="topbar" size={16}/>Menu no topo</button>
                <div className="profile"><span className="avatar">{initials}</span><span><strong>{data.user.name}</strong><small>{ROLE_LABEL[data.user.role]}</small></span><button className="icon-button" onClick={logout} title="Sair" aria-label="Sair do sistema"><Icon name="logout" size={17}/></button></div>
            </div>
        </aside>
        <div className="workspace">
            {!top && <header className="topbar">
                <div className="row"><button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Abrir menu"><Icon name="menu"/></button><div className="breadcrumb">JR Caçambas <Icon name="chevron" size={12}/><strong>{current?.label ?? 'Ordem de serviço'}</strong></div></div>
                <div className="top-actions">{data.user.role !== 'DRIVER' && <form className="global-search" action="/locacoes"><Icon name="search" size={15}/><input name="busca" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar caçamba ou cliente" placeholder="Buscar caçamba ou cliente..."/></form>}{layoutButton}<button className="icon-button" onClick={() => void refresh()} title="Atualizar dados" aria-label="Atualizar dados"><Icon name="refresh" size={17}/></button><Link href="/conta" className="avatar" title="Minha conta">{initials}</Link></div>
            </header>}
            {data.settings.demo && <div className="demo-banner"><Icon name="alert" size={14}/><b>MODO DEMONSTRATIVO</b> Dados fictícios, separados da operação real.</div>}
            {error && <div className="sync-error" role="alert"><Icon name="alert"/>{error} Os dados podem estar desatualizados.<button onClick={() => void refresh()}>Reconectar</button></div>}
            <main id="main" className="page-content">{children}</main>
            <footer className="workspace-footer"><span>JR Caçambas <b>/</b> {current?.label ?? 'Controle operacional'}</span><span>Horários: São Paulo <b>/</b> v1.0.0</span></footer>
        </div>
        {notice && <div className="toast" role="status"><Icon name="check" size={18}/><span>{notice}</span><button onClick={() => notify('')} aria-label="Fechar aviso">×</button></div>}
        {detail && <RentalDetail id={detail} onClose={closeDetail}/>}
        {form && <FormDialog key={form.title} config={form} onClose={closeForm}/>}
    </div>;
}
