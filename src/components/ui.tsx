import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './icons';
import { LABEL } from '../shared/format';
export function Button({ children, variant = 'secondary', icon, small = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'dark-secondary';
    icon?: IconName;
    small?: boolean;
}) { return <button type="button" {...props} className={`button ${variant} ${small ? 'small' : ''} ${className}`}>{icon && <Icon name={icon} size={small ? 15 : 17}/>} {children}</button>; }
export function Badge({ status, label }: {
    status: string;
    label?: string;
}) { return <span className={`badge ${status}`}><i />{label ?? LABEL[status] ?? status}</span>; }
export function Heading({ title, description, children }: {
    title: string;
    description: string;
    children?: ReactNode;
}) { return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>; }
export function Card({ title, subtitle, children, action, className = '' }: {
    title?: string;
    subtitle?: string;
    children: ReactNode;
    action?: ReactNode;
    className?: string;
}) { return <section className={`card ${className}`}>{title && <header className="panel-header"><div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</header>}{children}</section>; }
export function Empty({ title = 'Nenhum registro encontrado', description = 'Os registros aparecerão aqui quando forem cadastrados.', icon = 'bin', children }: {
    title?: string;
    description?: string;
    icon?: IconName;
    children?: ReactNode;
}) { return <div className="empty-state"><span className="icon-tile neutral"><Icon name={icon} size={26}/></span><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function Stat({ label, value, caption, icon, tone = 'yellow' }: {
    label: string;
    value: string | number;
    caption: string;
    icon: IconName;
    tone?: string;
}) { return <section className="card metric"><div className="row"><span>{label}</span><span className={`icon-tile ${tone}`}><Icon name={icon}/></span></div><strong>{value}</strong><small>{caption}</small></section>; }
export function Search({ value, onChange, placeholder = 'Buscar registros...' }: {
    value: string;
    onChange: (s: string) => void;
    placeholder?: string;
}) { return <label className="search-input"><Icon name="search" size={17}/><input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/></label>; }
export function Notice({ children, tone = 'info' }: {
    children: ReactNode;
    tone?: 'info' | 'warning' | 'error';
}) { return <div className={`notice ${tone}`}><Icon name={tone === 'info' ? 'help' : 'alert'} size={18}/><div>{children}</div></div>; }
export function Pagination({ page, count, size = 15, onPage }: {
    page: number;
    count: number;
    size?: number;
    onPage: (n: number) => void;
}) { const total = Math.max(1, Math.ceil(count / size)); return <div className="pagination"><small>{count} registro(s) &middot; Página {page} de {total}</small><div className="row"><Button small onClick={() => onPage(page - 1)} disabled={page <= 1}>Anterior</Button><Button small onClick={() => onPage(page + 1)} disabled={page >= total}>Próxima</Button></div></div>; }
