import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,as} from './support/database.mjs';
test('Las cuentas autorizadas crean una ficha y reciben INSERT RETURNING bajo RLS',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros']);
 try{
  for(const role of [1,2,3,4,7]){
   await as(db,role);
   const r=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria,activo,otra_iglesia_id,observaciones,cuerpos_ids,fecha_nacimiento) values($1,'PRUEBA',1,'Joven',true,2,'Nota','{}',null) returning *",['NUEVO'+role]);
   assert.equal(r.rows.length,1);
  }
  await as(db,5);await assert.rejects(()=>db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('NO','AUTORIZADO',1,'Joven') returning *"),/row-level security/);
  await as(db,6);await assert.rejects(()=>db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria) values('CORO','NO AUTORIZADO',1,'Joven') returning *"),/row-level security/);
 }finally{await db.close();}
});
