'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from './provider';
import { Badge, Button, Card, Empty, Heading, Notice, Pagination, Search, Stat } from './ui';
import { Icon } from './icons';
import { rentalForm, containerForm, inventoryForm, maintenanceForm, scheduleForm } from './forms';
import { dateTime, dateKey, fromLocalInput, time, isOpen, isOpenEndedPickup, LABEL, customerPlaceLabel } from '../shared/format';
import { downloadCsv, rentalRows } from '../shared/reports';
import type { Run } from './provider';
import type { Rental, Snapshot } from '../shared/types';
function pickupOverdue(r: Rental): boolean {
    return ['ACTIVE', 'COLLECTING'].includes(r.status) && !isOpenEndedPickup(r) && Date.parse(r.pickupAt) < Date.now();
}
function PickupCell({ s, rental: r, run, notify }: {
    s: Snapshot;
    rental: Rental;
    run: Run;
    notify: (text: string) => void;
}) {
    const collected = Boolean(r.pickedUpAt);
    const pickup = s.jobs.find(j => j.rentalId === r.id && j.kind === 'PICKUP'), delivery = s.jobs.find(j => j.rentalId === r.id && j.kind === 'DELIVERY');
    const assigned = pickup?.driverId ?? delivery?.driverId;
    const allowed = s.user.role !== 'DRIVER' || Boolean(assigned && assigned === s.user.driverId);
    const canConfirm = collected === false && allowed && ['ACTIVE', 'COLLECTING'].includes(r.status);
    async function mark(on: boolean) {
        if (!on || !canConfirm)
            return;
        try {
            await run('confirmPickup', { id: r.id, version: r.version });
        }
        catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível registrar a retirada.');
        }
    }
    return <div className="pickup-cell"><label className="check-label pickup-check"><input type="checkbox" checked={collected} disabled={!canConfirm} onChange={e => void mark(e.target.checked)}/>Ret.</label>
        {collected ? <>{dateTime(r.pickedUpAt)}<small>Horário da retirada</small></> : canConfirm ? <small className="muted">Marque ao retirar</small> : <small className="muted">{['RESERVED', 'DELIVERING'].includes(r.status) ? 'Aguardando entrega' : pickupOverdue(r) ? <span className="text-danger">Prazo vencido</span> : '—'}</small>}</div>;
}
export function Rentals() {
    const { data: s, openForm, run, openDetail, notify } = useData();
    const params = useSearchParams();
    const [query, setQuery] = useState(params.get('busca') ?? ''), [status, setStatus] = useState('OPEN'), [page, setPage] = useState(1);
    const q = query.toLocaleLowerCase('pt-BR'), list = s.rentals.filter(r => { const bin = s.containers.find(c => c.id === r.containerId), customer = s.customers.find(c => c.id === r.customerId), site = s.customerSites.find(item => item.id === r.siteId); return (status === 'ALL' || (status === 'OPEN' ? isOpen(r.status) : status === 'OVERDUE' ? pickupOverdue(r) : r.status === status)) && `${r.code} ${bin?.code} ${customer?.name} ${site?.name} ${r.address} ${r.neighborhood} ${r.city} ${r.siteContact}`.toLocaleLowerCase('pt-BR').includes(q); });
    const currentPage = Math.min(page, Math.max(1, Math.ceil(list.length / 15)));
    return <div className="screen enter"><Heading title="Locações" description="Da reserva à conferência do retorno: acompanhe o ciclo completo de cada caçamba."><Button icon="download" onClick={() => downloadCsv('locacoes-jr.csv', rentalRows(s, list))}>Exportar</Button><Button variant="primary" icon="plus" onClick={() => openForm(rentalForm(s, run))}>Nova locação</Button></Heading>
 <Card><div className="toolbar"><Search value={query} onChange={v => { setQuery(v); setPage(1); }} placeholder="Buscar caçamba, cliente ou endereço..."/><select aria-label="Situação da locação" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="OPEN">Em aberto</option><option value="ALL">Todas as locações</option><option value="OVERDUE">Retirada atrasada</option>{['RESERVED', 'DELIVERING', 'ACTIVE', 'COLLECTING', 'RETURNING', 'COMPLETED', 'CANCELLED'].map(v => <option key={v} value={v}>{LABEL[v]}</option>)}</select><span className="muted">{list.length} registro(s)</span></div>
 {list.length ? <><div className="table-scroll"><table><thead><tr><th>Locação / caçamba</th><th>Cliente / local</th><th>Entrega prevista</th><th>Retirada</th><th>Situação</th><th /></tr></thead><tbody>{list.slice((currentPage - 1) * 15, currentPage * 15).map(r => <tr key={r.id}><td><button className="text-button strong" onClick={() => openDetail(r.id)}>{r.code}</button><small>{s.containers.find(c => c.id === r.containerId)?.code}</small></td><td><strong>{customerPlaceLabel(s.customers.find(c => c.id === r.customerId), s.customerSites.find(item => item.id === r.siteId))}</strong><small className="truncate" title={`${r.address}, ${r.city}`}>{r.address} · {r.neighborhood}</small></td><td>{dateTime(r.deliveryAt)}<small>{r.deliveredAt ? 'Entregue: ' + dateTime(r.deliveredAt) : 'Aguardando confirmação'}</small></td><td><PickupCell s={s} rental={r} run={run} notify={notify}/></td><td><Badge status={r.status}/>{s.rentalSignatures.some(item => item.rentalId === r.id && item.kind === 'DELIVERY') && <small>Entrega assinada</small>}{s.rentalSignatures.some(item => item.rentalId === r.id && item.kind === 'PICKUP') && <small>Retirada assinada</small>}</td><td><Button small icon="eye" onClick={() => openDetail(r.id)}>Detalhes</Button></td></tr>)}</tbody></table></div><Pagination page={currentPage} count={list.length} onPage={setPage}/></> : <Empty title="Nenhuma locação nesta seleção" description="Confira os filtros ou cadastre uma nova locação."/>}</Card>
 {s.user.role === 'ADMIN' && s.containers.some(c => c.status === 'INVENTORY') && <Notice><strong>Começando com caçambas já locadas?</strong> Use a abertura de operação para registrar a entrega anterior e programar a retirada. <Button small onClick={() => openForm(rentalForm(s, run, true))}>Registrar locação existente</Button></Notice>}</div>;
}
export function Containers() {
    const { data: s, openForm, run, openDetail } = useData();
    const [query, setQuery] = useState(''), [status, setStatus] = useState('ALL');
    const list = s.containers.filter(c => (status === 'ALL' || c.status === status) && `${c.code} ${c.notes}`.toLowerCase().includes(query.toLowerCase()));
    return <div className="screen enter"><Heading title="Controle de caçambas" description="Identifique, localize e acompanhe cada unidade do seu patrimônio."><Button icon="plus" onClick={() => openForm(containerForm(run))}>Adicionar</Button><Button variant="primary" icon="check" onClick={() => openForm(inventoryForm(s, run))}>Conferir pátio</Button></Heading>
 <div className="stats-grid"><Stat label="Patrimônio cadastrado" value={s.containers.length} caption="Unidades identificadas individualmente" icon="bin"/><Stat label="Disponíveis" value={s.containers.filter(c => c.status === 'AVAILABLE').length} caption="Vazias e conferidas no pátio" icon="check" tone="green"/><Stat label="No cliente" value={s.containers.filter(c => c.status === 'ON_SITE').length} caption="Local vinculado à locação" icon="pin" tone="blue"/><Stat label="A conferir" value={s.containers.filter(c => c.status === 'INVENTORY').length} caption="Local físico ainda não declarado" icon="alert" tone="red"/></div>
 <Card><div className="toolbar"><Search value={query} onChange={setQuery} placeholder="Buscar pelo código da caçamba..."/><select aria-label="Situação da caçamba" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">Todas as situações</option>{['INVENTORY', 'AVAILABLE', 'RESERVED', 'IN_TRANSIT', 'ON_SITE', 'RETURNING', 'MAINTENANCE', 'RETIRED'].map(v => <option value={v} key={v}>{LABEL[v]}</option>)}</select><span className="muted">{list.length} unidade(s)</span></div>{list.length ? <div className="inventory-grid">{list.map(c => { const r = s.rentals.find(r => r.containerId === c.id && isOpen(r.status)); return <article className={`bin-tile state-${c.status}`} key={c.id}><div className="row split"><span className="icon-tile neutral"><Icon name="bin" size={27}/></span><button className="icon-button" aria-label={`Editar ${c.code}`} onClick={() => openForm(containerForm(run, c))}><Icon name="edit" size={15}/></button></div><h3>{c.code}</h3><small>{c.capacityM3 ? `${c.capacityM3} m³` : 'Capacidade a informar'}</small><Badge status={c.status}/><div className="bin-location"><Icon name="pin" size={14}/><span>{c.status === 'ON_SITE' ? r?.neighborhood ?? 'Cliente' : c.status === 'RESERVED' ? 'Pátio / reservada' : c.status === 'AVAILABLE' ? s.settings.yardAddress || 'Pátio' : c.status === 'IN_TRANSIT' ? 'A caminho do cliente' : c.status === 'RETURNING' ? 'Retorno em andamento' : c.status === 'MAINTENANCE' ? 'Bloqueada para reparo' : 'Local a confirmar'}</span></div>{r ? <Button small onClick={() => openDetail(r.id)}>Ver locação <Icon name="arrow" size={14}/></Button> : c.status === 'AVAILABLE' ? <div className="row"><Button small onClick={() => openForm(rentalForm(s, run, false, c.id))}>Locar</Button><button className="icon-button" title="Abrir manutenção" aria-label={`Manutenção de ${c.code}`} onClick={() => openForm(maintenanceForm(s, run, undefined, `container:${c.id}`))}><Icon name="tool" size={16}/></button></div> : c.status === 'INVENTORY' ? <Button small onClick={() => openForm(inventoryForm(s, run, c.id))}>Conferir unidade</Button> : null}</article>; })}</div> : <Empty />}</Card>
 <Notice>O código deve corresponder à identificação pintada ou afixada na caçamba. Reserva e coleta não significam disponibilidade: a liberação depende da conferência física.</Notice></div>;
}
export function Agenda({ mine = false }: {
    mine?: boolean;
}) {
    const { data: s, run, openForm, openDetail } = useData();
    const [date, setDate] = useState(dateKey()), [mode, setMode] = useState('day'), [driver, setDriver] = useState('ALL'), [truck, setTruck] = useState('ALL');
    const list = s.jobs.filter(j => (mode === 'pending' ? !['DONE', 'CANCELLED'].includes(j.status) : dateKey(j.scheduledAt) === date) && (driver === 'ALL' || j.driverId === driver) && (truck === 'ALL' || j.truckId === truck));
    function shift(n: number) { const d = new Date(fromLocalInput(date + 'T12:00')); d.setUTCDate(d.getUTCDate() + n); setDate(dateKey(d)); setMode('day'); }
    return <div className="screen enter"><Heading title={mine ? 'Meus serviços' : 'Agenda de serviços'} description={mine ? 'Confira o endereço e registre cada saída, entrega, coleta e retorno no momento real.' : 'Distribua as operações entre os caminhões sem sobrepor motorista ou veículo.'}>{!mine && <Button variant="primary" icon="plus" onClick={() => openForm(rentalForm(s, run))}>Agendar locação</Button>}</Heading>
 <Card><div className="toolbar agenda-controls"><Button small onClick={() => shift(-1)} aria-label="Dia anterior">‹</Button><input aria-label="Data da agenda" type="date" value={date} onChange={e => { if (e.target.value) {
        setDate(e.target.value);
        setMode('day');
    } }}/><Button small onClick={() => shift(1)} aria-label="Próximo dia">›</Button><Button small onClick={() => { setDate(dateKey()); setMode('day'); }}>Hoje</Button><Button small variant={mode === 'pending' ? 'primary' : 'secondary'} onClick={() => setMode(mode === 'pending' ? 'day' : 'pending')}>Todos os pendentes</Button>{!mine && <select aria-label="Filtrar motorista" value={driver} onChange={e => setDriver(e.target.value)}><option value="ALL">Todos os motoristas</option>{s.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}<select aria-label="Filtrar caminhão" value={truck} onChange={e => setTruck(e.target.value)}><option value="ALL">Todos os caminhões</option>{s.trucks.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}</select></div>
 {list.length ? <div className="agenda-list">{list.map(j => { const r = s.rentals.find(r => r.id === j.rentalId)!; const overdue = j.status === 'SCHEDULED' && Date.parse(j.scheduledAt) < Date.now(); return <article className={`agenda-entry ${overdue ? 'late' : ''}`} key={j.id}><div className="agenda-hour"><strong>{time(j.scheduledAt)}</strong><small>{dateKey(j.scheduledAt).split('-').reverse().join('/')}</small><small>{j.durationMinutes} min</small></div><div className="agenda-job"><div className="row wrap"><Badge status={j.kind}/><Badge status={j.status}/>{overdue && <span className="text-danger">Previsão vencida</span>}</div><h3>{s.containers.find(c => c.id === r.containerId)?.code} / {s.customers.find(c => c.id === r.customerId)?.name}</h3><p><Icon name="pin" size={14}/> {r.address}, {r.neighborhood} · {r.city}</p><small><Icon name="driver" size={14}/> {s.drivers.find(d => d.id === j.driverId)?.name} · {s.trucks.find(t => t.id === j.truckId)?.code} · {s.trucks.find(t => t.id === j.truckId)?.plate ?? 'Sem placa'}</small><small>Contato no local: {r.siteContact} · <a href={`tel:+55${r.sitePhone}`}>{r.sitePhone}</a></small></div><div className="agenda-actions"><Button small variant="primary" onClick={() => openDetail(r.id)}>Abrir serviço</Button>{!mine && j.status === 'SCHEDULED' && <Button small icon="calendar" onClick={() => openForm(scheduleForm(s, run, j))}>Reagendar</Button>}</div></article>; })}</div> : <Empty title="Nenhum serviço nesta seleção" description="Altere a data ou consulte todos os serviços pendentes." icon="calendar"/>}</Card><Notice>Os horários são apresentados no fuso de São Paulo. A confirmação operacional usa o horário do servidor, separado da previsão agendada.</Notice></div>;
}
