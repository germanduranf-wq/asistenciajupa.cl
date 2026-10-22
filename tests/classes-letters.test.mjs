import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {belongsToClass,canPerson,eligiblePerson} from '../src/access.mjs';
import {visibleBulletin} from '../src/bulletin-model.mjs';
import {letterTemplate,summaryRows,letterFilename} from '../src/visit-exports.mjs';
import {zipFiles} from '../src/zip.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('interfaz: pertenencia doble, avisos y documentos',()=>{
 const person={class_id:'1',secondary_class_id:'2'};
 assert.ok(belongsToClass(person,'2'));assert.ok(canPerson({role:'clase',class_id:'2',active:true},person,'edit'));
 assert.ok(eligiblePerson({activity_type:'escuela_dominical',class_id:'2'},person));
 assert.ok(!canPerson({role:'clase',class_id:'3',active:true},person,'edit'));
 const bulletin={activities:[{date:'2026-10-02'},{date:'2026-10-22'},{date:'2026-10-30'}],events:[]};
 assert.equal(visibleBulletin(bulletin,'2026-10','2026-10-22').activities.length,2);
 assert.equal(visibleBulletin(bulletin,'2026-10','2026-11-01').activities.length,3);
 assert.equal(letterTemplate({group:'Señoritas',role:'Coordinación'}),'women');
 assert.equal(letterTemplate({group:'Jóvenes',role:'Dirección del coro'}),'choir');
 assert.equal(summaryRows([{date:'2026-10-23',group:'Jóvenes'},{date:'2026-10-24',group:'Jóvenes'}]).length,1);
});
test('ZIP conserva nombres UTF-8 y contenido',async()=>{
 const blob=zipFiles([{name:'carta-señoritas.pdf',bytes:new TextEncoder().encode('%PDF-prueba')}]);
 const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/zip-prueba.zip',import.meta.url),bytes);
});
test('V3.1: clases, historial, permisos, doble marca y folios',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
 for(const f of ['202610100001_initial','202610110001_usernames','202610120001_activities_permissions','202610120002_minimum_age_10','202610120003_reactivate_people','202610140001_bodies_notices','202610170001_esquema_espanol','202610220001_clases_cartas'])await db.exec(await readFile(new URL('../supabase/migrations/'+f+'.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.iglesias(id,nombre) values(1,'San Carlos'),(2,'Templo Matriz'),(3,'Otra');insert into auth.users values('${uid(1)}'),('${uid(2)}'),('${uid(3)}'),('${uid(4)}'),('${uid(5)}'),('${uid(6)}');insert into public.usuarios(id,nombre,usuario,identificador_auth,rol,iglesia_id) values('${uid(1)}','Admin','admin','a@test','admin',null),('${uid(2)}','Clase A','clasea','b@test','clase',1),('${uid(3)}','Clase B','claseb','c@test','clase',2),('${uid(4)}','Otra','otra','d@test','clase',3),('${uid(5)}','Secretaria','secretaria','e@test','secretaria',null),('${uid(6)}','Jefatura','jefatura','f@test','jefatura',null);update public.modulos set habilitado=true;insert into public.miembros(id,nombres,apellidos,iglesia_id,otra_iglesia_id,categoria) values(1,'JUAN','PEREZ',1,2,'Joven');insert into public.actividades(id,date,iglesia_id,"group",tipo_actividad) values(1,current_date-extract(dow from current_date)::int,1,'Todos','escuela_dominical'),(2,current_date-extract(dow from current_date)::int,2,'Todos','escuela_dominical'),(3,current_date-extract(dow from current_date)::int,2,'Todos','servicio_domingo'),(4,current_date,3,'Jóvenes','visita');insert into public.permisos(usuario_auth_id,modulo,iglesia_id,puede_ver,puede_registrar,puede_exportar) values('${uid(2)}','escuela_dominical',1,true,true,true),('${uid(3)}','escuela_dominical',2,true,true,true),('${uid(3)}','servicio_domingo',2,true,true,true);insert into public.responsabilidades(actividad_id,rol,miembro_id) values(4,'Coordinación',1),(4,'Predicación',1);`);
 const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 await as(2);assert.equal((await db.query('select id from public.miembros')).rows.length,1);await db.exec("update public.miembros set observaciones='Nota clase A' where id=1");
 await as(3);await db.exec("update public.miembros set observaciones='Nota clase B' where id=1");assert.equal((await db.query('select observaciones from public.miembros')).rows[0].observaciones,'Nota clase B');
 await db.exec("insert into storage.objects(bucket_id,name) values('portraits','1/abcd.webp')");await db.query("select public.v3_set_photo(1,'1/abcd.webp')");
 await db.query('select public.v3_set_attendance(2,1,true,0)');assert.equal(Number((await db.query('select iglesia_id from public.asistencias where actividad_id=2')).rows[0].iglesia_id),2);
 await as(2);assert.equal((await db.query('select * from public.v3_presencias_otras_clases(1)')).rows[0].clase_presente,'Templo Matriz');await assert.rejects(()=>db.query('select public.v3_set_attendance(1,1,true,0)'),/ya está presente/);
 await as(3);await db.query('select public.v3_set_attendance(3,1,true,0)');await db.query('select public.v3_set_attendance(2,1,false,1)');
 await as(2);await db.query('select public.v3_set_attendance(1,1,true,0)');
 await as(4);assert.equal((await db.query('select id from public.miembros')).rows.length,0);assert.equal((await db.query("update public.miembros set observaciones='Ajena' where id=1 returning id")).rows.length,0);await assert.rejects(()=>db.query('select * from public.v3_historial_miembro(1,current_date-365,current_date)'),/Sin acceso/);await assert.rejects(()=>db.query('select public.v3_emitir_cartas(4,null)'),/Sin acceso/);
 await as(1);await db.exec('update public.miembros set iglesia_id=2,otra_iglesia_id=null where id=1');assert.equal(Number((await db.query('select iglesia_id from public.asistencias where actividad_id=1')).rows[0].iglesia_id),1);
 await as(3);const history=(await db.query('select * from public.v3_historial_miembro(1,current_date-365,current_date)')).rows;assert.equal(history.length,2);assert.deepEqual(new Set(history.map(r=>r.clase_contabilizada)),new Set(['San Carlos','Templo Matriz']));
 await as(2);assert.equal((await db.query('select * from public.miembros')).rows.length,0);assert.equal((await db.query('select * from public.v3_miembros_historicos()')).rows[0].nombres,'JUAN');assert.equal((await db.query('select * from public.v3_historial_miembro(1,current_date-365,current_date)')).rows.length,1);
 await as(5);assert.equal((await db.query('select * from public.asistencias where actividad_id=4')).rows.length,0);const letters=(await db.query('select public.v3_emitir_cartas(null,current_date) r')).rows[0].r;assert.equal(letters.length,2);assert.equal(letters[0].folio,'AJ 01');assert.deepEqual((await db.query('select public.v3_emitir_cartas(null,current_date) r')).rows[0].r,letters);
 await as(6);assert.equal((await db.query('select public.v3_emitir_cartas(4,null) r')).rows[0].r.length,2);await assert.rejects(()=>db.query('select public.v3_emitir_cartas(null,current_date)'),/mensual/);
 await db.exec('reset role');await assert.rejects(()=>db.exec('update public.asistencias set presente=true where actividad_id=2'),/asistencia_local_unica/);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.v3_emitir_cartas(4,null)'),/permission denied/);await assert.rejects(()=>db.query('select * from public.cartas_visitas'),/permission denied/);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/202610220001_clases_cartas.sql',import.meta.url),'utf8'));assert.equal((await db.query('select count(*)::int n from public.cartas_visitas')).rows[0].n,2);
 }finally{await db.close();}
});
