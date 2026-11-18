import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,as} from './support/database.mjs';
import {activityGroups,registrationOverview} from '../src/navigation.mjs';
const file=new URL('../supabase/migrations/202611180001_navegacion_evento_eliminacion.sql',import.meta.url);
test('V3.3: eliminación autorizada con auditoría y bloqueo de historial; evento unido sin duplicar',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria','202610240001_formato_nombres']);
 try{
  await db.exec('update public.modulos set habilitado=true');
  const {rows:[e]}=await db.query("insert into public.eventos(tipo,date,titulo,anfitrionas_ids,lugar,direccion,punto_predicacion,hora_manana,hora_tarde,publicado) values('jupa',current_date,'Evento prueba',array[1,2]::bigint[],'Templo','Calle','Plaza','10:00','18:00',true) returning *");
  const {rows:[d]}=await db.query("insert into public.actividades(date,iglesia_id,\"group\",tipo_actividad) values(current_date,1,'Todos','devocional') returning *");
  const {rows:[member]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('HISTORIAL','CONSERVADO',1,'Joven') returning *");
  await as(db,1);await db.query('select public.v3_set_attendance($1,$2,true,0)',[d.id,member.id]);await db.exec('reset role');
  const sql=await readFile(file,'utf8');await db.exec(sql);
  assert.equal(Number((await db.query('select evento_id from public.actividades where id=$1',[d.id])).rows[0].evento_id),Number(e.id));
  assert.equal((await db.query('select count(*)::int n from public.actividades where evento_id=$1',[e.id])).rows[0].n,3);
  await db.exec(sql);assert.equal((await db.query('select count(*)::int n from public.actividades where evento_id=$1',[e.id])).rows[0].n,3);
  // Solo el administrador obtiene el directorio, incluyendo cuentas inactivas.
  await db.exec('update public.usuarios set activo=false where usuario=\'cuenta7\'');
  await as(db,1);assert.equal((await db.query('select * from public.v3_profiles')).rows.length,7);
  for(const n of [2,3,4,6]){await as(db,n);const accounts=(await db.query('select * from public.v3_profiles')).rows;assert.equal(accounts.length,1);assert.equal(accounts[0].username,'cuenta'+n);assert.equal((await db.query('select * from public.usuarios_detalle_v3')).rows.length,1);}
  await as(db,1);
  await assert.rejects(()=>db.query('select public.v3_eliminar_miembro($1,$2,$3)',[member.id,member.nombres+' '+member.apellidos,'Duplicado de prueba']),/historial/);
  await assert.rejects(()=>db.query('select public.v3_save_visit($1,$2)',[JSON.stringify({id:d.id,activity_type:'devocional'}),'{}']),/evento mensual/);
  for(const n of [1,2,3]){
   await as(db,n);const {rows:[p]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('ELIMINAR','PRUEBA',1,'Joven') returning *");
   await assert.rejects(()=>db.query('select public.v3_eliminar_miembro($1,$2,$3)',[p.id,'Nombre erróneo','Duplicado']),/nombre completo/);
   await db.query('select public.v3_eliminar_miembro($1,$2,$3)',[p.id,p.nombres+' '+p.apellidos,'Ingreso equivocado']);
   assert.equal((await db.query('select id from public.miembros where id=$1',[p.id])).rows.length,0);
  }
  assert.equal((await db.query('select * from public.miembros_eliminados')).rows.length,3);
  await as(db,4);assert.equal((await db.query('select * from public.miembros_eliminados')).rows.length,0);await assert.rejects(()=>db.query('select public.v3_eliminar_miembro($1,$2,$3)',[member.id,'Nombre','Motivo']),/Solo Administrador/);
  await db.exec('reset role');await db.query('update public.eventos set date=current_date+1 where id=$1',[e.id]);
  assert.equal((await db.query('select count(*)::int n from public.asistencias where miembro_id=$1',[member.id])).rows[0].n,1);
  const pub=(await db.query('select public.v3_public_bulletin(current_date) r')).rows[0].r;assert.ok(!pub.activities.some(v=>Number(v.id)===Number(d.id)));
  await db.query('update public.eventos set publicado=false where id=$1',[e.id]);assert.equal((await db.query('select count(*)::int n from public.actividades where evento_id=$1 and eliminado_el is not null',[e.id])).rows[0].n,3);
  await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.miembros_eliminados'),/permission/);
 }finally{await db.close();}
});
test('Navegación por permisos y seguimiento sin confundir pendiente con ausencia',()=>{
 const p={id:'u',role:'clase',active:true,class_id:'1'},data={classes:[{id:'1',active:true},{id:'2',active:true}],activity_modules:[{code:'escuela_dominical',enabled:true}],account_permissions:[{profile_id:'u',module:'escuela_dominical',can_view:true}],visits:[{id:'a',class_id:'1',activity_type:'escuela_dominical',date:'2026-11-01',status:'held'},{id:'b',class_id:'1',activity_type:'escuela_dominical',date:'2026-11-08',status:'pending'},{id:'c',class_id:'1',activity_type:'escuela_dominical',date:'2026-11-15',status:'suspended'}],attendance:[]};
 assert.deepEqual(activityGroups(p,data).map(g=>g.id),['local']);const stats=registrationOverview(data,p,'escuela_dominical','2026-11-01','2026-11-18');assert.equal(stats.length,1);assert.equal(stats[0].registered,1);assert.equal(stats[0].pending,1);assert.equal(stats[0].participants,0);assert.equal(stats[0].never,false);
});
