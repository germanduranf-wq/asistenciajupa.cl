export const MODULES = { ensayo_coro:'Ensayos Coro JUPA', evento_coro:'Coro en evento JUPA', devocional: 'Devocionales JUPA', visita: 'Visitas', reunion_encargados: 'Reuniones de encargados JUPA', escuela_dominical: 'Escuela dominical', servicio_domingo: 'Servicio del domingo', reunion_mensual: 'Reunión mensual' };
export const PROFILE_ROLES = { coro:'Coro JUPA', admin: 'Administrador', jefatura: 'Jefatura del Templo Matriz', secretaria: 'Secretaría JUPA', clase: 'Cuenta de clase', encargado: 'Encargado de visitas' };
export const localActivity = type => ['escuela_dominical','servicio_domingo','reunion_mensual'].includes(type);
export function canActivity(profile, data, module, classId, action = 'view') {
  if (!profile?.active || profile.must_change_password || !data.activity_modules?.some(m => m.code === module && m.enabled)) return false;
  if (profile.role === 'admin') return true;
  if (profile.role === 'clase' && (!localActivity(module) || (classId && classId !== profile.class_id))) return false;
  if (profile.role === 'secretaria' && !['reunion_encargados','devocional','ensayo_coro','evento_coro'].includes(module)) return false;
  if (profile.role === 'coro' && !['ensayo_coro','evento_coro'].includes(module)) return false;
  if (profile.role === 'encargado' && module !== 'visita') return false;
  return (data.account_permissions || []).some(p => p.profile_id === profile.id && p.module === module && p.can_view && (!classId || !p.class_id || p.class_id === classId) && (profile.role !== 'clase' || !p.class_id || p.class_id === profile.class_id) && (action === 'view' || p[`can_${action}`]));
}
export const belongsToClass = (p,id) => p.class_id===id || p.secondary_class_id===id;
export function canPerson(profile, classId, action = 'view') {
  if(classId && typeof classId==='object'){if(classId.historico)return false;classId=profile?.role==='clase'&&belongsToClass(classId,profile.class_id)?profile.class_id:classId.class_id;}
  if (!profile?.active || profile.must_change_password) return false;
  if (['admin','jefatura','secretaria'].includes(profile.role)) return true;
  if (profile.role === 'encargado') return ['view','create','photo'].includes(action);
  return profile.role === 'clase' && (!classId || profile.class_id === classId) && ['view','create','edit','photo','reactivate'].includes(action);
}
export const canPublish = p => p?.active && !p.must_change_password && ['admin','jefatura','secretaria'].includes(p.role);
export const canSchedule = (p,d,m,c) => m!=='visita' ? canActivity(p,d,m,c,'manage') : canPublish(p) && d.activity_modules?.some(x=>x.code===m&&x.enabled) && (p.role==='admin' || (d.account_permissions||[]).some(x=>x.profile_id===p.id&&x.module===m&&(!c||!x.class_id||x.class_id===c)&&(x.can_schedule || (p.role==='jefatura'&&x.can_view&&x.can_manage))));
export const modulesFor = (p,d,action='view') => Object.keys(MODULES).filter(m => canActivity(p,d,m,null,action));
export const activityLabel = v => MODULES[v?.activity_type || 'visita'];
export const eligiblePerson = (v,p,data={}) => ['ensayo_coro','evento_coro'].includes(v.activity_type) ? (p.body_ids||[]).some(id=>data.bodies?.some(b=>b.id===id&&b.name==='Coro JUPA')) : localActivity(v.activity_type) ? belongsToClass(p,v.class_id) : v.activity_type === 'reunion_encargados' ? ['Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas'].includes(p.category) : true;
export function ageAt(birthDate, date) {
  if (!birthDate || !date || birthDate > date) return null;
  return Number(date.slice(0,4)) - Number(birthDate.slice(0,4)) - (date.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  const chars = [];
  while (chars.length < 20) { const bytes = crypto.getRandomValues(new Uint8Array(32)); for (const b of bytes) if (b < Math.floor(256 / alphabet.length) * alphabet.length && chars.length < 20) chars.push(alphabet[b % alphabet.length]); }
  return chars.join('');
}
