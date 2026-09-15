'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Notice } from './ui';
import { Icon } from './icons';
import { applyCepResult, digitsCep, formatCep, isCepField, isCompleteCep, lookupCepProviders, type CepAddress } from '../shared/cep';
export interface Field {
    name: string;
    label: string;
    type?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'datetime-local' | 'date' | 'textarea' | 'select' | 'checkbox' | 'multi';
    required?: boolean;
    options?: {
        value: string;
        label: string;
    }[];
    min?: number;
    max?: number;
    step?: number | string;
    hint?: string;
    group?: string;
    full?: boolean;
    when?: {
        field: string;
        value: string;
    };
}
export interface FormConfig {
    title: string;
    description?: string;
    fields: Field[];
    initial?: Record<string, unknown>;
    submit: (values: Record<string, unknown>) => Promise<unknown>;
    submitLabel?: string;
    gps?: boolean;
}
export function FormDialog({ config, onClose }: {
    config: FormConfig;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null), cepRequest = useRef(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [values, setValues] = useState<Record<string, unknown>>(config.initial ?? {}), [gpsBusy, setGpsBusy] = useState(false), [cepBusy, setCepBusy] = useState(false);
    useEffect(() => { if (ref.current && !ref.current.open)
        ref.current.showModal(); const onEscape = (e: Event) => { e.preventDefault(); if (!busy)
        onClose(); }; const d = ref.current; d?.addEventListener('cancel', onEscape); return () => d?.removeEventListener('cancel', onEscape); }, [busy, onClose]);
    const set = (key: string, value: unknown) => setValues(old => ({ ...old, [key]: value }));
    async function locate() { setGpsBusy(true); setError(''); if (!navigator.geolocation) {
        setError('Localização indisponível neste navegador.');
        setGpsBusy(false);
        return;
    } navigator.geolocation.getCurrentPosition(p => { setValues(v => ({ ...v, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) })); setGpsBusy(false); }, () => { setError('Não foi possível obter a localização. Confira a permissão e o uso de HTTPS.'); setGpsBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }); }
    async function fillFromCep(value: string) {
        if (!isCompleteCep(value))
            return;
        const n = ++cepRequest.current;
        setCepBusy(true);
        setError('');
        try {
            const digits = digitsCep(value);
            const res = await fetch(`/api/cep/${digits}`, { cache: 'no-store', credentials: 'same-origin' });
            if (n !== cepRequest.current)
                return;
            if (res.status === 401) {
                window.location.replace('/login');
                return;
            }
            let address: CepAddress | null = null;
            if (res.ok)
                address = await res.json() as CepAddress;
            if (!address)
                address = await lookupCepProviders(digits);
            if (n !== cepRequest.current)
                return;
            if (!address)
                throw new Error('CEP não encontrado. Confira os números ou preencha o endereço manualmente.');
            setValues(current => applyCepResult(current, config.fields, address));
        }
        catch (e) {
            if (n === cepRequest.current)
                setError(e instanceof Error ? e.message : 'Não foi possível consultar o CEP.');
        }
        finally {
            if (n === cepRequest.current)
                setCepBusy(false);
        }
    }
    function changeField(field: Field, raw: string) {
        if (isCepField(field)) {
            const formatted = formatCep(raw);
            set(field.name, formatted);
            if (isCompleteCep(formatted))
                void fillFromCep(formatted);
            return;
        }
        set(field.name, raw);
    }
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; setError(''); setBusy(true); try {
        const payload: Record<string, unknown> = { ...values };
        for (const f of config.fields) {
            if (f.when && values[f.when.field] !== f.when.value)
                continue;
            if (f.type === 'number') {
                const raw = values[f.name];
                payload[f.name] = raw == null || raw === '' ? null : Number(raw);
            }
            else if (f.type === 'checkbox')
                payload[f.name] = values[f.name] === true;
            else if (f.type === 'multi')
                payload[f.name] = values[f.name] ?? [];
            else
                payload[f.name] = values[f.name] ?? '';
        }
        await config.submit(payload);
        onClose();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
        setBusy(false);
    } }
    return <dialog ref={ref} className="modal form-modal" aria-labelledby="form-title" onClick={e => { if (e.target === ref.current && !busy)
        onClose(); }}><header className="modal-header"><div><span className="eyebrow">JR / OPERAÇÃO</span><h2 id="form-title">{config.title}</h2>{config.description && <p>{config.description}</p>}</div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar formulário"><Icon name="close"/></button></header><form onSubmit={submit}><div className="modal-body form-grid">{config.fields.map(f => {
            if (f.when && values[f.when.field] !== f.when.value)
                return null;
            const value = values[f.name] ?? '';
            const cep = isCepField(f);
            const hint = cep && cepBusy ? 'Consultando o CEP...' : f.hint;
            return <div className={`${f.full || f.type === 'checkbox' || f.type === 'multi' ? 'full' : ''} field`} key={f.name}>{f.group && <h3 className="form-group-title">{f.group}</h3>}{f.type === 'checkbox' ? <label className="check-label"><input type="checkbox" checked={value === true} onChange={e => set(f.name, e.target.checked)} required={f.required}/><span>{f.label}</span></label> : f.type === 'multi' ? <fieldset className="multi-select"><legend>{f.label}</legend><div>{f.options?.map(o => <label key={o.value}><input type="checkbox" checked={Array.isArray(value) && value.includes(o.value)} onChange={e => { const current = Array.isArray(value) ? value : []; set(f.name, e.target.checked ? [...current, o.value] : current.filter(x => x !== o.value)); }}/>{o.label}</label>)}</div></fieldset> : <><label htmlFor={`f-${f.name}`}>{f.label}{f.required && <span aria-hidden="true"> *</span>}</label>{f.type === 'select' ? <select id={`f-${f.name}`} value={String(value)} required={f.required} onChange={e => set(f.name, e.target.value)}><option value="">Selecione...</option>{f.options?.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select> : f.type === 'textarea' ? <textarea id={`f-${f.name}`} value={String(value)} onChange={e => set(f.name, e.target.value)} required={f.required} rows={3} maxLength={2000}/> : <input id={`f-${f.name}`} type={f.type ?? 'text'} value={String(value)} onChange={e => changeField(f, e.target.value)} onBlur={cep ? () => void fillFromCep(String(value)) : undefined} required={f.required} min={f.min} max={f.max} step={f.step ?? (f.type === 'number' ? 'any' : undefined)} maxLength={cep ? 9 : f.type === 'password' ? 128 : undefined} inputMode={cep ? 'numeric' : undefined} autoComplete={cep ? 'postal-code' : f.type === 'password' ? 'new-password' : undefined}/>}</>}{hint && <small className="field-hint">{hint}</small>}</div>;
        })}{config.gps && <div className="full"><Button small icon="pin" onClick={locate} disabled={gpsBusy || busy}>{gpsBusy ? 'Obtendo localização...' : 'Usar minha localização atual'}</Button><p className="field-hint">Opcional. Registra a posição deste dispositivo, não o rastreamento do caminhão.</p></div>}{error && <div className="full" role="alert"><Notice tone="error">{error}</Notice></div>}</div><footer className="modal-footer"><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="primary" type="submit" disabled={busy || gpsBusy || cepBusy} icon={busy ? 'refresh' : 'check'}>{busy ? 'Salvando...' : config.submitLabel ?? 'Salvar registro'}</Button></footer></form></dialog>;
}
