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
export function Provider({ children }: {
    children: ReactNode;
}) {
    const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [form, openForm] = useState<FormConfig | null>(null), [detail, openDetail] = useState<string | null>(null);
    const sequence = useRef(0), pending = useRef(false), keys = useRef(new Map<string, string>()), mounted = useRef(true);
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
        }
    }
    catch (e) {
        if (mounted.current && n === sequence.current)
            setError(e instanceof Error ? e.message : 'Sem conexão com o servidor.');
    } }, []);
    useEffect(() => { mounted.current = true; void refresh(); const id = setInterval(() => { if (!document.hidden && !pending.current)
        void refresh(); }, 30000); const focus = () => { if (!pending.current)
        void refresh(); }; window.addEventListener('focus', focus); return () => { mounted.current = false; clearInterval(id); window.removeEventListener('focus', focus); }; }, [refresh]);
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
