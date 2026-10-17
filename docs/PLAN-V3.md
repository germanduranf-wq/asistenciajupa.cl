# Asistencia JUPA 3: migración conservando producción

Esta carpeta contiene la versión 3 validada localmente. Para publicarla sigue `PUBLICACION-V3.md`. El SQL y la función todavía deben aplicarse en Supabase antes de enviar el código a GitHub.

Objetivos confirmados: tablas españolas con claves numéricas, conservación de personas/fotos/cuentas/historial, asistencia por lotes con control de versiones, responsables buscables, cámara izquierda, edición y eliminación recuperable de actividades por administrador, coro y demostraciones configurables.

Las cuentas de Auth mantienen su identificador interno y sus contraseñas. La identidad administrativa tendrá un número independiente. No usar nombres ni RUT opcional como clave principal.

Antes de publicar: respaldo de Supabase y Storage, comprobación previa, migración, actualización de Edge Function y publicación coordinada del frontend. Los datos ficticios NO se borran automáticamente. Se validaron 44 pruebas automatizadas y la compilación de producción; la base productiva debe verificarse siguiendo la guía.
