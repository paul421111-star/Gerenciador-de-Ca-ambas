'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useData } from './provider';
import { Badge, Button, Card, Empty, Heading, Notice } from './ui';
import { dateOnly, dateTime } from '../shared/format';
import type { BookingRequest, BookingRequestStatus } from '../shared/types';

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
    NEW: 'Nova',
    CONTACTED: 'Em contato',
    CONFIRMED: 'Confirmada',
    DECLINED: 'Não atendida'
};
const SERVICE_LABEL = { RENTAL: 'Nova locação', EXCHANGE: 'Troca de caçamba', PICKUP: 'Retirada' } as const;
const PERIOD_LABEL = { MORNING: 'Manhã', AFTERNOON: 'Tarde', ANY: 'Qualquer período' } as const;

function whatsapp(request: BookingRequest): string {
    const phone = request.phone.startsWith('55') ? request.phone : `55${request.phone}`;
    const text = encodeURIComponent(`Olá, ${request.customerName}! Somos da JR Caçambas. Recebemos sua solicitação ${request.protocol} para ${SERVICE_LABEL[request.serviceType].toLowerCase()} em ${request.preferredDate}. Podemos confirmar alguns detalhes?`);
    return `https://wa.me/${phone}?text=${text}`;
}

export function BookingRequests() {
    const { data: snapshot, run, openForm } = useData();
    const [status, setStatus] = useState<BookingRequestStatus | 'ALL'>('NEW');
    const list = snapshot.bookingRequests.filter(request => status === 'ALL' || request.status === status);

    async function markContacted(request: BookingRequest) {
        await run('updateBookingRequest', { id: request.id, status: 'CONTACTED', statusNote: 'Contato iniciado pela equipe.' });
    }

    function statusForm(request: BookingRequest, next: 'CONFIRMED' | 'DECLINED') {
        const confirmed = next === 'CONFIRMED';
        openForm({
            title: confirmed ? `Confirmar solicitação ${request.protocol}` : `Não atender ${request.protocol}`,
            description: confirmed
                ? 'Registre o combinado com o cliente. Esta ação não cria a locação nem reserva uma caçamba automaticamente.'
                : 'Explique por que a solicitação não será atendida. O registro continuará no histórico.',
            fields: [{
                name: 'statusNote',
                label: confirmed ? 'Resumo do combinado' : 'Motivo',
                type: 'textarea',
                required: true,
                full: true
            }],
            submit: payload => run('updateBookingRequest', { ...payload, id: request.id, status: next }),
            submitLabel: confirmed ? 'Marcar como confirmada' : 'Registrar como não atendida'
        });
    }

    return <div className="screen enter">
        <Heading title="Solicitações de clientes" description="Pedidos enviados pela página pública. Confira disponibilidade, combine os detalhes e só então crie a locação operacional.">
            <Link className="button secondary" href="/agendar" target="_blank">Abrir página pública</Link>
        </Heading>
        <div className="booking-summary">
            {(['NEW', 'CONTACTED', 'CONFIRMED', 'DECLINED'] as BookingRequestStatus[]).map(item =>
                <button key={item} className={status === item ? 'selected' : ''} onClick={() => setStatus(item)}>
                    <strong>{snapshot.bookingRequests.filter(request => request.status === item).length}</strong>
                    <span>{STATUS_LABEL[item]}</span>
                </button>)}
            <button className={status === 'ALL' ? 'selected' : ''} onClick={() => setStatus('ALL')}><strong>{snapshot.bookingRequests.length}</strong><span>Todas</span></button>
        </div>
        <Notice><strong>Importante:</strong> solicitação não é reserva. Confirme caçamba, caminhão, motorista, valor e horário antes de criar uma locação.</Notice>
        {list.length ? <div className="booking-request-list">{list.map(request =>
            <Card key={request.id} className="booking-request-card">
                <div className="booking-request-top">
                    <div><span className="eyebrow">{request.protocol}</span><h2>{request.customerName}</h2><p>{SERVICE_LABEL[request.serviceType]} · {request.wasteType}</p></div>
                    <div className="booking-request-state"><Badge status={request.status} label={STATUS_LABEL[request.status]}/><small>{dateTime(request.createdAt)}</small></div>
                </div>
                <div className="booking-request-grid">
                    <div><small>Contato</small><strong>{request.phone}</strong><span>{request.email || 'Sem e-mail'}</span></div>
                    <div><small>Preferência</small><strong>{dateOnly(request.preferredDate + 'T12:00:00Z')}</strong><span>{PERIOD_LABEL[request.preferredPeriod]}</span></div>
                    <div className="wide"><small>Local do serviço</small><strong>{request.address}</strong><span>{request.neighborhood} · {request.city}{request.postalCode ? ` · CEP ${request.postalCode}` : ''}</span></div>
                    {request.notes && <div className="wide"><small>Observações do cliente</small><p className="pre-wrap">{request.notes}</p></div>}
                    {request.statusNote && <div className="wide booking-status-note"><small>Registro da equipe</small><p className="pre-wrap">{request.statusNote}</p></div>}
                </div>
                <div className="booking-request-actions">
                    <a className="button secondary small" href={whatsapp(request)} target="_blank" rel="noreferrer">Conversar no WhatsApp</a>
                    {request.status === 'NEW' && <Button small variant="primary" onClick={() => void markContacted(request)}>Marcar contato iniciado</Button>}
                    {['NEW', 'CONTACTED'].includes(request.status) && <Button small onClick={() => statusForm(request, 'CONFIRMED')}>Confirmar solicitação</Button>}
                    {['NEW', 'CONTACTED'].includes(request.status) && <Button small variant="danger" onClick={() => statusForm(request, 'DECLINED')}>Não atender</Button>}
                </div>
            </Card>)}</div> : <Card><Empty title={`Nenhuma solicitação: ${status === 'ALL' ? 'todas' : STATUS_LABEL[status].toLowerCase()}`} description="Novos pedidos enviados pela página pública aparecerão aqui." icon="calendar"/></Card>}
    </div>;
}
