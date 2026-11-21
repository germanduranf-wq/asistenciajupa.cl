import {youthLabel} from './home-data.mjs';
import {canActivity,canSchedule,canPublish,modulesFor} from './access.mjs';
export function activityGroups(profile,data){
 const modules=modulesFor(profile,data),central=canPublish(profile);
 const item=(id,label,description)=>({id,label,description});
 return [
  {id:'jupa',label:'JUPA',description:'Encuentro mensual y reuniones de encargados.',items:[
   (central||modules.includes('devocional')||modules.includes('servicio_jupa'))&&item('monthly_jupa','Evento mensual JUPA','Devocional de la mañana y servicio de la tarde, en un solo lugar.'),
   modules.includes('reunion_encargados')&&item('reunion_encargados','Reunión de encargados JUPA','Programa reuniones y registra a los encargados.')]},
  {id:'visits',label:'Visitas y servicios',description:'Visitas de jóvenes y señoritas, JUMEP y salidas especiales.',items:[
   modules.includes('visita')&&item('visits','Asistencia de visitas','Consulta las visitas y registra a quienes participaron.'),
   canSchedule(profile,data,'visita',null)&&item('schedule','Programar visitas y servicios','Visitas de viernes y actividades especiales para los avisos.')]},
  {id:'choir',label:'Coro JUPA',description:'Programación y asistencia del coro.',items:[
   modules.includes('ensayo_coro')&&item('ensayo_coro','Ensayos de coro','Programa ensayos, registra asistencia y consulta participación.'),
   modules.includes('evento_coro')&&item('evento_coro','Coro en evento JUPA','Participación del coro en el encuentro mensual.')]},
  {id:'local',label:youthLabel(profile,data),description:profile.attendance_only?'Selecciona el servicio para registrar asistencia. La cuenta general prepara las fechas.':'Actividades internas de las clases y del Templo Matriz.',items:[
   modules.includes('escuela_dominical')&&item('escuela_dominical','Escuela dominical','Domingos por clase y seguimiento de registros.'),
   modules.includes('servicio_domingo')&&item('servicio_domingo','Servicio del domingo','Asistencia de la juventud al servicio de la tarde.'),
   modules.includes('reunion_mensual')&&item('reunion_mensual','Reunión mensual de la clase','Reunión interna de cada clase o del Templo Matriz.')]},
  {id:'secretariat',label:'Secretaría',description:'Resúmenes, cartas y comunicaciones.',items:central?[
   item('summaries','Resúmenes de Secretaría','Consulta períodos, evolución y exporta los resúmenes.'),
   item('documents','Cartas y responsables','Cartas individuales, ZIP y asignaciones del mes.'),
   item('bulletin','Gestionar avisos','Avisos destacados y consulta de la programación pública.')]:[]}
 ].map(g=>({...g,items:g.items.filter(Boolean)})).filter(g=>g.items.length);
}
export const recorded=(v,data)=>v.status==='held'||data.attendance.some(a=>a.visit_id===v.id&&a.present);
export function registrationOverview(data,profile,type,from,to){
 const classes=data.classes.filter(c=>c.active&&c.kind!=='Local'&&canActivity(profile,data,type,c.id));
 return classes.map(c=>{
  const all=data.visits.filter(v=>v.class_id===c.id&&v.activity_type===type&&!v.eliminado_el);
  const visits=all.filter(v=>v.date>=from&&v.date<=to&&v.status!=='suspended');
  const done=visits.filter(v=>recorded(v,data));
  return {...c,scheduled:visits.length,registered:done.length,pending:visits.filter(v=>!recorded(v,data)).length,
   participants:data.attendance.filter(a=>a.present&&visits.some(v=>v.id===a.visit_id)).length,
   never:!all.some(v=>v.status!=='suspended'&&recorded(v,data))};
 });
}
