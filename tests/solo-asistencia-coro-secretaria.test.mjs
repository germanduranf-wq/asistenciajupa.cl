import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,as,uid} from './support/database.mjs';
import {canActivity,canPerson,canPublish,canSchedule,limitedModules} from '../src/access.mjs';
import {activityGroups} from '../src/navigation.mjs';
import {matchesRoster,rosterOptions} from '../src/attendance-roster.mjs';
const extra=['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202610240001_formato_nombres','202611180001_navegacion_evento_eliminacion','202611180002_locales_sin_juventud','202611200001_contacto_miembros','202611200002_cuentas_asistencia_invitados','202611210001_seguimiento_encuentros_clases','202611210002_estado_miembros_clases','202611230001_gestion_jupa_plazos_auditoria','202611230002_solo_asistencia_coro_secretaria'];
test('V3.8: modalidad de Coro/Secretaría, privacidad real, altas y alcance de actividades',async()=>{
 const db=await setup(extra);
 try{
  await db.exec(await readFile(new URL('../supabase/migrations/'+extra.at(-1)+'.sql',import.meta.url),'utf8'));
  await db.exec(`update modulos set habilitado=true;
   insert into permisos(usuario_auth_id,modulo,puede_ver,puede_registrar,puede_exportar) values('${uid(6)}','ensayo_coro',true,true,true);
   insert into miembros(id,nombres,apellidos,iglesia_id,categoria,telefono,observaciones,cuerpos_ids) values(100,'Ana','Coro',1,'Señorita','PRIVADO','OBSERVACION PRIVADA',ARRAY[(select id from cuerpos where nombre='Coro JUPA')]),(101,'Luis','Invitado',2,'Joven','PRIVADO2','PRIVADO2','{}');
   insert into actividades(id,date,iglesia_id,"group",tipo_actividad) values(100,current_date,1,'Todos','ensayo_coro'),(101,current_date-8,1,'Todos','ensayo_coro'),(102,current_date,2,'Todos','reunion_mensual'),(103,current_date,1,'Jóvenes','visita'),(104,current_date,1,'Todos','reunion_encargados');
   insert into eventos(id,tipo,date,titulo,lugar,direccion,anfitrionas_ids,hora_manana,hora_tarde,punto_predicacion) values(100,'jupa',current_date,'Encuentro','Templo','Calle',ARRAY[1,2],'10:00','18:00','Plaza');`);
  await as(db,6);assert.equal((await db.query('select telefono from miembros where id=100')).rows[0].telefono,'PRIVADO');
  await assert.rejects(db.query('select v38_modalidad_cuenta($1,true)',[uid(6)]),/administrador/);
  await as(db,1);await assert.rejects(db.query('select v38_modalidad_cuenta($1,true)',[uid(1)]),/admiten/);
  await db.query('select v38_modalidad_cuenta($1,true)',[uid(6)]);await db.query('select v38_modalidad_cuenta($1,true)',[uid(3)]);
  const before=(await db.query('select usuario,identificador_auth,debe_cambiar_clave from usuarios where id=$1',[uid(6)])).rows[0];
  for(const n of [6,3]){
   await as(db,n);
   assert.equal((await db.query('select * from miembros')).rows.length,0);
   assert.equal((await db.query('select * from miembros_detalle')).rows.length,0);
   const directory=(await db.query('select * from v3_directorio_asistencia()')).rows;assert(directory.some(p=>p.id===100)&&directory.some(p=>p.id===101));assert(!JSON.stringify(directory).includes('PRIVADO'));assert(!('rut' in directory[0]));
   assert.equal((await db.query('select jupa_v3.puede_leer_miembro(100,1) ok')).rows[0].ok,false);
   assert.equal((await db.query('select * from resumenes_servicios')).rows.length,0);
   assert.equal((await db.query('select jupa_v3.can_publish() ok')).rows[0].ok,false);
   assert.equal((await db.query("select jupa_v3.can_activity('ensayo_coro',1,'export') ok")).rows[0].ok,false);
   assert.equal((await db.query("update miembros set nombres='No permitido' where id=100 returning id")).rows.length,0);
   await assert.rejects(db.query('select v3_set_photo(100,$1)',['100/foto.webp']),/permiso/);
   await assert.rejects(db.query('select v3_reactivate_person(100)'),/permiso/);
   await assert.rejects(db.query("select v3_eliminar_miembro(100,'Ana Coro','Prueba de eliminación')"),/permiso/);
   await assert.rejects(db.query('select v36_clase_panel(1)'),/acceso/);
   await assert.rejects(db.query("select v36_guardar_clase(100,1,'punto',ARRAY[100]::bigint[],0)"),/permiso/);
   await assert.rejects(db.query('select v3_historial_miembro(100,current_date-30,current_date)'),/solo registra/);
   await assert.rejects(db.query("select v3_save_visit('{}','{}')"),/solo registra/);
   await assert.rejects(db.query("select v3_set_activity_status(100,'held','',1,1)"),/solo registra/);
   await assert.rejects(db.query('select v3_archivar_actividad(100,1,true)'),/permiso/);
   await assert.rejects(db.query('select v3_archivar_evento(100,1,true)'),/permiso/);
   await assert.rejects(db.query("select v3_emitir_cartas(null,current_date)"),/acceso/);
   assert.equal((await db.query("update eventos set titulo='No permitido' where id=100 returning id")).rows.length,0);
   assert.equal((await db.query('select id from eventos where id=100')).rows.length,1);
   const fresh=(await db.query('select v3_crear_participante_asistencia($1) p',[{nombres:'Nueva'+n,apellidos:'Ejemplo',iglesia_id:2,categoria:'Señorita',telefono:'NUEVO PRIVADO',observaciones:'NO EXPONER',direccion_completa:'NO EXPONER'}])).rows[0].p;
   assert(fresh.id);assert.equal(fresh.iglesia_id,2);assert(!JSON.stringify(fresh).includes('PRIVADO'));assert(!('observaciones' in fresh));
   await assert.rejects(db.query('select v3_crear_participante_asistencia($1)',[{id:100,nombres:'No',apellidos:'Editar',iglesia_id:1}]),/nuevos/);
   assert.equal((await db.query('select * from miembros where id=$1',[fresh.id])).rows.length,0);
   await db.query('select v3_set_attendance(100,$1,true,0)',[fresh.id]);
   await assert.rejects(db.query('select v3_set_attendance(101,100,true,0)'),/7 días/);
   await assert.rejects(db.query('select v3_set_attendance(102,100,true,0)'),/permiso/);
   await assert.rejects(db.query('select v3_set_attendance(103,100,true,0)'),/permiso/);
   await assert.rejects(db.query('select v38_modalidad_cuenta($1,false)',[uid(n)]),/administrador/);
  }
  await as(db,6);await db.query('select v3_set_attendance(100,101,true,0)');await assert.rejects(db.query('select v3_set_attendance(104,101,true,0)'),/permiso/);
  await as(db,3);await db.query('select v3_set_attendance(104,101,true,0)');
  for(const type of ['devocional','servicio_jupa']){const v=(await db.query('select id from actividades where evento_id=100 and tipo_actividad=$1',[type])).rows[0];await db.query('select v3_set_attendance($1,101,true,0)',[v.id]);}
  await as(db,1);await db.query('select v38_modalidad_cuenta($1,false)',[uid(6)]);
  assert.deepEqual((await db.query('select usuario,identificador_auth,debe_cambiar_clave from usuarios where id=$1',[uid(6)])).rows[0],before);
  const logs=(await db.query("select v37_actividad_admin(current_date,current_date,null,null,'usuarios') data")).rows[0].data;assert(logs.some(x=>x.action==='Activó Solo asistencia'));assert(logs.some(x=>x.action==='Restauró modalidad general'));
  await as(db,6);assert.equal((await db.query('select telefono from miembros where id=100')).rows[0].telefono,'PRIVADO');assert.equal((await db.query("select jupa_v3.can_activity('ensayo_coro',1,'export') ok")).rows[0].ok,true);
 }finally{await db.close();}
});
test('V3.8: menús limitados y filtros incluyen invitados sin abrir fichas',()=>{
 const data={classes:[{id:'1',name:'Clase A'}],bodies:[{id:'coro',name:'Coro JUPA'}],activity_modules:['visita','reunion_encargados','devocional','servicio_jupa','ensayo_coro','evento_coro','reunion_mensual','escuela_dominical','servicio_domingo'].map(code=>({code,enabled:true}))};
 for(const role of ['coro','secretaria']){
  const p={id:'u',role,active:true,attendance_only:true};
  for(const module of limitedModules(role)){assert(canActivity(p,data,module,'1','manage'));assert(!canActivity(p,data,module,'1','export'));assert(!canSchedule(p,data,module,'1'));}
  assert(!canActivity(p,data,'escuela_dominical','1','manage'));assert(!canPublish(p));assert(canPerson(p,'2','create'));for(const a of ['edit','view','photo','delete','reactivate','retire'])assert(!canPerson(p,'1',a));
  const pages=activityGroups(p,data).flatMap(g=>g.items.map(i=>i.id));for(const page of ['schedule','bulletin','documents','summaries','class_participation'])assert(!pages.includes(page));
 }
 const v={activity_type:'ensayo_coro'};assert.equal(rosterOptions(v)[0][0],'choir');assert(matchesRoster({body_ids:['coro']},'choir',v,data));assert(!matchesRoster({body_ids:[]},'choir',v,data));assert(matchesRoster({body_ids:[]},'all',v,data));
});
