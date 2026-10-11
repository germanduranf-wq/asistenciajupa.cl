import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A = '00000000-0000-4000-8000-000000000001',
  M = '00000000-0000-4000-8000-000000000002',
  D = '00000000-0000-4000-8000-000000000003',
  C = '10000000-0000-4000-8000-000000000001',
  C2 = '10000000-0000-4000-8000-000000000002',
  P = '20000000-0000-4000-8000-000000000001',
  P2 = '20000000-0000-4000-8000-000000000002',
  V = '30000000-0000-4000-8000-000000000001',
  OLD = '30000000-0000-4000-8000-000000000002',
  EDGE = '30000000-0000-4000-8000-000000000003',
  FUTURE = '30000000-0000-4000-8000-000000000004';
test('PostgreSQL: seguridad, concurrencia lógica, plazo y conservación de historial', async t => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610100001_initial.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into auth.users values('${A}'),('${M}'),('${D}'); insert into public.profiles(id,name,email,role,active) values('${A}','Admin','a@test.cl','admin',true),('${M}','Encargado','m@test.cl','encargado',true),('${D}','Desactivado','d@test.cl','encargado',false); insert into public.classes(id,name) values('${C}','San Carlos'),('${C2}','Templo matriz'); insert into public.people(id,first_name,last_name,class_id,category) values('${P}',' Germán  Andrés ','Durán','${C}','Joven'),('${P2}','German Andres','Duran','${C}','Joven'); insert into public.visits(id,date,class_id,"group") values('${V}',(now() at time zone 'America/Santiago')::date,'${C}','Jóvenes'),('${OLD}',(now() at time zone 'America/Santiago')::date-22,'${C}','Jóvenes'),('${EDGE}',(now() at time zone 'America/Santiago')::date-21,'${C}','Jóvenes'),('${FUTURE}',(now() at time zone 'America/Santiago')::date+7,'${C}','Jóvenes');`);
  const as = async id => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  };
  const mark = (v, p, present, version) => db.query('select * from public.set_attendance($1,$2,$3,$4)', [v, p, present, version]);
  await t.test('anon no puede leer ni registrar asistencia', async () => {
    await as(null);
    await assert.rejects(() => db.query('select * from public.people'), /permission denied/);
    await assert.rejects(() => mark(V, P, true, 0), /permission denied/);
  });
  await t.test('encargado crea personas normalizadas pero no cambia clase ni perfiles', async () => {
    await as(M);
    const r = await db.query('select first_name from public.people where id=$1', [P]);
    assert.equal(r.rows[0].first_name, 'GERMÁN ANDRÉS');
    const changed = await db.query("update public.people set first_name='MAL' where id=$1 returning id", [P]);
    assert.equal(changed.rows.length, 0);
    await assert.rejects(() => db.query("update public.profiles set role='admin' where id=$1", [M]), /permission denied/);
    await assert.rejects(() => db.query("insert into public.people(first_name,last_name,class_id,category,rut) values('A','B',$1,'Joven','123456784')", [C]), /RUT/);
  });
  await t.test('guardado por persona detecta versión obsoleta', async () => {
    await as(M);
    const r = await mark(V, P, true, 0);
    assert.equal(r.rows[0].version, 1);
    await assert.rejects(() => mark(V, P, false, 0), /Otro encargado/);
    await mark(V, P, false, 1);
    await mark(V, P, true, 2);
    assert.equal((await db.query('select count(*)::int n from public.attendance where visit_id=$1', [V])).rows[0].n, 1);
    await assert.rejects(() => db.query('update public.attendance set present=false'), /permission denied/);
  });
  await t.test('día 21 permitido, día 22 y futuro bloqueados', async () => {
    await as(M);
    await mark(EDGE, P, true, 0);
    await assert.rejects(() => mark(OLD, P, true, 0), /21 días/);
    await assert.rejects(() => mark(FUTURE, P, true, 0), /abre el día/);
    await as(A);
    await mark(OLD, P, true, 0);
  });
  await t.test('perfil desactivado no puede leer ni escribir', async () => {
    await as(D);
    assert.equal((await db.query('select * from public.people')).rows.length, 0);
    await assert.rejects(() => mark(V, P, false, 3), /No tienes acceso/);
  });
  await t.test('cambiar clase no altera la clase histórica', async () => {
    await as(A);
    await db.query('update public.people set class_id=$1 where id=$2', [C2, P]);
    await mark(V, P, false, 3);
    await mark(V, P, true, 4);
    assert.equal((await db.query('select class_id from public.attendance where visit_id=$1 and person_id=$2', [V, P])).rows[0].class_id, C);
  });
  await t.test('responsable: estado separado, versiones y plazo', async () => {
    await as(A);
    const {
      rows: [visit]
    } = await db.query('select * from public.visits where id=$1', [OLD]);
    await db.query('select public.save_visit($1,$2)', [JSON.stringify(visit), JSON.stringify({
      'Predicación': P
    })]);
    const r = (await db.query('select * from public.responsibilities where visit_id=$1', [OLD])).rows[0];
    await as(M);
    await assert.rejects(() => db.query('select public.set_responsibility($1,$2,$3,$4,$5)', [r.id, 'Cumplió', P, '', r.version]), /21 días/);
    await as(A);
    await db.query('select public.set_responsibility($1,$2,$3,$4,$5)', [r.id, 'Se excusó', null, 'Motivo registrado', r.version]);
    assert.equal((await db.query('select present from public.attendance where visit_id=$1 and person_id=$2', [OLD, P])).rows[0].present, true);
    await assert.rejects(() => db.query('select public.set_responsibility($1,$2,$3,$4,$5)', [r.id, 'Cumplió', P, '', r.version]), /Otro encargado/);
  });
  await t.test('fotografías privadas y sin permiso de modificar otros datos', async () => {
    await as(M);
    const path = `${P}/40000000-0000-4000-8000-000000000001.webp`;
    await db.query("insert into storage.objects(bucket_id,name) values('portraits',$1)", [path]);
    await db.query('select public.set_photo($1,$2)', [P, path]);
    assert.equal((await db.query('select photo_path from public.people where id=$1', [P])).rows[0].photo_path, path);
    await assert.rejects(() => db.query('update public.people set photo_path=$1 where id=$2', [path, P2]), /permission denied/);
    await assert.rejects(() => db.query('select public.set_photo($1,$2)', [P2, path]), /Ruta/);
    await as(null);
    await assert.rejects(() => db.query('select * from storage.objects'), /permission denied/);
  });
  await t.test('fusión conserva una sola asistencia por visita y bloquea el origen', async () => {
    await as(M);
    await assert.rejects(() => db.query('select public.merge_people($1,$2)', [P2, P]), /administrador/);
    await as(A);
    await mark(V, P2, true, 0);
    await db.query('select public.merge_people($1,$2)', [P2, P]);
    assert.equal((await db.query('select count(*)::int n from public.attendance where visit_id=$1 and present', [V])).rows[0].n, 1);
    assert.equal((await db.query('select active from public.people where id=$1', [P2])).rows[0].active, false);
    await assert.rejects(() => mark(V, P2, true, 0), /no está disponible/);
  });
  await t.test('auditoría visible solamente al administrador', async () => {
    await as(M);
    assert.equal((await db.query('select * from public.audit_log')).rows.length, 0);
    await as(A);
    assert.ok((await db.query('select * from public.audit_log')).rows.length > 10);
  });
  await db.close();
});
