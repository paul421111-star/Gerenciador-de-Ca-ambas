'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useData } from './provider';
import { Heading, Card, Button, Badge, Notice, Empty } from './ui';
import { Icon } from './icons';
import { dateTime, pickupForecastLabel, PRECISION_LABEL } from '../shared/format';
import { REGION, fitBounds, resolveCoordinates, type GeoPoint } from '../shared/geo';
import type { Rental } from '../shared/types';
const TILE = 256;
function project(lat: number, lon: number, z: number) {
    const sin = Math.sin(Math.min(85.0511, Math.max(-85.0511, lat)) * Math.PI / 180), scale = TILE * 2 ** z;
    return { x: (lon + 180) / 360 * scale, y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}
function unproject(x: number, y: number, z: number) {
    const scale = TILE * 2 ** z;
    return { lon: x / scale * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI };
}
function pointOf(rental: Rental, extras: Record<string, GeoPoint>): GeoPoint | null {
    if (rental.latitude !== null && rental.longitude !== null)
        return { lat: rental.latitude, lon: rental.longitude };
    return extras[rental.id] ?? null;
}
export function MapView() {
    const { data: s, openDetail } = useData();
    const [showPlanned, setShowPlanned] = useState(true), [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState('');
    const [zoom, setZoom] = useState(REGION.zoom), [center, setCenter] = useState<GeoPoint>({ lat: REGION.lat, lon: REGION.lon }), [size, setSize] = useState({ w: 700, h: 530 }), [failed, setFailed] = useState(false);
    const [extras, setExtras] = useState<Record<string, GeoPoint>>({});
    const mapRef = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null), fitted = useRef(false);
    const list = useMemo(() => {
        const rows = s.rentals.filter(r => ['ACTIVE', 'COLLECTING'].includes(r.status) || (showPlanned && ['RESERVED', 'DELIVERING'].includes(r.status)));
        const term = query.trim().toLowerCase();
        if (!term)
            return rows;
        return rows.filter(r => [r.address, r.neighborhood, r.city, r.code, s.containers.find(c => c.id === r.containerId)?.code, s.customers.find(c => c.id === r.customerId)?.name].some(value => String(value ?? '').toLowerCase().includes(term)));
    }, [s, showPlanned, query]);
    const points = useMemo(() => list.map(r => ({ rental: r, point: pointOf(r, extras) })).filter((item): item is { rental: Rental; point: GeoPoint } => item.point !== null), [list, extras]);
    useEffect(() => {
        const el = mapRef.current;
        if (!el)
            return;
        const update = () => {
            const w = el.clientWidth, h = el.clientHeight;
            setSize(current => current.w === w && current.h === h ? current : { w, h });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        const el = mapRef.current;
        if (!el)
            return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            setZoom(currentZoom => {
                const nextZoom = Math.max(11, Math.min(18, currentZoom + (e.deltaY < 0 ? 1 : -1)));
                if (nextZoom === currentZoom)
                    return currentZoom;
                setCenter(currentCenter => {
                    const world = project(currentCenter.lat, currentCenter.lon, currentZoom);
                    const left = world.x - size.w / 2, top = world.y - size.h / 2;
                    const under = unproject(left + mx, top + my, currentZoom);
                    const next = project(under.lat, under.lon, nextZoom);
                    const recentered = unproject(next.x - mx + size.w / 2, next.y - my + size.h / 2, nextZoom);
                    return { lat: Math.max(-80, Math.min(80, recentered.lat)), lon: ((recentered.lon + 540) % 360) - 180 };
                });
                return nextZoom;
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [size.w, size.h]);
    useEffect(() => {
        if (!size.w)
            return;
        if (!points.length) {
            setCenter(current => current.lat === REGION.lat && current.lon === REGION.lon ? current : { lat: REGION.lat, lon: REGION.lon });
            setZoom(current => current === REGION.zoom ? current : REGION.zoom);
            return;
        }
        if (fitted.current)
            return;
        const bounds = fitBounds(points.map(item => item.point), size);
        setCenter(bounds.center);
        setZoom(bounds.zoom);
        fitted.current = true;
    }, [points, size]);
    useEffect(() => {
        const missing = list.filter(r => r.latitude === null && !extras[r.id]);
        if (!missing.length)
            return;
        let cancelled = false;
        void (async () => {
            const next: Record<string, GeoPoint> = {};
            for (const rental of missing.slice(0, 8)) {
                const point = await resolveCoordinates({ address: rental.address, neighborhood: rental.neighborhood, city: rental.city, postalCode: rental.postalCode });
                if (cancelled)
                    return;
                if (point)
                    next[rental.id] = point;
            }
            if (Object.keys(next).length)
                setExtras(current => ({ ...current, ...next }));
        })();
        return () => { cancelled = true; };
    }, [list, extras]);
    const c = project(center.lat, center.lon, zoom), left = c.x - size.w / 2, top = c.y - size.h / 2;
    const tiles = [];
    for (let x = Math.floor(left / TILE); x <= Math.floor((left + size.w) / TILE); x++)
        for (let y = Math.floor(top / TILE); y <= Math.floor((top + size.h) / TILE); y++) {
            const max = 2 ** zoom;
            if (y < 0 || y >= max)
                continue;
            tiles.push({ x, y, url: `https://tile.openstreetmap.org/${zoom}/${((x % max) + max) % max}/${y}.png` });
        }
    function focus(id: string) {
        const item = points.find(entry => entry.rental.id === id) ?? { rental: list.find(r => r.id === id), point: null };
        setSelected(id);
        if (item.point)
            setCenter(item.point);
    }
    function recenter() {
        const bounds = fitBounds(points.map(item => item.point), size);
        setCenter(bounds.center);
        setZoom(bounds.zoom);
    }
    return <div className="screen enter">
        <Heading title="Distribuição no mapa" description={`Região de operação: ${REGION.label}. Locais reais das caçambas no cliente, sem rastreamento contínuo de caminhões.`}/>
        <div className="map-toolbar row wrap">
            <Badge status="ON_SITE" label={`${list.filter(r => ['ACTIVE', 'COLLECTING'].includes(r.status)).length} no cliente`}/>
            <span className="muted">{points.length} no mapa · {list.length - points.length} sem coordenadas</span>
            <label className="check-label"><input type="checkbox" checked={showPlanned} onChange={e => setShowPlanned(e.target.checked)}/>Mostrar destinos previstos</label>
            <Button small onClick={recenter}>Recentrar na região</Button>
        </div>
        <Card className="map-shell">
            <div className="map-list">
                <div className="search-input"><Icon name="search" size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar caçamba, bairro ou cidade"/></div>
                {list.length ? list.map(r => <button className={`map-list-item ${selected === r.id ? 'selected' : ''}`} key={r.id} onClick={() => focus(r.id)}>
                    <div className="row split"><strong>{s.containers.find(c => c.id === r.containerId)?.code}</strong><Badge status={r.status}/></div>
                    <p>{r.address}</p>
                    <small>{r.neighborhood} · {r.city}</small>
                    <small>{s.customers.find(c => c.id === r.customerId)?.name}</small>
                    <small>{PRECISION_LABEL[r.locationPrecision ?? 'PENDING']}</small>
                </button>) : <Empty title="Nenhuma caçamba no cliente" description="Confirme entregas para visualizar os locais." icon="pin"/>}
            </div>
            <div ref={mapRef} className="map-container" role="region" aria-label="Mapa de Taboão da Serra e Embu das Artes: arraste, role o mouse para aproximar e use os botões" onPointerDown={e => { if ((e.target as HTMLElement).closest('button,a'))
                return; drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current)
                return; const d = drag.current, p = unproject(d.cx - (e.clientX - d.x), d.cy - (e.clientY - d.y), zoom); setCenter({ lat: Math.max(-80, Math.min(80, p.lat)), lon: ((p.lon + 540) % 360) - 180 }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <div className="tile-layer">{tiles.map(t => <img key={`${zoom}/${t.x}/${t.y}`} src={t.url} alt="" draggable={false} width={TILE} height={TILE} style={{ position: 'absolute', left: t.x * TILE - left, top: t.y * TILE - top }} onError={() => setFailed(true)}/>)}</div>
                {points.map(({ rental: r, point }) => {
                    const p = project(point.lat, point.lon, zoom), planned = ['RESERVED', 'DELIVERING'].includes(r.status), x = p.x - left, y = p.y - top;
                    if (x < -70 || x > size.w + 70 || y < -70 || y > size.h + 70)
                        return null;
                    return <button className={`map-pin ${selected === r.id ? 'selected' : ''} ${planned ? 'planned' : ''} ${r.locationPrecision === 'APPROXIMATE' ? 'approximate' : ''}`} style={{ left: x, top: y }} key={r.id} onClick={() => focus(r.id)} aria-label={`${s.containers.find(c => c.id === r.containerId)?.code}: ${planned ? 'destino previsto' : 'no cliente'} · ${PRECISION_LABEL[r.locationPrecision ?? 'PENDING']}`}><Icon name="bin" size={15}/>{s.containers.find(c => c.id === r.containerId)?.code}</button>;
                })}
                <div className="map-region-chip">{REGION.label}</div>
                <div className="map-controls">
                    <Button small onClick={() => setZoom(Math.min(18, zoom + 1))} aria-label="Aproximar mapa">+</Button>
                    <Button small onClick={() => setZoom(Math.max(11, zoom - 1))} aria-label="Afastar mapa">−</Button>
                    <Button small onClick={recenter} aria-label="Recentrar na região de operação">⌂</Button>
                </div>
                {!points.length && <div className="map-empty-label">Nenhum local com coordenadas nesta seleção.</div>}
                {failed && <div className="map-offline">Mapa externo indisponível. Os endereços continuam acessíveis na lista.</div>}
                <div className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · {REGION.label}</div>
            </div>
        </Card>
        {selected && (() => {
            const r = list.find(item => item.id === selected);
            const point = r ? pointOf(r, extras) : null;
            return r ? <Card><div className="selected-location"><div><h3>{s.containers.find(c => c.id === r.containerId)?.code} / {s.customers.find(c => c.id === r.customerId)?.name}</h3><p>{r.address}, {r.neighborhood}, {r.city}</p><small>{PRECISION_LABEL[r.locationPrecision ?? 'PENDING']}{r.locationPrecision === 'APPROXIMATE' ? ' — não use este ponto como endereço exato.' : ''}</small><small>Retirada prevista: {pickupForecastLabel(r)} · {r.siteContact} / {r.sitePhone}</small></div><div className="row wrap"><Button variant="primary" onClick={() => openDetail(r.id)}>Ver locação</Button><a className="button secondary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.locationPrecision === 'CONFIRMED' && point ? `${point.lat},${point.lon}` : `${r.address}, ${r.city}`)}`}><Icon name="external" size={16}/>Abrir no Maps</a></div></div></Card> : null;
        })()}
        <Notice>O mapa abre em Taboão da Serra e Embu das Artes. Posição confirmada, aproximada e pendente aparecem com texto. O centro da cidade não é gravado como endereço exato. Destinos previstos não representam a posição atual da caçamba.</Notice>
    </div>;
}
