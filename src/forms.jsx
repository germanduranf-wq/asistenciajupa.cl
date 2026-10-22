import {PersonPicker} from './person-picker.jsx';
import {ReincorporateForm} from './reincorporate.jsx';
import {canPerson,ageAt} from './access.mjs';
import React, { useState } from 'react';
import { Plus, Check, AlertTriangle, UserRound, Camera } from 'lucide-react';
import { Modal, Field, Button, Avatar } from './ui.jsx';
import { CATEGORIES, ROLES, OUTCOMES, fullName, possibleDuplicates, validRut, today, upper } from './domain.mjs';
import * as api from './api.mjs';
export function PersonForm({
  profile,
  person,
  data,
  onClose,
  onSaved,
  visit
}) {
  const [values, setValues] = useState(person ? {
    ...person
  } : {
    first_name: '',
    last_name: '',
    class_id: profile?.role==='clase' ? profile.class_id : '',
    category: visit?.group === 'Señoritas' ? 'Señorita' : 'Joven',
    rut: '',
    active: true
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState('new');
  const duplicates = possibleDuplicates(data.people, values);
  const set = (k, v) => {
    setValues({
      ...values,
      [k]: v,
      ...(k==='class_id' && v===values.secondary_class_id ? {secondary_class_id:null} : {})
    });
    setConfirmed(false);
  };
  const submit = async e => {
    e.preventDefault();
    if (values.birth_date && (ageAt(values.birth_date,today())<10 || values.birth_date<'1900-01-01')) { setError('La fecha debe corresponder a un joven o encargado.'); return; }
    if(values.secondary_class_id && values.secondary_class_id===values.class_id){setError('Selecciona dos clases diferentes.');return;}
    if (values.rut && !validRut(values.rut)) {
      setError('El RUT no es válido. Revisa los números y el dígito verificador.');
      return;
    }
    if (duplicates.length && !confirmed) {
      setError('Revisa las coincidencias y confirma si se trata de una persona diferente.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await api.savePerson({
        ...(person ? {
          id: person.id
        } : {}),
        first_name: values.first_name,
        last_name: values.last_name,
        class_id: values.class_id,
        secondary_class_id: values.secondary_class_id || null,
        observations: values.observations || '',
        category: values.category,
        rut: values.rut,
        body_ids: values.body_ids || [],
        birth_date: values.birth_date || null,
        active: values.active
      });
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  if (!person && mode === 'reactivate') return <ReincorporateForm profile={profile} data={data} onClose={onClose} onNew={()=>setMode('new')} onSaved={onSaved}/>;
  return <Modal title={person ? 'Editar participante' : 'Agregar participante'} subtitle="Sus datos quedarán disponibles para las próximas actividades." onClose={busy ? () => {} : onClose}><form onSubmit={submit}><div className="modal-body">{!person && canPerson(profile,null,'reactivate') && <div style={{marginBottom:20}}><button type="button" className="button secondary" onClick={()=>setMode('reactivate')}>Reincorporar participante inactivo</button><p className="hint">Si ya estaba registrado, recupera su ficha sin duplicarlo.</p></div>}<div className="form-grid"><Field label="Nombres *"><input value={values.first_name} onChange={e => set('first_name', e.target.value)} required maxLength={80} autoFocus autoComplete="given-name" placeholder="Ej. Martin Antonio" /></Field><Field label="Apellidos *"><input value={values.last_name} onChange={e => set('last_name', e.target.value)} required maxLength={80} autoComplete="family-name" placeholder="Ej. Farias Soto" /></Field><Field label="Clase principal *"><select disabled={!!person && profile?.role==='clase'} value={values.class_id} required onChange={e => set('class_id', e.target.value)}><option value="">Seleccionar clase</option>{data.classes.filter(c => (c.active || c.id === values.class_id) && (canPerson(profile,c.id,'create') || c.id===values.class_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Otra clase donde congrega (opcional)" hint="Aparecerá en ambas clases con una sola ficha. Ambas podrán editar sus datos."><select value={values.secondary_class_id||''} onChange={e=>set('secondary_class_id',e.target.value)}><option value="">Ninguna</option>{data.classes.filter(c=>c.id!==values.class_id&&(c.active||c.id===values.secondary_class_id)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Categoría *"><select value={values.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field><fieldset className="body-picker"><legend>Cuerpos JUPA (opcional)</legend><p className="hint">Puedes seleccionar más de uno. Tu categoría se mantiene.</p>{(data.bodies||[]).filter(b=>b.active||(values.body_ids||[]).includes(b.id)).map(b=><label className="check-label" key={b.id}><input type="checkbox" checked={(values.body_ids||[]).includes(b.id)} onChange={e=>set('body_ids',e.target.checked?[...(values.body_ids||[]),b.id]:(values.body_ids||[]).filter(id=>id!==b.id))}/>{b.name}{!b.active?' (inactivo)':''}</label>)}</fieldset><Field label="Fecha de nacimiento (opcional)"><input type="date" min="1900-01-01" max={today()} value={values.birth_date||''} onChange={e=>set('birth_date',e.target.value)}/></Field><Field label="RUT (opcional)" hint="Ayuda a distinguir personas con el mismo nombre."><input value={values.rut || ''} onChange={e => set('rut', e.target.value)} maxLength={14} placeholder="12.345.678-5" /></Field>{person && canPerson(profile,person,'retire') && <Field label="Estado"><select value={values.active ? 'true' : 'false'} onChange={e => set('active', e.target.value === 'true')}><option value="true">Activo</option><option value="false">Inactivo · conserva historial</option></select></Field>}</div><Field label="Observaciones (opcional)"><textarea rows={3} maxLength={2000} value={values.observations||''} onChange={e=>set('observations',e.target.value)} placeholder="Observaciones generales del participante"/></Field><p className="hint">En visitas cuenta para su clase principal. En actividades locales, para la clase en la que se registra su asistencia. El historial anterior se conserva.</p>{duplicates.length > 0 && <div className="duplicates"><strong><AlertTriangle size={17} /> Encontramos personas parecidas</strong>{duplicates.slice(0, 5).map(p => <div className="mini-person" key={p.id}><Avatar person={p} /><div><b>{fullName(p)}</b><small>{data.classes.find(c => c.id === p.class_id)?.name}</small></div>{visit && p.active && <button type="button" className="text-button" onClick={() => {
              onSaved(p);
              onClose();
            }}>Usar este registro</button>}</div>)}<label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo que es una persona diferente.</label></div>}{error && <div role="alert" className="form-error">{error}</div>}<div className="info-line"><Camera size={18} /> Puedes agregar su foto después de guardar.</div></div><div className="modal-foot"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><Button type="submit" className="button primary" busy={busy}><Check size={17} />{person ? 'Guardar cambios' : 'Agregar participante'}</Button></div></form></Modal>;
}
export function VisitForm({
  profile,
  visit,
  data,
  onClose,
  onSaved
}) {
  const [values, setValues] = useState(visit ? {
    ...visit
  } : {
    date: today(),
    class_id: '',
    group: 'Jóvenes',
    notes: ''
  });
  const [assignments, setAssignments] = useState(Object.fromEntries(ROLES.map(role => [role, data.responsibilities.find(r => r.visit_id === visit?.id && r.role === role)?.person_id || ''])));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.saveVisit(values, assignments);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return <Modal title={visit ? 'Editar visita' : 'Programar visita'} subtitle="Prepara el encuentro y asigna a sus responsables." onClose={busy ? () => {} : onClose}><form onSubmit={submit}><div className="modal-body"><div className="form-grid"><Field label="Fecha *"><input type="date" value={values.date} disabled={!!visit && profile?.role!=='admin'} required onChange={e => setValues({
              ...values,
              date: e.target.value
            })} /></Field><Field label="Grupo *"><select disabled={!!visit && profile?.role!=='admin'} value={values.group} onChange={e => setValues({
              ...values,
              group: e.target.value
            })}><option>Jóvenes</option><option>Señoritas</option></select></Field></div><Field label="Clase o local de destino *"><select disabled={!!visit && profile?.role!=='admin'} required value={values.class_id} onChange={e => setValues({
            ...values,
            class_id: e.target.value
          })}><option value="">Seleccionar destino</option>{data.classes.filter(c => c.active || c.id === values.class_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Hora (opcional)"><input type="time" value={values.scheduled_time||''} onChange={e=>setValues({...values,scheduled_time:e.target.value})}/></Field>{profile?.role!=='secretaria' && <><h3 className="form-section-title">Responsables <span>Opcionales</span></h3>{ROLES.map(role => <Field label={role} key={role}><PersonPicker label={role} people={data.people.filter(p=>p.active||p.id===assignments[role])} value={assignments[role]} onChange={id=>setAssignments({...assignments,[role]:id})}/></Field>)}</>}<Field label="Observaciones"><textarea rows={2} maxLength={1000} value={values.notes} onChange={e => setValues({
            ...values,
            notes: e.target.value
          })} placeholder="Información útil para los encargados" /></Field>{error && <div role="alert" className="form-error">{error}</div>}</div><div className="modal-foot"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><Button type="submit" className="button primary" busy={busy}><Check size={17} />{visit ? 'Guardar cambios' : 'Programar visita'}</Button></div></form></Modal>;
}
export function ResponsibilityForm({
  record,
  data,
  onClose,
  onSaved
}) {
  const [v, setV] = useState(record),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return <Modal title={record.role} subtitle={`Asignado: ${fullName(data.people.find(p => p.id === record.person_id))}`} onClose={busy ? () => {} : onClose}><form onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      try {
        await api.saveResponsibility(v);
        await onSaved();
        onClose();
      } catch (e) {
        setError(e.message);
        setBusy(false);
      }
    }}><div className="modal-body"><Field label="Resultado"><select value={v.outcome} onChange={e => setV({
            ...v,
            outcome: e.target.value
          })}>{OUTCOMES.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Quién realizó finalmente la función" hint="Selecciona también al responsable original si fue quien la realizó."><PersonPicker label="Quién realizó la función" people={data.people} value={v.actual_person_id} onChange={id=>setV({...v,actual_person_id:id||null})}/></Field><Field label="Observación o justificación"><textarea maxLength={1000} value={v.note || ''} rows={3} onChange={e => setV({
            ...v,
            note: e.target.value
          })} /></Field><p className="hint">La presencia se marca por separado en la lista de asistencia.</p>{error && <div role="alert" className="form-error">{error}</div>}</div><div className="modal-foot"><Button className="button primary" busy={busy} type="submit">Guardar resultado</Button></div></form></Modal>;
}
