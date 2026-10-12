import {fullName} from './domain.mjs';
import {MODULES,activityLabel} from './access.mjs';
const colors={navy:'#292e77',cyan:'#20b9e7',pale:'#eef5fa',ink:'#243047'};
export function reportMetadata(filters,data,profile,now=new Date()) {
 return { title:'Informe de asistencia JUPA', author:`${profile?.name||'Usuario'} (${profile?.username||profile?.role||'sin usuario'})`, time:new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'medium'}).format(now), filters:[`Período: ${filters.from} al ${filters.to}`,`Actividad: ${MODULES[filters.activity_type]||'Todas las autorizadas'}`,`Grupo: ${filters.group||'Jóvenes y señoritas'}`,`Clase: ${data.classes.find(c=>c.id===filters.class_id)?.name||'Todas las autorizadas'}`,`Categoría: ${filters.category||'Todas'}`,`Vista: ${{comparison:'Comparativa',total:'Total conjunto',separate:'Grupos separados'}[filters.view]||'Comparativa'}`] };
}
export function reportRows(stats,data) {
 return stats.rows.map(a=>{const v=data.visits.find(v=>v.id===a.visit_id),p=data.people.find(p=>p.id===a.person_id);return [v.date,activityLabel(v),data.classes.find(c=>c.id===v.class_id)?.name||'',data.classes.find(c=>c.id===(v.venue_class_id||v.class_id))?.name||'',fullName(p),data.classes.find(c=>c.id===a.class_id)?.name||'',a.category];});
}
async function logoPng() {
 const im=new Image();im.src='/logo-completo.webp';await im.decode();const c=document.createElement('canvas');c.width=900;c.height=Math.round(900*im.height/im.width);c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/png');
}
export function chartImage(stats, view='comparison') {
 const rows=stats.comparison||[], separated=view==='separate';
 const c=document.createElement('canvas');c.width=1200;c.height=Math.max(250,(rows.length*(separated?58:42))+100);const ctx=c.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=colors.ink;ctx.font='bold 26px Arial';ctx.fillText('Evolución mensual · asistencias',30,35);
 const series=view==='total'?[['total','Todos',colors.navy]]:[['young','Jóvenes',colors.navy],['women','Señoritas',colors.cyan]];
 series.forEach(([,label,color],i)=>{ctx.fillStyle=color;ctx.fillRect(660+i*240,20,18,18);ctx.font='20px Arial';ctx.fillText(label,688+i*240,36);});
 const max=Math.max(1,...rows.flatMap(r=>series.map(([k])=>r[k])));
 rows.forEach((r,i)=>{const y=85+i*(separated?58:42);ctx.fillStyle=colors.ink;ctx.font='19px Arial';ctx.fillText(r.month,30,y+12);series.forEach(([k,,color],j)=>{const yy=y+j*(separated?23:16),w=r[k]/max*930;ctx.fillStyle=colors.pale;ctx.fillRect(150,yy,930,separated?19:13);ctx.fillStyle=color;ctx.fillRect(150,yy,w,separated?19:13);ctx.font='16px Arial';ctx.fillText(String(r[k]),1090,yy+13);});});
 if(!rows.length){ctx.fillStyle=colors.ink;ctx.font='24px Arial';ctx.fillText('Sin asistencias en el período seleccionado',30,120);}
 return c.toDataURL('image/png');
}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportExcel(stats,data,filters,profile) {
 const imported=await import('exceljs');const Excel=imported.default||imported;const book=new Excel.Workbook();
 const meta=reportMetadata(filters,data,profile);book.creator=meta.author;book.created=new Date();book.subject=meta.title;
 const summary=book.addWorksheet('Resumen',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 summary.columns=Array.from({length:8},()=>({width:16}));summary.addImage(book.addImage({base64:await logoPng(),extension:'png'}),{tl:{col:0,row:0},ext:{width:320,height:135}});
 summary.mergeCells('D2:H3');summary.getCell('D2').value=meta.title;summary.getCell('D2').font={size:22,bold:true,color:{argb:'FF292E77'}};summary.getCell('D2').alignment={wrapText:true,vertical:'middle'};
 meta.filters.forEach((v,i)=>{summary.mergeCells(9+i,1,9+i,8);summary.getCell(9+i,1).value=v;});
 summary.mergeCells('A16:H16');summary.getCell('A16').value=`Exportado por ${meta.author} · ${meta.time} · America/Santiago`;summary.getCell('A16').alignment={wrapText:true};summary.getRow(16).height=32;
 summary.addRow([]);summary.getRow(18).values=['Asistencias',stats.total,'Personas únicas',stats.unique,'Actividades',stats.visits.length];summary.getRow(18).font={bold:true,size:12,color:{argb:'FF292E77'}};
 summary.addImage(book.addImage({base64:chartImage(stats,filters.view),extension:'png'}),{tl:{col:0,row:20},ext:{width:760,height:Math.max(180,(stats.comparison.length*(filters.view==='separate'?58:42)+100)*760/1200)}});
 const tableStart=23+Math.ceil(Math.max(180,(stats.comparison.length*(filters.view==='separate'?58:42)+100)*760/1200)/20);
 const summaries=[['Clase','Asistencias'],...stats.classes.map(c=>[c.name,c.count]),[],['Mes','Jóvenes','Señoritas','Total'],...stats.comparison.map(m=>[m.month,m.young,m.women,m.total])];
 summaries.forEach((r,i)=>{summary.getRow(tableStart+i).values=r; if(r[0]==='Clase'||r[0]==='Mes')paintHeader(summary.getRow(tableStart+i));});
 const details=book.addWorksheet('Asistencias',{views:[{state:'frozen',ySplit:5}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'}});
 details.columns=[13,30,26,26,36,26,28].map(width=>({width}));details.mergeCells('A1:G1');details.getCell('A1').value=meta.title;details.getCell('A1').font={bold:true,size:18,color:{argb:'FF292E77'}};
 details.mergeCells('A2:G2');details.getCell('A2').value=meta.filters.join(' · ');details.getCell('A2').alignment={wrapText:true};details.getRow(2).height=48;
 details.mergeCells('A3:G3');details.getCell('A3').value=`Exportado por ${meta.author} · ${meta.time} · America/Santiago`;
 details.addTable({name:'AsistenciasJUPA',ref:'A5',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:['Fecha','Actividad','Clase organizadora o destino','Lugar de realización','Participante','Clase contabilizada','Categoría histórica'].map(name=>({name,filterButton:true})),rows:reportRows(stats,data)});
 details.eachRow((row,n)=>{row.alignment={vertical:'middle',wrapText:true};if(n>5)row.height=32;});
 const events=book.addWorksheet('Actividades');events.columns=[14,32,28,28,24,50,15].map(width=>({width}));events.addRow(['Fecha','Actividad','Clase organizadora o destino','Lugar','Estado','Motivo de suspensión','Asistentes']);paintHeader(events.getRow(1));
 for(const v of stats.visits)events.addRow([v.date,activityLabel(v),data.classes.find(c=>c.id===v.class_id)?.name||'',data.classes.find(c=>c.id===(v.venue_class_id||v.class_id))?.name||'',({pending:'Pendiente',held:'Realizada',suspended:'Suspendida'})[v.status]||'Histórica',v.suspension_reason||'',stats.rows.filter(a=>a.visit_id===v.id).length]);
 events.autoFilter='A1:G1';events.views=[{state:'frozen',ySplit:1}];events.eachRow(r=>{r.alignment={wrapText:true,vertical:'middle'};r.height=32;});
 for(const ws of book.worksheets)ws.headerFooter.oddFooter=`&LJUPA · ${meta.author.replaceAll('&','&&')} · ${meta.time}&RPágina &P de &N`;
 const buffer=await book.xlsx.writeBuffer();saveBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`JUPA-${filters.from}-${filters.to}.xlsx`);
}
function paintHeader(row){row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF292E77'}};c.font={color:{argb:'FFFFFFFF'},bold:true};});row.height=28;}
export async function exportPDF(stats,data,filters,profile) {
 const {jsPDF}=await import('jspdf');const doc=new jsPDF(),meta=reportMetadata(filters,data,profile),logo=await logoPng();let y=48;
 const header=()=>{doc.addImage(logo,'PNG',16,10,60,25);doc.setFontSize(17);doc.setTextColor(colors.navy);doc.text('Informe de asistencia',85,24);doc.setDrawColor(colors.cyan);doc.line(16,39,194,39);};header();
 const page=()=>{doc.addPage();header();y=48;};
 const text=(s,size=10,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(colors.ink);const lines=doc.splitTextToSize(String(s),178);for(const line of lines){if(y>265)page();doc.text(line,16,y);y+=size*.45+1;}y+=3;};
 meta.filters.forEach(v=>text(v));text(`${stats.total} asistencias  |  ${stats.unique} personas únicas  |  ${stats.visits.length} actividades`,12,true);
 // Segmenta los meses para conservar legibilidad y evitar imágenes cortadas.
 const months=stats.comparison||[];
 for(let i=0;i<Math.max(1,months.length);i+=6){if(y>115)page();const slice=months.slice(i,i+6);const image=chartImage({...stats,comparison:slice},filters.view);const height=Math.max(250,slice.length*(filters.view==='separate'?58:42)+100)*178/1200;if(y+height>264)page();doc.addImage(image,'PNG',16,y,178,height);y+=height+10;}
 text('Participación por clase',14,true);stats.classes.forEach(c=>text(`${c.name}: ${c.count}`));
 text('Actividades y estado del registro',14,true);stats.visits.forEach(v=>{text(`${v.date} · ${activityLabel(v)} · ${data.classes.find(c=>c.id===v.class_id)?.name||''}`,10,true);text(`Lugar: ${data.classes.find(c=>c.id===(v.venue_class_id||v.class_id))?.name||''} · Estado: ${({pending:'Pendiente',held:'Realizada',suspended:'Suspendida'})[v.status]||'Histórica'} · Asistencias: ${stats.rows.filter(a=>a.visit_id===v.id).length}${v.suspension_reason?' · '+v.suspension_reason:''}`);});
 text('Participación individual',14,true);stats.people.forEach(p=>text(`${fullName(p)}: ${p.count}`));
 const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(95);doc.text(doc.splitTextToSize(`Exportado por ${meta.author} · ${meta.time} · America/Santiago`,178),16,280);doc.text(`Uso interno JUPA · Página ${i} de ${n}`,16,291);}
 doc.save(`JUPA-${filters.from}-${filters.to}.pdf`);
}
