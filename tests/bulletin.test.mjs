import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {canActivity,canSchedule,canPublish} from '../src/access.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=f=>readFile(new URL('../supabase/'+f,import.meta.url),'utf8');
test('avisos, cuerpos y permisos de programación: PostgreSQL con RLS',async t=>{
 const db=new PGlite();
 const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);if(n)await db.exec('set role authenticated');};
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  for(const f of ['202610100001_initial','202610110001_usernames','202610120001_activities_permissions','202610120002_minimum_age_10','202610120003_reactivate_people','202610140001_bodies_notices'])await db.exec(await sql('migrations/'+f+'.sql'));
  await db.exec(`insert into public.classes(id,name) values('${id(10)}','Clase San Carlos'),('${id(11)}','Catedral');
   insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
   insert into public.profiles(id,name,email,role,class_id) values
   ('${id(1)}','Admin','a@test.invalid','admin',null),('${id(2)}','Secretaría','s@test.invalid','secretaria',null),
   ('${id(3)}','Clase','c@test.invalid','clase','${id(10)}'),('${id(4)}','Jefatura','j@test.invalid','jefatura',null);
   insert into public.people(id,first_name,last_name,class_id,category) values
   ('${id(20)}','Privado','Uno','${id(10)}','Joven'),('${id(21)}','Privado','Dos','${id(11)}','Señorita');`);
  const current=(await db.query("select (now() at time zone 'America/Santiago')::date::text d")).rows[0].d;
  const month=current.slice(0,7)+'-01';let visit,devotional;
  await t.test('importación repetible conserva IDs y dirección corregida',async()=>{
   await db.exec(await sql('admin/importar-direcciones.sql'));await db.exec(await sql('admin/importar-direcciones.sql'));
   assert.equal((await db.query('select count(*)::int n from public.classes')).rows[0].n,21);
   assert.equal((await db.query('select address from public.classes where id=$1',[id(10)])).rows[0].address,'Avenida Las Nieves Oriente 0812');
   assert.deepEqual((await db.query("select name from public.classes where commune='La Florida' order by name")).rows.map(r=>r.name),['México','San Pedro']);
  });
  await t.test('devocional comienza deshabilitado; permisos repetibles habilitan solo lo solicitado',async()=>{
   await as(2);assert.equal((await db.query("select private.can_activity('devocional',$1,'manage') ok",[id(10)])).rows[0].ok,false);
   await as(null);await db.exec(await sql('admin/habilitar-avisos-devocionales.sql'));await db.exec(await sql('admin/habilitar-avisos-devocionales.sql'));
   assert.equal((await db.query('select count(*)::int n from public.account_permissions where profile_id=$1',[id(3)])).rows[0].n,0);
  });
  await t.test('Secretaría programa visitas sin marcar ni leer asistencia o responsables',async()=>{
   await as(2);
   visit=(await db.query("select * from public.save_visit($1,$2)",[JSON.stringify({date:current,class_id:id(10),group:'Jóvenes',scheduled_time:'19:30',notes:'NOTA PRIVADA'}),JSON.stringify({'Predicación':id(20)})])).rows[0];
   assert.equal(visit.scheduled_time,'19:30:00');
   await assert.rejects(()=>db.query('select public.set_attendance($1,$2,true,0)',[visit.id,id(20)]),/permiso/);
   await as(1);await db.query('select public.set_attendance($1,$2,true,0)',[visit.id,id(20)]);
   await as(null);await db.query('insert into public.responsibilities(visit_id,role,person_id) values($1,$2,$3)',[visit.id,'Predicación',id(20)]);
   await as(2);
   assert.equal((await db.query('select * from public.attendance')).rows.length,0);
   assert.equal((await db.query('select * from public.responsibilities')).rows.length,0);
   assert.equal((await db.query('select * from public.visits')).rows.length,1);
   const latest=(await db.query('select * from public.visits where id=$1',[visit.id])).rows[0];
   await db.query("select public.save_visit($1,'{}')",[JSON.stringify({...latest,notes:'ACTUALIZADO'})]);
   await assert.rejects(()=>db.query("select public.save_visit($1,'{}')",[JSON.stringify({...latest,notes:'versión atrasada'})]),/modificada/);
  });
  await t.test('devocional registra juventud de distintas clases y respeta plazo',async()=>{
   devotional=(await db.query("select * from public.save_visit($1,'{}')",[JSON.stringify({date:current,class_id:id(11),group:'Todos',activity_type:'devocional'})])).rows[0];
   await db.query('select public.set_attendance($1,$2,true,0)',[devotional.id,id(20)]);
   await db.query('select public.set_attendance($1,$2,true,0)',[devotional.id,id(21)]);
   assert.equal((await db.query('select * from public.attendance')).rows.length,2);
   await assert.rejects(()=>db.query("select public.save_visit($1,'{}')",[JSON.stringify({date:'2000-01-01',class_id:id(11),group:'Todos',activity_type:'devocional'})]),/21 días/);
  });
  await t.test('cuerpos múltiples independientes, alcance de clase y catálogo administrable',async()=>{
   const bodies=(await db.query('select id from public.bodies order by name')).rows.map(r=>r.id);
   await as(3);await db.query('update public.people set body_ids=$1 where id=$2',[[bodies[0],bodies[1],bodies[0]],id(20)]);
   const p=(await db.query('select body_ids,category from public.people where id=$1',[id(20)])).rows[0];
   assert.equal(p.body_ids.length,2);assert.equal(p.category,'Joven');
   assert.equal((await db.query('update public.people set body_ids=$1 where id=$2 returning id',[[bodies[0]],id(21)])).rows.length,0);
   await assert.rejects(()=>db.query('update public.people set body_ids=$1 where id=$2',[[id(999)],id(20)]),/Cuerpo/);
   await assert.rejects(()=>db.query("insert into public.bodies(name) values('Ajeno')"),/row-level/);
   await db.query("update public.people set body_ids='{}' where id=$1",[id(20)]);
   await as(1);await db.query("insert into public.bodies(name) values('Nuevo cuerpo')");
  });
  await t.test('eventos mensuales exigen dos anfitriones y no crean devocionales',async()=>{
   await as(2);
   const query="insert into public.bulletin_events(kind,date,title,venue,address,host_ids,morning_time,evening_time,preaching_place,maps_url) values('jupa',$1,'Encuentro público','Templo','Dirección',$2,'10:00','18:00','Plaza','https://maps.example.invalid') returning id";
   await assert.rejects(()=>db.query(query,[current,[id(10)]]),/check constraint/);
   await assert.rejects(()=>db.query(query,[current,[id(10),id(10)]]),/anfitrionas/);
   await db.query(query,[current,[id(10),id(11)]]);
   assert.equal((await db.query("select * from public.visits where activity_type='devocional'")).rows.length,1);
   await db.query("insert into public.bulletin_events(kind,date,title,published) values('especial',$1,'BORRADOR PRIVADO',false)",[current]);
   await db.query('insert into public.bulletin_highlights(month,message) values($1,$2)',[month,'Aviso del mes']);
   await assert.rejects(()=>db.query("insert into public.bulletin_events(kind,date,title,maps_url) values('especial',$1,'Mal enlace','javascript:alert(1)')",[current]),/check constraint/);
   await as(3);assert.equal((await db.query('select * from public.bulletin_events')).rows.length,0);
   await assert.rejects(()=>db.query("insert into public.bulletin_events(kind,date,title) values('especial',$1,'No permitido')",[current]),/row-level/);
  });
  await t.test('consulta anónima solo publica programación; tablas privadas cerradas',async()=>{
   await as(null);await db.exec('set role anon');
   const result=(await db.query('select public.public_bulletin($1) d',[month])).rows[0].d;
   assert.equal(result.highlight,'Aviso del mes');assert.equal(result.events.length,1);assert.equal(result.activities.length,2);
   assert.deepEqual(Object.keys(result.activities[0]).sort(),['id','date','type','group','time','class_name','address','commune','maps_url','status'].sort());
   assert.equal(JSON.stringify(result).includes('PRIVAD'),false);assert.equal(JSON.stringify(result).includes('Privado'),false);
   assert.equal((await db.query("select public.public_bulletin('2000-02-01') d")).rows[0].d.events.length,0);
   for(const table of ['people','attendance','profiles','bulletin_events','bulletin_highlights','bodies'])await assert.rejects(()=>db.query('select * from public.'+table),/permission denied/);
   await assert.rejects(()=>db.query('select public.save_visit($1,$2)',['{}','{}']),/permission denied/);
  });
  await t.test('cuenta inactiva o con contraseña temporal no puede publicar',async()=>{
   for(const patch of ['must_change_password=true','must_change_password=false,active=false']){
    await as(null);await db.exec(`update public.profiles set ${patch} where id='${id(2)}'`);await as(2);
    await assert.rejects(()=>db.query("insert into public.bulletin_highlights(month,message) values('2099-01-01','No')"),/row-level/);
    assert.equal((await db.query("select private.can_schedule('visita',$1) ok",[id(10)])).rows[0].ok,false);
   }
  });
 }finally{await db.close();}
});
test('menús separan programación y asistencia de visitas',()=>{
 const p={id:'s',role:'secretaria',active:true};const data={activity_modules:[{code:'visita',enabled:true},{code:'devocional',enabled:true}],account_permissions:[{profile_id:'s',module:'visita',can_schedule:true,can_view:false},{profile_id:'s',module:'devocional',can_view:true,can_manage:true,can_export:true}]};
 assert.equal(canSchedule(p,data,'visita',null),true);assert.equal(canActivity(p,data,'visita',null),false);assert.equal(canActivity(p,data,'visita',null,'export'),false);
 assert.equal(canActivity(p,data,'devocional',null,'manage'),true);assert.equal(canPublish(p),true);
 assert.equal(canSchedule({...p,role:'clase',class_id:'c'},data,'visita','c'),false);
 assert.equal(canPublish({...p,must_change_password:true}),false);
});
