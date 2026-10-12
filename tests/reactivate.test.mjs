import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {canPerson} from '../src/access.mjs';
const bootstrap="create role anon; create role authenticated; create role service_role bypassrls;\n    create schema auth; create table auth.users(id uuid primary key);\n    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;\n    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;\n    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);\n    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);\n    alter table storage.objects enable row level security;\n    grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;";
test('reincorporación conserva ficha y limita clase, rol y estado de cuenta',async()=>{
 const db=new PGlite(); const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try {
  await db.exec(bootstrap);
  for(const f of ['202610100001_initial.sql','202610110001_usernames.sql','202610120001_activities_permissions.sql','202610120002_minimum_age_10.sql','202610120003_reactivate_people.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  await db.exec(`insert into public.classes(id,name) values('${id(10)}','San Carlos'),('${id(11)}','Otra');
    insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
    insert into public.profiles(id,name,email,role,class_id) values
    ('${id(1)}','Clase','a@fixture.invalid','clase','${id(10)}'),
    ('${id(2)}','Admin','b@fixture.invalid','admin',null),
    ('${id(3)}','Jefatura','c@fixture.invalid','jefatura',null),
    ('${id(4)}','Secretaria','d@fixture.invalid','secretaria',null),
    ('${id(5)}','Operador','e@fixture.invalid','encargado',null);
    insert into public.people(id,first_name,last_name,class_id,category,active,photo_path) values
    ('${id(20)}','Persona','Propia','${id(10)}','Joven',false,'foto-existente.webp'),
    ('${id(21)}','Persona','Ajena','${id(11)}','Señorita',false,null),
    ('${id(22)}','Persona','Fusionada','${id(10)}','Joven',false,null);
    update public.people set merged_into='${id(20)}' where id='${id(22)}';
    insert into public.visits(id,date,class_id,"group") values('${id(30)}','2026-01-02','${id(10)}','Jóvenes');
    insert into public.attendance(visit_id,person_id,present,class_id,category) values('${id(30)}','${id(20)}',true,'${id(10)}','Joven');`);
  const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);if(n)await db.exec('set role authenticated');};
  await as(1);
  assert.deepEqual((await db.query('select id from public.people order by id')).rows.map(p=>p.id),[id(20),id(22)]);
  const saved=(await db.query('select * from public.reactivate_person($1)',[id(20)])).rows[0];
  assert.equal(saved.active,true);assert.equal(saved.id,id(20));assert.equal(saved.photo_path,'foto-existente.webp');
  await db.query('select public.reactivate_person($1)',[id(20)]); // repetir no duplica
  await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(21)]),/permiso/);
  await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(22)]),/fusionado/);
  await assert.rejects(()=>db.query('update public.people set active=false where id=$1',[id(20)]),/retirar/);
  await assert.rejects(()=>db.query('update public.people set class_id=$1 where id=$2',[id(11),id(20)]),/trasladar/);
  for(const central of [2,3,4]){
    await as(null);await db.query('update public.people set active=false where id=$1',[id(21)]);
    await as(central);assert.equal((await db.query('select * from public.reactivate_person($1)',[id(21)])).rows[0].active,true);
  }
  await as(5);await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(20)]),/permiso/);
  await as(null);await db.query('update public.profiles set must_change_password=true where id=$1',[id(1)]);
  await as(1);await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(20)]),/permiso/);
  await as(null);await db.query('update public.profiles set must_change_password=false,active=false where id=$1',[id(1)]);
  await as(1);await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(20)]),/permiso/);
  await as(null);
  assert.equal((await db.query('select count(*)::int n from public.people')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int n from public.attendance where present')).rows[0].n,1);
  await db.exec('set role anon');await assert.rejects(()=>db.query('select public.reactivate_person($1)',[id(20)]),/permission denied/);
 } finally {await db.close();}
});
test('interfaz ofrece reincorporación por clase y a perfiles centrales',()=>{
 const p={active:true,role:'clase',class_id:'san-carlos'};
 assert.equal(canPerson(p,'san-carlos','reactivate'),true);
 assert.equal(canPerson(p,'otra','reactivate'),false);
 assert.equal(canPerson(p,'san-carlos','retire'),false);
 for(const role of ['admin','jefatura','secretaria']) assert.equal(canPerson({...p,role},'otra','reactivate'),true);
 assert.equal(canPerson({...p,role:'encargado'},null,'reactivate'),false);
});
