# Publicar Asistencia JUPA

## 1. Preparar Supabase

1. Crea una organización y un proyecto en tu cuenta de Supabase. Elige una región cercana a Chile disponible para tu plan. Guarda la contraseña de la base de datos en tu gestor de contraseñas.
2. En SQL Editor, ejecuta una sola vez el contenido completo de `supabase/migrations/202610100001_initial.sql` **en un proyecto nuevo y dedicado a JUPA**. Este archivo configura los permisos de las tablas públicas; no ejecutarlo en un proyecto compartido con otra aplicación.
3. Comprueba en Storage que `portraits` existe y es **privado**. Se aceptan WebP de hasta 512 KB. No convertirlo en público.
4. En Authentication, desactiva la creación pública de usuarios (`Allow new users to sign up`). La función administrativa seguirá pudiendo crear cuentas.
5. En Authentication > URL Configuration agrega la URL de producción como Site URL y como redirect permitido, por ejemplo `https://asistenciajupa.cl`. Agrega por separado los orígenes de prueba que realmente usarás.
6. Configura SMTP si utilizarás recuperación por correo. El servicio de correo integrado de Supabase tiene restricciones y no está preparado para correos de producción a cualquier destinatario. El administrador también puede restablecer contraseñas desde la aplicación.

### Primera cuenta administradora

1. En Authentication > Users utiliza la opción de crear usuario, con tu correo, contraseña de al menos 12 caracteres y correo confirmado. No uses un nombre/RUT como contraseña.
2. Copia su UUID. En SQL Editor ejecuta, reemplazando los tres valores del ejemplo:

```sql
insert into public.profiles(id,name,email,role)
values('UUID_DEL_USUARIO','TU NOMBRE','tu-correo@ejemplo.cl','admin');
```

No hay contraseña predeterminada ni ruta pública para convertirse en administrador.

### Función para crear y gestionar cuentas

El archivo `supabase/functions/manage-users/index.ts` puede desplegarse desde el editor de Edge Functions del panel, con nombre **manage-users**, o con Supabase CLI:

```sh
supabase login
supabase link --project-ref TU_REFERENCIA
supabase functions deploy manage-users --no-verify-jwt
```

El flag no hace pública la operación: la propia función valida el JWT con `auth.getUser()` y exige un perfil administrador activo. Los secretos `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` están disponibles en el entorno de funciones de Supabase. No colocarlos juntos en el navegador; la clave `service_role` es exclusivamente de servidor.

Para una instalación autohospedada, configura esos valores únicamente en el servidor de Edge Functions. Los errores de configuración se verán al crear/restablecer usuarios y deben resolverse antes de repartir cuentas.

## 2. Conectar la aplicación

En la configuración API de Supabase obtén la URL del proyecto y la clave pública `anon` o publicable. Edita `public/config.js` antes de compilar, o `config.js` dentro del ZIP web después de descomprimir:

```js
window.JUPA_CONFIG = {
  supabaseUrl: 'https://TU_PROYECTO.supabase.co',
  supabaseAnonKey: 'TU_CLAVE_PUBLICA_ANON_O_PUBLICABLE',
  allowDemo: false
};
```

La URL y esta clave pública pueden estar en el navegador. Nunca uses la contraseña de PostgreSQL ni una clave `service_role`/secret. La seguridad de los datos se basa en RLS y los permisos de servidor de la migración.

Desactiva la demostración (`allowDemo: false`) para la instalación real. No se copian los datos ficticios a Supabase: comenzarás con las tablas vacías y podrás crear las clases reales desde Administración.

## 3. Cloudflare Pages

### Subida directa del ZIP

1. Compila y exporta, o utiliza `asistencia-jupa-web.zip` entregado.
2. En Cloudflare, abre Workers & Pages y la creación de un proyecto **Pages** con subida directa de archivos.
3. Sube el ZIP web con `index.html` en la raíz, no el ZIP de código ni la carpeta `src`.
4. Publica. Comprueba primero el acceso mediante la dirección `.pages.dev` que asigna Cloudflare.
5. Añade esa URL en los redirects de Supabase si harás pruebas de recuperación allí.

### Con repositorio

Puedes usar un repositorio privado bajo tu cuenta. Configura Node 22+, comando de construcción `pnpm install --frozen-lockfile && pnpm build` y directorio de salida `dist`. El repositorio incluye el archivo de bloqueo de dependencias.

Un proyecto Pages creado para subida directa no puede convertirse luego en uno con integración Git: crea otro proyecto y mueve el dominio si decides cambiar el flujo.

## 4. Conectar el dominio .cl

1. Compra el dominio en NIC Chile bajo tu control.
2. Agrega el dominio a Cloudflare y elige el plan Free.
3. Copia los dos servidores DNS que Cloudflare asigne y colócalos en el dominio de NIC Chile. No copies nombres de servidores de un ejemplo.
4. En tu proyecto Pages agrega el dominio mediante Custom domains. No basta con inventar un CNAME antes de asociarlo al proyecto.
5. Espera la activación DNS y del certificado HTTPS.
6. Actualiza Site URL y redirects de Supabase al dominio definitivo.

## 5. Verificación antes de usar datos reales

- Ingresar como administrador, crear una clase y una persona de prueba.
- Crear una cuenta de encargado desde la aplicación y abrirla en otro dispositivo/navegador.
- Marcar personas diferentes simultáneamente y comprobar que las dos marcas aparecen. Para la misma persona, una edición obsoleta debe producir aviso y actualizarse.
- Verificar que el encargado no puede modificar una visita de hace 22 días y que el administrador sí.
- Subir una foto de prueba, moverla y ampliar el recorte, confirmar 500 × 500 y comprobar que una sesión anónima no pueda obtenerla desde Storage.
- Descargar Excel y PDF y comparar con el listado.
- Desactivar una cuenta de encargado y verificar que no pueda leer ni escribir datos al renovar la pantalla.
- Probar recuperación por correo si se configuró SMTP.
- Verificar el respaldo y la restauración con datos ficticios antes del primer registro real.

La vista privada de Sites está destinada a revisión del propietario. La web final en Cloudflare utiliza sus propias cuentas de Supabase y no exige ChatGPT a los encargados.

## 6. Traslado a un hosting privado

### Trasladar solo la web

El ZIP web sirve en un hosting estático con HTTPS (Nginx, Apache, cPanel o similar). Conserva las rutas de archivos y usa `index.html` como documento inicial. La aplicación utiliza navegación interna sin rutas de servidor; no necesita PHP ni Node para servir las pantallas. Mantén la configuración del mismo Supabase para conservar usuarios, fotos y datos. Actualiza las URLs permitidas en Auth.

Ejemplo Nginx:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
location = /config.js {
  add_header Cache-Control "no-store";
}
```

### Trasladar también datos y autenticación

Requiere migrar PostgreSQL, Auth, Storage y Edge Functions juntos a otro proyecto Supabase o una instalación Supabase autohospedada. El ZIP web por sí solo no contiene la base de datos, cuentas ni fotos. Un alojamiento estático convencional no puede sustituir esos servicios. La portabilidad está en el código y el esquema SQL, pero una migración completa necesita respaldo, restauración y verificación aparte.

## 7. Respaldo y operación

Consulta `RESPALDOS.md`. El plan gratuito puede pausarse por baja actividad; antes de cada jornada verifica acceso y revisa avisos del proveedor. No hay garantía de disponibilidad continua por utilizar servicios gratuitos.

Documentación oficial consultada para la entrega:

- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
