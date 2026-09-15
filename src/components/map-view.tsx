'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useData } from './provider';
import { Heading, Card, Button, Badge, Notice, Empty } from './ui';
import { Icon } from './icons';
import { dateTime } from '../shared/format';
const TILE = 256;
function project(lat: number, lon: number, z: number) { const sin = Math.sin(Math.min(85.0511, Math.max(-85.0511, lat)) * Math.PI / 180), scale = TILE * 2 ** z; return { x: (lon + 180) / 360 * scale, y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale }; }
function unproject(x: number, y: number, z: number) { const scale = TILE * 2 ** z; return { lon: x / scale * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI }; }
export function MapView() {
    const { data: s, openDetail } = useData();
    const [showPlanned, setShowPlanned] = useState(false), [selected, setSelected] = useState<string | null>(null), [zoom, setZoom] = useState(12), [center, setCenter] = useState({ lat: -23.55, lon: -46.63 }), [size, setSize] = useState({ w: 700, h: 530 }), [failed, setFailed] = useState(false);
    const mapRef = useRef<HTMLDivElement>(null), drag = useRef<{
        x: number;
        y: number;
        cx: number;
        cy: number;
    } | null>(null), initialized = useRef(false);
    const list = useMemo(() => s.rentals.filter(r => ['ACTIVE', 'COLLECTING'].includes(r.status) || (showPlanned && ['RESERVED', 'DELIVERING'].includes(r.status))), [s.rentals, showPlanned]);
    const points = list.filter(r => r.latitude !== null && r.longitude !== null);
    useEffect(() => { const el = mapRef.current; if (!el)
        return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
    useEffect(() => { if (!initialized.current && points.length) {
        setCenter({ lat: points[0].latitude!, lon: points[0].longitude! });
        initialized.current = true;
    } }, [points]);
    const c = project(center.lat, center.lon, zoom), left = c.x - size.w / 2, top = c.y - size.h / 2;
    const tiles = [];
    for (let x = Math.floor(left / TILE); x <= Math.floor((left + size.w) / TILE); x++)
        for (let y = Math.floor(top / TILE); y <= Math.floor((top + size.h) / TILE); y++) {
            const max = 2 ** zoom;
            if (y < 0 || y >= max)
                continue;
            tiles.push({ x, y, url: `https://tile.openstreetmap.org/${zoom}/${((x % max) + max) % max}/${y}.png` });
        }
    function focus(id: string) { const r = list.find(r => r.id === id); setSelected(id); if (r?.latitude !== null && r?.latitude !== undefined && r.longitude !== null)
        setCenter({ lat: r.latitude, lon: r.longitude }); }
    return <div className="screen enter"><Heading title="Distribuição no mapa" description="Locais cadastrados das caçambas no cliente. Sem rastreamento contínuo de caminhões."/><div className="map-toolbar row wrap"><Badge status="ON_SITE" label={`${list.filter(r => ['ACTIVE', 'COLLECTING'].includes(r.status)).length} no cliente`}/><span className="muted">{points.length} com coordenadas · {list.length - points.length} sem coordenadas</span><label className="check-label"><input type="checkbox" checked={showPlanned} onChange={e => setShowPlanned(e.target.checked)}/>Mostrar destinos previstos</label></div>
 <Card className="map-shell"><div className="map-list">{list.length ? list.map(r => <button className={`map-list-item ${selected === r.id ? 'selected' : ''}`} key={r.id} onClick={() => focus(r.id)}><div className="row split"><strong>{s.containers.find(c => c.id === r.containerId)?.code}</strong><Badge status={r.status}/></div><p>{r.address}</p><small>{r.neighborhood} · {r.city}</small><small>{r.latitude === null ? 'Sem coordenadas cadastradas' : s.customers.find(c => c.id === r.customerId)?.name}</small></button>) : <Empty title="Nenhuma caçamba no cliente" description="Confirme entregas para visualizar os locais." icon="pin"/>}</div>
 <div ref={mapRef} className="map-container" role="region" aria-label="Mapa interativo: arraste para mover e utilize os botões para aproximar" onPointerDown={e => { if ((e.target as HTMLElement).closest('button,a'))
        return; drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current)
        return; const d = drag.current, p = unproject(d.cx - (e.clientX - d.x), d.cy - (e.clientY - d.y), zoom); setCenter({ lat: Math.max(-80, Math.min(80, p.lat)), lon: ((p.lon + 540) % 360) - 180 }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
 <div className="tile-layer">{tiles.map(t => <img key={`${zoom}/${t.x}/${t.y}`} src={t.url} alt="" draggable={false} width={TILE} height={TILE} style={{ position: 'absolute', left: t.x * TILE - left, top: t.y * TILE - top }} onError={() => setFailed(true)}/>)}</div>
 {points.map(r => { const p = project(r.latitude!, r.longitude!, zoom), planned = ['RESERVED', 'DELIVERING'].includes(r.status), x = p.x - left, y = p.y - top; if (x < -70 || x > size.w + 70 || y < -70 || y > size.h + 70)
        return null; return <button className={`map-pin ${selected === r.id ? 'selected' : ''} ${planned ? 'planned' : ''}`} style={{ left: x, top: y }} key={r.id} onClick={() => focus(r.id)} aria-label={`${s.containers.find(c => c.id === r.containerId)?.code}: ${planned ? 'destino previsto' : 'no cliente'}`}><Icon name="bin" size={15}/>{s.containers.find(c => c.id === r.containerId)?.code}</button>; })}
 <div className="map-controls"><Button small onClick={() => setZoom(Math.min(18, zoom + 1))} aria-label="Aproximar mapa">+</Button><Button small onClick={() => setZoom(Math.max(3, zoom - 1))} aria-label="Afastar mapa">−</Button></div>
 {!points.length && <div className="map-empty-label">Nenhum local com coordenadas nesta seleção.</div>}{failed && <div className="map-offline">Mapa externo indisponível. Os endereços continuam acessíveis na lista.</div>}
 <div className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · locais cadastrados</div>
 </div></Card>
 {selected && (() => { const r = list.find(r => r.id === selected); return r ? <Card><div className="selected-location"><div><h3>{s.containers.find(c => c.id === r.containerId)?.code} / {s.customers.find(c => c.id === r.customerId)?.name}</h3><p>{r.address}, {r.neighborhood}, {r.city}</p><small>Retirada prevista: {dateTime(r.pickupAt)} · {r.siteContact} / {r.sitePhone}</small></div><div className="row wrap"><Button variant="primary" onClick={() => openDetail(r.id)}>Ver locação</Button><a className="button secondary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.latitude !== null && r.longitude !== null ? `${r.latitude},${r.longitude}` : `${r.address}, ${r.city}`)}`}><Icon name="external" size={16}/>Abrir no Maps</a></div></div></Card> : null; })()}
 <Notice>Informe latitude e longitude ao cadastrar a locação para exibir um marcador. Endereços sem coordenadas permanecem na lista. Destinos previstos não representam a posição atual da caçamba. O mapa externo exige internet.</Notice></div>;
}
