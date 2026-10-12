import { normalizeUsername, usernameEmail } from './username.mjs';
import { createClient } from '@supabase/supabase-js';
import { createDemo } from './demo.mjs';
import { canEdit, upper, cleanRut } from './domain.mjs';
const config = window.JUPA_CONFIG || {};
export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
export const demoAllowed = config.allowDemo === true;
export const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const KEY = 'jupa-demo-v1';
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
export async function fetchAll() {
  if (demo) return readDemo();
  const tables = ['classes', 'people', 'visits', 'attendance', 'responsibilities', 'profiles'];
  const responses = await Promise.all(tables.map(async table => {
    let all = [];
    for (let start = 0;; start += 1000) {
      let query = supabase.from(table).select('*');
      query = table === 'attendance' ? query.order('visit_id').order('person_id') : query.order('id');
      const r = result(await query.range(start, start + 999));
      all.push(...r);
      if (r.length < 1000) return all;
    }
  }));
  return Object.fromEntries(tables.map((t, i) => [t, responses[i]]));
}
export async function fetchProfile() {
  if (demo) return {
    id: `demo-${demoRole === 'admin' ? 'admin' : 'member'}`,
    role: demoRole,
    name: demoRole === 'admin' ? 'Administrador de prueba' : 'Encargado de prueba',
    active: true
  };
  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();
  if (!user) return null;
  return result(await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
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
    const old = d.attendance.find(a => a.visit_id === visit.id && a.person_id === person.id);
    if ((old?.version || 0) !== version) throw Error('Otro encargado modificó esta asistencia. Actualizamos el registro; inténtalo de nuevo.');
    const value = {
      visit_id: visit.id,
      person_id: person.id,
      present,
      class_id: old?.class_id || person.class_id,
      category: old?.category || person.category,
      version: version + 1,
      updated_at: new Date().toISOString()
    };
    d.attendance = old ? d.attendance.map(a => a === old ? value : a) : [...d.attendance, value];
    writeDemo(d);
    return value;
  }
  return result(await supabase.rpc('set_attendance', {
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
    rut: cleanRut(person.rut) || null
  };
  delete payload.photo_url;
  if (demo) {
    if (payload.id && demoRole !== 'admin') throw Error('Solo el administrador puede modificar los datos.');
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
  return result(id ? await supabase.from('people').update(values).eq('id', id).select().single() : await supabase.from('people').insert(values).select().single());
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
  return result(id ? await supabase.from('classes').update(rest).eq('id', id).select().single() : await supabase.from('classes').insert(rest).select().single());
}
export async function saveVisit(values, assignments) {
  if (demo) {
    if (demoRole !== 'admin') throw Error('Acceso restringido.');
    const d = readDemo();
    const v = {
      ...values,
      id: values.id || crypto.randomUUID(),
      version: (values.version || 0) + 1
    };
    const old = d.visits.find(x => x.id === v.id);
    if (old && old.version !== values.version) throw Error('La visita fue modificada. Actualiza antes de guardar.');
    if (d.visits.some(x => x.id !== v.id && x.date === v.date && x.class_id === v.class_id && x.group === v.group)) throw Error('Ya existe una visita de ese grupo, fecha y destino.');
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
  return result(await supabase.rpc('save_visit', {
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
  result(await supabase.rpc('set_responsibility', {
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
  result(await supabase.rpc('merge_people', {
    p_source: source,
    p_target: target
  }));
}
export async function savePhoto(personId, blob) {
  if (blob.type !== 'image/webp' || blob.size > 524288) throw Error('La foto optimizada debe ser WebP y pesar menos de 512 KB.');
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
  const previous = result(await supabase.from('people').select('photo_path').eq('id', personId).single());
  const path = `${personId}/${crypto.randomUUID()}.webp`;
  result(await supabase.storage.from('portraits').upload(path, blob, {
    contentType: 'image/webp',
    upsert: false
  }));
  try {
    result(await supabase.rpc('set_photo', {
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
        active: true
      });
    } else if (values.action === 'update') {
      d.profiles = d.profiles.map(p => p.id === values.id ? {
        ...p,
        active: values.active
      } : p);
    }
    writeDemo(d);
    return;
  }
  const r = await supabase.functions.invoke('super-responder', {
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
    const created = result(await supabase.from('profiles').select('id,username').eq('id', r.data.id).maybeSingle());
    if (!created || created.username !== values.username) {
      throw Error('No se pudo verificar el perfil creado. Revisa Authentication y profiles en Supabase antes de volver a crear la cuenta.');
    }
  }
  return r.data;
}
export async function auditLog() {
  if (demo) return readDemo().audit || [];
  return result(await supabase.from('audit_log').select('*').order('created_at', {
    ascending: false
  }).limit(100));
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  writeDemo(createDemo());
}
