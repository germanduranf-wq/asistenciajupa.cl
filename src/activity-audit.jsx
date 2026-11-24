import React,{useState,useEffect,useRef} from 'react';
import {History,RefreshCw} from 'lucide-react';
import {fetchActivityAudit} from './api.mjs';
import {today,addDays} from './domain.mjs';
import {Field} from './ui.jsx';
import './activity-audit.css';
const entities={miembros:'Participantes',asistencias:'Asistencia por persona',registros_encuentro_clases:'Asistencia de clases en JUPA',actividades:'Actividades',eventos:'Encuentros y servicios especiales',responsabilidades:'Responsabilidades',resumenes_servicios:'Resúmenes de Secretaría',usuarios:'Cuentas',iglesias:'Clases',miembros_eliminados:'Motivos de eliminación'};
const stamp=s=>new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export function ActivityAudit({data}){
 const [filters,setFilters]=useState({from:addDays(today(),-30),to:today(),classId:'',actor:'',table:''});
 const [rows,setRows]=useState([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(0);
 const load=async(append=false)=>{const ticket=++request.current;setBusy(true);setError('');try{
  if(filters.from>filters.to)throw Error('La fecha inicial debe ser anterior a la fecha final.');
  const result=await fetchActivityAudit({...filters,before:append?rows.at(-1)?.id:null});
  if(ticket!==request.current)return;setRows(old=>append?[...old,...result]:result);setMore(result.length===50);
 }catch(e){if(ticket===request.current){setError(e.message);if(!append)setRows([]);}}finally{if(ticket===request.current)setBusy(false);}};
 useEffect(()=>{load();return()=>{request.current++;};},[filters]);
 const change=(key,value)=>setFilters(f=>({...f,[key]:value}));
 return <section className="panel settings-panel audit-panel"><header className="audit-heading"><div><span className="eyebrow">SOLO ADMINISTRADOR</span><h2><History size={23}/>Actividad de las clases</h2><p>Quién realizó cada cambio, cuándo y en qué clase. Horario de Chile.</p></div><button className="button secondary" disabled={busy} onClick={()=>load()}><RefreshCw size={16}/>Actualizar</button></header>
 <div className="audit-filters"><Field label="Desde"><input type="date" value={filters.from} onChange={e=>e.target.value&&change('from',e.target.value)}/></Field><Field label="Hasta"><input type="date" value={filters.to} onChange={e=>e.target.value&&change('to',e.target.value)}/></Field><Field label="Clase"><select value={filters.classId} onChange={e=>change('classId',e.target.value)}><option value="">Todas las clases</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Usuario"><select value={filters.actor} onChange={e=>change('actor',e.target.value)}><option value="">Todos los usuarios</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.username} · {p.name}</option>)}</select></Field><Field label="Tipo de registro"><select value={filters.table} onChange={e=>change('table',e.target.value)}><option value="">Todos los registros</option>{Object.entries(entities).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field></div>
 <p className="hint">Cada marca de asistencia es un cambio. El registro incluye las acciones disponibles desde que la auditoría estuvo habilitada; no representa inicios de sesión.</p>
 {error&&<p role="alert" className="form-error">{error}</p>}{busy&&<p role="status">Consultando actividad…</p>}
 <div className="audit-list">{rows.map(r=><article className="audit-entry" key={r.id}><div className="audit-time"><time dateTime={r.at}>{stamp(r.at)}</time><small>{r.username||'Sistema'}{r.actor_name?' · '+r.actor_name:''}</small></div><div><strong>{r.action}</strong><p>{r.subject}</p>{r.detail&&<p className="audit-detail">{r.detail}</p>}<small>{entities[r.table]||r.table}</small></div><span className="audit-class">{r.class_name||'General JUPA'}</span></article>)}</div>
 {!rows.length&&!busy&&!error&&<p className="audit-empty">No hay movimientos para estos filtros.</p>}{more&&<button className="button secondary" disabled={busy} onClick={()=>load(true)}>Ver movimientos anteriores</button>}
 </section>;
}
