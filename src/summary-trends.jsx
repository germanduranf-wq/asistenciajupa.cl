import React from 'react';
import {recorded} from './navigation.mjs';
import {attendanceSummary,linkedAttendance} from './service-summary.mjs';
export function evolutionRows(visits,rows,data){
 return [...visits].filter(v=>v.status!=='suspended').sort((a,b)=>a.date.localeCompare(b.date)).map(v=>{
  const s=rows.find(r=>String(r.actividad_id)===v.id),dev=data.visits.find(d=>v.evento_id&&d.evento_id===v.evento_id&&d.activity_type==='devocional')||data.visits.find(d=>d.id===String(s?.devocional_id));
  return {id:v.id,date:v.date,count:recorded(v,data)?attendanceSummary(data,v.id).total:null,
   morning:dev&&recorded(dev,data)?linkedAttendance(data,dev.id)?.leaders??null:null,
   point:s?.total_punto??null,afternoon:s?.total_general??null};
 });
}
export function SummaryTrends({visits,rows,data,type}){
 const points=evolutionRows(visits,rows,data),series=type==='servicio_jupa'?[['morning','Encargados y ayudantes en devocional','#333783'],['point','Total punto de predicación','#178575'],['afternoon','Total general tarde','#b65c18']]:[['count','Asistentes registrados','#333783']];
 const max=Math.max(1,...points.flatMap(p=>series.map(([key])=>p[key]??0)));
 const x=i=>points.length>1?50+i*600/(points.length-1):350,y=n=>200-n/max*155;
 return <section className="panel summary-trends"><h2>Evolución del período</h2><p>Solo se comparan conteos informados. Los espacios sin datos no se convierten en cero.</p>{points.length?<><svg role="img" aria-label="Evolución de asistencia por fecha. Los valores también se muestran en la tabla y en los indicadores." viewBox="0 0 710 255"><line x1="50" y1="200" x2="650" y2="200" stroke="#cdd4df"/><text x="12" y="50">{max}</text><text x="24" y="204">0</text>{series.map(([key,label,color])=><g key={key}><title>{label}</title>{points.map((p,i)=>p[key]===null?null:<React.Fragment key={p.id}>{i>0&&points[i-1][key]!==null&&<line x1={x(i-1)} y1={y(points[i-1][key])} x2={x(i)} y2={y(p[key])} stroke={color} strokeWidth="2"/>}<circle cx={x(i)} cy={y(p[key])} r="4" fill={color}><title>{p.date}: {p[key]}</title></circle></React.Fragment>)}</g>)}{points.map((p,i)=>(points.length<=12||i===0||i===points.length-1)&&<text key={p.id} x={x(i)} y="230" textAnchor="middle" fontSize="11">{p.date.slice(5)}</text>)}</svg><div className="trend-metrics">{series.map(([key,label,color])=>{const values=points.map(p=>p[key]).filter(v=>v!==null),change=values.length>1?values.at(-1)-values[0]:null;return <div key={key} style={{borderTopColor:color}}><strong>{label}</strong><p>{values.length?`Promedio: ${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)}`:'Sin datos informados'}</p><small>{change===null?'Se requieren al menos dos registros para comparar.':`Primer a último registro: ${change>0?'+':''}${change} personas.`}</small></div>;})}</div></>:<p>No hay actividades en este período.</p>}</section>;
}
