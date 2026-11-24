import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES} from '../src/domain.mjs';
import {matchesAttendanceGender,initialAttendanceGender,matchesRoster} from '../src/attendance-roster.mjs';
import {toggleDraft,effectiveMarks,mergeAttendanceSelection} from '../src/attendance-draft.mjs';
import {setup,as,uid} from './support/database.mjs';

test('Género: todas las categorías, sin inferir por nombres ni asignar categorías desconocidas',()=>{
 for(const [i,category] of CATEGORIES.entries()){
  const p={category,first_name:'Nombre indistinto'};
  assert(matchesAttendanceGender(p,'all'));
  assert.equal(matchesAttendanceGender(p,'men'),i%2===0);
  assert.equal(matchesAttendanceGender(p,'women'),i%2===1);
 }
 for(const category of [null,undefined,'Sin categorizar']){
  assert(matchesAttendanceGender({category},'all'));
  assert(!matchesAttendanceGender({category},'men'));
  assert(!matchesAttendanceGender({category},'women'));
 }
 assert.equal(initialAttendanceGender({group:'Jóvenes'}),'men');
 assert.equal(initialAttendanceGender({group:'Señoritas'}),'women');
 assert.equal(initialAttendanceGender({group:'Todos'}),'all');
});
test('Género combina Coro e invitados sin alterar marcas al cambiar de filtro',()=>{
 const people=[{id:'1',category:'Joven',body_ids:['c']},{id:'2',category:'Señorita',body_ids:['c']},{id:'3',category:'Colaboradora',body_ids:[]}];
 const data={bodies:[{id:'c',name:'Coro JUPA'}]},visit={activity_type:'ensayo_coro'};
 assert.deepEqual(people.filter(p=>matchesRoster(p,'choir',visit,data)&&matchesAttendanceGender(p,'women')).map(p=>p.id),['2']);
 assert.deepEqual(people.filter(p=>matchesRoster(p,'all',visit,data)&&matchesAttendanceGender(p,'women')).map(p=>p.id),['2','3']);
 let draft=toggleDraft({},[],'1');draft=toggleDraft(draft,[],'2');
 const marks=effectiveMarks([],draft);
 assert.equal(marks.filter(m=>m.present).length,2);
 const visible=people.filter(p=>matchesAttendanceGender(p,'men'));
 assert.deepEqual(visible.map(p=>p.id),['1']);assert.equal(Object.keys(draft).length,2);
 draft=toggleDraft(draft,[],'1');assert.deepEqual(Object.keys(draft),['2']);
});
test('Encuentros: fusionar cambios locales preserva marcas ocultas, históricas y de otra cuenta',()=>{
 assert.deepEqual(mergeAttendanceSelection([],['hombre'],['mujer']),['mujer','hombre']);
 assert.deepEqual(mergeAttendanceSelection(['hombre','historico'],['historico'],['hombre','historico','mujer']),['historico','mujer']);
 assert.deepEqual(mergeAttendanceSelection(['hombre'],['hombre'],[]),[]);
 assert.deepEqual(mergeAttendanceSelection([],['hombre','hombre'],['hombre']),['hombre']);
});
test('Dos cuentas: marcas separadas no se duplican y los encuentros conservan ambos grupos',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202611180001_navegacion_evento_eliminacion','202611180002_locales_sin_juventud','202611200001_contacto_miembros','202611200002_cuentas_asistencia_invitados','202611210001_seguimiento_encuentros_clases','202611230001_gestion_jupa_plazos_auditoria']);
 try{
  await db.exec(`update modulos set habilitado=true;
   insert into permisos(usuario_auth_id,modulo,iglesia_id,puede_ver,puede_registrar) values('${uid(4)}','escuela_dominical',1,true,true);
   insert into miembros(id,nombres,apellidos,iglesia_id,categoria) values(100,'Ana','Ejemplo',1,'Señorita'),(101,'Luis','Ejemplo',1,'Joven');
   insert into actividades(id,date,iglesia_id,"group",tipo_actividad) values(100,current_date-extract(dow from current_date)::int,1,'Todos','escuela_dominical');
   insert into eventos(id,tipo,date,titulo,lugar,direccion,anfitrionas_ids,hora_manana,hora_tarde,punto_predicacion) values(100,'jupa',current_date,'Encuentro','Templo','Calle',ARRAY[1,2],'10:00','18:00','Plaza');`);
  await as(db,1);await db.query('select v3_guardar_asistencias(100,$1)',[[{person_id:101,present:true,version:0}]]);
  await as(db,4);await db.query('select v3_guardar_asistencias(100,$1)',[[{person_id:100,present:true,version:0}]]);
  await assert.rejects(db.query('select v3_guardar_asistencias(100,$1)',[[{person_id:100,present:true,version:0}]]),/modific/);
  await as(db,1);let rows=(await db.query('select miembro_id from asistencias where actividad_id=100 and presente order by miembro_id')).rows;
  assert.deepEqual(rows.map(r=>r.miembro_id),[100,101]);
  // Dos pantallas abiertas con la misma base vacía; cada una modifica un grupo.
  await db.query("select v36_guardar_clase(100,1,'punto',ARRAY[101]::bigint[],0)");
  await as(db,4);const panel=(await db.query('select v36_clase_panel(1) p')).rows[0].p;
  const current=panel.registers.find(r=>r.event_id==='100'&&r.moment==='punto');
  const merged=mergeAttendanceSelection([],['100'],current.ids);
  await db.query("select v36_guardar_clase(100,1,'punto',$1::bigint[],$2)",[merged,current.version]);
  const final=(await db.query('select v36_clase_panel(1) p')).rows[0].p;
  assert.deepEqual(final.registers.find(r=>r.moment==='punto').ids.sort(),['100','101']);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from resumenes_servicios')).rows[0].n,0);
 }finally{await db.close();}
});
