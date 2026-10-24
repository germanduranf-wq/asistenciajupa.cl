import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,as,uid} from './support/database.mjs';
import {attendanceSummary,expectedInService,summaryRow} from '../src/service-summary.mjs';
import {buildAttendanceWorkbook,buildParticipantsWorkbook,buildServiceWorkbook} from '../src/service-exports.mjs';
const migration='202610230002_resumenes_secretaria';
test('Resúmenes: permisos, concurrencia, plazos, ensayos, vínculo al evento y cuerpos históricos',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros',migration]);
 try{
  await db.exec(`update public.modulos set habilitado=true;insert into public.permisos(usuario_auth_id,modulo,puede_ver,puede_registrar,puede_exportar) select u.id,m.codigo,true,true,true from public.usuarios u cross join public.modulos m where u.rol in ('secretaria','jefatura');`);
  const {rows:[event]}=await db.query(`insert into public.eventos(tipo,date,titulo,anfitrionas_ids,lugar,direccion,punto_predicacion,hora_manana,hora_tarde,publicado) values('jupa',current_date,'Evento de prueba',array[1,2]::bigint[],'Templo','Calle de prueba','Plaza','10:00','18:00',true) returning id`);
  const {rows:activities}=await db.query('select * from public.actividades where evento_id=$1 order by tipo_actividad',[event.id]);assert.equal(activities.length,2);
  const afternoon=activities.find(v=>v.tipo_actividad==='servicio_jupa');
  await db.exec(`insert into public.actividades(id,date,iglesia_id,"group",tipo_actividad) values(100,current_date,1,'Todos','devocional'),(101,current_date,1,'Todos','reunion_encargados'),(102,current_date,1,'Todos','ensayo_coro'),(103,current_date,2,'Todos','ensayo_coro'),(104,current_date-30,1,'Todos','reunion_encargados');`);
  await as(db,3);
  // Incluye personas mal etiquetadas: pueden marcarse igual en mañana/tarde.
  const {rows:[person]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria,cuerpos_ids) values('NUEVO','JOVEN',1,'Joven',array[1]::bigint[]) returning *");
  await db.query('select public.v3_set_attendance($1,$2,true,0)',[afternoon.id,person.id]);
  await db.query('select public.v3_set_attendance(100,$1,true,0)',[person.id]);
  await db.query("update public.miembros set cuerpos_ids='{}' where id=$1",[person.id]);
  assert.deepEqual((await db.query('select cuerpos_ids from public.asistencias where actividad_id=$1',[afternoon.id])).rows[0].cuerpos_ids,[1]);
  const save=(id,values,ver)=>db.query('select public.v3_guardar_resumen($1,$2,$3)',[id,JSON.stringify(values),ver]);
  await save(afternoon.id,{total_punto:0,total_general:250,devocional_id:100,predicadores_presentes:'Invitado sin ficha'},0);
  const {rows:[stored]}=await db.query('select * from public.resumenes_servicios where actividad_id=$1',[afternoon.id]);assert.equal(stored.total_punto,0);assert.equal(stored.total_general,250);assert.equal(stored.version,1);
  await assert.rejects(()=>save(afternoon.id,{total_general:400},0),/Otra persona/);
  await assert.rejects(()=>save(afternoon.id,{total_general:-1},1),/check constraint/);
  await assert.rejects(()=>save(afternoon.id,{total_general:2,actualizado_por:uid(1)},1),/no permitido/);
  await assert.rejects(()=>save(afternoon.id,{devocional_id:101},1),/devocional/);
  await save(101,{primer_ensayo_id:102,segundo_ensayo_id:103,invitaciones_ids:[1,2]},0);
  await assert.rejects(()=>save(101,{primer_ensayo_id:102,segundo_ensayo_id:102},1),/diferentes/);
  await assert.rejects(()=>save(101,{primer_ensayo_id:100},1),/ensayos/);
  await save(100,{solicitaron_tema_ids:[1,3],oportunidades_ids:[2],tema_biblico:'Tema'},0);
  await assert.rejects(()=>save(100,{solicitaron_tema_ids:[99999]},1),/clase no válida/);
  await assert.rejects(()=>save(104,{},0),/21 días/);
  await as(db,1);await save(104,{},0);
  await as(db,4);assert.equal((await db.query('select * from public.resumenes_servicios')).rows.length,0);await assert.rejects(()=>save(100,{},1),/permiso/);
  await as(db,6);await assert.rejects(()=>save(100,{},1),/permiso/);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.resumenes_servicios'),/permission/);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query('update public.eventos set publicado=false where id=$1',[event.id]);assert.equal((await db.query('select count(*)::int n from public.actividades where evento_id=$1 and eliminado_el is not null',[event.id])).rows[0].n,2);
  await db.query('update public.eventos set publicado=true,date=current_date+1 where id=$1',[event.id]);assert.equal((await db.query('select count(*)::int n from public.actividades where evento_id=$1 and eliminado_el is null',[event.id])).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from public.asistencias where actividad_id=$1',[afternoon.id])).rows[0].n,1);
  await db.exec(await readFile(new URL('../supabase/migrations/'+migration+'.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select count(*)::int n from public.resumenes_servicios')).rows[0].n,4);
 }finally{await db.close();}
});
const fixture={classes:[{id:'1',name:'Primera',active:true},{id:'2',name:'Segunda',active:true}],bodies:[{id:'1',name:'Audio JUPA',active:true},{id:'2',name:'Coro JUPA',active:true}],people:[{id:'1',first_name:'ANA',last_name:'PEREZ',class_id:'2',category:'Señorita',body_ids:['2'],active:true,birth_date:'2000-01-02',created_at:'2026-01-02T00:00:00Z'}],visits:[{id:'1',date:'2026-10-23',class_id:'1',activity_type:'servicio_jupa',status:'held'}],attendance:[{visit_id:'1',person_id:'1',present:true,class_id:'1',category:'Ayudante de señoritas',body_ids:['1','2']}],activity_modules:[{code:'servicio_jupa',enabled:true}],bulletin_events:[]};
const admin={role:'admin',active:true,name:'Cuenta de prueba'};
test('Conteos distinguen cuerpos, clases históricas, totales manuales y Excel legible',async()=>{
 const data=structuredClone(fixture),v=data.visits[0],stats=attendanceSummary(data,'1');
 assert.equal(stats.total,1);assert.equal(stats.leaders,1);assert.equal(stats.classes[0].count,1);assert.equal(stats.classes[1].count,0);assert.equal(stats.bodies[0].count,1);assert.equal(stats.bodies[1].count,1);
 assert.ok(expectedInService(data.people[0]));
 assert.equal(attendanceSummary(data,'1',{body:'missing'}).total,0);
 assert.equal(summaryRow(v,{total_punto:0,total_general:200},data)[4],0);
 const book=await buildAttendanceWorkbook(data,v,admin),sheet=book.getWorksheet('Asistentes');
 assert.equal(sheet.getCell('C9').value,'Primera');assert.equal(sheet.getCell('J9').value,'Segunda');assert.ok(sheet.getCell('O9').value instanceof Date);
 assert.equal(book.getWorksheet('Cuerpos').getCell('B9').value,1);
 const bytes=await book.xlsx.writeBuffer();const {default:Excel}=await import('exceljs');const reopened=new Excel.Workbook();await reopened.xlsx.load(bytes);assert.equal(reopened.getWorksheet('Asistentes').getCell('B9').value,'ANA PEREZ');
 await assert.rejects(()=>buildParticipantsWorkbook(data,{role:'secretaria',active:true}),/administrador/);
 assert.equal((await buildParticipantsWorkbook(data,admin)).getWorksheet('Participantes').getCell('I9').value.toISOString().slice(0,10),'2000-01-02');
 const annual=await buildServiceWorkbook(data,[{actividad_id:'1',total_general:200,total_punto:0}],admin,'2026');assert.equal(annual.worksheets.length,4);assert.equal(annual.getWorksheet('Servicio general').getCell('E9').value,0);assert.equal(annual.getWorksheet('Servicio general').getCell('F9').value,200);
});

 test('Resumen de reunión separa encargados del total y no presenta vínculos ausentes como cero',()=>{
  const data=structuredClone(fixture);const v=data.visits[0];v.activity_type='reunion_encargados';data.attendance[0].category='Joven';
  const row=summaryRow(v,{primer_ensayo_id:'no-disponible'},data);
  assert.equal(attendanceSummary(data,v.id).total,1);assert.equal(row[3],0);assert.equal(row[4],null);assert.equal(row[6],null);
 });
