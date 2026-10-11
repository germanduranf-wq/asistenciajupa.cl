# Actualización a usuario y contraseña

Los encargados ingresan un usuario, por ejemplo `german.duran`, sin correo real. Se admiten 3–40 caracteres: letras sin tildes, números, punto, guion y guion bajo. Se convierten a minúscula. Supabase Auth conserva internamente un identificador `german.duran@usuarios.jupa.invalid`; no es un buzón. No hay recuperación por correo: el administrador restablece contraseñas desde Administración. Para recuperar al administrador, utiliza el panel de Supabase o su Admin API.

## Base existente: ejecutar antes de subir la nueva web

1. En SQL Editor ejecuta `supabase/migrations/202610110001_usernames.sql`. No vuelvas a ejecutar la migración inicial. Esta actualización también admite la columna username creada manualmente siguiendo las instrucciones anteriores.
2. En Table Editor → profiles asigna un `username` único a cada cuenta. Alternativa SQL:

```sql
update public.profiles set username = 'german.duran'
where id = 'UUID_DE_TU_CUENTA';
```

3. Sincroniza las cuentas Auth conservando sus UUID. Puedes usar la herramienta administrativa del panel para cambiar el identificador Email de cada cuenta por `USUARIO@usuarios.jupa.invalid`, como confirmado, y actualizar `profiles.email` con el mismo valor. No borres ni recrees la cuenta y no edites las tablas internas auth mediante SQL. Si el panel no permite el cambio directo, usa el script incluido:

   - En un equipo de confianza con Node y dependencias instaladas, configura las variables de entorno `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` con tu proyecto y su clave de servidor. No las escribas en GitHub, config.js ni en la web.
   - Ejecuta `node scripts/migrate-usernames.mjs` para validar y simular.
   - Ejecuta `node scripts/migrate-usernames.mjs --apply` para aplicar. Mantiene contraseñas, UUID e historial. Se puede repetir si una operación falla.
   - Elimina esas variables del entorno cuando termines.

4. En Edge Functions actualiza **manage-users** con el contenido de `supabase/functions/manage-users/index.ts` y despliega. Desactiva la verificación JWT de la plataforma para esta función: el código verifica el token con auth.getUser y exige administrador activo. Con CLI: `supabase functions deploy manage-users --no-verify-jwt`.
5. En Authentication desactiva el registro público de usuarios. Las nuevas cuentas se crean desde Administración.
6. Sube el nuevo código a GitHub conservando tu `public/config.js` real. El archivo incluido tiene configuración de ejemplo. No repongas la antigua regla de `_redirects`.
7. Comprueba inicio de sesión del administrador y creación, ingreso, restablecimiento de contraseña y desactivación de un encargado de prueba.

Durante el cambio de identificadores, la web antigua con login por correo dejará de servir para esas cuentas: realiza los pasos en una misma sesión de mantenimiento.

## Proyecto nuevo

Ejecuta primero `202610100001_initial.sql` y después `202610110001_usernames.sql`. Crea el primer administrador en Authentication → Users con el identificador `admin@usuarios.jupa.invalid`, contraseña y correo confirmado. No uses invitación por correo. Copia su UUID:

```sql
insert into public.profiles(id,name,email,username,role)
values('UUID_DEL_USUARIO','Administrador','admin@usuarios.jupa.invalid','admin','admin');
```

Despliega manage-users y configura public/config.js como indica PUBLICACION.md. Ingresa escribiendo solamente `admin`. Las demás cuentas se crean desde la aplicación.

## Ubicación de los cambios

- src/main.jsx: formulario de ingreso, ayuda de contraseña, listado y formulario de cuentas.
- src/username.mjs: normalización y generación del identificador interno.
- src/api.mjs: inicio de sesión y validación de creación de cuentas.
- supabase/functions/manage-users/index.ts: creación de cuentas Auth y perfiles.
- supabase/migrations/202610110001_usernames.sql: columna, formato y unicidad de username.
- scripts/migrate-usernames.mjs: actualización opcional de cuentas existentes mediante Admin API.

La columna email interna se conserva por compatibilidad. No renombrar auth.users.email ni reemplazar globalmente la palabra email en el código.
