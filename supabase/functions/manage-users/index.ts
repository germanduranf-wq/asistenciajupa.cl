import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers});
const roles = ['admin','encargado','jefatura','secretaria','clase','coro'];
// One class per request: retries preserve all existing accounts and passwords.
async function provisionClassAccounts(admin:any,classId:string,password:string,actor:string){
 const {data:c,error:classError}=await admin.from('iglesias').select('id,nombre,tipo,activo').eq('id',classId).maybeSingle();
 if(classError)throw Error('No se pudo consultar la clase.');
 if(!c?.activo||c.tipo==='Local')throw Error('Selecciona una clase activa o el Templo Matriz.');
 const stem=c.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!stem||stem.length>29)throw Error('El nombre de la clase necesita un usuario abreviado. Crea sus cuentas individualmente.');
 const rows=[];
 for(const limited of [false,true]){
  const username=`${stem}.${limited?'asistencia':'jupa'}`;
  const {data:existing,error:existingError}=await admin.from('usuarios').select('id,usuario,activo').eq('rol','clase').eq('iglesia_id',c.id).eq('solo_asistencia',limited);
  if(existingError)throw Error('Aplica primero la migración V3.5 en la base de datos.');
  if(existing.length){rows.push(...existing.map((p:any)=>({username:p.usuario,status:'existing',active:p.activo})));continue;}
  const {data:collision,error:collisionError}=await admin.from('usuarios').select('id').eq('usuario',username).maybeSingle();
  if(collisionError)throw Error('No se pudo comprobar el nombre de usuario.');
  if(collision){rows.push({username,status:'error',message:'El nombre ya pertenece a otra cuenta. Revisa su clase y perfil; no se modificó.'});continue;}
  const {data:created,error}=await admin.auth.admin.createUser({email:`${username}@usuarios.jupa.invalid`,password,email_confirm:true});
  if(error||!created?.user){rows.push({username,status:'error',message:'No se creó en Authentication. Comprueba el nombre y los requisitos de contraseña.'});continue;}
  const {error:profileError}=await admin.rpc('v3_completar_cuenta_clase',{p_id:created.user.id,p_clase:c.id,p_limitada:limited,p_usuario:username,p_actor:actor});
  if(profileError){
   // A network timeout can occur after commit. Never delete an account with a saved profile.
   const check=await admin.from('usuarios').select('id').eq('id',created.user.id).maybeSingle();
   if(check.data){rows.push({username,status:'created'});continue;}
   if(check.error){rows.push({username,status:'error',message:'Resultado pendiente de verificar. Revisa Authentication y usuarios antes de reintentar.'});continue;}
   const cleanup=await admin.auth.admin.deleteUser(created.user.id);
   rows.push({username,status:'error',message:cleanup.error?'No se guardó el perfil y no se pudo retirar la cuenta de Authentication. Revisa ambas tablas.':'No se guardó el perfil; se retiró la cuenta recién creada. Revisa la migración o vuelve a consultar las cuentas existentes.'});continue;
  }
  rows.push({username,status:'created'});
 }
 return rows;
}
Deno.serve(async req => {
 if (req.method==='OPTIONS') return new Response('ok',{headers});
 if (req.method!=='POST') return reply({error:'Método no permitido.'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return reply({error:'Sesión inválida. Vuelve a ingresar.'},401);
  const {data:profile,error:profileReadError}=await admin.from('v3_profiles').select('*').eq('id',user.id).maybeSingle();
  if(profileReadError)return reply({error:'La función no pudo consultar el perfil. Revisa que super-responder tenga el código V3 y que exista public.v3_profiles.',code:'PROFILE_READ_FAILED'},500);
  if(!profile)return reply({error:'Tu sesión no tiene una cuenta asociada en usuarios. Cierra sesión e ingresa otra vez. Si continúa, revisa el ID de Authentication y usuarios.',code:'PROFILE_NOT_FOUND'},403);
  if(!profile.active)return reply({error:'Tu cuenta está desactivada. Un administrador debe activarla antes de gestionar contraseñas.',code:'ACCOUNT_INACTIVE'},403);
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
   const saved=await admin.from('v3_profiles').update({must_change_password:false}).eq('id',user.id);
   if(saved.error)return reply({error:'La contraseña cambió, pero no se pudo habilitar el perfil. Contacta al administrador.'},500);
   await admin.from('v3_audit_log').insert({actor:user.id,action:'CHANGE_OWN_PASSWORD',table_name:'profiles',record_id:user.id});
   return reply({ok:true});
  }
  if(profile.role!=='admin'||profile.must_change_password)return reply({error:'Acceso reservado al administrador.'},403);
  if(body.action==='provision_class_accounts'){
   if(!goodPassword(body.password)||!/^\d+$/.test(String(body.class_id||'')))return reply({error:'Selecciona una clase y una contraseña temporal de 12 a 128 caracteres.'},400);
   try{return reply({ok:true,accounts:await provisionClassAccounts(admin,String(body.class_id),body.password,user.id)});}catch(e){return reply({error:(e as Error).message},400);}
  }
  if(body.action==='create'){
   const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!goodPassword(body.password)||!roles.includes(body.role))return reply({error:'Revisa nombre, usuario, perfil y contraseña (12 a 128 caracteres).'},400);
   if(body.role==='clase'&&!body.class_id)return reply({error:'Selecciona la clase de esta cuenta.'},400);
   if(body.attendance_only&&body.role!=='clase')return reply({error:'Solo asistencia requiere el perfil Cuenta de clase.'},400);
   if(body.class_id){const c=await admin.from('v3_classes').select('id').eq('id',body.class_id).eq('active',true).maybeSingle();if(!c.data)return reply({error:'Clase no disponible.'},400);}
   if(body.role==='clase'){const c=await admin.from('iglesias').select('tipo').eq('id',body.class_id).single();if(c.error||c.data.tipo==='Local')return reply({error:'Los locales no requieren cuentas. Selecciona una clase o Templo Matriz.'},400);}
   const email=`${username}@usuarios.jupa.invalid`;
   const {data:created,error}=await admin.auth.admin.createUser({email,password:body.password,email_confirm:true});
   if(error)return reply({error:'No se pudo crear la cuenta. Comprueba que el usuario no exista y que la contraseña cumpla los requisitos.'},400);
   const {error:profileError}=await admin.from('v3_profiles').insert({id:created.user.id,name:body.name.trim(),email,username,role:body.role,class_id:body.class_id||null,must_change_password:true,attendance_only:body.attendance_only===true});
   if(profileError){await admin.auth.admin.deleteUser(created.user.id);return reply({error:'No se pudo crear el perfil. Comprueba que la migración 2.0 esté aplicada.'},400);}
   await admin.from('v3_audit_log').insert({actor:user.id,action:'CREATE_ACCOUNT',table_name:'profiles',record_id:created.user.id});
   return reply({ok:true,id:created.user.id});
  }
  if(!/^[0-9a-f-]{36}$/i.test(body.id||''))return reply({error:'Usuario inválido.'},400);
  const {data:target,error:targetError}=await admin.from('v3_profiles').select('id,role,active,must_change_password').eq('id',body.id).maybeSingle();
  if(targetError)return reply({error:'No se pudo consultar la cuenta que quieres modificar. Revisa la configuración V3 de la función.',code:'TARGET_READ_FAILED'},500);
  if(!target)return reply({error:'La cuenta no existe.'},404);
  if(body.action==='update'){
   if(body.id===user.id)return reply({error:'No puedes desactivar tu propia cuenta.'},400);
   if(target.role==='admin'&&body.active===false)return reply({error:'No se desactivan administradores desde esta pantalla.'},400);
   if(typeof body.active!=='boolean')return reply({error:'Estado inválido.'},400);
   const {error}=await admin.from('v3_profiles').update({active:body.active}).eq('id',body.id);if(error)throw error;
   await admin.from('v3_audit_log').insert({actor:user.id,action:body.active?'ENABLE_ACCOUNT':'DISABLE_ACCOUNT',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  if(body.action==='password'){
   if(!goodPassword(body.password))return reply({error:'La contraseña debe tener entre 12 y 128 caracteres.'},400);
   // Bloquea el acceso antes de cambiar Auth. Una falla parcial queda cerrada por seguridad.
   const flag=await admin.from('v3_profiles').update({must_change_password:true}).eq('id',body.id);if(flag.error)throw flag.error;
   const {error}=await admin.auth.admin.updateUserById(body.id,{password:body.password});
   if(error){await admin.from('v3_profiles').update({must_change_password:target.must_change_password}).eq('id',body.id);return reply({error:'No se pudo restablecer la contraseña.'},400);}
   await admin.from('v3_audit_log').insert({actor:user.id,action:'RESET_PASSWORD',table_name:'profiles',record_id:body.id});
   return reply({ok:true});
  }
  return reply({error:'Acción no válida.'},400);
 }catch{return reply({error:'No se pudo completar la operación. Revisa la migración y la configuración de la función.'},500);}
});
