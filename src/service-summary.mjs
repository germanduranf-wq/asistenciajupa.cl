import {fullName} from './domain.mjs';
import {canPublish,canActivity} from './access.mjs';
export const SUMMARY_TYPES={servicio_jupa:'Servicio general JUPA',devocional:'Devocional JUPA',reunion_encargados:'Reunión mensual y ensayos'};
export const LEADERS=['Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas'];
export const expectedInService=p=>LEADERS.includes(p.category)||(p.body_ids||[]).length>0;
export const canSummary=(p,d,v,action='view')=>!!SUMMARY_TYPES[v?.activity_type]&&canPublish(p)&&canActivity(p,d,v.activity_type,v.class_id,action);
export const classNames=(ids,data)=>(ids||[]).map(id=>data.classes.find(c=>String(c.id)===String(id))?.name||'Clase '+id).join(', ');
export function linkedAttendance(data,id){
 if(!id)return null;
 const visit=data.visits.find(v=>v.id===String(id)&&!v.eliminado_el&&v.status!=='suspended');
 return visit?attendanceSummary(data,visit.id):null;
}
export function attendanceSummary(data,visitId,{body='',category='',classId=''}={}){
 const visit=data.visits.find(v=>v.id===visitId);
 const rows=!visit||visit.eliminado_el||visit.status==='suspended'?[]:data.attendance.filter(a=>a.visit_id===visitId&&a.present);
 const filtered=rows.filter(a=>{
  const p=data.people.find(p=>p.id===a.person_id),bodies=a.body_ids??p?.body_ids??[];
  return (!body||bodies.includes(body))&&(!category||a.category===category)&&(!classId||a.class_id===classId);
 });
 const classes=data.classes.filter(c=>c.active||rows.some(a=>a.class_id===c.id)).map(c=>({...c,count:filtered.filter(a=>a.class_id===c.id).length}));
 return {total:filtered.length,leaders:filtered.filter(a=>LEADERS.includes(a.category)).length,rows:filtered,classes,
  bodies:(data.bodies||[]).map(b=>({...b,count:filtered.filter(a=>(a.body_ids??data.people.find(p=>p.id===a.person_id)?.body_ids??[]).includes(b.id)).length})),
  legacyBodies:filtered.some(a=>a.body_ids==null)};
}
export const SUMMARY_TEXT={
 servicio_jupa:[['oportunidades','Oportunidades (una por línea)'],['coordinador','Coordinador'],['predicador','Predicador'],['pasaje_biblico','Pasaje de la Palabra'],['oracion_palabra','Oración por la Palabra'],['predicadores_presentes','Predicadores presentes'],['agradecimientos','Agradecimientos'],['observaciones','Observaciones generales']],
 devocional:[['tema_biblico','Tema bíblico'],['expositor','Expositor del tema'],['lectura','Hermano de lectura'],['pasaje_biblico','Pasaje bíblico'],['tema_administrativo','Tema administrativo / responsable'],['coordinador','Coordinador'],['predicadores_presentes','Predicadores presentes'],['observaciones','Observaciones generales']],
 reunion_encargados:[['oracion','Oración'],['lectura','Lectura'],['pasaje_biblico','Pasaje'],['tema_administrativo','Tema administrativo / responsable'],['oportunidades','Oportunidades especiales'],['bendicion','Bendición'],['observaciones','Observaciones generales']]
};
export function summaryDefaults(data,v,saved){
 const event=data.bulletin_events?.find(e=>e.id===v.evento_id);
 return {devocional_id:null,primer_ensayo_id:null,segundo_ensayo_id:null,anfitrionas_ids:event?.host_ids||[],total_punto:null,total_general:null,invitaciones_ids:[],oportunidades_ids:[],solicitaron_tema_ids:[],...Object.fromEntries(Object.values(SUMMARY_TEXT).flat().map(([k])=>[k,''])),...saved};
}
export function summaryPayload(values){
 const fields=['devocional_id','primer_ensayo_id','segundo_ensayo_id','anfitrionas_ids','total_punto','total_general','invitaciones_ids','oportunidades_ids','solicitaron_tema_ids',...Object.values(SUMMARY_TEXT).flat().map(([k])=>k)];
 return Object.fromEntries([...new Set(fields)].map(k=>[k,values[k]??(k.endsWith('_ids')?[]:k.endsWith('_id')||k.startsWith('total_')?null:'')]));
}
export function summaryRow(v,saved,data){
 const s=summaryDefaults(data,v,saved),marks=attendanceSummary(data,v.id);
 const count=id=>linkedAttendance(data,id)?.total??null;
 const common=[v.date,saved?'Completado':'Sin completar'];
 if(v.activity_type==='servicio_jupa')return [...common,classNames(data.bulletin_events?.find(e=>e.id===v.evento_id)?.host_ids||s.anfitrionas_ids,data),linkedAttendance(data,s.devocional_id)?.leaders??null,s.total_punto,s.total_general,marks.total,marks.leaders,...SUMMARY_TEXT.servicio_jupa.map(([k])=>s[k])];
 if(v.activity_type==='devocional')return [...common,classNames(s.anfitrionas_ids,data),classNames(s.oportunidades_ids,data),marks.total,marks.leaders,...SUMMARY_TEXT.devocional.map(([k])=>s[k]),classNames(s.solicitaron_tema_ids,data)];
 const leaders=id=>linkedAttendance(data,id)?.leaders??null;
 return [...common,classNames(s.invitaciones_ids,data),marks.leaders,leaders(s.primer_ensayo_id),leaders(s.segundo_ensayo_id),count(s.primer_ensayo_id),count(s.segundo_ensayo_id),...SUMMARY_TEXT.reunion_encargados.map(([k])=>s[k])];
}
export const SUMMARY_HEADERS={
 servicio_jupa:['Fecha','Estado del resumen','Clases anfitrionas','Encargados y ayudantes en devocional','Total punto de predicación (manual)','Total general tarde (manual)','Registrados por nombre en tarde','Encargados y ayudantes en tarde',...SUMMARY_TEXT.servicio_jupa.map(([,label])=>label)],
 devocional:['Fecha','Estado del resumen','Clases anfitrionas','Clases con oportunidad','Registrados por nombre','Encargados y ayudantes',...SUMMARY_TEXT.devocional.map(([,label])=>label),'Clases que solicitaron el tema bíblico'],
 reunion_encargados:['Fecha','Estado del resumen','Clases de invitaciones','Encargados y ayudantes en reunión','Encargados y ayudantes en primer ensayo','Encargados y ayudantes en segundo ensayo','Total asistentes primer ensayo de coro','Total asistentes segundo ensayo de coro',...SUMMARY_TEXT.reunion_encargados.map(([,label])=>label)]
};
export function participantColumns(data){return ['ID','Nombres','Apellidos','Clase principal actual','Otra clase actual','Categoría actual','Cuerpos actuales','RUT','Fecha de nacimiento','Observaciones','Activo','Referencia de fotografía','Fecha de registro','Fusionado en'];}
export function participantRow(p,data){return [p.id,p.first_name,p.last_name,classNames([p.class_id],data),classNames(p.secondary_class_id?[p.secondary_class_id]:[],data),p.category,(p.body_ids||[]).map(id=>data.bodies.find(b=>b.id===id)?.name||id).join(', '),p.rut||'',p.birth_date||null,p.observations||'',p.active?'Sí':'No',p.photo_path||'',p.created_at||null,p.merged_into||''];}
export function attendanceExportRows(data,v){
 return attendanceSummary(data,v.id).rows.map(a=>{const p=data.people.find(p=>p.id===a.person_id)||{id:a.person_id};return [v.date,fullName(p),classNames([a.class_id],data),a.category,(a.body_ids??p.body_ids??[]).map(id=>data.bodies.find(b=>b.id===id)?.name||id).join(', '),a.body_ids==null?'Cuerpos actuales; sin dato histórico':'Cuerpos al registrar',...participantRow(p,data)];}).sort((a,b)=>a[1].localeCompare(b[1]));
}
