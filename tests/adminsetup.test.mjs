import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Configuración San Carlos: repetible, aislada y vistas privadas con nombres', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  for(const file of ['202610100001_initial.sql','202610110001_usernames.sql','202610120001_activities_permissions.sql'])
    await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const sql=await readFile(new URL('../supabase/admin/configurar-sancarlos.sql',import.meta.url),'utf8');
  await assert.rejects(()=>db.exec(sql),/Primero crea/); await db.exec('rollback');
  const id='00000000-0000-4000-8000-000000000001';
  await db.exec(`insert into auth.users values('${id}');
    insert into public.profiles(id,name,email,username,role) values('${id}','Cuenta San Carlos','fixture@example.invalid','sancarlos.jupa','encargado');
    insert into public.classes(name) values('San Carlos'),('Otra clase');
    insert into public.account_permissions(profile_id,module,can_manage) values('${id}','visita',true);`);
  await db.exec(sql); await db.exec(sql);
  const rows=(await db.query("select * from public.permisos_detalle where puede_ver")).rows;
  assert.equal(rows.length,3);
  assert.ok(rows.every(r=>r.usuario==='sancarlos.jupa' && r.alcance==='San Carlos' && r.perfil==='Cuenta de clase' && r.puede_gestionar && r.puede_exportar));
  assert.equal((await db.query("select count(*)::int n from public.account_permissions where module='visita' and can_view")).rows[0].n,0);
  const own=(await db.query("select id from public.classes where name='San Carlos'")).rows[0].id;
  const other=(await db.query("select id from public.classes where name='Otra clase'")).rows[0].id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
  assert.equal((await db.query("select private.can_activity('escuela_dominical',$1,'manage') ok",[own])).rows[0].ok,true);
  assert.equal((await db.query("select private.can_activity('escuela_dominical',$1,'manage') ok",[other])).rows[0].ok,false);
  assert.equal((await db.query("select private.can_activity('visita',$1,'manage') ok",[own])).rows[0].ok,false);
  await assert.rejects(()=>db.query('select * from public.permisos_detalle'),/permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>db.query('select * from public.usuarios_detalle'),/permission denied/);
  await db.exec('reset role');
  await db.query("update public.classes set name='San Carlos actualizado' where id=$1",[own]);
  assert.equal((await db.query('select clase from public.usuarios_detalle')).rows[0].clase,'San Carlos actualizado');
 } finally {await db.close();}
});
