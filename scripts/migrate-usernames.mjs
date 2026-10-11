// Ejecutar exclusivamente en un equipo de confianza, nunca en el navegador.
import { createClient } from '@supabase/supabase-js';
import { usernameEmail, normalizeUsername } from '../src/username.mjs';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno local.');
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.from('profiles').select('id,username');
if (error) throw Error('No se pudieron leer los perfiles. Ejecuta primero la migración SQL de usuarios.');
const usernames = new Set();
for (const p of data) {
  if (!p.username) throw Error(`Falta asignar username al perfil ${p.id}. No se modificó ninguna cuenta.`);
  const name = normalizeUsername(p.username);
  if (usernames.has(name)) throw Error('Hay usuarios repetidos. No se modificó ninguna cuenta.');
  usernames.add(name);
}
for (const p of data) {
  const email = usernameEmail(p.username);
  if (!process.argv.includes('--apply')) { console.log(`Preparado: ${p.username} (${p.id})`); continue; }
  const updated = await admin.auth.admin.updateUserById(p.id, { email, email_confirm: true });
  if (updated.error) throw Error(`No se pudo actualizar Auth para ${p.username}. Revisa Supabase y vuelve a ejecutar; las cuentas anteriores pueden estar ya actualizadas.`);
  const saved = await admin.from('profiles').update({ email }).eq('id', p.id);
  if (saved.error) throw Error(`Auth actualizado para ${p.username}, pero falta sincronizar el perfil. Vuelve a ejecutar.`);
  console.log(`Actualizado: ${p.username}`);
}
if (!process.argv.includes('--apply')) console.log('Simulación terminada. Usa --apply para aplicar. Conserva UUID, contraseña e historial.');
