'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from './provider';
import { Heading, Button, Notice, Badge } from './ui';
import { SignaturePad, type SignaturePadHandle } from './signature-pad';
import { dateTime, money, LABEL, diagnosedLabel, priceCaption, balanceLabel, pickupForecastLabel, customerPlaceLabel, isMeasured } from '../shared/format';
import { received, rentalMeasurementReasons } from '../shared/reports';
import { requiresPickupSignature } from '../shared/rental-groups';
import { signatureOf } from '../shared/signature';
import type { RentalSignature } from '../shared/types';
function SignatureBlock({ title, note, kind, responsibleLabel, driverLabel, defaultResponsible, defaultDriver, responsible, driver, canSave, canRedo, busy, notify, onSave }: {
    title: string;
    note?: string;
    kind: 'DELIVERY' | 'PICKUP';
    responsibleLabel: string;
    driverLabel: string;
    defaultResponsible: string;
    defaultDriver: string;
    responsible?: RentalSignature;
    driver?: RentalSignature;
    canSave: boolean;
    canRedo: boolean;
    busy: boolean;
    notify: (text: string) => void;
    onSave: (kind: 'DELIVERY' | 'PICKUP', responsibleName: string, responsibleImage: string, driverName: string, driverImage: string, replaceReason?: string) => Promise<void>;
}) {
    const responsibleRef = useRef<SignaturePadHandle>(null);
    const driverRef = useRef<SignaturePadHandle>(null);
    const [redo, setRedo] = useState(false);
    const [replaceReason, setReplaceReason] = useState('');
    const signed = Boolean(responsible && driver) && !redo;
    async function save() {
        const left = responsibleRef.current, right = driverRef.current;
        if (!left?.hasInk() || !right?.hasInk()) {
            notify('Desenhe as duas assinaturas antes de salvar.');
            return;
        }
        if (!left.name() || !right.name()) {
            notify('Informe o nome do responsável e do motorista.');
            return;
        }
        if (redo && replaceReason.trim().length < 5) {
            notify('Informe o motivo da substituição das assinaturas.');
            return;
        }
        try {
            await onSave(kind, left.name(), left.image(), right.name(), right.image(), redo ? replaceReason.trim() : undefined);
            setRedo(false);
            setReplaceReason('');
        }
        catch {
            /* O comando já avisou o motivo. */
        }
    }
    return <section className="print-section"><h2>{title}{signed && <span className="signature-saved-mark">Assinado no sistema</span>}</h2>
        {note && <p className="signature-note">{note}</p>}
        <div className="signature-lines">
            <SignaturePad ref={responsibleRef} label={responsibleLabel} defaultName={defaultResponsible} saved={signed ? responsible : undefined}/>
            <SignaturePad ref={driverRef} label={driverLabel} defaultName={defaultDriver} saved={signed ? driver : undefined}/>
        </div>
        {signed ? <p>Registrado em {dateTime(responsible?.signedAt)}</p> : <p className="print-only">Data: ____/____/________ &nbsp;&nbsp; Horário: ____:____</p>}
        {canSave && !signed && <div className="signature-actions no-print">{redo && <label className="signature-name full">Motivo da substituição<textarea value={replaceReason} onChange={e => setReplaceReason(e.target.value)} rows={2} required/></label>}<Button variant="primary" disabled={busy} onClick={() => void save()}>Salvar assinaturas</Button><small className="muted">{redo ? 'A versão anterior fica no histórico, com autor, data e motivo.' : 'As assinaturas ficam gravadas nesta locação e aparecem na impressão.'}</small></div>}
        {canRedo && signed && <div className="signature-actions no-print"><Button disabled={busy} onClick={() => setRedo(true)}>Substituir assinaturas</Button></div>}
    </section>;
}
export function PrintOrder({ id }: {
    id: string;
}) {
    const { data: s, run, notify, busy } = useData();
    const r = s.rentals.find(x => x.id === id);
    const customer = r ? s.customers.find(x => x.id === r.customerId) : undefined;
    const requiredPickup = requiresPickupSignature(customer);
    const [includePickup, setIncludePickup] = useState(requiredPickup);
    const [images, setImages] = useState<RentalSignature[]>([]);
    useEffect(() => {
        let cancelled = false;
        void fetch(`/api/rentals/${id}/signatures`, { credentials: 'same-origin', cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then((data: { signatures?: RentalSignature[] } | null) => {
            if (!cancelled && data?.signatures)
                setImages(data.signatures);
        })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [id, s.rentalSignatures]);
    if (!r)
        return <Notice tone="warning">Ordem não encontrada ou não atribuída ao seu perfil.</Notice>;
    const bin = s.containers.find(x => x.id === r.containerId), jobs = s.jobs.filter(j => j.rentalId === id), isDriver = s.user.role === 'DRIVER';
    const site = s.customerSites.find(item => item.id === r.siteId);
    const deliveryJob = jobs.find(j => j.kind === 'DELIVERY'), pickupJob = jobs.find(j => j.kind === 'PICKUP');
    const deliveryDriver = s.drivers.find(d => d.id === deliveryJob?.driverId)?.name ?? '';
    const pickupDriver = s.drivers.find(d => d.id === (pickupJob?.driverId ?? deliveryJob?.driverId))?.name ?? '';
    const withImage = (meta?: RentalSignature) => {
        if (!meta)
            return undefined;
        return images.find(item => item.id === meta.id) ?? images.find(item => item.kind === meta.kind && item.role === meta.role) ?? meta;
    };
    const deliveryResponsible = withImage(signatureOf(s.rentalSignatures, id, 'DELIVERY', 'RESPONSIBLE'));
    const deliveryDriverSign = withImage(signatureOf(s.rentalSignatures, id, 'DELIVERY', 'DRIVER'));
    const pickupResponsible = withImage(signatureOf(s.rentalSignatures, id, 'PICKUP', 'RESPONSIBLE'));
    const pickupDriverSign = withImage(signatureOf(s.rentalSignatures, id, 'PICKUP', 'DRIVER'));
    const showPickup = requiredPickup || includePickup || Boolean(pickupResponsible && pickupDriverSign);
    const canSave = r.status !== 'CANCELLED';
    const canRedo = canSave && !isDriver;
    const signedAny = Boolean(deliveryResponsible || pickupResponsible);
    async function persist(kind: 'DELIVERY' | 'PICKUP', responsibleName: string, responsibleImage: string, driverName: string, driverImage: string, replaceReason?: string) {
        try {
            await run('saveRentalSignatures', { rentalId: id, kind, responsibleName, responsibleImage, driverName, driverImage, ...(replaceReason ? { replaceReason } : {}) });
        }
        catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível salvar as assinaturas.');
            throw e;
        }
    }
    return <div className="screen print-screen"><div className="no-print"><Heading title="Ordem de serviço" description="Assine na tela, salve no sistema e imprima ou gere o PDF pelo navegador."><Link className="button secondary" href={isDriver ? '/minha-rota' : '/locacoes'}>Voltar</Link><Button icon="printer" variant="primary" onClick={() => window.print()}>Imprimir / salvar PDF</Button></Heading>
        {!requiredPickup && <label className="check-label print-pickup-toggle"><input type="checkbox" checked={includePickup} onChange={e => setIncludePickup(e.target.checked)}/>Incluir assinatura de retirada / troca (opcional)</label>}</div>
        <article className="print-sheet"><header className="print-header"><img src="/brand-lockup.png" alt="JR Caçambas"/><div><span className="eyebrow">ORDEM DE SERVIÇO</span><h1>{r.code}</h1><Badge status={r.status}/></div></header>
        {s.settings.demo && <p className="print-demo">DEMONSTRAÇÃO — DADOS FICTÍCIOS</p>}
        <p>{s.settings.companyName} {s.settings.companyPhone && `| ${s.settings.companyPhone}`}</p>
        <p className="muted">{s.settings.yardAddress || 'Endereço do pátio ainda não cadastrado'}</p>
        <section className="print-section"><h2>Contratante e local do serviço</h2><dl className="detail-grid"><div><dt>Cliente</dt><dd>{customerPlaceLabel(customer, site)}</dd></div><div><dt>Contato do contratante</dt><dd>{customer?.contact} · {customer?.phone}</dd></div><div className="full"><dt>Local de entrega e retirada</dt><dd>{r.address}<br />{[r.neighborhood, r.city, r.postalCode].filter(Boolean).join(' · ')}</dd></div><div><dt>Responsável no local</dt><dd>{r.siteContact} · {r.sitePhone}</dd></div><div><dt>Equipamento / resíduo informado</dt><dd>{bin?.code} · {bin?.capacityM3 ?? '?'} m³ · {r.wasteType}</dd></div></dl></section>
        <section className="print-section"><h2>Planejamento e execução</h2><table><thead><tr><th>Etapa</th><th>Previsão</th><th>Efetiva</th></tr></thead><tbody><tr><td>Entrega</td><td>{dateTime(r.deliveryAt)}</td><td>{dateTime(r.deliveredAt)}</td></tr><tr><td>Coleta</td><td>{pickupForecastLabel(r)}</td><td>{dateTime(r.pickedUpAt)}</td></tr><tr><td>Retorno ao pátio</td><td>Conferência operacional</td><td>{dateTime(r.returnedAt)}</td></tr></tbody></table>
            <table><thead><tr><th>Serviço</th><th>Motorista responsável</th><th>Caminhão / placa</th></tr></thead><tbody>{jobs.map(j => <tr key={j.id}><td>{LABEL[j.kind]}</td><td>{s.drivers.find(d => d.id === j.driverId)?.name || 'Outro responsável'}</td><td>{s.trucks.find(t => t.id === j.truckId)?.code || 'Outro veículo'} · {s.trucks.find(t => t.id === j.truckId)?.plate || '—'}</td></tr>)}</tbody></table></section>
        {!isDriver && <section className="print-section"><h2>Valores registrados</h2><dl className="detail-grid"><div><dt>{priceCaption(r, true)}</dt><dd>{diagnosedLabel(r, received(s, id))}</dd></div><div><dt>Recebido / saldo</dt><dd>{money(received(s, id))} / {balanceLabel(r, received(s, id))}</dd></div>{isMeasured(r) && <div className="full"><dt>Motivos do valor diagnosticado</dt><dd className="pre-wrap">{rentalMeasurementReasons(s, id) || 'Ainda não informado.'}</dd></div>}</dl></section>}
        {r.notes && <section className="print-section"><h2>Observações</h2><p className="pre-wrap">{r.notes}</p></section>}
        <SignatureBlock title="Conferência da entrega" kind="DELIVERY" responsibleLabel="Nome e assinatura do responsável" driverLabel="Nome e assinatura do motorista" defaultResponsible={r.siteContact} defaultDriver={deliveryDriver} responsible={deliveryResponsible} driver={deliveryDriverSign} canSave={canSave} canRedo={canRedo} busy={busy} notify={notify} onSave={persist}/>
        {showPickup && <SignatureBlock title="Conferência da retirada / troca" note={requiredPickup ? 'Obrigatório neste contratante: o motorista e o responsável pela troca ou retirada da caçamba assinam no local.' : 'Preencha se houver troca ou retirada neste atendimento.'} kind="PICKUP" responsibleLabel="Nome e assinatura do responsável pela troca ou retirada" driverLabel="Nome e assinatura do motorista da retirada" defaultResponsible={r.siteContact} defaultDriver={pickupDriver} responsible={pickupResponsible} driver={pickupDriverSign} canSave={canSave} canRedo={canRedo} busy={busy} notify={notify} onSave={persist}/>}
        <footer className="print-footer">Emitido em {dateTime(s.serverTime)} · Horários de São Paulo<br />Controle operacional. Não substitui nota fiscal, contrato ou comprovante de destinação. {signedAny ? 'Assinaturas digitais registradas no sistema.' : 'Assine na tela e clique em Salvar para gravar no sistema, ou imprima para preenchimento manual.'}</footer></article></div>;
}
