import React,{useState,useEffect} from 'react';
import {Modal,Field,Button} from './ui.jsx';
import {today,dateLabel,ROLES} from './domain.mjs';
import * as api from './api.mjs';
import {letterPDF,saveFile,letterFilename,exportResponsibilities} from './visit-exports.mjs';
import {zipFiles} from './zip.mjs';

export function VisitLetters({visitId}){
 const [open,setOpen]=useState(false),[letters,setLetters]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=async()=>{setOpen(true);setError('');setBusy('load');try{setLetters(await api.issueLetters(visitId));}catch(e){setError(e.message);}finally{setBusy('');}};
 return <><button className="button secondary letters-button" onClick={load}>Cartas de esta visita</button>{open&&<Modal title="Cartas de responsabilidades" subtitle="Una carta por persona y función asignada. Las descargas conservan su folio." onClose={()=>!busy&&setOpen(false)}><div className="modal-body">{busy==='load'&&<p role="status">Preparando cartas…</p>}{letters.map(l=><div className="report-row" key={l.folio}><div><b>{l.name}</b><small>{l.role} · {l.folio}</small></div><Button busy={busy===l.folio} disabled={!!busy} className="button secondary" onClick={async()=>{setBusy(l.folio);setError('');try{saveFile(new Blob([await letterPDF(l)],{type:'application/pdf'}),letterFilename(l));}catch(e){setError(e.message);}finally{setBusy('');}}}>Descargar PDF</Button></div>)}{!letters.length&&!busy&&!error&&<p>No hay responsables asignados, o la visita está suspendida. Asigna los responsables antes de descargar sus cartas.</p>}{error&&<p role="alert" className="form-error">{error}</p>}</div></Modal>}</>;
}
export function VisitDocuments({profile}){
 const [month,setMonth]=useState(today().slice(0,7)),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');setLoading(true);api.visitResponsibilities(month).then(r=>live&&setRows(r)).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[month]);
 const download=async type=>{setBusy(type);setError('');try{
  if(type==='zip'){
   const letters=await api.issueLetters(null,month);if(!letters.length)throw Error('No hay cartas para este mes. Revisa los responsables de las visitas.');
   const files=[];for(const l of letters)files.push({name:letterFilename(l),bytes:await letterPDF(l)});saveFile(zipFiles(files),'Cartas-JUPA-'+month+'.zip');
  }else await exportResponsibilities(rows,month,type,profile);
 }catch(e){setError(e.message);}finally{setBusy('');}};
 return <><div className="filter-bar"><Field label="Mes de visitas"><input type="month" value={month} disabled={!!busy} onChange={e=>e.target.value&&setMonth(e.target.value)}/></Field><div className="action-wrap"><Button className="button secondary" disabled={loading||!!busy||!rows.length} busy={busy==='pdf'} onClick={()=>download('pdf')}>Resumen PDF</Button><Button className="button secondary" disabled={loading||!!busy||!rows.length} busy={busy==='png'} onClick={()=>download('png')}>Resumen imagen</Button>{['admin','secretaria'].includes(profile.role)&&<Button className="button primary" disabled={loading||!!busy||!rows.length} busy={busy==='zip'} onClick={()=>download('zip')}>Cartas del mes · ZIP</Button>}</div></div><p className="hint">Incluye solo visitas de jóvenes y señoritas. Los eventos JUPA y los ensayos se mantienen separados. Las funciones sin responsable aparecen como «Por asignar» y no generan carta.</p>{error&&<p role="alert" className="form-error">{error}</p>}{loading?<p role="status">Cargando responsabilidades…</p>:<div className="monthly-visits">{rows.map(v=><section className="panel monthly-visit" key={v.id}><div className="eyebrow">{v.group} · {dateLabel(v.date,{weekday:'long'})}</div><h2>{v.class_name}</h2>{v.status==='suspended'&&<strong>Visita suspendida</strong>}{ROLES.map(role=><div className="monthly-responsible" key={role}><span>{role}</span><b>{v.responsables.find(r=>r.role===role)?.name||'Por asignar'}</b></div>)}<VisitLetters visitId={v.id}/></section>)}{!rows.length&&<p>No hay visitas programadas para este mes.</p>}</div>}</>;
}
