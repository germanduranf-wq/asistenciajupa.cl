import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/manage-users/index.ts',import.meta.url),'utf8')).replace("import { createClient } from 'npm:@supabase/supabase-js@2';",''));
async function run(profile,readError=null){
 let handler,changed=false;const id='00000000-0000-4000-8000-000000000001';
 const client={auth:{getUser:async()=>({data:{user:{id}},error:null}),admin:{updateUserById:async()=>{changed=true;return {error:null};}}},from:()=>{
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:profile,error:readError}),update:()=>q,insert:async()=>({error:null}),then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;
 }};
 new Function('Deno','createClient',code)({env:{get:()=> 'test-only'},serve:fn=>handler=fn},()=>client);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer test-only','Content-Type':'application/json'},body:JSON.stringify({action:'password',id,password:'Generated-Test-Only-123!'})}));
 return {status:response.status,body:await response.json(),changed};
}
test('Función: distingue error de consulta, perfil faltante y cuenta inactiva sin cambiar contraseñas',async()=>{
 for(const [p,e,expected]of [[null,{message:'missing relation'},'PROFILE_READ_FAILED'],[null,null,'PROFILE_NOT_FOUND'],[{active:false},null,'ACCOUNT_INACTIVE']]){const r=await run(p,e);assert.equal(r.body.code,expected);assert.equal(r.changed,false);}
});
test('Función: solo administrador activo sin contraseña temporal restablece',async()=>{
 for(const p of [{active:true,role:'jefatura'},{active:true,role:'admin',must_change_password:true}]){const r=await run(p);assert.equal(r.status,403);assert.equal(r.changed,false);}
 const r=await run({active:true,role:'admin',must_change_password:false});assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.changed,true);
});
