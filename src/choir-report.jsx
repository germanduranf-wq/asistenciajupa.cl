import React from 'react';
import {eligiblePerson} from './access.mjs';
import {fullName,groupOf} from './domain.mjs';
export function ChoirReport({data,activity,filters}){
 if(!activity||!['ensayo_coro','evento_coro'].includes(activity.activity_type))return null;
 const members=data.people.filter(p=>p.active&&eligiblePerson(activity,p,data)&&(!filters.class_id||p.class_id===filters.class_id)&&(!filters.category||p.category===filters.category)&&(!filters.group||groupOf(p.category)===filters.group));
 const marked=new Set(data.attendance.filter(a=>a.visit_id===activity.id&&a.present).map(a=>a.person_id));
 const history=data.attendance.filter(a=>a.present).map(a=>({...a,visit:data.visits.find(v=>v.id===a.visit_id)})).filter(a=>a.visit&&['ensayo_coro','evento_coro'].includes(a.visit.activity_type)&&a.visit.date<=filters.to);
 const never=members.filter(p=>!history.some(a=>a.person_id===p.id));
 return <section className="panel settings-panel"><h2>Seguimiento Coro JUPA</h2><p>Actividad del {activity.date}. Mientras se registra, una persona sin marca todavía puede incorporarse.</p><h3>Sin asistencia registrada en esta actividad</h3>{members.filter(p=>!marked.has(p.id)).map(p=><p key={p.id}>{fullName(p)} · {data.classes.find(c=>c.id===p.class_id)?.name}</p>)}{members.every(p=>marked.has(p.id))&&<p>Todos los integrantes activos tienen una marca.</p>}<h3>Integrantes sin asistencias previas registradas</h3>{never.map(p=><p key={p.id}>{fullName(p)}</p>)}{!never.length&&<p>Todos tienen al menos una asistencia registrada.</p>}</section>;
}
