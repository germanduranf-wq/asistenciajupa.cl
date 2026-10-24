import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,as} from './support/database.mjs';
import {titleName,possibleDuplicates} from '../src/domain.mjs';

test('Nombres: migra existentes sin perder relaciones y normaliza altas futuras bajo RLS',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros','202610230002_resumenes_secretaria']);
 const migration=await readFile(new URL('../supabase/migrations/202610240001_formato_nombres.sql',import.meta.url),'utf8');
 try{
  const {rows:[p]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria,observaciones) values('MARTÍN ANTONIO','FARÍAS SOTO',1,'Joven','Observación conservada') returning *");
  await db.exec("insert into public.actividades(id,date,iglesia_id,\"group\",tipo_actividad) values(100,current_date,1,'Jóvenes','visita')");
  await as(db,1);await db.query('select public.v3_set_attendance(100,$1,true,0)',[p.id]);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");
  const before=(await db.query('select * from public.asistencias')).rows;
  await db.exec(migration);
  const {rows:[updated]}=await db.query('select * from public.miembros where id=$1',[p.id]);
  assert.equal(updated.nombres,'Martín Antonio');assert.equal(updated.apellidos,'Farías Soto');
  assert.deepEqual({...updated,nombres:p.nombres,apellidos:p.apellidos},p);
  assert.deepEqual((await db.query('select * from public.asistencias')).rows,before);
  const audited=(await db.query('select count(*)::int n from public.auditoria')).rows[0].n;
  await db.exec(migration);assert.equal((await db.query('select count(*)::int n from public.auditoria')).rows[0].n,audited);
  for(const account of [1,2]){
   await as(db,account);
   const {rows:[created]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('  mARÍA   JOSÉ  ','  MUÑOZ o’NEILL  ',1,'Señorita') returning *");
   assert.equal(created.nombres,'María José');assert.equal(created.apellidos,'Muñoz O’Neill');
   await db.query("update public.miembros set nombres='JUAN-PABLO' where id=$1",[created.id]);
   assert.equal((await db.query('select nombres from public.miembros where id=$1',[created.id])).rows[0].nombres,'Juan-Pablo');
  }
  await assert.rejects(()=>db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria,rut) values('A','B',1,'Joven','123')"),/RUT/);
  for(const value of ['MARTÍN ANTONIO','  mARÍA   JOSÉ  ','MUÑOZ o’NEILL','JUAN-PABLO','de la CRUZ','JOSE\u0301']){
   assert.equal((await db.query('select jupa_v3.formato_nombre($1) n',[value])).rows[0].n,titleName(value));
  }
  assert.equal(titleName(null),'');
  assert.equal(possibleDuplicates([{id:'1',first_name:'MARTIN ANTONIO',last_name:'FARIAS SOTO'}],{first_name:'Martín Antonio',last_name:'Farías Soto'}).length,1);
 }finally{await db.close();}
});
