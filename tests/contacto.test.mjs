import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,as} from './support/database.mjs';
import {encode,decode} from '../src/schema.mjs';
import {participantColumns,participantRow} from '../src/service-summary.mjs';
test('Contacto: columnas opcionales, edición por clase y lectura privada',async()=>{
 const db=await setup(['202610230001_corregir_alta_miembros']);
 try{const sql=await readFile(new URL('../supabase/migrations/202611200001_contacto_miembros.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);await as(db,4);
 const {rows:[m]}=await db.query("insert into public.miembros(nombres,apellidos,iglesia_id,categoria,telefono,correo_contacto,nombre_contacto_emergencia,telefono_emergencia,direccion_completa) values('Prueba','Contacto',1,'Joven','+56 9 0000 0000','ejemplo@example.invalid','Contacto ficticio','00000000','Dirección de prueba') returning *");
 assert.equal(m.correo_contacto,'ejemplo@example.invalid');await db.query('update public.miembros set telefono=$1 where id=$2',['11111111',m.id]);
 await as(db,5);assert.equal((await db.query('select * from public.miembros where id=$1',[m.id])).rows.length,0);assert.equal((await db.query("update public.miembros set telefono='22222222' where id=$1 returning id",[m.id])).rows.length,0);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select telefono from public.miembros'),/permission/);
 }finally{await db.close();}
});
test('Contacto: adaptador y Excel conservan correo separado del acceso',()=>{
 const p={phone:'123',contact_email:'a@example.invalid',emergency_contact_name:'Contacto',emergency_phone:'456',full_address:'Dirección'};assert.deepEqual(decode(encode(p)),p);assert.equal(encode(p).correo_contacto,'a@example.invalid');assert.equal(encode({email:'login'}).identificador_auth,'login');
 const data={classes:[],bodies:[]};assert.equal(participantColumns(data).length,participantRow(p,data).length);assert.equal(participantRow(p,data).at(-1),'Dirección');
});
