# Asistencia JUPA 3.3

## Publicar esta versión

1. En Supabase → SQL Editor, ejecutar **completo** `supabase/migrations/202611180001_navegacion_evento_eliminacion.sql`. Se aplica sobre la versión 3.2.1; no volver a ejecutar la migración inicial de V3. No requiere cambiar claves, usuarios ni contraseñas.
2. Confirmar que el SQL terminó sin errores. Después, hacer commit y push desde la carpeta `C:\Users\mandu\Documents\GitHub\asistenciajupa.cl`. Cloudflare debe compilar el nuevo commit.
3. Abrir la web y verificar: Actividades → Evento mensual JUPA; Administración → Usuarios; una exportación de cartas; y la consulta de asistencia existente.

La migración es transaccional y repetible. No elimina participantes ni asistencias. Conserva los identificadores de los devocionales existentes que logra vincular al evento mensual. Si hay varios devocionales sin vincular en una fecha, se detiene sin aplicar cambios: seleccionar el correcto en el resumen del servicio de tarde y repetir el SQL completo. No eliminar asistencias para resolver esa situación.

Esta entrega no modifica la Edge Function. El restablecimiento utiliza la función existente `super-responder`, cuyo código vigente está en `supabase/functions/manage-users/index.ts`. Si el servidor tiene una versión antigua, actualizar su código desde ese archivo; no colocar claves secretas en GitHub ni en el navegador.

## Cambios incluidos

- Actividades agrupadas por JUPA, visitas y servicios, coro, juventud de la clase y Secretaría; navegación según permisos.
- Inicio con agenda del mes, responsabilidades, indicadores y acceso a Avisos públicos. Conserva el acceso a visitas para quienes pueden consultar su asistencia.
- El evento mensual crea y mantiene su devocional, servicio de tarde y asistencia del coro. Se modifica la fecha desde el evento; cada asistencia conserva sus marcas y permite suspender su sesión. Los permisos y módulos habilitados siguen controlados en Administración.
- Servicios especiales programados y publicados aparecen en Avisos JUPA. Devocional vinculado se muestra dentro de su evento, sin repetirlo como otro aviso.
- Resúmenes de Secretaría: año completo por defecto, rango de fechas, semestre, tabla, evolución y Excel del período elegido. Un total no informado se mantiene vacío, no se convierte en cero. La reunión de encargados y el coro conservan sus conteos separados.
- Actividades locales con filtros por mes, fecha, clase y registro; seguimiento de clases que registraron, pendientes y participaciones. Sin registro no significa ausencia. Una actividad realizada con cero asistentes debe marcarse como realizada.
- Eliminación de fichas sin historial para Administrador, Secretaría y Jefatura: confirmar nombre y motivo. Queda registro en `miembros_eliminados` y auditoría. Con asistencias, responsabilidades, cartas o fusiones, se bloquea la eliminación; se puede desactivar o solicitar al administrador fusionar duplicados. No se borran automáticamente fichas al instalar.
- Cartas individuales y las cartas del ZIP en tamaño **Carta / Letter (216 × 279 mm)**, firma centrada y distribución ajustada. Para imprimir elegir Carta y escala 100 %. Se conservan firmas, contactos y textos actuales, sin «Por la presente» ni sigla DZH.
- Se aplicaron los cuatro lemas aprobados; se conserva «Por una JUPA conforme al corazón de Cristo».

## Cuentas y contraseñas

Solo el administrador puede ver el directorio completo de cuentas activas/inactivas, buscarlas, activarlas/desactivarlas y restablecer contraseñas. Las otras cuentas solo pueden leer su propio perfil; no reciben el listado completo desde la base.

Administración → Usuarios → buscar cuenta → **Restablecer contraseña** → Confirmar → **Copiar credenciales**. La contraseña temporal se muestra y copia en esa ventana; al ingresar se exige elegir una nueva. La ventana no ofrece recuperar contraseñas anteriores. Supabase almacena hashes, no una contraseña legible: https://supabase.com/docs/guides/auth/password-security. No se añadió una copia de contraseñas a tablas, archivos, auditorías ni almacenamiento del navegador.

## Verificación

- Suite automatizada: 55 pruebas; incluye migración repetida, conservación de asistencia, eliminación con auditoría, restricciones del directorio de usuarios y permisos por clase.
- Prueba de navegador con datos ficticios en cinco perfiles, tamaños de 320 y 390 píxeles y escritorio; programación/navegación, resúmenes, exportación Excel y eliminación.
- Flujo de cuenta ficticia: búsqueda, restablecimiento temporal, portapapeles y filtro de inactivos.
- Tres cartas renderizadas y revisadas: una página Carta cada una.
- Compilación de producción correcta. Excel se carga bajo demanda; Vite mantiene su advertencia de tamaño para esa dependencia.

Las pruebas no modificaron Supabase productivo. La publicación y ejecución del SQL quedan a cargo del administrador del proyecto.
