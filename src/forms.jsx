import React, { useState } from 'react';
import { Plus, Check, AlertTriangle, UserRound, Camera } from 'lucide-react';
import { Modal, Field, Button, Avatar } from './ui.jsx';
import { CATEGORIES, ROLES, OUTCOMES, fullName, possibleDuplicates, validRut, today, upper } from './domain.mjs';
import * as api from './api.mjs';
export function PersonForm({
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
    class_id: '',
    category: visit?.group === 'Señoritas' ? 'Señorita' : 'Joven',
    rut: '',
    active: true
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const duplicates = possibleDuplicates(data.people, values);
  const set = (k, v) => {
    setValues({
      ...values,
      [k]: v
    });
    setConfirmed(false);
  };
  const submit = async e => {
    e.preventDefault();
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
        category: values.category,
        rut: values.rut,
        active: values.active
      });
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return <Modal title={person ? 'Editar participante' : 'Agregar participante'} subtitle="Sus datos quedarán disponibles para las próximas visitas." onClose={busy ? () => {} : onClose}><form onSubmit={submit}><div className="modal-body"><div className="form-grid"><Field label="Nombres *"><input value={values.first_name} onChange={e => set('first_name', e.target.value)} required maxLength={80} autoFocus autoComplete="given-name" placeholder="Ej. Germán Andrés" /></Field><Field label="Apellidos *"><input value={values.last_name} onChange={e => set('last_name', e.target.value)} required maxLength={80} autoComplete="family-name" placeholder="Ej. Durán Soto" /></Field><Field label="Clase o local *"><select value={values.class_id} required onChange={e => set('class_id', e.target.value)}><option value="">Seleccionar clase</option>{data.classes.filter(c => c.active || c.id === values.class_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Categoría *"><select value={values.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="RUT (opcional)" hint="Ayuda a distinguir personas con el mismo nombre."><input value={values.rut || ''} onChange={e => set('rut', e.target.value)} maxLength={14} placeholder="12.345.678-5" /></Field>{person && <Field label="Estado"><select value={values.active ? 'true' : 'false'} onChange={e => set('active', e.target.value === 'true')}><option value="true">Activo</option><option value="false">Inactivo · conserva historial</option></select></Field>}</div><p className="hint">La asistencia se atribuye solo a la clase seleccionada, incluso si también tiene un cargo en el templo matriz.</p>{duplicates.length > 0 && <div className="duplicates"><strong><AlertTriangle size={17} /> Encontramos personas parecidas</strong>{duplicates.slice(0, 5).map(p => <div className="mini-person" key={p.id}><Avatar person={p} /><div><b>{fullName(p)}</b><small>{data.classes.find(c => c.id === p.class_id)?.name}</small></div>{visit && <button type="button" className="text-button" onClick={() => {
              onSaved(p);
              onClose();
            }}>Usar este registro</button>}</div>)}<label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo que es una persona diferente.</label></div>}{error && <div role="alert" className="form-error">{error}</div>}<div className="info-line"><Camera size={18} /> Puedes agregar su foto después de guardar.</div></div><div className="modal-foot"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><Button type="submit" className="button primary" busy={busy}><Check size={17} />{person ? 'Guardar cambios' : 'Agregar participante'}</Button></div></form></Modal>;
}
export function VisitForm({
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
  return <Modal title={visit ? 'Editar visita' : 'Programar visita'} subtitle="Prepara el encuentro y asigna a sus responsables." onClose={busy ? () => {} : onClose}><form onSubmit={submit}><div className="modal-body"><div className="form-grid"><Field label="Fecha *"><input type="date" value={values.date} required onChange={e => setValues({
              ...values,
              date: e.target.value
            })} /></Field><Field label="Grupo *"><select value={values.group} onChange={e => setValues({
              ...values,
              group: e.target.value
            })}><option>Jóvenes</option><option>Señoritas</option></select></Field></div><Field label="Clase o local de destino *"><select required value={values.class_id} onChange={e => setValues({
            ...values,
            class_id: e.target.value
          })}><option value="">Seleccionar destino</option>{data.classes.filter(c => c.active || c.id === values.class_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><h3 className="form-section-title">Responsables <span>Opcionales</span></h3>{ROLES.map(role => <Field label={role} key={role}><select value={assignments[role]} onChange={e => setAssignments({
            ...assignments,
            [role]: e.target.value
          })}><option value="">Por definir</option>{data.people.filter(p => p.active || p.id === assignments[role]).sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></Field>)}<Field label="Observaciones"><textarea rows={2} maxLength={1000} value={values.notes} onChange={e => setValues({
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
          })}>{OUTCOMES.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Quién realizó finalmente la función" hint="Selecciona también al responsable original si fue quien la realizó."><select value={v.actual_person_id || ''} onChange={e => setV({
            ...v,
            actual_person_id: e.target.value || null
          })}><option value="">Sin confirmar</option>{data.people.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></Field><Field label="Observación o justificación"><textarea maxLength={1000} value={v.note || ''} rows={3} onChange={e => setV({
            ...v,
            note: e.target.value
          })} /></Field><p className="hint">La presencia se marca por separado en la lista de asistencia.</p>{error && <div role="alert" className="form-error">{error}</div>}</div><div className="modal-foot"><Button className="button primary" busy={busy} type="submit">Guardar resultado</Button></div></form></Modal>;
}
