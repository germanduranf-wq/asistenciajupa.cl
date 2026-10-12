import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('JUPA 2: migración, aislamiento y módulos',async t=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
 for(const name of ['202610100001_initial.sql','202610110001_usernames.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${uid(1)}'),('${uid(2)}'),('${uid(3)}'),('${uid(4)}'),('${uid(5)}'); insert into public.profiles(id,name,email,role) values('${uid(1)}','Admin','a@test.cl','admin'),('${uid(2)}','Operador','b@test.cl','encargado'); insert into public.classes(id,name) values('${uid(10)}','Clase A'),('${uid(11)}','Clase B'); insert into public.people(id,first_name,last_name,class_id,category) values('${uid(20)}','Persona','A','${uid(10)}','Joven'),('${uid(21)}','Persona','B','${uid(11)}','Señorita'); insert into public.visits(id,date,class_id,"group") values('${uid(30)}',(now() at time zone 'America/Santiago')::date,'${uid(10)}','Jóvenes'); insert into public.attendance(visit_id,person_id,present,class_id,category) values('${uid(30)}','${uid(20)}',true,'${uid(10)}','Joven');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610120001_activities_permissions.sql',import.meta.url),'utf8'));
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);if(id)await db.exec('set role authenticated');};
 await t.test('conserva marcas y solo visitas queda habilitado',async()=>{
  assert.equal((await db.query('select count(*)::int n from public.attendance')).rows[0].n,1);
  assert.deepEqual((await db.query('select code from public.activity_modules where enabled')).rows.map(r=>r.code),['visita']);
  await as(uid(2));assert.equal((await db.query('select * from public.visits')).rows.length,1);
  await assert.rejects(()=>db.query("select public.save_visit($1,'{}')",[JSON.stringify({date:'2026-10-18',class_id:uid(10),group:'Todos',activity_type:'escuela_dominical'})]),/permiso/);
 });
 await as(null);
 await db.exec(`insert into public.profiles(id,name,email,username,role,class_id) values('${uid(3)}','Clase A','c@test.cl','clase.a','clase','${uid(10)}'),('${uid(4)}','Secretaria','d@test.cl','secretaria','secretaria',null),('${uid(5)}','Jefatura','e@test.cl','jefatura','jefatura',null); update public.activity_modules set enabled=true; insert into public.account_permissions(profile_id,module,class_id,can_manage,can_export) values('${uid(3)}','escuela_dominical','${uid(10)}',true,true),('${uid(3)}','reunion_mensual','${uid(10)}',true,true),('${uid(4)}','reunion_encargados',null,true,true);`);
 let local;
 await t.test('clase crea reunión propia y no puede leer ni modificar juventud ajena',async()=>{
  await as(uid(3));assert.equal((await db.query('select * from public.people')).rows.length,1);
  assert.equal((await db.query("update public.people set first_name='Ajeno' where id=$1 returning id",[uid(21)])).rows.length,0);
  await assert.rejects(()=>db.query('update public.people set class_id=$1 where id=$2',[uid(11),uid(20)]),/trasladar|row-level/);
  await assert.rejects(()=>db.query('update public.people set active=false where id=$1',[uid(20)]),/retirar/);
  await db.query("update public.people set first_name='Actualizado',category='Colaborador',birth_date='2000-01-01' where id=$1",[uid(20)]);
  const current=(await db.query("select (now() at time zone 'America/Santiago')::date::text d")).rows[0].d;
  const params={date:current,class_id:uid(10),group:'Todos',activity_type:'reunion_mensual'};
  local=(await db.query("select * from public.save_visit($1,'{}')",[JSON.stringify(params)])).rows[0];
  await assert.rejects(()=>db.query("select public.save_visit($1,'{}')",[JSON.stringify({...params,class_id:uid(11)})]),/permiso/);
  await assert.rejects(()=>db.query('select public.set_attendance($1,$2,true,0)',[local.id,uid(21)]),/disponible|clase/);
  await assert.rejects(()=>db.query("insert into public.account_permissions(profile_id,module) values($1,'visita')",[uid(3)]),/permission denied/);
 });
 await t.test('sin doble conteo al trasladar lugar; suspensión requiere motivo y sin marcas',async()=>{
  await db.query('select public.set_attendance($1,$2,true,0)',[local.id,uid(20)]);
  const ver=(await db.query('select version from public.visits where id=$1',[local.id])).rows[0].version;
  await assert.rejects(()=>db.query("select public.set_activity_status($1,'suspended','Motivo',$2,$3)",[local.id,uid(10),ver]),/asistentes/);
  await db.query("select public.set_activity_status($1,'held','',$2,$3)",[local.id,uid(11),ver]);
  const a=(await db.query('select * from public.attendance where visit_id=$1',[local.id])).rows;
  assert.equal(a.length,1);assert.equal(a[0].class_id,uid(10));
 });
 await t.test('scope SQL invalido no permite a clase leer visitas ni clases ajenas',async()=>{
  await as(null);await db.exec(`insert into public.account_permissions(profile_id,module,can_manage,can_export) values('${uid(3)}','visita',true,true),('${uid(3)}','reunion_mensual',true,true);`);
  await as(uid(3));assert.equal((await db.query("select private.can_activity('visita',$1) ok",[uid(10)])).rows[0].ok,false);
  assert.equal((await db.query("select private.can_activity('reunion_mensual',$1) ok",[uid(11)])).rows[0].ok,false);
 });
 await t.test('fotos de otra clase protegidas y edición propia permitida',async()=>{
  const own=`${uid(20)}/${uid(90)}.webp`,other=`${uid(21)}/${uid(91)}.webp`;
  await db.query("insert into storage.objects(bucket_id,name) values('portraits',$1)",[own]);
  await db.query('select public.set_photo($1,$2)',[uid(20),own]);
  await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('portraits',$1)",[other]),/row-level/);
  await assert.rejects(()=>db.query('select public.set_photo($1,$2)',[uid(21),other]),/permiso/);
 });
 await t.test('Secretaría gestiona personas globales pero solo reuniones autorizadas',async()=>{
  await as(uid(4));assert.equal((await db.query('select * from public.people')).rows.length,2);
  await db.query('update public.people set active=false where id=$1',[uid(21)]);
  assert.equal((await db.query('select * from public.visits')).rows.length,0);
  assert.equal((await db.query("select private.can_activity('reunion_encargados',$1,'manage') ok",[uid(10)])).rows[0].ok,true);
 });
 await t.test('contraseña temporal bloquea datos, RPC y fotos',async()=>{
  await as(null);await db.query('update public.profiles set must_change_password=true where id=$1',[uid(3)]);
  await as(uid(3));assert.equal((await db.query('select * from public.people')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(()=>db.query('select public.set_attendance($1,$2,false,1)',[local.id,uid(20)]),/permiso/);
  assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 });
 await t.test('generación de domingos idempotente y suspensión explícita',async()=>{
  await as(uid(1));const now=(await db.query("select (now() at time zone 'America/Santiago')::date::text d")).rows[0].d;
  const n=(await db.query('select public.ensure_sundays($1::date,$1::date+14) n',[now])).rows[0].n;assert.ok(n>0);
  assert.equal((await db.query('select public.ensure_sundays($1::date,$1::date+14) n',[now])).rows[0].n,0);
  const v=(await db.query("select * from public.visits where activity_type='escuela_dominical' limit 1")).rows[0];assert.equal(v.status,'pending');
  await assert.rejects(()=>db.query("select public.set_activity_status($1,'suspended','',$2,$3)",[v.id,v.class_id,v.version]),/por qué/);
  await db.query("select public.set_activity_status($1,'suspended','No hubo actividad',$2,$3)",[v.id,v.class_id,v.version]);
  await assert.rejects(()=>db.query('select public.set_attendance($1,$2,true,0)',[v.id,uid(20)]),/suspendida/);
 });
 await db.close();
});
