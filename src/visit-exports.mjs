import {dateLabel,ROLES,normalize} from './domain.mjs';
export function saveFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const safeName=s=>normalize(s).replace(/[^A-Z0-9 _-]/g,'').replace(/\s+/g,'-');
export const letterFilename=l=>`${l.date}_${safeName(l.group)}_${safeName(l.class_name)}_${safeName(l.role)}_${safeName(l.name)}_${safeName(l.folio)}.pdf`;
const cached=new Map();
async function imageData(path){if(!cached.has(path))cached.set(path,(async()=>{const image=new Image();image.src=path;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return {data:c.toDataURL('image/png'),width:c.width,height:c.height,image};})());return cached.get(path);}
export const letterTemplate=l=>l.group==='Señoritas'?'women':l.role==='Dirección del coro'?'choir':'young';
const templates={
 young:{prefix:'Hno.',greeting:'Estimado',group:'Jóvenes',contact:['Hno Marco Lara: +5698232544','Hno Jonathan Núñez: +56982450670'],signer:'Hno. Marco Lara Larenas',title:'Jefe General JUPA',signature:'/cartas/firma-jovenes.png',verse:'“Ninguno tenga en poco tu juventud, sino sé ejemplo de los creyentes en palabra, conducta, amor, espíritu, fe y pureza.”',citation:'1 Timoteo 4:12'},
 choir:{prefix:'Hno.',greeting:'Estimado',group:'Jóvenes',contact:['Hno Gerard Rosales: +56953852982','Hno Luis Cerda: +56945617856'],signer:'Hno. Gerard Rosales',title:'Jefe Coro JUPA',verse:'“Bendeciré a Jehová en todo tiempo; Su alabanza estará de continuo en mi boca.”',citation:'Salmos 34:1'},
 women:{prefix:'Hna.',greeting:'Estimada',group:'Señoritas',contact:['Hna Mariela Vargas: +56973201959','Hna Evelyn Lobos: +56987562597','Hna Paulina Tapia: +56990326448'],signer:'Hna. Mariela Vargas',title:'Jefa General Señoritas',signature:'/cartas/firma-senoritas.png',verse:'“Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.”',citation:'Josué 1:9'}
};
export async function letterPDF(letter){
 const {jsPDF}=await import('jspdf'),pdf=new jsPDF({format:'a4',compress:true}),t=templates[letterTemplate(letter)],logo=await imageData('/logo-completo.webp');
 pdf.setFont('times','normal');pdf.setTextColor(20);pdf.setFontSize(11);
 pdf.addImage(logo.data,'PNG',24,26,39,39*logo.height/logo.width);
 pdf.text(['Iglesia Metodista Pentecostal de Chile','Pastorado de Puente Alto','Juventud Unida de Puente Alto'],69,29,{lineHeightFactor:1.3});
 pdf.text('Folio '+letter.folio,185,56,{align:'right'});pdf.text(dateLabel(letter.issued,{day:'numeric',month:'long',year:'numeric'}),185,62,{align:'right'});
 let y=75;
 const paragraph=(text,space=6)=>{const lines=pdf.splitTextToSize(text,162);pdf.text(lines,24,y,{lineHeightFactor:1.35});y+=lines.length*5.25+space;};
 paragraph(`${t.prefix} ${letter.name}   Presente`,1);paragraph(`${t.greeting} en el Señor`,5);
 paragraph(`Por la presente le saluda confiando goce de las más ricas bendiciones en Cristo Jesús, junto a su familia y grupo de ${t.group} al cual pertenece.`,2);
 paragraph(letterTemplate(letter)==='women'?'Además de indicarle que por misericordia de Dios le corresponde el siguiente trabajo como clase:':'Además de indicarle que por misericordia de Dios le corresponde el siguiente servicio:',4);
 const role=letter.role==='Coordinación'?(letter.group==='Señoritas'?'Coordinadora':'Coordinador'):letter.role==='Predicación'?(letter.group==='Señoritas'?'Predicadora':'Predicador'):(letter.group==='Señoritas'?'Dirección del coro':'Jefe Coro');
 const columns=[{x:26,w:45,label:'Función',value:role},{x:74,w:63,label:'Lugar',value:letter.class_name},{x:140,w:46,label:'Fecha',value:dateLabel(letter.date,{day:'numeric',month:'long'})}];
 let height=0;pdf.setFont('times','bold');for(const c of columns)pdf.text(c.label,c.x,y);pdf.setFont('times','normal');y+=6;
 for(const c of columns){const lines=pdf.splitTextToSize(c.value,c.w);height=Math.max(height,lines.length*5.25);pdf.text(lines,c.x,y,{lineHeightFactor:1.35});}y+=height+11;
 paragraph('Ante cualquier duda o consulta favor contactarse con uno de nuestros hermanos detallados a continuación:',4);
 for(const contact of t.contact)paragraph(contact,0);
 y+=6;paragraph('Rogando a nuestro Salvador le revista de su gracia se despide muy atentamente.',0);
 // La firma se mantiene separada del texto para que ambos resulten legibles.
 const signatureY=Math.max(211,y+8);
 if(t.signature){const signature=await imageData(t.signature);const height=Math.min(22,58*signature.height/signature.width);const width=height*signature.width/signature.height;pdf.addImage(signature.data,'PNG',105-width/2,signatureY,width,height);}
 const nameY=Math.max(240,signatureY+27);pdf.text([t.signer,t.title,'Catedral Evangélica de Puente Alto'],105,nameY,{align:'center',lineHeightFactor:1.2});
 pdf.setFontSize(10);const verse=pdf.splitTextToSize(t.verse,166);pdf.text(verse,105,274,{align:'center',lineHeightFactor:1.15});pdf.text(t.citation,105,274+verse.length*4.1+2,{align:'center'});
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
