'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { dateTime } from '../shared/format';
import type { RentalSignature } from '../shared/types';
export interface SignaturePadHandle {
    name: () => string;
    image: () => string;
    hasInk: () => boolean;
}
export const SignaturePad = forwardRef<SignaturePadHandle, {
    label: string;
    defaultName?: string;
    saved?: RentalSignature;
}>(function SignaturePad({ label, defaultName = '', saved }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [name, setName] = useState(defaultName);
    const [ink, setInk] = useState(false);
    useEffect(() => { setName(defaultName); }, [defaultName]);
    useEffect(() => {
        const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
        if (!canvas || !ctx)
            return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = 320 * ratio;
        canvas.height = 96 * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.strokeStyle = '#1c2618';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, [saved]);
    function point(e: React.PointerEvent<HTMLCanvasElement>) {
        const box = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - box.left) * (320 / box.width), y: (e.clientY - box.top) * (96 / box.height) };
    }
    function start(e: React.PointerEvent<HTMLCanvasElement>) {
        if (saved)
            return;
        const ctx = e.currentTarget.getContext('2d');
        if (!ctx)
            return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const p = point(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    }
    function move(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!drawing.current)
            return;
        const ctx = e.currentTarget.getContext('2d');
        if (!ctx)
            return;
        const p = point(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setInk(true);
    }
    function end() { drawing.current = false; }
    function clear() {
        const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
        if (!canvas || !ctx)
            return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ratio = window.devicePixelRatio || 1;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        setInk(false);
    }
    useImperativeHandle(ref, () => ({
        name: () => name.trim(),
        image: () => canvasRef.current?.toDataURL('image/png') ?? '',
        hasInk: () => {
            if (ink)
                return true;
            const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
            if (!canvas || !ctx)
                return false;
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 10)
                    return true;
            }
            return false;
        }
    }));
    if (saved)
        return <div className="signature-slot">{saved.image ? <img className="signature-image" src={saved.image} alt={`Assinatura de ${saved.signerName}`}/> : <div className="signature-image" aria-hidden="true"/>}<strong>{saved.signerName}</strong><small>Assinado em {dateTime(saved.signedAt)}</small><span>{label}</span></div>;
    return <div className="signature-slot"><label className="signature-name"><span>Nome</span><input value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name"/></label>
        <canvas ref={canvasRef} className="signature-canvas" width={320} height={96} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}/>
        <div className="row split"><span>{label}</span><button type="button" className="text-button no-print" onClick={clear} disabled={!ink}>Limpar</button></div></div>;
});
