import React,{useEffect,useState} from 'react';
import {Modal,Field} from './ui.jsx';
import {fullName,today,dateLabel} from './domain.mjs';
import {MODULES} from './access.mjs';
import {memberHistory} from './api.mjs';
export function MemberHistory({person,onClose}){
 const [from,setFrom]=useState(today().slice(0,4)+'-01-01'),[to,setTo]=useState(today()),[rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setLoading(true);setError('');if(!from||!to||from>to){setError('Revisa el período seleccionado.');setLoading(false);return;}
 memberHistory(person.id,from,to).then(r=>live&&setRows(r)).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[person.id,from,to]);
 return <Modal title="Historial de asistencia" subtitle={fullName(person)} onClose={onClose}><div className="modal-body"><div className="form-grid"><Field label="Desde"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="Hasta"><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field></div><p className="hint">Las asistencias conservan la clase en que fueron contabilizadas, aunque la persona se haya trasladado.</p>{error?<p className="form-error" role="alert">{error}</p>:loading?<p role="status">Cargando historial…</p>:<><div className="history-total"><b>{rows.length}</b> asistencias en este período</div>{rows.map(r=><div className="history-row" key={r.visit_id}><div><b>{dateLabel(r.date,{year:'numeric'})} · {MODULES[r.activity_type]}</b><small>{r.destino} · {r.group}</small><small>Contabilizó en {r.clase_contabilizada} · {r.category}</small></div></div>)}{!rows.length&&<p>No hay asistencias en este período.</p>}</>}</div></Modal>;
}
