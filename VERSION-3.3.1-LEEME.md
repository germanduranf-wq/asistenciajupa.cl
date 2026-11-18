# Asistencia JUPA 3.3.1

1. Si todavía no instalaste 3.3, ejecutar primero `supabase/migrations/202611180001_navegacion_evento_eliminacion.sql`.
2. Ejecutar completo `supabase/migrations/202611180002_locales_sin_juventud.sql`.
3. Hacer commit/push de esta versión y esperar el despliegue de Cloudflare.

El inicio presenta accesos por área, avisos con márgenes amplios, responsabilidades pendientes y cumpleaños de los siguientes 30 días. La agenda queda al final, después del panel de visitas. Las cuentas de clase ven solamente su ámbito; Jefatura inicia con Templo Matriz (si no tiene otra clase asignada), con selector para consultar todas. Administración y Secretaría pueden filtrar las clases autorizadas. Los filtros de agenda y juventud son independientes y están etiquetados.

Las responsabilidades mostradas pertenecen a personas de la clase seleccionada (principal o adicional), tienen fecha de hoy en adelante dentro del mes y respetan los permisos de consulta existentes. Esta versión no otorga permisos nuevos de visitas a cuentas de clase. Si una cuenta no tiene acceso a las responsabilidades, no se exponen mediante el inicio.

Los locales continúan como destinos de visita. Ya no son opciones para pertenencia principal ni adicional de participantes. El SQL impide nuevas asignaciones a locales y deja de generarles domingos. No borra actividades anteriores, no mueve fichas existentes ni cambia la clase contabilizada en asistencias históricas. La distinción usa el tipo **Local** del catálogo, no deducciones a partir del nombre. Revisar en Administración que Los Lirios, Concha y Toro y San Miguel estén clasificados correctamente; no se asocian automáticamente nombres ambiguos.

Las contraseñas actuales no pueden consultarse: Supabase conserva hashes. No se añadió almacenamiento de contraseñas legibles. El administrador puede restablecer y copiar una contraseña temporal desde Administración → Usuarios, como en 3.3.

Validación: pruebas automatizadas de aislamiento por clase, fechas, cumpleaños y reglas SQL de locales; compilación de producción; revisión visual en escritorio y celulares. No se modificó la base de datos productiva.
