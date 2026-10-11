# Asistencia JUPA

> **Acceso actualizado a usuario y contraseña:** sigue primero `docs/USUARIOS.md` (o `USUARIOS.md` desde esta carpeta). Sustituye los pasos antiguos de alta/recuperación por correo por los de esa guía.

Aplicación para la Juventud Unida de Puente Alto. React + Vite con Supabase (PostgreSQL, Auth, Storage privado y Realtime). Interfaz estática exportable: no necesita Node en el hosting que sirve la web.

## Estado de entrega

- Web construida y modo de prueba con datos ficticios. Los nombres de ejemplo no son un padrón real.
- Base de datos, reglas de seguridad y función de administración incluidas en `supabase/`.
- **Pendiente para uso real:** configurar el proyecto Supabase del propietario, ejecutar la migración, desplegar `manage-users`, crear la primera cuenta admin y conectar el dominio.
- La publicación privada de revisión en Sites no sustituye estas configuraciones ni habilita acceso a los encargados.
- El modo de prueba guarda solo en este navegador. No proporciona sincronización entre dispositivos ni cuentas reales. No ingresar datos reales en la demostración.
- Backend probado en PostgreSQL 17 mediante PGlite. Auth, Realtime, correos y Storage de un proyecto Supabase real deben verificarse tras conectarlo; no hay credenciales reales incluidas.

## Desarrollo

Requiere Node 22.13+ y pnpm 10.11.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm export
```

La exportación crea:

- `artifacts/asistencia-jupa-web.zip`: contenido de `dist/`, para subir al hosting.
- `artifacts/asistencia-jupa-codigo.zip`: código, migraciones, pruebas y documentación para continuar el desarrollo o trasladarlo.

## Publicación

Sigue `docs/PUBLICACION.md`. La configuración pública está en `public/config.js`. Si ya tienes la compilación, puedes editar `dist/config.js` sin recompilar.

## Funciones

- Visitas separadas por jóvenes y señoritas, calendario e historial.
- Asistencia por nombre o fotografía, filtros, frecuencia histórica y alta durante el registro.
- Recorte cuadrado con arrastre, zoom y teclas de dirección; genera WebP 500 × 500 antes de subir. Límite de entrada 15 MB; servidor admite WebP de hasta 512 KB.
- Normalización de nombres, advertencias por similitud, RUT opcional validado y fusión transaccional.
- Clase y categoría históricas por asistencia. No se duplica una persona por pertenecer también al templo matriz.
- Predicación, coordinación y coro: asignación, resultado, reemplazo y justificación independientes de la presencia.
- Perfiles admin/encargado, fechas de Santiago y bloqueo de ediciones a partir del día 22.
- Actualizaciones en tiempo real con sondeo de respaldo; versión por registro para evitar pérdida de cambios.
- Estadísticas mensuales/semestrales, conteos únicos/acumulados, retornos e inactividad. Excel y PDF.
- Fotos privadas con URL temporal. Sin reconocimiento facial.

## Decisiones iniciales

- Las cuentas ingresan por correo y contraseña. El administrador las crea; no existe formulario público de registro.
- Todos los encargados activos pueden consultar participantes y visitas y registrar asistencia. Las pantallas de estadísticas, exportación y administración son exclusivas del administrador; los datos de asistencia que un encargado puede consultar también son accesibles mediante su sesión en la API. No se promete ocultar esos mismos datos a un encargado técnico.
- Para encargados, el plazo incluye todo el día 21 posterior a la visita en America/Santiago; visitas futuras son de consulta hasta su fecha. Admin puede corregir cualquier fecha.
- Se usa una categoría y clase principal por persona. La frecuencia cuenta las visitas anteriores del grupo seleccionado y queda fija mientras está abierta la pantalla.
- Una marca retirada queda como registro `present=false` para conservar versión y auditoría. Los conteos solo incluyen `present=true`.
- La clase y categoría se capturan al crear la primera marca y se conservan si se desmarca o remarca. Las fusiones conservan la instantánea del registro destino cuando ambos participaron en una visita.
- No se cambia la asignación prevista de una función que ya tiene resultado: se registra el reemplazo en el resultado y se conserva el historial.
- Sin conexión no se promete guardado. No hay modo offline en esta versión.
- El RUT no es obligatorio y no se usa como contraseña.

## Archivos principales

`src/main.jsx`: pantallas y navegación. `src/ui.jsx`: componentes y editor de fotos. `src/forms.jsx`: formularios. `src/api.mjs`: integración y simulador de prueba. `src/domain.mjs`: fechas, deduplicación y estadísticas. `supabase/migrations/`: reglas y operaciones de servidor. `supabase/functions/manage-users/`: gestión segura de cuentas.

Los logos fueron proporcionados por JUPA. Se incluyen versiones WebP reducidas, respetando sus proporciones.
