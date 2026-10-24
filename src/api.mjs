import {database} from './database.mjs';
import {summaryPayload,canSummary} from './service-summary.mjs';
import { canPerson, canActivity, eligiblePerson, localActivity, MODULES, canSchedule } from './access.mjs';
import { normalizeUsername, usernameEmail } from './username.mjs';
import { createClient } from '@supabase/supabase-js';
import { createDemo } from './demo.mjs';
import { canEdit, upper, cleanRut } from './domain.mjs';
const config = window.JUPA_CONFIG || {};
export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
export const demoAllowed = config.allowDemo === true;
export const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const db = configured ? database(supabase) : null;
const KEY = 'jupa-demo-v5';
let demo = false;
let demoRole = 'admin';
export const isDemo = () => demo;
export const currentDemoRole = () => demoRole;
export function enterDemo(role = 'admin') {
  demo = true;
  demoRole = role;
}
export function leaveDemo() {
  demo = false;
}
const readDemo = () => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (value?.people && value?.visits) { value.profiles = value.profiles.map(p => ({ ...p, username: p.username || p.email?.split('@')[0] })); return value; }
  } catch {}
  const d = createDemo();
  localStorage.setItem(KEY, JSON.stringify(d));
  return d;
};
function writeDemo(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
  window.dispatchEvent(new Event('jupa-change'));
}
function result(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
// Resúmenes conservan los nombres de columnas en español en toda su interfaz.
export async function fetchServiceSummaries(){
 if(demo)return readDemo().service_summaries||[];
 const rows=[];
 for(let start=0;;start+=1000){const page=result(await supabase.from('resumenes_servicios').select('*').order('id').range(start,start+999));rows.push(...page);if(page.length<1000)return rows;}
}
export async function saveServiceSummary(visit,values,version=0){
 const payload=summaryPayload(values);
 if(!demo)return result(await supabase.rpc('v3_guardar_resumen',{p_actividad:visit.id,p_datos:payload,p_version:version}));
 const d=readDemo(),p=await fetchProfile();if(!canSummary(p,d,visit,'manage'))throw Error('Sin permiso para completar este resumen.');
 d.service_summaries||=[];const old=d.service_summaries.find(r=>String(r.actividad_id)===visit.id);
 if((old?.version||0)!==version)throw Error('Otra persona modificó el resumen. Vuelve a abrirlo.');
 const row={...payload,actividad_id:visit.id,version:version+1,actualizado_el:new Date().toISOString()};
 d.service_summaries=d.service_summaries.filter(r=>r!==old).concat(row);writeDemo(d);return row;
}
export async function fetchAll() {
  if (demo) {
    const d = readDemo(), p = await fetchProfile();
    const visits = d.visits.filter(v => !v.eliminado_el && (canActivity(p,d,v.activity_type || 'visita',v.class_id)||canSchedule(p,d,v.activity_type||'visita',v.class_id)));
    const ids = new Set(visits.filter(v=>canActivity(p,d,v.activity_type||'visita',v.class_id)).map(v => v.id));
    return { ...d, archived_visits:p.role==='admin'?d.visits.filter(v=>v.eliminado_el):[], people:d.people.filter(x=>p.role==='coro'?eligiblePerson({activity_type:'ensayo_coro'},x,d):canPerson(p,x)), visits, attendance:d.attendance.filter(a=>ids.has(a.visit_id)), responsibilities:d.responsibilities.filter(r=>ids.has(r.visit_id)), profiles:d.profiles.filter(x=>p.role==='admin'||x.id===p.id) };
  }
  const tables = ['classes', 'people', 'visits', 'attendance', 'responsibilities', 'profiles', 'activity_modules', 'account_permissions', 'bodies', 'bulletin_events', 'bulletin_highlights'];
  const responses = await Promise.all(tables.map(async table => {
    let all = [];
    for (let start = 0;; start += 1000) {
      let query = db.from(table).select('*');
      query = table === 'activity_modules' ? query.order('code') : table === 'attendance' ? query.order('visit_id').order('person_id') : query.order('id');
      const r = result(await query.range(start, start + 999));
      all.push(...r);
      if (r.length < 1000) return all;
    }
  }));
  const data = Object.fromEntries(tables.map((t,i)=>[t,responses[i]]));
  const historical=result(await db.rpc('miembros_historicos'));
  data.people.push(...historical.filter(p=>!data.people.some(x=>x.id===p.id)));
  data.archived_visits=data.visits.filter(v=>v.eliminado_el);data.visits=data.visits.filter(v=>!v.eliminado_el);return data;
}
export async function fetchProfile() {
  if (demo) return {
    id: `demo-${demoRole === 'admin' ? 'admin' : 'member'}`,
    role: demoRole,
    name: demoRole === 'admin' ? 'Administrador de prueba' : 'Cuenta de prueba',
    class_id: demoRole === 'clase' ? 'c1' : null,
    active: true
  };
  const { data: {session} } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: {user} } = await supabase.auth.getUser();
  if (!user) return null;
  return result(await db.from('profiles').select('*').eq('id', user.id).maybeSingle());
}
export async function login(username, password) {
  result(await supabase.auth.signInWithPassword({
    email: usernameEmail(username),
    password
  }));
}
export async function logout() {
  if (!demo && supabase) await supabase.auth.signOut();
  demo = false;
}
export async function saveAttendance(visit, person, present, version) {
  if (demo) {
    if (!canEdit(visit, demoRole)) throw Error('La visita está fuera del plazo de edición.');
    const d = readDemo();
    if (!eligiblePerson(visit,person,d) || visit.status === 'suspended') throw Error('Participante o actividad no disponible.');
    if (present) d.visits = d.visits.map(v => v.id === visit.id ? { ...v,status:'held' } : v);
    const old = d.attendance.find(a => a.visit_id === visit.id && a.person_id === person.id);
    if ((old?.version || 0) !== version) throw Error('Otro encargado modificó esta asistencia. Actualizamos el registro; inténtalo de nuevo.');
    const value = {
      visit_id: visit.id,
      person_id: person.id,
      present,
      class_id: old?.class_id || (localActivity(visit.activity_type)?visit.class_id:person.class_id),
      category: old?.category || person.category,
      version: version + 1,
      updated_at: new Date().toISOString()
    };
    d.attendance = old ? d.attendance.map(a => a === old ? value : a) : [...d.attendance, value];
    writeDemo(d);
    return value;
  }
  return result(await db.rpc('set_attendance', {
    p_visit: visit.id,
    p_person: person.id,
    p_present: present,
    p_version: version
  }));
}
export async function savePerson(person) {
  const payload = {
    ...person,
    first_name: upper(person.first_name),
    last_name: upper(person.last_name),
    rut: cleanRut(person.rut) || null,
    birth_date: person.birth_date || null
  };
  delete payload.photo_url;
  if (demo) {
    const prof = await fetchProfile();
    if (!canPerson(prof,payload,payload.id ? 'edit' : 'create')) throw Error('No tienes permiso para modificar estos datos.');
    const d = readDemo();
    if (payload.rut && d.people.some(p => p.id !== payload.id && p.rut === payload.rut)) throw Error('Este RUT ya está registrado.');
    payload.id ||= crypto.randomUUID();
    payload.active ??= true;
    d.people = d.people.some(p => p.id === payload.id) ? d.people.map(p => p.id === payload.id ? {
      ...p,
      ...payload
    } : p) : [...d.people, payload];
    writeDemo(d);
    return payload;
  }
  const {
    id,
    ...values
  } = payload;
  return result(id ? await db.from('people').update(values).eq('id', id).select().single() : await db.from('people').insert(values).select().single());
}
export async function saveClass(values) {
  if (demo) {
    if (demoRole !== 'admin') throw Error('Acceso restringido.');
    const d = readDemo();
    const value = {
      ...values,
      id: values.id || crypto.randomUUID()
    };
    d.classes = values.id ? d.classes.map(c => c.id === values.id ? value : c) : [...d.classes, value];
    writeDemo(d);
    return value;
  }
  const {
    id,
    ...rest
  } = values;
  return result(id ? await db.from('classes').update(rest).eq('id', id).select().single() : await db.from('classes').insert(rest).select().single());
}
export async function saveVisit(values, assignments) {
  if (demo) {
    const d = readDemo();
    if (!canSchedule(await fetchProfile(),d,values.activity_type||'visita',values.class_id)) throw Error('Sin permiso.');
    const v = {
      status: 'pending', activity_type:'visita',
      ...values,
      id: values.id || crypto.randomUUID(),
      version: (values.version || 0) + 1
    };
    const old = d.visits.find(x => x.id === v.id);
    if (old && old.version !== values.version) throw Error('La visita fue modificada. Actualiza antes de guardar.');
    if (d.visits.some(x => x.id !== v.id && x.date === v.date && x.class_id === v.class_id && x.group === v.group && (x.activity_type || 'visita') === v.activity_type)) throw Error('Ya existe una visita de ese grupo, fecha y destino.');
    d.visits = old ? d.visits.map(x => x.id === v.id ? v : x) : [...d.visits, v];
    for (const [role, person_id] of Object.entries(assignments)) {
      const r = d.responsibilities.find(r => r.visit_id === v.id && r.role === role);
      if (r && person_id !== r.person_id && (r.outcome !== 'Pendiente' || r.actual_person_id || r.note)) throw Error('La función ya tiene resultado. Registra el reemplazo en quién realizó la función.');
      if (person_id) {
        if (r) {
          r.person_id = person_id;
          r.version++;
        } else d.responsibilities.push({
          id: crypto.randomUUID(),
          visit_id: v.id,
          role,
          person_id,
          actual_person_id: null,
          outcome: 'Pendiente',
          note: '',
          version: 1
        });
      } else if (r) d.responsibilities = d.responsibilities.filter(x => x.id !== r.id);
    }
    writeDemo(d);
    return v;
  }
  return result(await db.rpc('save_visit', {
    p_values: values,
    p_assignments: assignments
  }));
}
export async function saveResponsibility(r) {
  if (demo) {
    const d = readDemo();
    const v = d.visits.find(v => v.id === r.visit_id);
    if (!canEdit(v, demoRole)) throw Error('La visita está fuera del plazo de edición.');
    const old = d.responsibilities.find(x => x.id === r.id);
    if (old.version !== r.version) throw Error('Otro encargado modificó este registro.');
    d.responsibilities = d.responsibilities.map(x => x.id === r.id ? {
      ...r,
      version: r.version + 1
    } : x);
    writeDemo(d);
    return;
  }
  result(await db.rpc('set_responsibility', {
    p_id: r.id,
    p_outcome: r.outcome,
    p_actual: r.actual_person_id || null,
    p_note: r.note || '',
    p_version: r.version
  }));
}
export async function mergePeople(source, target) {
  if (demo) {
    if (demoRole !== 'admin') throw Error('Acceso restringido.');
    const d = readDemo();
    for (const a of d.attendance.filter(a => a.person_id === source)) {
      const other = d.attendance.find(x => x.person_id === target && x.visit_id === a.visit_id);
      if (other) {
        other.present ||= a.present;
        other.version++;
      } else d.attendance.push({
        ...a,
        person_id: target,
        version: a.version + 1
      });
    }
    d.attendance = d.attendance.filter(a => a.person_id !== source);
    d.responsibilities = d.responsibilities.map(r => ({
      ...r,
      person_id: r.person_id === source ? target : r.person_id,
      actual_person_id: r.actual_person_id === source ? target : r.actual_person_id
    }));
    d.people = d.people.map(p => p.id === source ? {
      ...p,
      active: false
    } : p);
    writeDemo(d);
    return;
  }
  result(await db.rpc('merge_people', {
    p_source: source,
    p_target: target
  }));
}
export async function savePhoto(personId, blob) {
  if (!['image/webp','image/jpeg','image/png'].includes(blob.type) || blob.size > 524288) throw Error('La foto optimizada debe pesar menos de 512 KB.');
  if (demo) {
    const url = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    const d = readDemo();
    d.people = d.people.map(p => p.id === personId ? {
      ...p,
      photo_path: url
    } : p);
    writeDemo(d);
    return;
  }
  const previous = result(await db.from('people').select('photo_path').eq('id', personId).single());
  const ext = { 'image/webp':'webp', 'image/jpeg':'jpg', 'image/png':'png' }[blob.type];
  const path = `${personId}/${crypto.randomUUID()}.${ext}`;
  result(await supabase.storage.from('portraits').upload(path, blob, {
    contentType: blob.type,
    upsert: false
  }));
  try {
    result(await db.rpc('set_photo', {
      p_person: personId,
      p_path: path
    }));
  } catch (error) {
    await supabase.storage.from('portraits').remove([path]);
    throw error;
  }
  // La política permite retirar solo objetos que ya no están vinculados a nadie.
  if (previous?.photo_path) await supabase.storage.from('portraits').remove([previous.photo_path]);
}
export async function photoUrl(path) {
  if (!path) return null;
  if (demo) return path;
  const r = result(await supabase.storage.from('portraits').createSignedUrl(path, 600));
  return r.signedUrl;
}
export async function manageUser(values) {
  if (values.action === 'create') values = { ...values, username: normalizeUsername(values.username) };
  if (demo) {
    if (demoRole !== 'admin') throw Error('Acceso restringido.');
    const d = readDemo();
    if (values.action === 'create') {
      if (d.profiles.some(p => p.username === values.username)) throw Error('El usuario ya está registrado.');
      d.profiles.push({
        id: crypto.randomUUID(),
        name: values.name,
        username: values.username,
        role: values.role,
        class_id: values.class_id || null,
        active: true
      });
    } else if (values.action === 'update') {
      d.profiles = d.profiles.map(p => p.id === values.id ? {
        ...p,
        active: values.active
      } : p);
    }
    writeDemo(d);
    return {ok:true,id:values.action==='create'?d.profiles.at(-1).id:values.id};
  }
  const r = await supabase.functions.invoke(config.userFunction || 'super-responder', {
    body: values
  });
  if (r.error) {
    let message = r.error.message;
    try {
      const body = await r.error.context.json();
      message = body.error || message;
    } catch {}
    throw Error(message);
  }
  if (r.data?.error) throw Error(r.data.error);
  if (r.data?.ok !== true) {
    throw Error('La función respondió, pero no confirmó la operación. Revisa que super-responder tenga el código completo de manage-users.');
  }
  if (values.action === 'create') {
    if (typeof r.data.id !== 'string') throw Error('La función no devolvió el identificador de la cuenta creada. Revisa su código en Supabase.');
    const created = result(await db.from('profiles').select('id,username').eq('id', r.data.id).maybeSingle());
    if (!created || created.username !== values.username) {
      throw Error('No se pudo verificar el perfil creado. Revisa Authentication y profiles en Supabase antes de volver a crear la cuenta.');
    }
  }
  return r.data;
}
export async function auditLog() {
  if (demo) return readDemo().audit || [];
  return result(await db.from('audit_log').select('*').order('created_at', {
    ascending: false
  }).limit(100));
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  writeDemo(createDemo());
}
export async function ensureSundays(from, to) {
  if (demo) {
    const d = readDemo(), profile = await fetchProfile();
    for (let date = new Date(`${from}T12:00:00Z`); date.toISOString().slice(0,10) <= to; date.setUTCDate(date.getUTCDate()+1)) {
      if (date.getUTCDay() !== 0) continue;
      const day = date.toISOString().slice(0,10);
      for (const c of d.classes.filter(c=>c.active)) for (const type of ['escuela_dominical','servicio_domingo']) {
        if (!canActivity(profile,d,type,c.id,'manage') || d.visits.some(v=>v.date===day&&v.class_id===c.id&&v.activity_type===type)) continue;
        d.visits.push({id:crypto.randomUUID(),date:day,class_id:c.id,venue_class_id:c.id,group:'Todos',activity_type:type,status:'pending',version:1,notes:''});
      }
    }
    writeDemo(d); return;
  }
  result(await db.rpc('ensure_sundays',{p_from:from,p_to:to}));
}
export async function setActivityStatus(v, status, reason, venue) {
  if (demo) {
    const d=readDemo();
    if (!canEdit(v,demoRole) || !canActivity(await fetchProfile(),d,v.activity_type||'visita',v.class_id,'manage')) throw Error('No tienes permiso para modificar esta actividad.');
    if (status!=='held' && d.attendance.some(a=>a.visit_id===v.id&&a.present)) throw Error('Hay asistentes registrados; revisa las marcas.');
    if(status==='suspended'&&!reason.trim())throw Error('Indica el motivo de suspensión.');
    d.visits=d.visits.map(x=>x.id===v.id?{...x,status,suspension_reason:reason,venue_class_id:venue||x.class_id,version:x.version+1}:x);
    writeDemo(d); return;
  }
  result(await db.rpc('set_activity_status',{p_id:v.id,p_status:status,p_reason:reason,p_venue:venue||v.class_id,p_version:v.version}));
}

export async function reactivatePerson(id) {
  if (demo) {
    const d=readDemo(), profile=await fetchProfile(), person=d.people.find(p=>p.id===id);
    if (!person || !canPerson(profile,person,'reactivate')) throw Error('No tienes permiso para reincorporar a este participante.');
    if (person.merged_into) throw Error('Este registro fue fusionado. Utiliza la ficha que se conservó.');
    const saved={...person,active:true}; d.people=d.people.map(p=>p.id===id?saved:p); writeDemo(d); return saved;
  }
  const r=await db.rpc('reactivate_person',{p_person:id});
  if (r.error?.code==='PGRST202') throw Error('Falta aplicar la actualización SQL de reincorporación en Supabase.');
  return result(r);
}

export async function saveBulletin(table, values) {
  if (!['bulletin_events','bulletin_highlights','bodies'].includes(table)) throw Error('Tabla no válida.');
  if (demo) {const d=readDemo();const v={...values,id:values.id||crypto.randomUUID(),version:(values.version||0)+1};d[table] ||= [];d[table]=d[table].some(x=>x.id===v.id)?d[table].map(x=>x.id===v.id?v:x):[...d[table],v];if(table==='bulletin_events'){for(const linkedType of ['evento_coro','servicio_jupa']){const existing=d.visits.find(x=>x.evento_id===v.id&&x.activity_type===linkedType);if(v.kind==='jupa'){const linked={...existing,id:existing?.id||crypto.randomUUID(),evento_id:v.id,date:v.date,class_id:v.host_ids[0],group:'Todos',activity_type:linkedType,status:existing?.status||'pending',notes:v.title,version:(existing?.version||0)+1,eliminado_el:v.published?null:new Date().toISOString()};d.visits=existing?d.visits.map(x=>x.id===existing.id?linked:x):[...d.visits,linked];}else if(existing)existing.eliminado_el=new Date().toISOString();}}writeDemo(d);return v;}
  const {id,version,...fields}=values;
  if (table!=='bodies') fields.version=id?version+1:1;
  let q=id?db.from(table).update(fields).eq('id',id):db.from(table).insert(fields);
  if (id&&table!=='bodies') q=q.eq('version',version);
  const saved=result(await q.select().maybeSingle());if(!saved)throw Error('Otra persona modificó el registro. Actualiza la página antes de guardar.');return saved;
}
export async function publicBulletin(month) {
  if (configured&&!demo) return result(await db.rpc('public_bulletin',{p_month:month+'-01'}));
  if (!demoAllowed&&!demo) throw Error('No está configurada la conexión para los avisos.');
  const d=readDemo();return {month:month+'-01',highlight:d.bulletin_highlights?.find(x=>x.month===month+'-01'&&x.published)?.message||'',
   activities:d.visits.filter(v=>!v.eliminado_el&&v.date.startsWith(month)&&['visita','reunion_encargados','devocional'].includes(v.activity_type||'visita')).map(v=>{const c=d.classes.find(c=>c.id===(v.venue_class_id||v.class_id));return {id:v.id,date:v.date,type:v.activity_type||'visita',group:v.group,time:v.scheduled_time,class_name:c?.name,address:c?.address||'',commune:c?.commune||'Puente Alto',maps_url:c?.maps_url||'',status:v.status};}),
   events:(d.bulletin_events||[]).filter(v=>v.published&&v.date.startsWith(month)).map(v=>({...v,hosts:(v.host_ids||[]).map(id=>d.classes.find(c=>c.id===id)?.name)}))};
}

export async function saveAttendanceBatch(visit, changes) {
 if(!demo)return result(await db.rpc('guardar_asistencias',{p_visit:visit.id,p_changes:changes}));
 const d=readDemo(),p=await fetchProfile();if(!canEdit(visit,p.role)||!canActivity(p,d,visit.activity_type||'visita',visit.class_id,'manage'))throw Error('No tienes permiso para guardar.');
 for(const c of changes){if(c.present&&localActivity(visit.activity_type)&&d.attendance.some(a=>a.person_id===c.person_id&&a.present&&a.visit_id!==visit.id&&d.visits.some(v=>v.id===a.visit_id&&v.date===visit.date&&v.activity_type===visit.activity_type&&!v.eliminado_el&&v.status!=='suspended')))throw Error('Esta persona ya está presente en otra clase para el mismo servicio.');const old=d.attendance.find(a=>a.visit_id===visit.id&&a.person_id===c.person_id);if((old?.version||0)!==c.version)throw Error('Otro encargado modificó una marca. Revisa los cambios pendientes.');}
 const saved=changes.map(c=>{const person=d.people.find(p=>p.id===c.person_id),old=d.attendance.find(a=>a.visit_id===visit.id&&a.person_id===c.person_id);return {...old,visit_id:visit.id,person_id:person.id,present:c.present,class_id:old?.class_id||(localActivity(visit.activity_type)?visit.class_id:person.class_id),category:old?.category||person.category,body_ids:old?old.body_ids:person.body_ids||[],version:c.version+1,updated_at:new Date().toISOString()};});
 d.attendance=d.attendance.filter(a=>!saved.some(b=>b.visit_id===a.visit_id&&b.person_id===a.person_id)).concat(saved);if(changes.some(c=>c.present))d.visits=d.visits.map(v=>v.id===visit.id?{...v,status:'held'}:v);writeDemo(d);return saved;
}
export async function attendanceFor(id){if(demo)return readDemo().attendance.filter(a=>a.visit_id===id);return result(await db.from('attendance').select('*').eq('visit_id',id));}
export async function archiveActivity(v,archived=true){if(demo){const d=readDemo();d.visits=d.visits.map(x=>x.id===v.id?{...x,eliminado_el:archived?new Date().toISOString():null,version:x.version+1}:x);writeDemo(d);return;}return result(await db.rpc('archivar_actividad',{p_id:v.id,p_version:v.version,p_archivar:archived}));}
export async function demoOptions(){if(!configured)return demoAllowed?['admin','jefatura','secretaria','clase','coro']:[];try{return result(await db.rpc('demostraciones'))||[];}catch{return [];}}
export async function adminDemoOptions(){if(demo)return ['admin','jefatura','secretaria','clase','coro'].map(perfil=>({perfil,habilitada:true}));return result(await db.from('demostraciones').select('*').order('perfil'));}
export async function setDemoOption(perfil,habilitada){if(demo)return;result(await db.from('demostraciones').update({habilitada}).eq('perfil',perfil));}
export async function savePermissions(id,permissions){if(demo){const d=readDemo();d.account_permissions=d.account_permissions.filter(p=>p.profile_id!==id).concat(permissions.map((p,i)=>({...p,id:'demo-perm-'+i,profile_id:id})));writeDemo(d);return;}result(await db.rpc('guardar_permisos',{p_usuario:id,p_permisos:permissions}));}
export async function setModule(code,enabled){if(demo){const d=readDemo();d.activity_modules=d.activity_modules.map(m=>m.code===code?{...m,enabled}:m);writeDemo(d);return;}result(await db.from('activity_modules').update({enabled}).eq('code',code));}

export async function otherAttendance(id){
 if(!demo)return result(await db.rpc('presencias_otras_clases',{p_actividad:id}));
 const d=readDemo(),v=d.visits.find(v=>v.id===id);
 if(!v||!localActivity(v.activity_type))return [];
 return d.attendance.filter(a=>a.present&&a.visit_id!==id&&d.visits.some(x=>x.id===a.visit_id&&x.date===v.date&&x.activity_type===v.activity_type&&!x.eliminado_el&&x.status!=='suspended')).map(a=>({person_id:a.person_id,clase_presente:d.classes.find(c=>c.id===a.class_id)?.name}));
}
export async function memberHistory(id,from,to){
 if(!demo)return result(await db.rpc('historial_miembro',{p_miembro:id,p_desde:from,p_hasta:to}));
 const d=readDemo();return d.attendance.filter(a=>a.person_id===id&&a.present).flatMap(a=>{const v=d.visits.find(v=>v.id===a.visit_id);return v&&!v.eliminado_el&&v.status!=='suspended'&&v.date>=from&&v.date<=to?[{visit_id:v.id,date:v.date,activity_type:v.activity_type||'visita',group:v.group,destino:d.classes.find(c=>c.id===v.class_id)?.name,clase_contabilizada:d.classes.find(c=>c.id===a.class_id)?.name,category:a.category}]:[];}).sort((a,b)=>b.date.localeCompare(a.date));
}
export async function visitResponsibilities(month){
 if(!demo)return result(await db.rpc('resumen_responsables',{p_mes:month+'-01'}));
 const d=readDemo();return d.visits.filter(v=>!v.eliminado_el&&(v.activity_type||'visita')==='visita'&&v.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date)).map(v=>({...v,class_name:d.classes.find(c=>c.id===v.class_id)?.name,responsables:d.responsibilities.filter(r=>r.visit_id===v.id).map(r=>({...r,name:(()=>{const p=d.people.find(p=>p.id===r.person_id);return `${p?.first_name||''} ${p?.last_name||''}`.trim();})()}))}));
}
export async function issueLetters(visitId,month){
 if(!demo)return result(await db.rpc('emitir_cartas',{p_visita:visitId||null,p_mes:month?month+'-01':null}));
 const d=readDemo();d.letters||=[];const issuedLetters=[];
 for(const v of d.visits.filter(v=>!v.eliminado_el&&v.status!=='suspended'&&(v.activity_type||'visita')==='visita'&&(visitId?v.id===visitId:v.date.startsWith(month))))for(const r of d.responsibilities.filter(r=>r.visit_id===v.id)){
  let letter=d.letters.find(x=>x.visit_id===v.id&&x.person_id===r.person_id&&x.role===r.role);
  if(!letter){letter={visit_id:v.id,person_id:r.person_id,role:r.role,folio:'DEMO AJ '+String(d.letters.length+1).padStart(2,'0'),issued:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date())};d.letters.push(letter);}
  const p=d.people.find(p=>p.id===r.person_id);issuedLetters.push({...letter,name:`${p?.first_name||''} ${p?.last_name||''}`,class_name:d.classes.find(c=>c.id===v.class_id)?.name,date:v.date,group:v.group});
 }writeDemo(d);return issuedLetters;
}
