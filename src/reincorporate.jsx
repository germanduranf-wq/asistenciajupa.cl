import React, {useState} from 'react';
import {Modal, Field, Button, Avatar} from './ui.jsx';
import {fullName, normalize} from './domain.mjs';
import {canPerson,belongsToClass} from './access.mjs';
import {reactivatePerson} from './api.mjs';

export function ReincorporateForm({profile, data, onClose, onNew, onSaved}) {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const inactive = data.people.filter(p => !p.active && !p.merged_into && canPerson(profile,p,'reactivate'));
  const people = inactive.filter(p => (!classId || belongsToClass(p,classId)) && normalize(fullName(p)).includes(normalize(search)))
    .sort((a,b)=>fullName(a).localeCompare(fullName(b),'es'));
  const restore = async p => {
    setBusy(p.id); setError('');
    try {
      const saved = await reactivatePerson(p.id);
      await onSaved(saved, 'reactivated');
      onClose();
    } catch(e) {setError(e.message); setBusy(null);}
  };
  return <Modal title="Reincorporar participante inactivo" onClose={busy?()=>{}:onClose}
    subtitle={profile.role==='clase'?'Participantes inactivos de tu clase.':'Participantes inactivos de todas las clases.'}>
    <div className="modal-body">
      <button type="button" className="button secondary" disabled={!!busy} onClick={onNew}>Volver a crear participante nuevo</button>
      <p className="hint" style={{margin:'16px 0'}}>Se conservarán sus datos, fotografía e historial. Reincorporarlo no marca asistencia automáticamente.</p>
      <Field label="Buscar inactivo por nombre o apellido"><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} disabled={!!busy}/></Field>
      {profile.role!=='clase' && <Field label="Filtrar inactivos por clase"><select value={classId} onChange={e=>setClassId(e.target.value)} disabled={!!busy}>
        <option value="">Todas las clases</option>
        {data.classes.filter(c=>canPerson(profile,c.id,'reactivate')).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></Field>}
      <p role="status" className="hint">{people.length} participantes inactivos encontrados.</p>
      {people.map(p=><div key={p.id} className="report-row" style={{alignItems:'center',flexWrap:'wrap'}}>
        <div className="mini-person"><Avatar person={p}/><div><b>{fullName(p)}</b><small>{data.classes.find(c=>c.id===p.class_id)?.name} · {p.category}</small></div></div>
        <Button type="button" className="button secondary" busy={busy===p.id} disabled={!!busy} onClick={()=>restore(p)} aria-label={`Reincorporar a ${fullName(p)}`}>Reincorporar</Button>
      </div>)}
      {!people.length && <p className="info-line">No hay participantes inactivos que coincidan con esta búsqueda.</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
    <div className="modal-foot"><button type="button" className="button secondary" disabled={!!busy} onClick={onClose}>Cerrar</button></div>
  </Modal>;
}
