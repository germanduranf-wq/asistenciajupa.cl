import {dateLabel,ROLES,normalize} from './domain.mjs';
export function saveFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const safeName=s=>normalize(s).replace(/[^A-Z0-9 _-]/g,'').replace(/\s+/g,'-');
export const letterFilename=l=>`${l.date}_${safeName(l.group)}_${safeName(l.class_name)}_${safeName(l.role)}_${safeName(l.name)}_${safeName(l.folio)}.pdf`;
const cached=new Map();
async function imageData(path){if(!cached.has(path))cached.set(path,(async()=>{const image=new Image();image.src=path;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return {data:c.toDataURL('image/png'),width:c.width,height:c.height,image};})());return cached.get(path);}
export {letterTemplate} from './letter-model.mjs';
import {letterTemplate,letterTemplates} from './letter-model.mjs';
const fonts=new Map();
async function fontData(style){
 if(!fonts.has(style))fonts.set(style,(async()=>{
  const response=await fetch(`/cartas/fuentes/EBGaramond-${style}.ttf`);
  if(!response.ok)throw Error('No se pudo cargar la tipografía de las cartas. Recarga e intenta nuevamente.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
 })().catch(error=>{fonts.delete(style);throw error;}));
 return fonts.get(style);
}
export async function letterPDF(letter){
 const {jsPDF}=await import('jspdf'),pdf=new jsPDF({format:'a4',compress:true});
 const t=letterTemplates[letterTemplate(letter)];
 const [regular,bold,logo,signature]=await Promise.all([fontData('Regular'),fontData('Bold'),imageData('/cartas/logo-jupa-cartas.png'),imageData(t.signature)]);
 pdf.addFileToVFS('EBGaramond-Regular.ttf',regular);pdf.addFont('EBGaramond-Regular.ttf','EBGaramond','normal');
 pdf.addFileToVFS('EBGaramond-Bold.ttf',bold);pdf.addFont('EBGaramond-Bold.ttf','EBGaramond','bold');
 pdf.setProperties({title:`${letter.folio} · ${letter.role} · ${letter.name}`,author:'Juventud Unida de Puente Alto',subject:'Asignación de responsabilidad en visita JUPA'});
 pdf.setTextColor(20);pdf.setFont('EBGaramond','normal');pdf.setFontSize(11);
 pdf.addImage(logo.data,'PNG',25,25,42,42*logo.height/logo.width);
 pdf.setFont('EBGaramond','bold');pdf.text('Iglesia Metodista Pentecostal de Chile',185,29,{align:'right'});
 pdf.setFont('EBGaramond','normal');pdf.text(['Pastorado de Puente Alto','Juventud Unida de Puente Alto'],185,34,{align:'right',lineHeightFactor:1.25});
 pdf.text('Folio N° '+letter.folio,185,56,{align:'right'});
 pdf.text(dateLabel(letter.issued,{day:'numeric',month:'long',year:'numeric'}),185,62,{align:'right'});
 const role=letter.role==='Coordinación'?(letter.group==='Señoritas'?'Coordinadora':'Coordinador'):letter.role==='Predicación'?(letter.group==='Señoritas'?'Predicadora':'Predicador'):(letter.group==='Señoritas'?'Dirección del coro':'Jefe Coro');
 // Medir primero evita que nombres largos alcancen la firma o salgan de la hoja.
 function body(size,draw){
  let y=76;const line=size*0.455;
  pdf.setFontSize(size);pdf.setFont('EBGaramond','normal');
  const paragraph=(text,space=4,weight='normal')=>{pdf.setFont('EBGaramond',weight);const lines=pdf.splitTextToSize(text,160);if(draw)pdf.text(lines,25,y,{lineHeightFactor:1.29});y+=lines.length*line+space;};
  paragraph(`${t.prefix} ${letter.name}`,2,'bold');paragraph(`${t.greeting} en el Señor:`,5);
  paragraph(`Por la presente le saluda confiando goce de las más ricas bendiciones en Cristo Jesús, junto a su familia y ${t.community} al cual pertenece.`);
  paragraph(`Además de indicarle que por misericordia de Dios le ${letterTemplate(letter)==='young'?'corresponden':'corresponde'} ${t.assignment}:`,6);
  const columns=[{x:25,w:40,label:'Función',value:role},{x:70,w:62,label:'Lugar',value:letter.class_name},{x:139,w:46,label:'Fecha',value:dateLabel(letter.date,{day:'numeric',month:'long'})}];
  pdf.setFont('EBGaramond','bold');if(draw)for(const c of columns)pdf.text(c.label,c.x,y);
  y+=line+1;pdf.setFont('EBGaramond','normal');let height=0;
  for(const c of columns){const lines=pdf.splitTextToSize(c.value,c.w);height=Math.max(height,lines.length*line);if(draw)pdf.text(lines,c.x,y,{lineHeightFactor:1.29});}y+=height+8;
  paragraph(t.contactIntro,3);for(const contact of t.contacts)paragraph(contact,0);
  y+=5;paragraph('Rogando a nuestro Salvador le revista de su gracia se despide muy atentamente,',0);
  return y;
 }
 let size=11;while(body(size,false)>207&&size>9.5)size-=0.25;
 if(body(size,false)>207)throw Error('El nombre o lugar es demasiado extenso para la carta. Revisa los datos antes de exportar.');
 body(size,true);
 // Mantener las firmas originales, con su proporción y sin reconstruir sus trazos.
 const sh=48,sw=sh*signature.width/signature.height;
 pdf.addImage(signature.data,'PNG',105-sw/2,200,sw,sh);
 pdf.setFontSize(11);pdf.setFont('EBGaramond','bold');pdf.text(t.signer,105,251,{align:'center'});
 pdf.setFont('EBGaramond','normal');pdf.text(t.titles,105,256,{align:'center',lineHeightFactor:1.15});
 if(t.initials){pdf.setFontSize(8);pdf.text(t.initials,25,267);}
 pdf.setFontSize(9.5);const verse=pdf.splitTextToSize(t.verse,160);pdf.text(verse,105,278,{align:'center',lineHeightFactor:1.15});
 pdf.setFont('EBGaramond','bold');pdf.text(t.citation,105,278+verse.length*3.85+1,{align:'center'});
 return pdf.output('arraybuffer');
}
export function summaryRows(visits){
 const friday=visits.filter(v=>new Date(v.date+'T12:00:00Z').getUTCDay()===5);
 return [...new Set(friday.map(v=>v.date))].sort().flatMap(date=>{const young=friday.filter(v=>v.date===date&&v.group==='Jóvenes'),women=friday.filter(v=>v.date===date&&v.group==='Señoritas');return Array.from({length:Math.max(young.length,women.length)},(_,i)=>({date,young:young[i],women:women[i]}));});
}
function wrap(ctx,text,max){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>max&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);return lines;}
async function summaryCanvas(rows,month,profile,page,total){
 const c=document.createElement('canvas');c.width=1600;const ctx=c.getContext('2d');
 const measures=rows.map(row=>{let height=90;for(const v of [row.young,row.women]){if(!v)continue;let h=90;ctx.font='bold 30px Arial';h+=wrap(ctx,v.class_name,620).length*35;for(const role of ROLES){ctx.font='24px Arial';h+=27+wrap(ctx,v.responsables.find(r=>r.role===role)?.name||'Por asignar',620).length*29+7;}height=Math.max(height,h);}return height+20;});
 c.height=Math.max(2200,350+measures.reduce((a,b)=>a+b,0)+125);ctx.fillStyle='#eef4f8';ctx.fillRect(0,0,c.width,c.height);
 const logo=await imageData('/logo-completo.webp');ctx.drawImage(logo.image,75,45,320,320*logo.height/logo.width);
 ctx.fillStyle='#292e77';ctx.font='bold 54px Arial';ctx.fillText('RESPONSABILIDADES',450,100);ctx.font='32px Arial';ctx.fillText('Visitas de jóvenes y señoritas',450,150);ctx.font='bold 48px Arial';ctx.fillText(dateLabel(month+'-01',{day:undefined,month:'long',year:'numeric'}).toUpperCase(),75,245);
 ctx.font='bold 32px Arial';ctx.fillText('JÓVENES',110,310);ctx.fillText('SEÑORITAS',850,310);
 let y=340;
 rows.forEach((row,i)=>{const height=measures[i];[row.young,row.women].forEach((v,column)=>{const x=75+column*740,w=710;ctx.fillStyle='#fff';ctx.fillRect(x,y,w,height-16);ctx.fillStyle=column?'#17a7c8':'#333783';ctx.fillRect(x,y,8,height-16);ctx.font='bold 30px Arial';ctx.fillText(dateLabel(row.date,{day:'numeric',month:'long'}),x+30,y+45);let cy=y+82;
  if(!v){ctx.fillStyle='#667387';ctx.font='24px Arial';ctx.fillText('Sin visita programada',x+30,cy);return;}
  ctx.fillStyle='#202a42';ctx.font='bold 30px Arial';for(const line of wrap(ctx,v.class_name,620)){ctx.fillText(line,x+30,cy);cy+=35;}
  if(v.status==='suspended'){ctx.fillStyle='#b34242';ctx.font='bold 28px Arial';ctx.fillText('SUSPENDIDA',x+30,cy+5);return;}
  for(const role of ROLES){ctx.fillStyle='#69758b';ctx.font='20px Arial';ctx.fillText(role.toUpperCase(),x+30,cy+10);cy+=37;ctx.fillStyle='#202a42';ctx.font='24px Arial';for(const line of wrap(ctx,v.responsables.find(r=>r.role===role)?.name||'Por asignar',620)){ctx.fillText(line,x+30,cy);cy+=29;}cy+=7;}
 });y+=height;});
 ctx.fillStyle='#69758b';ctx.font='24px Arial';const time=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}).format(new Date());ctx.fillText('JUPA · Uso interno · '+(page?`Página ${page}/${total}`:''),75,c.height-72);ctx.fillText(`Exportado por ${profile.name||profile.username||'Usuario'} · ${time}`,75,c.height-34);return c;
}
export async function exportResponsibilities(visits,month,type,profile){
 const rows=summaryRows(visits);if(!rows.length)throw Error('No hay visitas de viernes para este mes.');
 if(type==='png'){const canvas=await summaryCanvas(rows,month,profile);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('No se pudo generar la imagen.');saveFile(blob,'Responsabilidades-JUPA-'+month+'.png');return;}
 const {jsPDF}=await import('jspdf'),pdf=new jsPDF({compress:true});const pages=Math.ceil(rows.length/5);
 for(let i=0;i<pages;i++){if(i)pdf.addPage();const c=await summaryCanvas(rows.slice(i*5,i*5+5),month,profile,i+1,pages);const scale=Math.min(190/c.width,277/c.height);pdf.addImage(c.toDataURL('image/png'),'PNG',(210-c.width*scale)/2,10,c.width*scale,c.height*scale);}
 pdf.save('Responsabilidades-JUPA-'+month+'.pdf');
}
