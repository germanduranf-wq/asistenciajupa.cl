import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req => {
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=req.headers.get('Authorization')||'';
  const client=createClient(url,anon,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return reply({error:'Sesión inválida.'},401);
  const {data:profile}=await client.from('profiles').select('role,active').eq('id',user.id).single();
  if(!profile?.active||profile.role!=='admin')return reply({error:'Acceso reservado al administrador.'},403);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const body=await req.json();
  if(body.action==='create'){
   if(typeof body.email!=='string'||!body.email.includes('@')||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.password!=='string'||body.password.length<12||!['admin','encargado'].includes(body.role))return reply({error:'Revisa nombre, correo, perfil y contraseña (mínimo 12 caracteres).'},400);
   const {data:created,error}=await admin.auth.admin.createUser({email:body.email.trim().toLowerCase(),password:body.password,email_confirm:true});
   if(error)return reply({error:error.message},400);
   const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,name:body.name.trim(),email:body.email.trim().toLowerCase(),role:body.role});
   if(profileError){await admin.auth.admin.deleteUser(created.user.id);return reply({error:'No se pudo crear el perfil. Vuelve a intentarlo.'},400);}
   await admin.from('audit_log').insert({actor:user.id,action:'CREATE_ACCOUNT',table_name:'profiles',record_id:created.user.id});
   return reply({ok:true,id:created.user.id});
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.id||''))return reply({error:'Usuario inválido.'},400);
  const {data:target}=await admin.from('profiles').select('id,role,active').eq('id',body.id).maybeSingle();
  if(!target)return reply({error:'La cuenta no existe.'},404);
  if(body.action==='update'){
   if(body.id===user.id)return reply({error:'No puedes desactivar tu propia cuenta.'},400);
   // Conserva todos los administradores existentes. Evita perder acceso por desactivaciones concurrentes.
   if(target.role==='admin'&&body.active===false)return reply({error:'No se desactivan administradores desde esta pantalla. Usa Supabase para revisar ese acceso.'},400);
   if(typeof body.active!=='boolean')return reply({error:'Estado inválido.'},400);
   const {error}=await admin.from('profiles').update({active:body.active}).eq('id',body.id);
   if(error)throw error;
   await admin.from('audit_log').insert({actor:user.id,action:body.active?'ENABLE_ACCOUNT':'DISABLE_ACCOUNT',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  if(body.action==='password'){
   if(typeof body.password!=='string'||body.password.length<12)return reply({error:'La contraseña debe tener al menos 12 caracteres.'},400);
   const {error}=await admin.auth.admin.updateUserById(body.id,{password:body.password});if(error)throw error;
   await admin.from('audit_log').insert({actor:user.id,action:'RESET_PASSWORD',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  return reply({error:'Acción no válida.'},400);
 }catch{return reply({error:'No se pudo completar la operación. Revisa la configuración de la función.'},500);}
});
