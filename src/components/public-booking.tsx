'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { DEFAULT_PUBLIC_CONTACT, formatBrPhone, socialHandle, whatsappLink, type PublicContact } from '../shared/contact';
import { copyrightLine } from '../shared/brand';

function stagger(index: number): CSSProperties {
    return { '--i': index } as CSSProperties;
}

function InstagramIcon() {
    return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;
}

function FacebookIcon() {
    return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z"/></svg>;
}

function WhatsAppIcon() {
    return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.1 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.3.1-1.4l-1.9-.9c-.3-.1-.5-.2-.7.1l-.9 1.2c-.2.2-.3.2-.6.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.1.1-.1 0-.3 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4h-.5z"/></svg>;
}

const SERVICE_LABELS = {
    RENTAL: 'Alugar caçamba',
    EXCHANGE: 'Trocar caçamba',
    PICKUP: 'Solicitar retirada'
} as const;

interface Result {
    protocol: string;
    message: string;
}

interface TrackedRequest {
    protocol: string;
    customerName: string;
    serviceType: keyof typeof SERVICE_LABELS;
    preferredDate: string;
    preferredPeriod: 'MORNING' | 'AFTERNOON' | 'ANY';
    neighborhood: string;
    city: string;
    status: 'NEW' | 'CONTACTED' | 'CONFIRMED' | 'DECLINED';
    summary: string;
    createdAt: string;
}

const TRACK_LABEL = {
    NEW: 'Recebida',
    CONTACTED: 'Em contato',
    CONFIRMED: 'Confirmada',
    DECLINED: 'Não atendida'
} as const;

const PERIOD_LABEL = { MORNING: 'Manhã', AFTERNOON: 'Tarde', ANY: 'Qualquer período' } as const;

function digits(value: string): string {
    return value.replace(/\D/g, '');
}

function phoneMask(value: string): string {
    const n = digits(value).slice(0, 11);
    if (n.length <= 2) return n;
    if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function cepMask(value: string): string {
    const n = digits(value).slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
}

export function PublicBooking({ contact = DEFAULT_PUBLIC_CONTACT }: { contact?: PublicContact }) {
    // Contatos configurados pelo administrador (Configurações → Contato e redes sociais).
    const CONTACTS = contact.whatsapp.map(value => ({ label: formatBrPhone(value), value }));
    const mainWhatsapp = CONTACTS[0]?.value ?? DEFAULT_PUBLIC_CONTACT.whatsapp[0];
    const [serviceType, setServiceType] = useState<keyof typeof SERVICE_LABELS>('RENTAL');
    const [phone, setPhone] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [address, setAddress] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [city, setCity] = useState('');
    const [busy, setBusy] = useState(false);
    const [cepBusy, setCepBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<Result | null>(null);
    const [trackMode, setTrackMode] = useState<'protocol' | 'contact'>('protocol');
    const [trackProtocol, setTrackProtocol] = useState('');
    const [trackPhone, setTrackPhone] = useState('');
    const [trackEmail, setTrackEmail] = useState('');
    const [trackBusy, setTrackBusy] = useState(false);
    const [trackError, setTrackError] = useState('');
    const [tracked, setTracked] = useState<TrackedRequest[] | null>(null);
    const [captchaId, setCaptchaId] = useState('');
    const [captchaImage, setCaptchaImage] = useState('');

    async function loadCaptcha() {
        setCaptchaId('');
        setCaptchaImage('');
        try {
            const response = await fetch('/api/public/captcha', { cache: 'no-store' });
            const body = await response.json() as { id?: string; image?: string };
            if (response.ok && body.id && body.image) {
                setCaptchaId(body.id);
                setCaptchaImage(body.image);
            }
        }
        catch {
            setCaptchaImage('');
        }
    }

    useEffect(() => { void loadCaptcha(); }, []);

    const siteRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const root = siteRef.current;
        if (!root) return;
        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
        if (!('IntersectionObserver' in window)) {
            items.forEach(item => item.classList.add('is-visible'));
            return;
        }
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
        items.forEach(item => observer.observe(item));
        return () => observer.disconnect();
    }, []);

    async function lookupCep(value: string) {
        const cep = digits(value);
        if (cep.length !== 8) return;
        setCepBusy(true);
        try {
            const response = await fetch(`/api/public/cep/${cep}`, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json() as { street?: string; neighborhood?: string; city?: string; state?: string };
            if (data.street) setAddress(data.street);
            if (data.neighborhood) setNeighborhood(data.neighborhood);
            if (data.city) setCity([data.city, data.state].filter(Boolean).join(' / '));
        }
        finally {
            setCepBusy(false);
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        const form = new FormData(event.currentTarget);
        const payload = Object.fromEntries(form.entries());
        try {
            const response = await fetch('/api/public/booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payload,
                    serviceType,
                    phone,
                    postalCode,
                    address,
                    neighborhood,
                    city,
                    consent: form.get('consent') === 'on'
                })
            });
            const body = await response.json() as Result & { error?: string };
            if (!response.ok) {
                void loadCaptcha();
                throw new Error(body.error || 'Não foi possível enviar a solicitação.');
            }
            setResult(body);
            document.getElementById('solicitar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a solicitação.');
        }
        finally {
            setBusy(false);
        }
    }

    async function track(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setTrackBusy(true);
        setTrackError('');
        setTracked(null);
        try {
            const response = await fetch('/api/public/booking/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackMode === 'protocol'
                    ? { protocol: trackProtocol }
                    : { phone: trackPhone, email: trackEmail })
            });
            const body = await response.json() as { requests?: TrackedRequest[]; error?: string };
            if (!response.ok) throw new Error(body.error || 'Não foi possível consultar o andamento.');
            setTracked(body.requests ?? []);
        }
        catch (reason) {
            setTrackError(reason instanceof Error ? reason.message : 'Não foi possível consultar o andamento.');
        }
        finally {
            setTrackBusy(false);
        }
    }

    const whatsappText = result
        ? `Olá! Enviei uma solicitação pelo site da ${contact.companyName}. Protocolo: ${result.protocol}.`
        : undefined;

    return <main className="public-site" ref={siteRef}>
        <header className="public-header">
            <a className="public-brand" href="#inicio" aria-label="JR Caçambas - início">
                <span>JR</span><strong>JR CAÇAMBAS</strong>
            </a>
            <nav aria-label="Navegação da página">
                <a href="#como-funciona">Como funciona</a>
                <a href="#acompanhar">Acompanhar</a>
                <a href="#atendimento">Área de atendimento</a>
                <a href="#duvidas">Dúvidas</a>
            </nav>
            <div className="public-header-actions">
                {contact.instagram && <a className="public-social instagram" href={contact.instagram} target="_blank" rel="noreferrer" aria-label={`Instagram ${socialHandle(contact.instagram)}`} title={`Instagram ${socialHandle(contact.instagram)}`}><InstagramIcon/></a>}
                {contact.facebook && <a className="public-social facebook" href={contact.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" title={`Facebook ${socialHandle(contact.facebook)}`}><FacebookIcon/></a>}
                <a className="public-social whatsapp" href={whatsappLink(mainWhatsapp)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${formatBrPhone(mainWhatsapp)}`} title={`WhatsApp ${formatBrPhone(mainWhatsapp)}`}><WhatsAppIcon/><span>WhatsApp</span></a>
                <a className="public-header-cta" href="#solicitar">Solicitar caçamba</a>
            </div>
        </header>

        <section className="public-hero" id="inicio">
            <div className="public-hero-copy">
                <span className="public-kicker"><i/>Atendimento em Taboão da Serra, Embu das Artes e região</span>
                <h1>A caçamba certa,<br/><em>sem complicação.</em></h1>
                <p>Solicite entrega, troca ou retirada pela internet. Nossa equipe confere a disponibilidade e combina os detalhes diretamente com você.</p>
                <div className="public-hero-actions">
                    <a className="public-button primary" href="#solicitar">Fazer uma solicitação <span>→</span></a>
                    <a className="public-button quiet" href={whatsappLink(mainWhatsapp)} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
                </div>
                <ul className="public-proof">
                    <li><b>✓</b><span><strong>Atendimento local</strong><small>Conhecemos a região</small></span></li>
                    <li><b>✓</b><span><strong>Confirmação humana</strong><small>Sem promessa automática</small></span></li>
                    <li><b>✓</b><span><strong>Acompanhamento</strong><small>Da entrega à retirada</small></span></li>
                </ul>
            </div>
            <div className="public-hero-art">
                <div className="public-sun" aria-hidden="true"/>
                <figure className="public-bin-shot">
                    <span className="public-bin-tag">Nosso modelo</span>
                    <img src="/cacamba-jr.jpg" alt="Caçamba branca da JR Caçambas com telefone (11) 95629-2968" width={1024} height={1024} fetchPriority="high"/>
                    <figcaption>Caçamba identificada com nosso telefone.</figcaption>
                </figure>
                <div className="public-art-card" aria-hidden="true"><span>●</span><div><strong>Solicitação online</strong><small>Retorno da nossa equipe</small></div></div>
            </div>
        </section>

        <section className="public-steps" id="como-funciona">
            <div className="public-section-heading" data-reveal><span>PROCESSO SIMPLES</span><h2>Você solicita. A gente organiza.</h2><p>O pedido entra na nossa fila operacional e só vira agendamento depois da confirmação.</p></div>
            <div className="public-step-grid">
                <article data-reveal style={stagger(0)}><b>01</b><div className="public-step-icon">⌖</div><h3>Informe o local</h3><p>Preencha o endereço da obra e o tipo de resíduo.</p></article>
                <article data-reveal style={stagger(1)}><b>02</b><div className="public-step-icon">◷</div><h3>Escolha uma preferência</h3><p>Indique a melhor data e período para atendimento.</p></article>
                <article data-reveal style={stagger(2)}><b>03</b><div className="public-step-icon">✓</div><h3>Aguarde a confirmação</h3><p>Nossa equipe retorna com disponibilidade, valor e horário.</p></article>
            </div>
        </section>

        <section className="public-booking-zone" id="solicitar">
            <div className="public-booking-intro" data-reveal>
                <span className="public-kicker light"><i/>SOLICITAÇÃO ONLINE</span>
                <h2>Conte o que você precisa.</h2>
                <p>Leva menos de dois minutos. O envio não gera cobrança e não confirma automaticamente a reserva.</p>
                <div className="public-contact-block">
                    <small>Prefere falar com a equipe?</small>
                    {CONTACTS.map(c => <a key={c.value} href={whatsappLink(c.value)} target="_blank" rel="noreferrer"><span>WhatsApp</span><strong>{c.label}</strong></a>)}
                    {contact.instagram && <a href={contact.instagram} target="_blank" rel="noreferrer"><span>Instagram</span><strong>{socialHandle(contact.instagram)}</strong></a>}
                    {contact.facebook && <a href={contact.facebook} target="_blank" rel="noreferrer"><span>Facebook</span><strong>{socialHandle(contact.facebook)}</strong></a>}
                </div>
                <address>Rua Agelina, 424<br/>Jardim Record · Taboão da Serra/SP</address>
            </div>
            <div className="public-form-card" data-reveal style={stagger(1)}>
                {result ? <div className="public-success" role="status">
                    <div className="public-success-icon">✓</div>
                    <span>SOLICITAÇÃO RECEBIDA</span>
                    <h2>Agora é com a gente.</h2>
                    <p>{result.message}</p>
                    <div className="public-protocol"><small>Seu protocolo</small><strong>{result.protocol}</strong></div>
                    <p className="public-success-note">Guarde esse número. Depois, consulte o andamento com o mesmo e-mail e telefone.</p>
                    <div className="public-success-actions">
                        <a className="public-button primary" href={whatsappLink(mainWhatsapp, whatsappText)} target="_blank" rel="noreferrer">Continuar no WhatsApp</a>
                        <button className="public-link-button" onClick={() => setResult(null)}>Fazer outra solicitação</button>
                    </div>
                </div> : <form onSubmit={submit}>
                    <div className="public-form-head"><span>1</span><div><h3>Qual serviço você precisa?</h3><p>Selecione uma opção para começar.</p></div></div>
                    <div className="public-service-options">
                        {(Object.entries(SERVICE_LABELS) as [keyof typeof SERVICE_LABELS, string][]).map(([value, label]) =>
                            <button type="button" key={value} aria-pressed={serviceType === value} className={serviceType === value ? 'selected' : ''} onClick={() => setServiceType(value)}>
                                <span>{value === 'RENTAL' ? '▰' : value === 'EXCHANGE' ? '⇄' : '↙'}</span><strong>{label}</strong><small>{value === 'RENTAL' ? 'Primeira entrega no local' : value === 'EXCHANGE' ? 'Retira uma e deixa outra' : 'Caçamba já está no local'}</small>
                            </button>)}
                    </div>

                    <div className="public-form-head divider"><span>2</span><div><h3>Seus dados e o local</h3><p>Usaremos essas informações somente para este atendimento.</p></div></div>
                    <div className="public-form-grid">
                        <label className="wide"><span>Nome ou razão social *</span><input name="customerName" required minLength={2} maxLength={120} autoComplete="name" placeholder="Como podemos chamar você?"/></label>
                        <label><span>WhatsApp / telefone *</span><input name="phoneDisplay" required inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(phoneMask(event.target.value))} placeholder="(11) 99999-9999"/></label>
                        <label><span>E-mail *</span><input name="email" type="email" required autoComplete="email" maxLength={254} placeholder="voce@exemplo.com"/><small>Use este e-mail para consultar o andamento.</small></label>
                        <label><span>CEP</span><input name="postalCodeDisplay" inputMode="numeric" autoComplete="postal-code" value={postalCode} onChange={event => setPostalCode(cepMask(event.target.value))} onBlur={event => void lookupCep(event.target.value)} placeholder="00000-000"/><small>{cepBusy ? 'Buscando endereço...' : 'Preenchemos o endereço pelo CEP.'}</small></label>
                        <label className="wide"><span>Rua, número e complemento *</span><input name="addressDisplay" required minLength={5} maxLength={240} autoComplete="street-address" value={address} onChange={event => setAddress(event.target.value)} placeholder="Ex.: Rua das Flores, 120 — portão azul"/></label>
                        <label><span>Bairro *</span><input name="neighborhoodDisplay" required minLength={2} maxLength={100} value={neighborhood} onChange={event => setNeighborhood(event.target.value)} placeholder="Bairro"/></label>
                        <label><span>Cidade / UF *</span><input name="cityDisplay" required minLength={2} maxLength={100} value={city} onChange={event => setCity(event.target.value)} placeholder="Taboão da Serra / SP"/></label>
                    </div>

                    <div className="public-form-head divider"><span>3</span><div><h3>Preferência de atendimento</h3><p>A data será confirmada após verificarmos a rota.</p></div></div>
                    <div className="public-form-grid">
                        <label><span>Data desejada *</span><input name="preferredDate" type="date" required min={new Date().toISOString().slice(0, 10)}/></label>
                        <label><span>Período *</span><select name="preferredPeriod" required defaultValue="ANY"><option value="ANY">Qualquer período</option><option value="MORNING">Manhã</option><option value="AFTERNOON">Tarde</option></select></label>
                        <label className="wide"><span>Tipo de resíduo *</span><select name="wasteType" required defaultValue=""><option value="" disabled>Selecione...</option><option>Entulho de obra / construção</option><option>Terra e solo</option><option>Madeira</option><option>Podas e resíduos verdes</option><option>Material reciclável</option><option>Outro — explicar nas observações</option></select></label>
                        <label className="wide"><span>Observações</span><textarea name="notes" rows={3} maxLength={1000} placeholder="Informe acesso estreito, portão, referência, quantidade estimada ou outra orientação importante."/></label>
                    </div>
                    <input className="public-honeypot" name="companyWebsite" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
                    <div className="public-captcha">
                        <div>
                            <span>Confirme que você não é um robô *</span>
                            <small>Digite os 5 caracteres da imagem. Maiúsculas e minúsculas valem igual.</small>
                        </div>
                        <div className="public-captcha-row">
                            {captchaImage
                                ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaImage)}`} alt="Código de verificação" width={168} height={58}/>
                                : <div className="public-captcha-pending">Carregando código...</div>}
                            <button type="button" onClick={() => void loadCaptcha()}>Trocar código</button>
                            <input name="captchaAnswer" required autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={8} placeholder="Código da imagem" aria-label="Código da imagem"/>
                        </div>
                        <input type="hidden" name="captchaId" value={captchaId}/>
                    </div>
                    <label className="public-consent"><input name="consent" type="checkbox" required/><span>Autorizo a JR Caçambas a entrar em contato pelos dados informados para tratar desta solicitação.</span></label>
                    {error && <div className="public-form-error" role="alert">{error}</div>}
                    <button className="public-submit" type="submit" disabled={busy}>{busy ? 'Enviando solicitação...' : <>Enviar solicitação <span>→</span></>}</button>
                    <p className="public-disclaimer">O envio é gratuito e não confirma preço, disponibilidade ou reserva. A contratação acontece somente após o retorno da equipe.</p>
                </form>}
            </div>
        </section>

        <section className="public-track" id="acompanhar">
            <div className="public-section-heading" data-reveal>
                <span>ACOMPANHAMENTO</span>
                <h2>Como está o seu pedido?</h2>
                <p>Use o número do pedido ou o mesmo e-mail e celular da solicitação. Mostramos só o andamento, sem dados internos da equipe.</p>
            </div>
            <div className="public-track-modes" role="tablist" aria-label="Forma de consulta" data-reveal style={stagger(1)}>
                <button type="button" role="tab" aria-selected={trackMode === 'protocol'} className={trackMode === 'protocol' ? 'selected' : ''} onClick={() => { setTrackMode('protocol'); setTracked(null); setTrackError(''); }}>Número do pedido</button>
                <button type="button" role="tab" aria-selected={trackMode === 'contact'} className={trackMode === 'contact' ? 'selected' : ''} onClick={() => { setTrackMode('contact'); setTracked(null); setTrackError(''); }}>E-mail e celular</button>
            </div>
            <div data-reveal style={stagger(2)}>
            <form className={`public-track-form${trackMode === 'protocol' ? ' protocol' : ''}`} onSubmit={track}>
                {trackMode === 'protocol'
                    ? <label><span>Número do pedido</span><input required autoCapitalize="characters" spellCheck={false} maxLength={24} value={trackProtocol} onChange={event => setTrackProtocol(event.target.value.toUpperCase())} placeholder="JR-20260928-AB12CD"/></label>
                    : <><label><span>E-mail</span><input type="email" required autoComplete="email" maxLength={254} value={trackEmail} onChange={event => setTrackEmail(event.target.value)} placeholder="voce@exemplo.com"/></label>
                        <label><span>WhatsApp / telefone</span><input required inputMode="tel" autoComplete="tel" value={trackPhone} onChange={event => setTrackPhone(phoneMask(event.target.value))} placeholder="(11) 99999-9999"/></label></>}
                <button className="public-button primary" type="submit" disabled={trackBusy}>{trackBusy ? 'Consultando...' : 'Consultar andamento'}</button>
            </form>
            </div>
            {trackError && <div className="public-form-error public-track-feedback" role="alert">{trackError}</div>}
            {tracked && (tracked.length ? <div className="public-track-list">{tracked.map(request =>
                <article key={request.protocol} className={`public-track-card status-${request.status.toLowerCase()}`}>
                    <div><span>{request.protocol}</span><strong className="public-track-badge">{TRACK_LABEL[request.status]}</strong></div>
                    <h3>{request.customerName}</h3>
                    <p className="public-track-service">{SERVICE_LABELS[request.serviceType]}</p>
                    <p>{request.summary}</p>
                    <small>{request.preferredDate.split('-').reverse().join('/')} · {PERIOD_LABEL[request.preferredPeriod]} · {request.neighborhood}, {request.city}</small>
                </article>)}</div> : <p className="public-track-empty">{trackMode === 'protocol' ? 'Não encontramos um pedido com esse número. Confira o código do comprovante ou consulte pelo e-mail e celular.' : 'Não encontramos pedidos com esses dados. Confira o e-mail e o telefone ou use o número do pedido.'}</p>)}
        </section>

        <section className="public-coverage" id="atendimento">
            <div data-reveal><span>ATENDIMENTO REGIONAL</span><h2>Perto de você,<br/>perto da sua obra.</h2><p>Nosso pátio fica no Jardim Record, em Taboão da Serra. Atendemos Taboão da Serra, Embu das Artes e localidades próximas mediante consulta de rota.</p><a href="#solicitar">Consultar meu endereço →</a></div>
            <div className="public-coverage-map" data-reveal style={stagger(1)}>
                <i className="road one"/><i className="road two"/><i className="road three"/>
                <span className="map-place taboao"><b/>Taboão da Serra</span>
                <span className="map-place embu"><b/>Embu das Artes</span>
                <span className="map-yard"><b>JR</b><small>Nosso pátio</small></span>
            </div>
        </section>

        <section className="public-faq" id="duvidas">
            <div className="public-section-heading" data-reveal><span>ANTES DE SOLICITAR</span><h2>Dúvidas frequentes</h2></div>
            <div className="public-faq-grid">
                <details data-reveal style={stagger(0)}><summary>A solicitação já reserva a caçamba?</summary><p>Não. Primeiro conferimos disponibilidade, endereço, tipo de resíduo e rota. A reserva só fica confirmada após nosso contato.</p></details>
                <details data-reveal style={stagger(1)}><summary>Quais cidades vocês atendem?</summary><p>Taboão da Serra, Embu das Artes e região. Endereços fora dessa área passam por consulta antes da confirmação.</p></details>
                <details data-reveal style={stagger(2)}><summary>Posso pedir troca ou retirada?</summary><p>Sim. Escolha “Trocar caçamba” ou “Solicitar retirada” no formulário e informe o endereço onde ela está.</p></details>
                <details data-reveal style={stagger(3)}><summary>Posso descartar qualquer material?</summary><p>Não. Informe corretamente o resíduo para que a equipe confirme se ele pode ser transportado e qual destinação será necessária.</p></details>
            </div>
        </section>

        <footer className="public-footer" data-reveal>
            <a className="public-brand inverse" href="#inicio"><span>JR</span><strong>JR CAÇAMBAS</strong></a>
            <p>Solicitação de caçambas em Taboão da Serra, Embu das Artes e região.</p>
            <div>
                {CONTACTS.map(c => <a key={c.value} href={whatsappLink(c.value)} target="_blank" rel="noreferrer">{c.label}</a>)}
                {contact.instagram && <a href={contact.instagram} target="_blank" rel="noreferrer">Instagram {socialHandle(contact.instagram)}</a>}
                {contact.facebook && <a href={contact.facebook} target="_blank" rel="noreferrer">Facebook</a>}
            </div>
            <small>Rua Agelina, 424 · Jardim Record · Taboão da Serra/SP</small>
            <small className="public-copyright">{copyrightLine()}</small>
        </footer>
    </main>;
}
