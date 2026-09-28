'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { Snapshot, CommandName, CommandResult } from '../shared/types';
import type { FormConfig } from './form-dialog';
export type Run = (action: CommandName, payload: Record<string, unknown>) => Promise<CommandResult>;
interface AppState {
    data: Snapshot | null;
    error: string;
    notice: string;
    busy: boolean;
    refresh: () => Promise<void>;
    run: Run;
    notify: (text: string) => void;
    form: FormConfig | null;
    openForm: (form: FormConfig | null) => void;
    detail: string | null;
    openDetail: (id: string | null) => void;
}
const Context = createContext<AppState | null>(null);
/** Notificação do navegador só quando a aba não está em foco — em foco o toast já avisa. */
function pushBrowserNotification(body: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted')
        return;
    if (!document.hidden && document.hasFocus())
        return;
    try {
        const alert = new Notification('JR Caçambas — nova solicitação', { body, icon: '/brand-lockup.png', tag: 'jr-booking-request' });
        alert.onclick = () => { window.focus(); window.location.assign('/solicitacoes'); alert.close(); };
    }
    catch {
        /* navegador sem suporte ou bloqueado */
    }
}
export function Provider({ children }: {
    children: ReactNode;
}) {
    const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [form, openForm] = useState<FormConfig | null>(null), [detail, openDetail] = useState<string | null>(null);
    const sequence = useRef(0), pending = useRef(false), keys = useRef(new Map<string, string>()), mounted = useRef(true);
    /** IDs de solicitações já vistas nesta sessão; null até o primeiro snapshot (que não gera aviso). */
    const seenRequests = useRef<Set<string> | null>(null);
    const announceNewRequests = useCallback((snapshot: Snapshot) => {
        const requests = snapshot.bookingRequests ?? [];
        if (!seenRequests.current) {
            seenRequests.current = new Set(requests.map(r => r.id));
            return;
        }
        const seen = seenRequests.current;
        const fresh = requests.filter(r => r.status === 'NEW' && !seen.has(r.id));
        for (const r of requests)
            seen.add(r.id);
        if (!fresh.length)
            return;
        const text = fresh.length === 1
            ? `Nova solicitação de ${fresh[0].customerName} — protocolo ${fresh[0].protocol}.`
            : `${fresh.length} novas solicitações de clientes chegaram.`;
        setNotice(text);
        pushBrowserNotification(text);
    }, []);
    const refresh = useCallback(async () => { const n = ++sequence.current; try {
        const res = await fetch('/api/snapshot', { cache: 'no-store', credentials: 'same-origin' });
        if (res.status === 401) {
            window.location.replace('/login');
            return;
        }
        const body = await res.json();
        if (!res.ok)
            throw new Error(body.error ?? 'Falha ao atualizar.');
        if (mounted.current && n === sequence.current) {
            setData(body);
            setError('');
            announceNewRequests(body);
        }
    }
    catch (e) {
        if (mounted.current && n === sequence.current)
            setError(e instanceof Error ? e.message : 'Sem conexão com o servidor.');
    } }, [announceNewRequests]);
    useEffect(() => { mounted.current = true; void refresh(); const id = setInterval(() => { if (!document.hidden && !pending.current)
        void refresh(); }, 30000); const focus = () => { if (!pending.current)
        void refresh(); }; window.addEventListener('focus', focus); return () => { mounted.current = false; clearInterval(id); window.removeEventListener('focus', focus); }; }, [refresh]);
    const role = data?.user.role;
    useEffect(() => {
        // Pede permissão de notificação no primeiro clique (o navegador exige gesto do usuário).
        if (!role || role === 'DRIVER')
            return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'default')
            return;
        const ask = () => { void Notification.requestPermission(); };
        window.addEventListener('pointerdown', ask, { once: true });
        return () => window.removeEventListener('pointerdown', ask);
    }, [role]);
    useEffect(() => { if (!notice)
        return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
    const run = useCallback<Run>(async (action, payload) => {
        if (pending.current)
            throw new Error('Aguarde a operação em andamento.');
        const body = JSON.stringify({ action, payload }), key = keys.current.get(body) ?? (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), x => x.toString(16).padStart(2, '0')).join(''));
        keys.current.set(body, key);
        pending.current = true;
        setBusy(true);
        try {
            const res = await fetch('/api/command', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body });
            const result = await res.json();
            if (!res.ok) {
                if (res.status < 500)
                    keys.current.delete(body);
                if (res.status === 401)
                    window.location.replace('/login');
                await refresh();
                throw new Error(result.error ?? 'Não foi possível salvar.');
            }
            keys.current.delete(body);
            setNotice(result.message);
            if (action === 'changePassword') {
                window.location.replace('/login?senha=alterada');
                return result;
            }
            await refresh();
            return result;
        }
        catch (e) {
            throw e instanceof Error ? e : new Error('Falha de comunicação. Tente novamente com os mesmos dados.');
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }, [refresh]);
    return <Context.Provider value={{ data, error, notice, busy, refresh, run, notify: setNotice, form, openForm, detail, openDetail }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value)
    throw new Error('App Provider ausente.'); return value; }
export function useData() { const { data, ...rest } = useApp(); if (!data)
    throw new Error('Dados ainda não carregados.'); return { data, ...rest }; }
