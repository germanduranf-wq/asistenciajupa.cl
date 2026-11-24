# Asistencia JUPA · V3.7

Actualización del 23 de noviembre de 2026. Aplicar sobre V3.6.2.

## Publicación

1. En Supabase → SQL Editor, ejecutar **completo** el archivo `supabase/migrations/202611230001_gestion_jupa_plazos_auditoria.sql`.
2. Subir a GitHub los cambios de esta versión desde la carpeta `asistenciajupa.cl`. Cloudflare compilará la página.
3. Esperar que finalice la implementación. Cerrar sesión y volver a ingresar para recargar los accesos.
4. Verificar las acciones de abajo con las cuentas correspondientes.

No volver a ejecutar la migración inicial V3 ni las importaciones de participantes. Esta migración conserva cuentas, contraseñas, participantes, asistencias y responsabilidades. Es transaccional y puede repetirse. No requiere actualizar la Edge Function `super-responder`.

## Asistencias abiertas

- Guardar registra los cambios y permite seguir agregando o retirando marcas. El estado “Realizada” no cierra la asistencia.
- Cuenta de clase marcada como **Solo asistencia** (`.asistencia`): hasta 7 días después de la fecha de la actividad, inclusive.
- Cuenta general (`.jupa`) y otros perfiles autorizados: hasta 21 días después, inclusive.
- Administrador: sin límite de fecha para corregir.
- Las otras cuentas solo registran desde el día de la actividad. Las actividades suspendidas deben reanudarse primero; las eliminadas deben restaurarse.
- El plazo se determina por la propiedad `solo_asistencia`, no por escribir un sufijo en el nombre de usuario.
- Se mantienen el ámbito de cada clase, la privacidad de las cuentas limitadas y la protección ante cambios simultáneos. Si otra cuenta cambió el mismo registro, se solicita actualizar antes de sobrescribirlo.
- Los registros de las clases en punto de predicación y tarde siguen separados de los totales de Secretaría.

## Secretaría JUPA

- Programa las actividades generales habilitadas: visitas, reuniones de encargados, ensayos y encuentros mensuales. Los servicios especiales se administran en su programación.
- En “Programar visitas y servicios” puede elegir Predicación, Coordinación y Dirección del coro mediante el buscador de personas.
- Puede eliminar actividades generales y encuentros. Se retiran del calendario, avisos y estadísticas; **su historial se conserva**. El administrador puede restaurarlos en “Actividades eliminadas”.
- El encuentro mensual se elimina/restaura completo, junto con su devocional, servicio de tarde y coro. No se eliminan por separado sus asistencias vinculadas.
- Se excluyen Escuela dominical, Servicio del domingo y Reunión mensual interna de cada clase.
- La programación y las asignaciones de visitas no conceden permiso para pasar su asistencia. Los accesos de asistencia de visitas se mantienen separados.
- Los módulos que el administrador deshabilite permanecen deshabilitados. Los accesos generales de Secretaría habilitados por esta versión forman parte de su perfil.

## Cartas

En “Actividades” → “Cartas y responsables”, Administrador y Secretaría disponen de **“Cartas del mes · PDF único”**. Genera una carta por página dentro de un solo archivo, en tamaño carta. Conserva los folios, firmas y diseño de las cartas individuales. Se mantienen las opciones PDF individual y ZIP.

Las funciones sin responsable asignado no generan carta. Las visitas suspendidas o eliminadas no se incluyen.

## Administración

- Se retiró de la página el formulario de creación masiva de cuentas y contraseña temporal común. Se conserva la creación y el restablecimiento **individual** en Usuarios. Ninguna contraseña se cambia al aplicar esta versión.
- “Administración” → **“Actividad de las clases”** muestra el usuario, fecha y hora de Chile, acción, participante/actividad y clase.
- Filtros: Desde, Hasta, Clase, Usuario y Tipo de registro. “Actualizar” recarga la consulta; “Ver movimientos anteriores” carga otra página de 50 registros.
- Incluye altas, modificaciones, desactivaciones y eliminaciones de participantes; marcas de asistencia; registros de clases en encuentros; programación y eliminación de actividades; responsabilidades y resúmenes.
- Solo el administrador puede consultar el monitor. No se muestran contraseñas ni documentos completos de fichas, contactos u observaciones privadas. Se muestra el motivo de una eliminación cuando existe su registro.
- El historial disponible comienza donde existan registros de auditoría. No es un registro de inicios de sesión.

## Verificación después de publicar

1. Cuenta general: abrir una Escuela dominical reciente, marcar y guardar.
2. Cuenta `.asistencia` de la misma clase: abrir esa misma fecha y confirmar que puede continuar registrando si está dentro de 7 días.
3. Comprobar que una fecha de 8 días es de consulta para `.asistencia` y una de 22 días para la cuenta general. El administrador puede corregir ambas.
4. Secretaría: programar una visita de prueba con responsables y revisar las tres asignaciones al volver a abrirla. Eliminar la actividad de prueba; restaurarla con el administrador si corresponde.
5. Descargar “Cartas del mes · PDF único”. Revisar que las páginas correspondan a las asignaciones del mes elegido.
6. Administrador: comprobar los movimientos anteriores en “Actividad de las clases” y filtrar por la cuenta utilizada.

## Verificación técnica realizada

- 74 pruebas automatizadas satisfactorias, incluidas las de PostgreSQL/RLS sobre una base aislada.
- Probado: cambio de cuenta general a limitada después de guardar; retirar/agregar presentes; límites de 7/21 días; concurrencia; privacidad y aislamiento de clases; Secretaría sin permisos sobre actividades internas; eliminación/restauración conservando historial; monitor exclusivo del administrador.
- Compilación de producción correcta.
- Navegador local con datos ficticios: asignaciones de Secretaría, eliminación de ensayo y evento, monitor y ausencia del formulario masivo, guardado sin cierre.
- PDF mensual de prueba: 27 cartas, 27 páginas tamaño carta, folios y texto presentes en todas las páginas.

Estas comprobaciones son locales; la publicación real requiere los pasos indicados al inicio.

## GitHub

**Título:** `v3.7: asistencia abierta, gestión de Secretaría y auditoría`

**Descripción:**

Permite continuar registrando asistencia tras guardar, con plazos de 7 días para cuentas limitadas y 21 días para cuentas generales. Secretaría gestiona actividades JUPA y responsables, excluyendo actividades internas de clases. Agrega cartas mensuales en un único PDF y un monitor de actividad exclusivo del administrador. Retira el formulario masivo de credenciales y conserva el historial al eliminar actividades. Incluye migración SQL y pruebas de permisos, plazos y conservación de datos.
