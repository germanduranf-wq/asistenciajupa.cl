import {belongsToClass,localActivity} from './access.mjs';
import {CATEGORIES} from './domain.mjs';
// La categoría es el dato explícito disponible; nunca inferirlo por el nombre.
export function matchesAttendanceGender(person,gender){
 if(gender==='all')return true;
 const index=CATEGORIES.indexOf(person.category);
 if(index<0)return false;
 return gender==='men'?index%2===0:gender==='women'?index%2===1:false;
}
export const initialAttendanceGender=visit=>visit.group==='Jóvenes'?'men':visit.group==='Señoritas'?'women':'all';
const leaders=['Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas'];
export function rosterOptions(visit){
 if(['ensayo_coro','evento_coro'].includes(visit.activity_type))return [['choir','Solo Coro JUPA'],['all','Todos · incluir invitados']];
 if(localActivity(visit.activity_type))return [['class','Mi clase'],['all','Todos · incluir invitados']];
 if(['reunion_encargados','devocional','servicio_jupa'].includes(visit.activity_type))return [['leaders','Encargados y ayudantes'],['bodies','Colaboradores y cuerpos'],['all','Todos']];
 return [['all','Todos']];
}
export function matchesRoster(p,mode,visit,data){
 if(mode==='class')return belongsToClass(p,visit.class_id);
 if(mode==='choir')return (p.body_ids||[]).some(id=>data.bodies.some(b=>b.id===id&&b.name==='Coro JUPA'));
 if(mode==='leaders')return leaders.includes(p.category);
 if(mode==='bodies')return ['Colaborador','Colaboradora'].includes(p.category)||(p.body_ids||[]).length>0;
 return mode==='all';
}
// Explicit allowlist: never spread a full participant into the guest directory.
export function basicParticipant(p){return Object.fromEntries(['id','first_name','last_name','class_id','secondary_class_id','category','body_ids','active','photo_path'].map(k=>[k,p[k]]));}
