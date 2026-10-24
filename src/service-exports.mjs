import {SUMMARY_TYPES,SUMMARY_HEADERS,summaryRow,attendanceSummary,participantColumns,participantRow,attendanceExportRows,canSummary,classNames} from './service-summary.mjs';
import {canActivity,activityLabel} from './access.mjs';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const dateValue=v=>v?new Date(`${v.slice(0,10)}T12:00:00Z`):null;
const stamp=()=>new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'medium'}).format(new Date());
export async function workbookBase(profile){
 const {default:Excel}=await import('exceljs');const book=new Excel.Workbook();
 book.creator=`${profile?.name||'Usuario'} (${profile?.username||profile?.role||''})`;book.created=new Date();return book;
}
async function readLogo(){
 const image=new Image();image.src='/logo-completo.webp';await image.decode();const canvas=document.createElement('canvas');canvas.width=600;canvas.height=Math.round(600*image.height/image.width);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
function sheet(book,name,title,headers,rows,{logo,notes=''}={}){
 const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:8,showGridLines:false}],pageSetup:{orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:8'}});
 ws.columns=headers.map((label,i)=>({width:i===0?14:/Observaciones|Oportunidades|Tema|Cuerpos/.test(label)?42:28}));
 const end=headers.length;ws.mergeCells(1,1,3,Math.min(2,end));ws.getRow(1).height=24;ws.getRow(2).height=24;ws.getRow(3).height=24;
 if(logo)ws.addImage(book.addImage({base64:logo,extension:'png'}),{tl:{col:0,row:0},ext:{width:180,height:76}});
 ws.mergeCells(1,3,3,end);ws.getCell(1,3).value=title;ws.getCell(1,3).font={name:'Calibri',size:19,bold:true,color:{argb:'FF292E77'}};ws.getCell(1,3).alignment={vertical:'middle',wrapText:true};
 ws.mergeCells(5,1,5,end);ws.getCell(5,1).value=`Exportado por ${book.creator} · ${stamp()} · America/Santiago`;ws.getRow(5).height=28;
 ws.mergeCells(6,1,6,end);ws.getCell(6,1).value=notes;ws.getCell(6,1).alignment={wrapText:true,vertical:'middle'};ws.getRow(6).height=42;
 const h=ws.getRow(8);h.values=headers;h.height=52;h.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB8CBE7'}};c.font={name:'Calibri',bold:true,color:{argb:'FF172847'}};c.alignment={vertical:'middle',wrapText:true};});
 for(const values of rows){const row=ws.addRow(values);row.height=Math.max(34,Math.min(180,18*Math.max(...values.map(v=>Math.ceil(String(v??'').length/30)+String(v??'').split('\n').length-1))));row.eachCell({includeEmpty:true},(c,col)=>{c.font={name:'Calibri',size:11};c.alignment={vertical:'top',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFD9E1EC'}}};if(row.number%2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6FC'}};if(c.value instanceof Date)c.numFmt='dd/mm/yyyy';if(typeof c.value==='number')c.numFmt='#,##0';});}
 ws.autoFilter={from:{row:8,column:1},to:{row:8,column:end}};ws.headerFooter.oddFooter=`&LJUPA · Uso interno&RPágina &P de &N`;return ws;
}
export async function buildServiceWorkbook(data,summaries,profile,year,{logo}={}){
 const book=await workbookBase(profile);
 for(const [type,name]of Object.entries(SUMMARY_TYPES)){
  const visits=data.visits.filter(v=>v.date.startsWith(year)&&v.status!=='suspended'&&canSummary(profile,data,v,'export')).filter(v=>v.activity_type===type).sort((a,b)=>a.date.localeCompare(b.date));
  const rows=visits.map(v=>{const row=summaryRow(v,summaries.find(r=>String(r.actividad_id)===v.id),data);row[0]=dateValue(row[0]);return row;});
  sheet(book,type==='servicio_jupa'?'Servicio general':type==='devocional'?'Devocionales':'Reuniones y ensayos',`${name} ${year}`,SUMMARY_HEADERS[type],rows,{logo,notes:'Los totales manuales no se suman al registro por nombre. Vacío = no informado. Cero = total confirmado sin asistentes. Ensayos: asistencia total del coro; la reunión de encargados se cuenta aparte.'});
 }
 const devotional=data.visits.filter(v=>v.date.startsWith(year)&&v.activity_type==='devocional'&&v.status!=='suspended'&&canSummary(profile,data,v,'export'));
 const requests=devotional.flatMap(v=>{const s=summaries.find(r=>String(r.actividad_id)===v.id);return data.classes.filter(c=>c.active||s?.solicitaron_tema_ids?.map(String).includes(c.id)).map(c=>[dateValue(v.date),c.name,s?s.solicitaron_tema_ids.map(String).includes(c.id)?'Sí':'No registrada':'Resumen pendiente',s?.tema_biblico||'']);});
 sheet(book,'Solicitudes tema bíblico','Solicitudes del tema bíblico '+year,['Fecha del devocional','Clase','Solicitud registrada','Tema bíblico'],requests,{logo,notes:'“No registrada” significa que Secretaría no ha registrado una solicitud de esa clase. Un resumen pendiente no se interpreta como falta de solicitud.'});
 return book;
}
export async function buildAttendanceWorkbook(data,visit,profile,{logo}={}){
 if(!canActivity(profile,data,visit.activity_type||'visita',visit.class_id,'export'))throw Error('No tienes permiso para exportar esta actividad.');
 const book=await workbookBase(profile),stats=attendanceSummary(data,visit.id);
 const rows=attendanceExportRows(data,visit).map(r=>{r[0]=dateValue(r[0]);r[14]=dateValue(r[14]);r[18]=dateValue(r[18]);return r;});
 sheet(book,'Asistentes',`${activityLabel(visit)} · ${visit.date}`,['Fecha de actividad','Participante','Clase contabilizada','Categoría al asistir','Cuerpos','Origen de cuerpos',...participantColumns(data)],rows,{logo,notes:`${stats.total} asistentes registrados. Solo incluye marcas guardadas. La clase y categoría contabilizadas conservan el historial; los datos de ficha están identificados como actuales.`});
 sheet(book,'Clases',`Participación por clase · ${visit.date}`,['Clase','Asistentes registrados','Estado'],stats.classes.map(c=>[c.name,c.count,c.count?'Con asistentes':'Sin asistentes registrados']),{logo});
 sheet(book,'Cuerpos',`Participación por cuerpo · ${visit.date}`,['Cuerpo','Asistentes registrados','Criterio'],stats.bodies.map(b=>[b.name,b.count,stats.legacyBodies?'Incluye cuerpos actuales de marcas antiguas':'Cuerpos al registrar']),{logo,notes:'Una persona puede integrar varios cuerpos. No sumar estas filas para obtener el total de personas.'});
 return book;
}
export async function buildParticipantsWorkbook(data,profile,{logo}={}){
 if(profile?.role!=='admin'||!profile.active||profile.must_change_password)throw Error('Solo el administrador puede exportar el padrón completo.');
 const book=await workbookBase(profile),people=data.people.filter(p=>!p.historico).sort((a,b)=>a.last_name.localeCompare(b.last_name));
 sheet(book,'Participantes','Registro completo de participantes JUPA',participantColumns(data),people.map(p=>{const r=participantRow(p,data);r[8]=dateValue(r[8]);r[12]=dateValue(r[12]);return r;}),{logo,notes:`${people.length} fichas, incluidos inactivos y registros fusionados. La referencia de foto es su ruta privada, no un enlace público.`});return book;
}
async function download(book,filename){const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:MIME})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportServiceWorkbook(data,summaries,profile,year){await download(await buildServiceWorkbook(data,summaries,profile,year,{logo:await readLogo()}),`Resumenes-JUPA-${year}.xlsx`);}
export async function exportAttendanceList(data,visit,profile){await download(await buildAttendanceWorkbook(data,visit,profile,{logo:await readLogo()}),`Asistentes-${visit.activity_type||'visita'}-${visit.date}-${visit.id}.xlsx`);}
export async function exportParticipants(data,profile){await download(await buildParticipantsWorkbook(data,profile,{logo:await readLogo()}),'Participantes-JUPA.xlsx');}
