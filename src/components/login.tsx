'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from './icons';
import { Button } from './ui';
export function Login() {
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false), [changed, setChanged] = useState(false);
    useEffect(() => { setChanged(new URLSearchParams(window.location.search).has('senha')); void fetch('/api/snapshot', { cache: 'no-store' }).then(r => { if (r.ok)
        window.location.replace('/painel'); }).catch(() => { }); }, []);
    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy)
        return; setBusy(true); setError(''); try {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const body = await res.json();
        if (!res.ok)
            throw new Error(body.error || 'Não foi possível entrar.');
        window.location.replace('/painel');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Sem conexão. Tente novamente.');
        setBusy(false);
    } }
    return <div className="login-page"><section className="login-story"><div className="login-brand"><img src="/brand-lockup.png" alt="JR Caçambas"/></div><div className="login-story-content"><span className="eyebrow">CONTROLE QUE MOVE A SUA OPERAÇÃO</span><h1>Cada caçamba.<br />No lugar certo.</h1><p>Da primeira entrega ao retorno ao pátio: tenha clareza sobre sua frota, sua equipe e cada serviço.</p><div className="login-fleet-art" aria-hidden="true"><Icon name="truck" size={110}/><div className="login-road"/><Icon name="bin" size={54}/><Icon name="bin" size={54}/></div><div className="login-highlights"><span><Icon name="pin" size={20}/>Localização cadastrada</span><span><Icon name="calendar" size={20}/>Agenda integrada</span><span><Icon name="shield" size={20}/>Acesso por perfil</span></div></div><div className="login-caption">JR CAÇAMBAS <span>GESTÃO OPERACIONAL</span></div></section><section className="login-form-side"><div className="login-form-card"><div className="login-mobile-logo"><img src="/brand-lockup.png" alt="JR Caçambas"/></div><span className="icon-tile yellow"><Icon name="lock" size={22}/></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Entre na sua operação.</h2><p className="muted">Use o acesso cadastrado pelo administrador.</p>{changed && <div className="notice info" role="status">Senha alterada. Entre novamente com sua nova senha.</div>}<form onSubmit={submit}><label className="field"><span>E-mail</span><input name="email" type="email" autoComplete="username" placeholder="seu.email@empresa.com.br" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required autoFocus/></label><label className="field"><span>Senha</span><span className="password-field"><input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} required/><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}><Icon name="eye" size={18}/></button></span></label>{error && <div className="form-error" role="alert">{error}</div>}<Button type="submit" variant="primary" disabled={busy} icon={busy ? 'refresh' : 'arrow'} className={busy ? 'login-submit loading' : 'login-submit'}>{busy ? 'Validando acesso...' : 'Entrar no sistema'}</Button></form><div className="login-support"><Icon name="help" size={16}/><p>Primeiro acesso ou esqueceu sua senha?<br />Solicite orientação ao administrador do sistema.</p></div><small className="login-security"><Icon name="shield" size={14}/>Acesso individual. Não compartilhe sua senha.</small></div><footer>JR Caçambas · Plataforma de gestão</footer></section></div>;
}
