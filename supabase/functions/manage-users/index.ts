import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers});
const roles = ['admin','encargado','jefatura','secretaria','clase'];
Deno.serve(async req => {
 if (req.method==='OPTIONS') return new Response('ok',{headers});
 if (req.method!=='POST') return reply({error:'Método no permitido.'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return reply({error:'Sesión inválida. Vuelve a ingresar.'},401);
  const {data:profile,error:profileReadError}=await admin.from('profiles').select('*').eq('id',user.id).single();
  if(profileReadError||!profile?.active)return reply({error:'Cuenta sin acceso activo.'},403);
  const body=await req.json();
  const goodPassword=(p:unknown)=>typeof p==='string'&&p.length>=12&&p.length<=128;
  if(body.action==='change_own_password'){
   if(!goodPassword(body.password)||typeof body.current_password!=='string')return reply({error:'Ingresa la contraseña actual y una nueva de 12 a 128 caracteres.'},400);
   if(body.password===body.current_password)return reply({error:'La nueva contraseña debe ser diferente de la temporal o actual.'},400);
   const verifier=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const verified=await verifier.auth.signInWithPassword({email:user.email!,password:body.current_password});
   if(verified.error||verified.data.user?.id!==user.id)return reply({error:'La contraseña actual no es correcta.'},400);
   if(verified.data.session)await verifier.auth.signOut({scope:'local'});
   const updated=await admin.auth.admin.updateUserById(user.id,{password:body.password});
   if(updated.error)return reply({error:'No se pudo cambiar la contraseña. Revisa sus requisitos.'},400);
   const saved=await admin.from('profiles').update({must_change_password:false}).eq('id',user.id);
   if(saved.error)return reply({error:'La contraseña cambió, pero no se pudo habilitar el perfil. Contacta al administrador.'},500);
   await admin.from('audit_log').insert({actor:user.id,action:'CHANGE_OWN_PASSWORD',table_name:'profiles',record_id:user.id});
   return reply({ok:true});
  }
  if(profile.role!=='admin'||profile.must_change_password)return reply({error:'Acceso reservado al administrador.'},403);
  if(body.action==='create'){
   const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!goodPassword(body.password)||!roles.includes(body.role))return reply({error:'Revisa nombre, usuario, perfil y contraseña (12 a 128 caracteres).'},400);
   if(body.role==='clase'&&!body.class_id)return reply({error:'Selecciona la clase de esta cuenta.'},400);
   if(body.class_id){const c=await admin.from('classes').select('id').eq('id',body.class_id).eq('active',true).maybeSingle();if(!c.data)return reply({error:'Clase no disponible.'},400);}
   const email=`${username}@usuarios.jupa.invalid`;
   const {data:created,error}=await admin.auth.admin.createUser({email,password:body.password,email_confirm:true});
   if(error)return reply({error:'No se pudo crear la cuenta. Comprueba que el usuario no exista y que la contraseña cumpla los requisitos.'},400);
   const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,name:body.name.trim(),email,username,role:body.role,class_id:body.class_id||null,must_change_password:true});
   if(profileError){await admin.auth.admin.deleteUser(created.user.id);return reply({error:'No se pudo crear el perfil. Comprueba que la migración 2.0 esté aplicada.'},400);}
   await admin.from('audit_log').insert({actor:user.id,action:'CREATE_ACCOUNT',table_name:'profiles',record_id:created.user.id});
   return reply({ok:true,id:created.user.id});
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.id||''))return reply({error:'Usuario inválido.'},400);
  const {data:target}=await admin.from('profiles').select('id,role,active,must_change_password').eq('id',body.id).maybeSingle();
  if(!target)return reply({error:'La cuenta no existe.'},404);
  if(body.action==='update'){
   if(body.id===user.id)return reply({error:'No puedes desactivar tu propia cuenta.'},400);
   if(target.role==='admin'&&body.active===false)return reply({error:'No se desactivan administradores desde esta pantalla.'},400);
   if(typeof body.active!=='boolean')return reply({error:'Estado inválido.'},400);
   const {error}=await admin.from('profiles').update({active:body.active}).eq('id',body.id);if(error)throw error;
   await admin.from('audit_log').insert({actor:user.id,action:body.active?'ENABLE_ACCOUNT':'DISABLE_ACCOUNT',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  if(body.action==='password'){
   if(!goodPassword(body.password))return reply({error:'La contraseña debe tener entre 12 y 128 caracteres.'},400);
   // Bloquea el acceso antes de cambiar Auth. Una falla parcial queda cerrada por seguridad.
   const flag=await admin.from('profiles').update({must_change_password:true}).eq('id',body.id);if(flag.error)throw flag.error;
   const {error}=await admin.auth.admin.updateUserById(body.id,{password:body.password});
   if(error){await admin.from('profiles').update({must_change_password:target.must_change_password}).eq('id',body.id);return reply({error:'No se pudo restablecer la contraseña.'},400);}
   await admin.from('audit_log').insert({actor:user.id,action:'RESET_PASSWORD',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  return reply({error:'Acción no válida.'},400);
 }catch{return reply({error:'No se pudo completar la operación. Revisa la migración y la configuración de la función.'},500);}
});
