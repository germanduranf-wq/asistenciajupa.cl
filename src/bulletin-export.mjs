export async function exportBulletinPDF(board,month,options){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 let blocks=[],links=[],width=820;
 const canvas=await html2canvas(board,{...options,onclone:doc=>{
  options.onclone(doc);const sheet=doc.querySelector('.bulletin-sheet'),root=sheet.getBoundingClientRect();width=root.width;
  blocks=[...sheet.querySelectorAll('[data-export-card]')].filter(e=>!e.parentElement.closest('[data-export-card]')).map(e=>{const r=e.getBoundingClientRect();return {top:r.top-root.top,bottom:r.bottom-root.top};});
  links=[...sheet.querySelectorAll('a[href]')].map(e=>{const r=e.getBoundingClientRect();return {url:e.href,x:r.left-root.left,y:r.top-root.top,w:r.width,h:r.height};});
 }});
 const groups=[];for(const block of blocks.sort((a,b)=>a.top-b.top)){const previous=groups.at(-1);if(previous&&Math.abs(previous.top-block.top)<2)previous.bottom=Math.max(previous.bottom,block.bottom);else groups.push({...block});}
 const pdf=new jsPDF({compress:true}),scale=canvas.width/width,mm=186/canvas.width;let y=12;
 for(const group of groups){let start=Math.floor(group.top*scale),end=Math.ceil(group.bottom*scale);
  while(start<end){let height=Math.min(end-start,Math.floor(260/mm));if(y+height*mm>277&&y>12){pdf.addPage();y=12;}
   const part=document.createElement('canvas');part.width=canvas.width;part.height=height;part.getContext('2d').drawImage(canvas,0,start,canvas.width,height,0,0,canvas.width,height);pdf.addImage(part.toDataURL('image/png'),'PNG',12,y,186,height*mm);
   for(const a of links){const top=a.y*scale-start;if(/^https:\/\//i.test(a.url)&&top>=0&&top<height)pdf.link(12+a.x*scale*mm,y+top*mm,a.w*scale*mm,Math.min(a.h*scale,height-top)*mm,{url:a.url});}
   y+=height*mm+5;start+=height;
  }
 }
 const count=pdf.getNumberOfPages();for(let i=1;i<=count;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.textWithLink(`Avisos JUPA · ${month} · ${i}/${count}`,12,290,{url:location.origin+'/avisos?mes='+month});}
 pdf.save('Avisos-JUPA-'+month+'.pdf');
}
