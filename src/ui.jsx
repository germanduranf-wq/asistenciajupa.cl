import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Minus, Plus, Move, Check, LoaderCircle } from 'lucide-react';
import { fullName } from './domain.mjs';
import { photoUrl } from './api.mjs';
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false
}) {
  const ref = useRef();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    el.showModal();
    const cancel = e => {
      e.preventDefault();
      close.current();
    };
    el.addEventListener('cancel', cancel);
    return () => {
      el.removeEventListener('cancel', cancel);
      el.close();
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title"><div className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={22} /></button></div>{children}</dialog>;
}
export function Avatar({
  person,
  large = false
}) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (person?.photo_path) photoUrl(person.photo_path).then(u => {
      if (live) setUrl(u);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [person?.photo_path]);
  return <span className={`avatar ${large ? 'large' : ''} tone-${(person?.first_name?.charCodeAt(0) || 0) % 5}`}>{url ? <img src={url} alt={fullName(person)} loading="lazy" onError={() => setUrl(null)} /> : <span aria-hidden="true">{person?.first_name?.[0]}{person?.last_name?.[0]}</span>}</span>;
}
export function Empty({
  icon: Icon,
  title,
  text,
  action
}) {
  return <div className="empty"><div className="empty-icon">{Icon && <Icon size={28} />}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function Field({
  label,
  children,
  hint
}) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Button({
  busy,
  children,
  ...props
}) {
  return <button {...props} disabled={busy || props.disabled}>{busy && <LoaderCircle size={17} className="spin" />}{children}</button>;
}
export function CropPhoto({
  person,
  onClose,
  onSave
}) {
  const [source, setSource] = useState(null),
    [zoom, setZoom] = useState(1),
    [offset, setOffset] = useState({
      x: 0,
      y: 0
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const canvas = useRef(),
    imageRef = useRef(),
    drag = useRef();
  const urlRef = useRef();
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);
  const bounded = (next, z = zoom) => {
    const im = imageRef.current;
    if (!im) return next;
    const base = Math.max(500 / im.width, 500 / im.height) * z;
    const mx = (im.width * base - 500) / 2,
      my = (im.height * base - 500) / 2;
    return {
      x: Math.max(-mx, Math.min(mx, next.x)),
      y: Math.max(-my, Math.min(my, next.y))
    };
  };
  const paint = () => {
    const im = imageRef.current,
      c = canvas.current;
    if (!im || !c) return;
    const ctx = c.getContext('2d');
    const scale = Math.max(500 / im.width, 500 / im.height) * zoom;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 500, 500);
    ctx.drawImage(im, (500 - im.width * scale) / 2 + offset.x, (500 - im.height * scale) / 2 + offset.y, im.width * scale, im.height * scale);
  };
  useEffect(paint, [source, zoom, offset]);
  const choose = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Selecciona una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('La foto debe pesar menos de 15 MB.');
      return;
    }
    setError('');
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const im = new Image();
    im.onload = () => {
      imageRef.current = im;
      setOffset({
        x: 0,
        y: 0
      });
      setZoom(1);
      setSource(url);
    };
    im.onerror = () => setError('No pudimos abrir esta foto. Prueba con otra.');
    im.src = url;
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      let blob;
      for (const quality of [.82,.65,.45]) { blob = await new Promise(resolve => canvas.current.toBlob(resolve, 'image/webp', quality)); if (blob && blob.size <= 524288) break; }
      if (!blob || blob.size > 524288) blob = await new Promise(resolve => canvas.current.toBlob(resolve,'image/jpeg',.75));
      if (!blob) throw Error('No pudimos preparar la imagen.');
      await onSave(blob);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return <Modal title="Fotografía de referencia" subtitle={fullName(person)} onClose={busy ? () => {} : onClose}><div className="modal-body"><p className="muted">Centra el rostro. Arrastra la foto y ajusta el zoom.</p><label className="upload-button"><Camera size={18} />{source ? 'Elegir otra foto' : 'Elegir una fotografía'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} /></label>{source ? <><div className="crop-frame"><canvas width="500" height="500" ref={canvas} aria-label="Recorte de fotografía. Arrastra para centrar el rostro." tabIndex={0} onKeyDown={e => {
            const moves = {
              ArrowLeft: [-8, 0],
              ArrowRight: [8, 0],
              ArrowUp: [0, -8],
              ArrowDown: [0, 8]
            };
            if (moves[e.key]) {
              e.preventDefault();
              setOffset(o => bounded({
                x: o.x + moves[e.key][0],
                y: o.y + moves[e.key][1]
              }));
            }
          }} onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              offset
            };
          }} onPointerMove={e => {
            if (!drag.current) return;
            const ratio = 500 / e.currentTarget.clientWidth;
            setOffset(bounded({
              x: drag.current.offset.x + (e.clientX - drag.current.x) * ratio,
              y: drag.current.offset.y + (e.clientY - drag.current.y) * ratio
            }));
          }} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null} /><div className="crop-guides" /></div><div className="zoom"><Minus size={18} /><input type="range" aria-label="Zoom de fotografía" min="1" max="4" step=".01" value={zoom} onChange={e => {
            const z = Number(e.target.value);
            setZoom(z);
            setOffset(o => bounded(o, z));
          }} /><Plus size={18} /></div><div className="crop-note"><Move size={15} /> También puedes moverla con las flechas del teclado.</div><span className="badge neutral">500 × 500 píxeles · WebP optimizado</span></> : <div className="crop-placeholder"><Camera size={40} /><span>Una foto clara ayuda a reconocer al hermano.</span></div>}{error && <div role="alert" className="form-error">{error}</div>}</div><div className="modal-foot"><button className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><Button className="button primary" busy={busy} disabled={!source} onClick={save}><Check size={17} /> Guardar fotografía</Button></div></Modal>;
}
