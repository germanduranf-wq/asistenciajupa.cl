# Actualización 3.2.1

1. En Supabase → SQL Editor, ejecutar completo `supabase/migrations/202610240001_formato_nombres.sql` (sobre la versión 3.2). Es repetible. El resultado debe indicar `pendientes_de_formato = 0`.
2. Hacer Commit y Push desde GitHub Desktop. Esperar el despliegue de Cloudflare y recargar la web.

El SQL convierte los nombres y apellidos de todos los participantes, activos e inactivos, a inicial mayúscula por palabra: «Martín Antonio Farías Soto». Conserva tildes, identificadores, clases, cuentas y asistencias. También aplica el formato al insertar o actualizar desde la web, SQL Editor o futuras importaciones. No cambia usuarios de inicio de sesión ni contraseñas. La búsqueda y detección de posibles duplicados siguen ignorando mayúsculas y tildes.

Las cartas usan «Le saluda confiando…» y ya no incluyen «DZH/jna». Los destinatarios también se muestran con iniciales mayúsculas, incluso al volver a descargar una carta emitida antes de esta actualización. Los folios, firmas y contactos se conservan. Los archivos PDF que ya descargaste no se modifican: vuelve a descargarlos.

No repetir la migración completa V3 ni cambiar la Edge Function. Esta actualización no ejecuta SQL automáticamente; hay que completar el paso 1.
