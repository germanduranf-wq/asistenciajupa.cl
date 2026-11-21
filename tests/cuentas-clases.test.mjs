import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/manage-users/index.ts',import.meta.url),'utf8')).replace("import { createClient } from 'npm:@supabase/supabase-js@2';",''));
const provision=new Function('Deno',source+';return provisionClassAccounts;')({serve(){}});
function mock({existing=[],kind='Clase',failure=false,afterCommit=false}={}){
 const users=[...existing],created=[],deleted=[],calls=[];
 const client={from(table){
  const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle(){return execute(true);},then(resolve,reject){return execute(false).then(resolve,reject);}};
  async function execute(single){const data=table==='iglesias'?[{id:1,nombre:'San Carlos',tipo:kind,activo:true}]:users.filter(p=>filters.every(([k,v])=>p[k]===v));return {data:single?(data[0]||null):data,error:null};}return q;
 },auth:{admin:{async createUser(v){const id='new-'+(created.length+1);created.push({...v,id});return {data:{user:{id}},error:null};},async deleteUser(id){deleted.push(id);return {error:null};}}},async rpc(name,args){calls.push(args);if(!failure||afterCommit)users.push({id:args.p_id,rol:'clase',iglesia_id:1,solo_asistencia:args.p_limitada,usuario:args.p_usuario,activo:true});return {error:failure?{message:'failure'}:null};}};
 return {client,created,deleted,calls};
}
test('Cuentas: crea solo las faltantes y repetir no restablece claves existentes',async()=>{
 const m=mock({existing:[{id:'old',rol:'clase',iglesia_id:1,solo_asistencia:false,usuario:'sancarlos.jupa',activo:true}]});
 const rows=await provision(m.client,'1','Temporal-Prueba-123!','admin');
 assert.deepEqual(rows.map(r=>r.status),['existing','created']);assert.equal(m.created.length,1);assert.equal(m.created[0].email,'sancarlos.asistencia@usuarios.jupa.invalid');
 assert.equal(m.calls[0].p_limitada,true);assert(!JSON.stringify(rows).includes('Temporal'));
 assert((await provision(m.client,'1','Otra-Clave-123!','admin')).every(r=>r.status==='existing'));assert.equal(m.created.length,1);
});
test('Cuentas: excluye locales y revierte únicamente la cuenta nueva sin perfil',async()=>{
 const local=mock({kind:'Local'});await assert.rejects(()=>provision(local.client,'1','Temporal-Prueba-123!','admin'),/clase activa/);assert.equal(local.created.length,0);
 const fail=mock({failure:true});const rows=await provision(fail.client,'1','Temporal-Prueba-123!','admin');assert(rows.every(r=>r.status==='error'));assert.equal(fail.deleted.length,2);
 const timeout=mock({failure:true,afterCommit:true});assert((await provision(timeout.client,'1','Temporal-Prueba-123!','admin')).every(r=>r.status==='created'));assert.equal(timeout.deleted.length,0);
});
test('Cuentas: el endpoint impide que perfiles no administradores creen lotes',async()=>{
 for(const profile of [{active:true,role:'clase'},{active:true,role:'admin',must_change_password:true}]){
  let handler;const client={auth:{getUser:async()=>({data:{user:{id:'caller'}}})},from(){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:profile})};return q;}};
  new Function('Deno','createClient',source)({env:{get:()=>''},serve:fn=>handler=fn},()=>client);
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'provision_class_accounts',class_id:1,password:'Temporal-Prueba-123!'})}));assert.equal(response.status,403);
 }
});
