'use client';

import { useState, type FormEvent } from 'react';

const CONTACTS = [
    { label: '(11) 95629-2968', value: '5511956292968' },
    { label: '(11) 96615-0912', value: '5511966150912' }
];

const SERVICE_LABELS = {
    RENTAL: 'Alugar caçamba',
    EXCHANGE: 'Trocar caçamba',
    PICKUP: 'Solicitar retirada'
} as const;

interface Result {
    protocol: string;
    message: string;
}

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

export function PublicBooking() {
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
            if (!response.ok) throw new Error(body.error || 'Não foi possível enviar a solicitação.');
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

    const whatsappText = result
        ? encodeURIComponent(`Olá! Enviei uma solicitação pelo site da JR Caçambas. Protocolo: ${result.protocol}.`)
        : '';

    return <main className="public-site">
        <header className="public-header">
            <a className="public-brand" href="#inicio" aria-label="JR Caçambas - início">
                <span>JR</span><strong>JR CAÇAMBAS</strong>
            </a>
            <nav aria-label="Navegação da página">
                <a href="#como-funciona">Como funciona</a>
                <a href="#atendimento">Área de atendimento</a>
                <a href="#duvidas">Dúvidas</a>
            </nav>
            <a className="public-header-cta" href="#solicitar">Solicitar caçamba</a>
        </header>

        <section className="public-hero" id="inicio">
            <div className="public-hero-copy">
                <span className="public-kicker"><i/>Atendimento em Taboão da Serra, Embu das Artes e região</span>
                <h1>A caçamba certa,<br/><em>sem complicação.</em></h1>
                <p>Solicite entrega, troca ou retirada pela internet. Nossa equipe confere a disponibilidade e combina os detalhes diretamente com você.</p>
                <div className="public-hero-actions">
                    <a className="public-button primary" href="#solicitar">Fazer uma solicitação <span>→</span></a>
                    <a className="public-button quiet" href={`https://wa.me/${CONTACTS[0].value}`} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
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
            <div className="public-section-heading"><span>PROCESSO SIMPLES</span><h2>Você solicita. A gente organiza.</h2><p>O pedido entra na nossa fila operacional e só vira agendamento depois da confirmação.</p></div>
            <div className="public-step-grid">
                <article><b>01</b><div className="public-step-icon">⌖</div><h3>Informe o local</h3><p>Preencha o endereço da obra e o tipo de resíduo.</p></article>
                <article><b>02</b><div className="public-step-icon">◷</div><h3>Escolha uma preferência</h3><p>Indique a melhor data e período para atendimento.</p></article>
                <article><b>03</b><div className="public-step-icon">✓</div><h3>Aguarde a confirmação</h3><p>Nossa equipe retorna com disponibilidade, valor e horário.</p></article>
            </div>
        </section>

        <section className="public-booking-zone" id="solicitar">
            <div className="public-booking-intro">
                <span className="public-kicker light"><i/>SOLICITAÇÃO ONLINE</span>
                <h2>Conte o que você precisa.</h2>
                <p>Leva menos de dois minutos. O envio não gera cobrança e não confirma automaticamente a reserva.</p>
                <div className="public-contact-block">
                    <small>Prefere falar com a equipe?</small>
                    {CONTACTS.map(contact => <a key={contact.value} href={`https://wa.me/${contact.value}`} target="_blank" rel="noreferrer"><span>WhatsApp</span><strong>{contact.label}</strong></a>)}
                </div>
                <address>Rua Agelina, 424<br/>Jardim Record · Taboão da Serra/SP</address>
            </div>
            <div className="public-form-card">
                {result ? <div className="public-success" role="status">
                    <div className="public-success-icon">✓</div>
                    <span>SOLICITAÇÃO RECEBIDA</span>
                    <h2>Agora é com a gente.</h2>
                    <p>{result.message}</p>
                    <div className="public-protocol"><small>Seu protocolo</small><strong>{result.protocol}</strong></div>
                    <p className="public-success-note">Guarde esse número. Ele identifica seu atendimento.</p>
                    <div className="public-success-actions">
                        <a className="public-button primary" href={`https://wa.me/${CONTACTS[0].value}?text=${whatsappText}`} target="_blank" rel="noreferrer">Continuar no WhatsApp</a>
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
                        <label><span>E-mail</span><input name="email" type="email" autoComplete="email" maxLength={254} placeholder="voce@exemplo.com"/></label>
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
                    <label className="public-consent"><input name="consent" type="checkbox" required/><span>Autorizo a JR Caçambas a entrar em contato pelos dados informados para tratar desta solicitação.</span></label>
                    {error && <div className="public-form-error" role="alert">{error}</div>}
                    <button className="public-submit" type="submit" disabled={busy}>{busy ? 'Enviando solicitação...' : <>Enviar solicitação <span>→</span></>}</button>
                    <p className="public-disclaimer">O envio é gratuito e não confirma preço, disponibilidade ou reserva. A contratação acontece somente após o retorno da equipe.</p>
                </form>}
            </div>
        </section>

        <section className="public-coverage" id="atendimento">
            <div><span>ATENDIMENTO REGIONAL</span><h2>Perto de você,<br/>perto da sua obra.</h2><p>Nosso pátio fica no Jardim Record, em Taboão da Serra. Atendemos Taboão da Serra, Embu das Artes e localidades próximas mediante consulta de rota.</p><a href="#solicitar">Consultar meu endereço →</a></div>
            <div className="public-coverage-map">
                <i className="road one"/><i className="road two"/><i className="road three"/>
                <span className="map-place taboao"><b/>Taboão da Serra</span>
                <span className="map-place embu"><b/>Embu das Artes</span>
                <span className="map-yard"><b>JR</b><small>Nosso pátio</small></span>
            </div>
        </section>

        <section className="public-faq" id="duvidas">
            <div className="public-section-heading"><span>ANTES DE SOLICITAR</span><h2>Dúvidas frequentes</h2></div>
            <div className="public-faq-grid">
                <details><summary>A solicitação já reserva a caçamba?</summary><p>Não. Primeiro conferimos disponibilidade, endereço, tipo de resíduo e rota. A reserva só fica confirmada após nosso contato.</p></details>
                <details><summary>Quais cidades vocês atendem?</summary><p>Taboão da Serra, Embu das Artes e região. Endereços fora dessa área passam por consulta antes da confirmação.</p></details>
                <details><summary>Posso pedir troca ou retirada?</summary><p>Sim. Escolha “Trocar caçamba” ou “Solicitar retirada” no formulário e informe o endereço onde ela está.</p></details>
                <details><summary>Posso descartar qualquer material?</summary><p>Não. Informe corretamente o resíduo para que a equipe confirme se ele pode ser transportado e qual destinação será necessária.</p></details>
            </div>
        </section>

        <footer className="public-footer">
            <a className="public-brand inverse" href="#inicio"><span>JR</span><strong>JR CAÇAMBAS</strong></a>
            <p>Solicitação de caçambas em Taboão da Serra, Embu das Artes e região.</p>
            <div>{CONTACTS.map(contact => <a key={contact.value} href={`https://wa.me/${contact.value}`} target="_blank" rel="noreferrer">{contact.label}</a>)}</div>
            <small>Rua Agelina, 424 · Jardim Record · Taboão da Serra/SP</small>
        </footer>
    </main>;
}
