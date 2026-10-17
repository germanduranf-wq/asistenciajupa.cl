# Publicar Asistencia JUPA 3

El código y SQL se validaron localmente. La publicación se completa al ejecutar los pasos siguientes en tu proyecto Supabase y enviar el repositorio a GitHub. No hay cambios remotos realizados por este paquete.

## Orden de actualización

1. Elige un momento en que nadie registre asistencia. Pide cerrar las pestañas de la aplicación hasta terminar.
2. Conserva un respaldo externo de la base actual, incluyendo Auth, y de las fotografías del bucket `portraits`. Conserva también el código actual de `super-responder` y el despliegue anterior de Cloudflare. Exportar solo participantes a CSV no equivale a un respaldo completo.
3. En Supabase → SQL Editor → nueva consulta, ejecuta **`supabase/v3/01_comprobar_antes.sql`**. Guarda los conteos. Si aparece un error, detente y comparte solamente ese mensaje; no ejecutes las migraciones antiguas a ciegas.
4. En otra consulta ejecuta **todo** el archivo **`supabase/migrations/202610170001_esquema_espanol.sql`**. Solo una vez. No ejecutes los archivos SQL anteriores ni `mejoras.sql` por separado. La migración está dentro de una transacción: si falla antes de COMMIT, no queda una migración parcial.
5. Ejecuta **`supabase/v3/03_verificar_despues.sql`**. Las comprobaciones de conservación deben devolver `true` y las cuentas deben ser las esperadas. Todavía no registres asistencias nuevas mientras verificas los conteos.
6. En Supabase → Edge Functions → **super-responder** → código, reemplaza el contenido con el archivo completo **`supabase/functions/manage-users/index.ts`** y despliega esa misma función. No crees otra con nombre aleatorio. Conserva los secretos existentes; no pegues claves de servidor en GitHub ni en `public/config.js`. La función comprueba sesión y perfil administrador internamente.
7. En GitHub Desktop, abre `C:\Users\mandu\Documents\GitHub\asistenciajupa.cl`, revisa los cambios, crea el commit «Actualización JUPA 3» y pulsa **Push origin**. Este es el momento para enviarlo: no antes del SQL y la función. Cloudflare compila y despliega desde GitHub.
8. Tras un despliegue correcto, abre `https://asistenciajupa.cl`, recarga y entra con la misma cuenta de administrador. No tienes que cambiar su contraseña.
9. Verifica que coincidan los participantes, fotos y cuentas. Prueba una marca y su retiro en una actividad de prueba, pulsando **Guardar asistencia** en cada caso. Comprueba una cuenta de clase y otra de coro/secretaría para confirmar sus accesos.

## Configuración nueva

- Administración → Actividades y permisos: habilita módulos y asigna accesos por cuenta. Las clases siguen limitadas a su propia iglesia.
- Crea `coro.jupa` con perfil **Coro JUPA**, habilitando ensayos y coro en evento JUPA. Solo muestra integrantes del cuerpo Coro JUPA. No se crea una cuenta ni contraseña automáticamente.
- Los eventos mensuales de tipo JUPA en Avisos generan su asistencia del coro. El devocional sigue programándose por separado.
- Administración → Exploración de prueba: todas las demostraciones empiezan deshabilitadas. Puedes habilitarlas individualmente. Usan datos ficticios locales.
- El administrador puede corregir fecha/destino y eliminar actividades de forma recuperable. Se restauran desde Administración. Las actividades vinculadas a un evento se gestionan publicando/despublicando ese evento.
- Para corregir la visita real del 16 de octubre puedes editarla desde la página o ejecutar **`supabase/v3/04_corregir_visita_16_octubre.sql`**. El script se detiene si encuentra nombres ambiguos y no borra ninguna asistencia.

## Tablas y edición manual

Tablas principales: `iglesias`, `miembros`, `categorias`, `cuerpos`, `usuarios`, `actividades`, `asistencias`, `responsabilidades`, `modulos`, `permisos`, `eventos`, `avisos_destacados` y `demostraciones`.

Para leer nombres junto a las relaciones usa `miembros_detalle`, `usuarios_detalle_v3`, `permisos_detalle_v3` y `responsables_por_actividad`. Esta última muestra una fila por actividad con sus tres responsables. Las filas originales de responsabilidades se conservan para mantener sus resultados e historial.

Los registros de negocio usan números. `usuarios.numero` es el identificador administrativo; `usuarios.id` conserva el UUID interno de Supabase Auth para mantener las cuentas y contraseñas. No se deben crear cuentas insertando únicamente en `usuarios`: usa Administración para que también se cree su cuenta Auth. Las contraseñas no se almacenan visibles.

Los identificadores anteriores quedan en `referencia_anterior`. Las tablas antiguas se conservan en `respaldo_v2`, sin acceso desde la aplicación. Esa copia dentro de la misma base no reemplaza el respaldo externo. No borres ese esquema durante esta actualización.

## Si algo falla

- Si el SQL falla: guarda el error completo. No continúes con la función o GitHub y no vuelvas a ejecutar archivos al azar.
- Si el SQL terminó correctamente pero falla la función o el despliegue: mantén la pausa de registros y corrige ese paso. Repetir la migración no es la solución.
- Volver solamente al frontend anterior no revierte V3: ese frontend usa las tablas anteriores. Una reversión exige recuperar de forma coordinada base, función y frontend. Si ya se registraron datos en V3, hay que preservarlos antes; nunca reemplazarlos por una copia antigua sin conciliación.

## Validación realizada

Pruebas automatizadas de migración con PostgreSQL local y datos sintéticos, conservación de participantes/cuentas/asistencias, permisos por clase/coro, fotos antiguas y nuevas, conflictos atómicos al guardar, edición y eliminación recuperable, domingos sin duplicación, eventos del coro con asistencia conservada y demostraciones públicas deshabilitadas. La verificación en tu Supabase productivo se realiza con los pasos 3, 5 y 9.
