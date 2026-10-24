import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function setup(extra=[]){
 const db=new PGlite();
 await db.exec("set timezone='America/Santiago'");
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
 for(const f of ['202610100001_initial','202610110001_usernames','202610120001_activities_permissions','202610120002_minimum_age_10','202610120003_reactivate_people','202610140001_bodies_notices','202610170001_esquema_espanol','202610220001_clases_cartas',...extra])await db.exec(await readFile(new URL('../../supabase/migrations/'+f+'.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.iglesias(id,nombre) values(1,'Clase A'),(2,'Clase B'),(3,'Clase C');`);
 for(const [n,role,cl] of [[1,'admin',null],[2,'jefatura',null],[3,'secretaria',null],[4,'clase',1],[5,'clase',2],[6,'coro',null],[7,'encargado',null]]){
  await db.query('insert into auth.users values($1)',[uid(n)]);
  await db.query('insert into public.usuarios(id,nombre,usuario,identificador_auth,rol,iglesia_id) values($1,$2,$2,$3,$4,$5)',[uid(n),'cuenta'+n,'cuenta'+n+'@test.invalid',role,cl]);
 }
 return db;
}
export async function as(db,n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');}
