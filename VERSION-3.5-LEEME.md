# Versión 3.5 — Invitados y cuentas de asistencia

Esta entrega contiene código y SQL listos para publicar. No ejecuta cambios en Supabase ni crea cuentas productivas por sí sola.

## Publicación, en este orden

1. En Supabase → SQL Editor ejecuta completo `supabase/migrations/202611200002_cuentas_asistencia_invitados.sql`. Requiere las migraciones anteriores, incluida `202611200001_contacto_miembros.sql`. Es repetible y conserva participantes, historial y contraseñas. No vuelvas a ejecutar la migración inicial V3.
2. En Supabase → Edge Functions → **super-responder**, reemplaza el código por **todo** `supabase/functions/manage-users/index.ts` y despliega. El archivo es autocontenido. Conserva la configuración y los secretos del servidor; no copies claves al frontend.
3. Sube los cambios de esta versión a GitHub y espera que Cloudflare termine la implementación. Recarga la página e ingresa como administrador.
4. En Administración → **Cuentas de las clases**, elige una contraseña temporal de **12 a 128 caracteres**, cópiala y pulsa **Crear cuentas faltantes**. Revisa el resultado por clase. No cierres la pantalla mientras procesa.
5. En Administración → **Actividades y permisos**, comprueba que estén habilitados Escuela dominical, Servicio del domingo y Reunión mensual. La creación en lote ya asigna a las cuentas nuevas los permisos correspondientes a su propia clase.

La creación usa la API administrativa de Supabase Auth y guarda perfil/permisos con una función SQL transaccional. Así se evitan inserciones manuales incompatibles en las tablas internas de Authentication. Solo un administrador activo, con contraseña definitiva, puede ejecutar el proceso.

## Usuarios

| Clase | Cuenta general nueva | Cuenta de registro nueva |
|---|---|---|
| San Carlos | sancarlos.jupa | sancarlos.asistencia |
| Casas Viejas | casasviejas.jupa | casasviejas.asistencia |
| Templo Matriz | templomatriz.jupa | templomatriz.asistencia |

Se toman las clases activas de la base de datos, sin locales; se quitan espacios y tildes para construir el usuario. Cada cuenta nueva debe cambiar su contraseña en el primer ingreso. La contraseña actual no queda visible ni se incluye en la auditoría.

Si ya existe una cuenta de clase del mismo tipo, se conserva con su nombre, permisos, estado y contraseña actuales, aunque tenga otro nombre de usuario. Si el nombre esperado pertenece a otro perfil, se informa el conflicto sin modificarlo. Por ejemplo, una cuenta de Jefatura con nombre `templomatriz.jupa` requiere revisar el nombre de la nueva cuenta general; no se transforma automáticamente ni pierde sus privilegios.

El proceso se puede repetir: solo crea lo que falta. Los errores se muestran por clase. Usa `supabase/consultas/20261120_verificar_cuentas_clases.sql` para revisar cuentas y actividades habilitadas con nombres legibles. Las cuentas existentes conservan también sus permisos: revísalos en Administración si todavía no tienen habilitadas las tres actividades locales.

Para crear una sola cuenta, también está disponible la casilla **Solo asistencia** en Crear usuario, al elegir Cuenta de clase.

## Diferencias de acceso

| Acción | General de la clase | Solo asistencia |
|---|---|---|
| Pasar asistencia de su clase | Sí, según permisos | Sí, según permisos |
| Buscar invitados de otras clases | Datos básicos | Datos básicos |
| Agregar participantes nuevos de su clase | Sí | Sí, con campos opcionales completos |
| Consultar o editar fichas existentes | Solo de su clase, incluida pertenencia secundaria | No |
| Ver RUT, contactos, dirección u observaciones existentes | Solo fichas autorizadas | No |
| Programar reuniones/preparar domingos | Sí | No |
| Estadísticas, historial y exportaciones | Según permisos | No |

La cuenta general abre Escuela dominical y Servicio del domingo para preparar los domingos del mes. También programa la reunión mensual. Luego la cuenta `.asistencia` encuentra esas actividades en su calendario. El alta desde la cuenta limitada devuelve solo datos básicos; la cuenta general puede revisar la ficha y agregar su fotografía después.

## Filtros de asistencia

- Coro: **Solo Coro JUPA** o **Todos · incluir invitados**.
- Actividades locales: **Mi clase** o **Todos · incluir invitados**.
- Reunión de encargados, devocional y servicio JUPA: **Encargados y ayudantes**, **Colaboradores y cuerpos**, **Todos**.
- Las personas ya presentes siguen visibles aunque no coincidan con el filtro de grupo. La búsqueda por nombre y el filtro adicional por clase siguen disponibles.

Buscar invitados no permite editar sus fichas. En actividades locales la presencia se contabiliza para la clase que registra el servicio; no cambia la clase de pertenencia del participante. Se conserva la prevención de doble presencia en el mismo tipo de servicio y fecha, así como el plazo de edición de 21 días y el guardado en lote.

## Comprobación después de publicar

1. Crea una cuenta `.asistencia`, ingresa y cambia su clave temporal.
2. Confirma que solo aparecen Inicio, Actividades y Avisos, sin Participantes ni Estadísticas.
3. Desde una actividad propia ya programada, cambia a Todos, busca un invitado y guarda su asistencia.
4. Agrega un participante nuevo de tu clase con un contacto opcional. Comprueba desde la cuenta general que el dato se guardó, y que `.asistencia` no puede abrir su ficha.
5. En Coro, comprueba que Todos permite registrar a una persona sin etiqueta de coro.

No se realizaron estas operaciones sobre producción durante el desarrollo; las verificaciones se ejecutaron con PostgreSQL local y datos ficticios de navegador.
