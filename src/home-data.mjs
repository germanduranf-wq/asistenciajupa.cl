import {belongsToClass,localActivity,canActivity} from './access.mjs';
export const youthChurch=c=>c?.kind!=='Local';
export function homeClass(profile,data){return profile.class_id||(profile.role==='jefatura'?data.classes.find(c=>c.kind==='Templo matriz')?.id:null)||'';}
export function youthLabel(profile,data){const c=data.classes.find(c=>c.id===homeClass(profile,data));return c?(c.kind==='Templo matriz'?'Juventud del Templo Matriz':`Juventud de la clase ${c.name}`):'Juventud de las clases';}
export function homeData(data,profile,scope,now){
 const visits=data.visits.filter(v=>!v.eliminado_el&&v.status!=='suspended'&&canActivity(profile,data,v.activity_type||'visita',v.class_id));
 const upcoming=visits.filter(v=>v.date>=now&&v.date.startsWith(now.slice(0,7))&&(!localActivity(v.activity_type)||(data.classes.some(c=>c.id===v.class_id&&youthChurch(c))&&(!scope||v.class_id===scope)))).sort((a,b)=>a.date.localeCompare(b.date));
 const people=data.people.filter(p=>p.active&&!p.historico&&!p.merged_into&&(!scope||belongsToClass(p,scope)));
 const responsibilities=data.responsibilities.filter(r=>upcoming.some(v=>v.id===r.visit_id)&&people.some(p=>p.id===r.person_id)).sort((a,b)=>upcoming.find(v=>v.id===a.visit_id).date.localeCompare(upcoming.find(v=>v.id===b.visit_id).date));
 const start=new Date(now+'T12:00:00Z');
 const birthdays=people.filter(p=>p.birth_date).map(p=>{let year=start.getUTCFullYear();let next=new Date(`${year}-${p.birth_date.slice(5)}T12:00:00Z`);if(next<start)next=new Date(`${++year}-${p.birth_date.slice(5)}T12:00:00Z`);return {...p,next:next.toISOString().slice(0,10),days:Math.round((next-start)/86400000)};}).filter(p=>p.days<=30).sort((a,b)=>a.days-b.days);
 return {upcoming,people,responsibilities,birthdays};
}
