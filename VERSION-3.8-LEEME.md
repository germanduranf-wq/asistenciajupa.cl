# Asistencia JUPA · V3.8

23 de noviembre de 2026. Aplicar sobre V3.7.

## Publicar

1. Si V3.7 aún no se aplicó en Supabase, ejecutar primero `202611230001_gestion_jupa_plazos_auditoria.sql`.
2. En Supabase → SQL Editor, ejecutar completo `supabase/migrations/202611230002_solo_asistencia_coro_secretaria.sql`.
3. Actualizar la Edge Function existente **super-responder** con el contenido completo de `supabase/functions/manage-users/index.ts` y desplegarla. Esto permite crear cuentas nuevas limitadas de Coro y Secretaría; configurar una cuenta existente usa la nueva función SQL y no requiere cambiar su contraseña.
4. Subir a GitHub los cambios de esta versión y esperar la compilación de Cloudflare.
5. Cerrar sesión y volver a ingresar.

No ejecutar de nuevo la migración inicial V3 ni importar participantes. La nueva migración es transaccional y repetible; conserva cuentas, contraseñas e historial. No cambia automáticamente la modalidad de ninguna cuenta por su nombre.

## Configurar la cuenta de asistencia que ya existe

Desde la cuenta administradora:

1. Abrir **Administración → Usuarios**.
2. Buscar la cuenta de Coro que creaste, por ejemplo `corojupa.asistencia`. Debe tener perfil **Coro JUPA**.
3. Pulsar **Configurar acceso**.
4. Marcar **Solo asistencia** y pulsar **Guardar modalidad**.
5. Pedir a esa cuenta que cierre sesión y vuelva a ingresar.

Se mantiene el mismo usuario y contraseña. El cambio queda registrado en la actividad del administrador. Para restaurar la cuenta general, desmarcar la misma opción. Los permisos generales anteriores se conservan.

## Alcance de Solo asistencia

| Perfil | Actividades habilitadas que puede registrar |
|---|---|
| Coro JUPA | Ensayos Coro JUPA y Coro en evento JUPA |
| Secretaría JUPA | Reuniones de encargados, devocionales, servicio JUPA de la tarde, ensayos y coro en evento JUPA |
| Clase | Escuela dominical, servicio del domingo y reunión mensual de su clase; conserva sus registros separados de participación en encuentros JUPA |

- Puede corregir marcas desde el día de la actividad hasta 7 días después, inclusive.
- Coro comienza mostrando sus integrantes; **Todos** permite buscar invitados por nombre sin abrir sus fichas privadas.
- Puede agregar participantes nuevos desde la asistencia, con sus datos de contacto. Coro y Secretaría eligen la clase correspondiente; una cuenta de clase solo crea dentro de su clase.
- No puede consultar datos privados de fichas existentes, editar fotografías o datos, desactivar, reincorporar o eliminar participantes.
- No tiene estadísticas ni exportaciones, programación, eliminación de actividades, cartas, responsabilidades o resúmenes administrativos.
- Secretaría limitada no recibe asistencia de visitas de viernes ni actividades internas de otras clases. La cuenta general conserva sus funciones habituales.
- El administrador habilita los módulos globales en **Actividades y permisos**. La modalidad limitada mantiene estas restricciones aunque hubiera permisos generales guardados previamente.
- El sufijo `.asistencia` es una convención de nombre; la restricción depende de la opción **Solo asistencia**.

## Verificación

- 77 pruebas automatizadas aprobadas, incluidas migración repetida, permisos de base de datos, privacidad, altas, invitados, plazo, auditoría y creación de cuentas.
- Compilación de producción correcta.
- Flujo local probado en Edge con datos ficticios: configurar cuentas existentes, alta desde Coro, filtro Todos, guardar asistencia, navegación limitada y vista móvil de Secretaría.
- Falta ejecutar la migración y publicar en los servicios reales; las pruebas locales no equivalen a una publicación en producción.

## GitHub

Título: **feat: habilitar cuentas de solo asistencia para Coro y Secretaría**

Descripción: Permite al administrador configurar la modalidad Solo asistencia en cuentas existentes de clase, Coro y Secretaría sin cambiar sus credenciales. Incluye filtros para integrantes e invitados, alta de participantes nuevos y restricciones de base de datos que impiden consultar o editar fichas privadas, programar y ver estadísticas. Añade auditoría de cambios y conserva el plazo de siete días. Incluye migración SQL, actualización de la función de usuarios y pruebas de permisos.
