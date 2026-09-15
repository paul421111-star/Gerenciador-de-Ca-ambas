'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useData } from './provider';
import { Button, Badge, Notice } from './ui';
import { Icon } from './icons';
import { dateTime, money, LABEL, contractedLabel, isMeasured, balanceLabel, isOpenEndedPickup, customerPlaceLabel } from '../shared/format';
import { received } from '../shared/reports';
import { transitionForm, scheduleForm, paymentForm, voidForm } from './forms';
import { signatureOf } from '../shared/signature';
export function RentalDetail({ id, onClose }: {
    id: string;
    onClose: () => void;
}) {
    const drawerRef = useRef<HTMLElement>(null);
    const { data: s, run, openForm } = useData();
    const r = s.rentals.find(r => r.id === id);
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        drawerRef.current?.focus();
        const listener = (e: KeyboardEvent) => {
            if (document.querySelector('dialog[open]'))
                return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== 'Tab')
                return;
            const elements = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.offsetParent !== null);
            if (!elements.length) {
                e.preventDefault();
                return;
            }
            const first = elements[0], last = elements[elements.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', listener);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', listener); document.body.style.overflow = previous; if (previousFocus?.isConnected)
            previousFocus.focus(); };
    }, [onClose]);
    if (!r)
        return <div className="drawer-backdrop"><aside ref={drawerRef} tabIndex={-1} className="detail-drawer" role="dialog" aria-modal="true" aria-label="Detalhe indisponível"><Button onClick={onClose}>Fechar</Button><Notice tone="warning">Registro não encontrado ou sem permissão.</Notice></aside></div>;
    const bin = s.containers.find(c => c.id === r.containerId), customer = s.customers.find(c => c.id === r.customerId), site = s.customerSites.find(item => item.id === r.siteId), jobs = s.jobs.filter(j => j.rentalId === id), events = s.events.filter(e => e.rentalId === id), driver = s.user.role === 'DRIVER', paid = received(s, id);
    const actionMap: Record<string, {
        action: string;
        label: string;
    }> = { RESERVED: { action: 'start_delivery', label: 'Iniciar entrega' }, DELIVERING: { action: 'complete_delivery', label: 'Confirmar entrega' }, ACTIVE: { action: 'start_pickup', label: 'Iniciar retirada' }, COLLECTING: { action: 'complete_pickup', label: 'Confirmar coleta' }, RETURNING: { action: 'return_yard', label: 'Conferir retorno' } };
    const next = actionMap[r.status], kind = ['RESERVED', 'DELIVERING'].includes(r.status) ? 'DELIVERY' : 'PICKUP', job = jobs.find(j => j.kind === kind), pickupJob = jobs.find(j => j.kind === 'PICKUP'), canAct = !driver || job?.driverId === s.user.driverId, assignPickup = next?.action === 'start_pickup' && !pickupJob;
    const deliverySign = signatureOf(s.rentalSignatures, id, 'DELIVERY', 'RESPONSIBLE'), pickupSign = signatureOf(s.rentalSignatures, id, 'PICKUP', 'RESPONSIBLE');
    const deliveryDriverSign = signatureOf(s.rentalSignatures, id, 'DELIVERY', 'DRIVER'), pickupDriverSign = signatureOf(s.rentalSignatures, id, 'PICKUP', 'DRIVER');
    return <div className="drawer-backdrop" onClick={e => { if (e.target === e.currentTarget)
        onClose(); }}><aside ref={drawerRef} tabIndex={-1} className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="rental-title"><header className="drawer-header"><div><span className="eyebrow">ORDEM DE SERVIÇO / {r.code}</span><h2 id="rental-title">{bin?.code} <span className="muted">/ {customerPlaceLabel(customer, site)}</span></h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar detalhe"><Icon name="close"/></button></header><div className="drawer-body stack"><div className="row wrap"><Badge status={r.status}/><span className="muted">{bin?.capacityM3 ?? '?'} m³</span><Link className="button secondary small" href={`/ordem/${r.id}`} target="_blank"><Icon name="printer" size={16}/>Imprimir ordem</Link></div>
 {next && canAct && <div className="operation-action"><div><strong>Próxima etapa</strong><small>Confirme apenas quando acontecer.</small></div><Button variant="primary" icon="arrow" onClick={() => openForm(transitionForm(s, run, r, next.action, { assignPickup }))}>{next.label}</Button></div>}
 {['DELIVERING', 'COLLECTING'].includes(r.status) && canAct && <Button small onClick={() => openForm(transitionForm(s, run, r, r.status === 'DELIVERING' ? 'abort_delivery' : 'abort_pickup'))} icon="alert">Serviço não realizado / registrar tentativa</Button>}
 <section><h3>Local e responsáveis</h3><p className="address-line">{r.address}<br />{r.neighborhood} · {r.city}</p><div className="detail-grid"><div><small>Contratante</small><strong>{customerPlaceLabel(customer, site)}</strong><span>{customer?.contact}</span></div><div><small>Responsável no local</small><strong>{r.siteContact}</strong><a href={`tel:+55${r.sitePhone}`}><Icon name="phone" size={14}/> {r.sitePhone}</a></div></div><a className="text-button" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.latitude !== null && r.longitude !== null ? `${r.latitude},${r.longitude}` : `${r.address}, ${r.neighborhood}, ${r.city}`)}`}><Icon name="external" size={14}/> Abrir local no Google Maps</a></section>
 <section><h3>Assinaturas digitais</h3><div className="detail-grid">{deliverySign && deliveryDriverSign ? <div><small>Entrega</small><strong>Assinado no sistema</strong><span>{deliverySign.signerName} · {deliveryDriverSign.signerName}</span><small>{dateTime(deliverySign.signedAt)}</small></div> : <div><small>Entrega</small><strong>Sem assinatura</strong><span>Registre na ordem impressa</span></div>}{pickupSign && pickupDriverSign ? <div><small>Retirada / troca</small><strong>Assinado no sistema</strong><span>{pickupSign.signerName} · {pickupDriverSign.signerName}</span><small>{dateTime(pickupSign.signedAt)}</small></div> : <div><small>Retirada / troca</small><strong>Sem assinatura</strong><span>Opcional, obrigatória na cooperativa</span></div>}</div><Link className="text-button" href={`/ordem/${r.id}`}><Icon name="printer" size={14}/> Abrir ordem para assinar</Link></section>
 <section><h3>Datas previstas e realizadas</h3><div className="detail-grid three"><div><small>Entrega prevista</small><strong>{dateTime(r.deliveryAt)}</strong><small>Real: {dateTime(r.deliveredAt)}</small></div><div><small>Retirada prevista</small><strong>{isOpenEndedPickup(r) && !r.pickedUpAt ? 'Sem data certa' : dateTime(r.pickupAt)}</strong><small>Coleta: {dateTime(r.pickedUpAt)}</small></div><div><small>Retorno ao pátio</small><strong>{dateTime(r.returnedAt)}</strong><small>{s.settings.yardAddress || 'Pátio não configurado'}</small></div></div></section>
 <section><h3>Equipe e programação</h3>{jobs.map(j => <div className="job-detail" key={j.id}><div><strong>{LABEL[j.kind]}</strong><small>{s.drivers.find(d => d.id === j.driverId)?.name ?? 'Motorista de outra etapa'} · {s.trucks.find(t => t.id === j.truckId)?.code ?? 'Outro caminhão'}</small><small>{dateTime(j.scheduledAt)} · janela de {j.durationMinutes} min</small></div><Badge status={j.status}/>{!driver && j.status === 'SCHEDULED' && <Button small icon="calendar" onClick={() => openForm(scheduleForm(s, run, j))}>Reagendar</Button>}</div>)}{isOpenEndedPickup(r) && !pickupJob && <small className="muted">Retirada sem data certa. A equipe da coleta é informada quando a retirada for iniciada.</small>}{driver && jobs.length < 2 && <small className="muted">Exibindo somente as etapas atribuídas a você.</small>}</section>
 {!driver && <section><div className="row split"><h3>Recebimentos</h3>{r.status !== 'CANCELLED' && (isMeasured(r) || paid < r.priceCents) && <Button small icon="plus" onClick={() => openForm(paymentForm(s, run, r))}>Registrar pagamento</Button>}</div><div className="finance-summary"><div><small>Contratado</small><strong>{contractedLabel(r)}</strong></div><div><small>Recebido</small><strong>{money(paid)}</strong></div><div><small>Saldo</small><strong>{balanceLabel(r, paid)}</strong></div></div>{s.payments.filter(p => p.rentalId === id).map(p => <div className={`payment-row ${p.voidedAt ? 'voided' : ''}`} key={p.id}><div><strong>{money(p.amountCents)} · {LABEL[p.method]}</strong><small>{dateTime(p.paidAt)} {p.voidedAt ? '· Estornado' : ''}</small></div>{!p.voidedAt && s.user.role === 'ADMIN' && <Button small onClick={() => openForm(voidForm(run, p))}>Estornar</Button>}</div>)}</section>}
 <section><h3>Instruções da locação</h3><p className="muted">Resíduo: {r.wasteType}</p><p className="pre-wrap">{r.notes || 'Nenhuma observação adicional.'}</p></section>
 <section><h3>Histórico da operação</h3><div className="timeline">{events.map(e => <div className="timeline-event" key={e.id}><i /><small>{dateTime(e.occurredAt)} · {e.actorName}</small><p>{e.description}</p>{e.latitude !== null && e.longitude !== null && <a className="text-button" href={`https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={13}/>Localização registrada nesta etapa</a>}</div>)}</div></section>
 {!driver && r.status === 'RESERVED' && <Button variant="danger" icon="close" onClick={() => openForm(transitionForm(s, run, r, 'cancel'))}>Cancelar locação</Button>}</div></aside></div>;
}
