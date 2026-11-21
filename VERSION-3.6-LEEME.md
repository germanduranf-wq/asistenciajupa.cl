# V3.6 · Participación de las clases en JUPA

## Publicar
1. En Supabase → SQL Editor, ejecutar completo `supabase/migrations/202611210001_seguimiento_encuentros_clases.sql`. Requiere las migraciones anteriores hasta V3.5. Es repetible.
2. Subir esta versión a GitHub y esperar el despliegue de Cloudflare.
3. Entrar con una cuenta de clase → Actividades → Mi clase en JUPA → Participación de mi clase.

No requiere actualizar la Edge Function ni restablecer contraseñas. El SQL no se ha ejecutado en producción desde este trabajo.

## Uso
- Ambas cuentas de clase pueden registrar Punto de predicación y Servicio de la tarde en encuentros mensuales publicados, seleccionando el mes. Guardar una lista vacía registra cero; sin guardar se muestra Sin registrar.
- Guardar asistencia de mi clase confirma el registro. Se controlan versiones para evitar sobrescribir a otra cuenta. Fecha futura bloqueada; plazo 21 días, salvo administrador para fechas pasadas.
- La cuenta general puede consultar visitas, ensayos y coro en evento: filtros de fechas, grupo, seguimiento de 21/42/60/90 días, últimas asistencias y regresos. La cuenta .asistencia no recibe ese historial ni estadísticas ni contactos privados.
- Administración, Jefatura y Secretaría pueden seleccionar una clase en esta sección. Los registros son anexos: nunca se suman a los totales generales de Secretaría.
- Se conservan las clases históricas de las asistencias. La nueva tabla es registros_encuentro_clases, con registro de autor, fecha y auditoría. No se permite borrar miembros con este historial.

## Verificación
Pruebas SQL de aislamiento, concurrencia, plazo, cuenta limitada y separación de los totales; compilación y prueba de navegador con datos ficticios.

## GitHub
Título: v3.6: Seguimiento y asistencia de las clases en encuentros JUPA
Descripción: Añade seguimiento de visitas y coro para cuentas generales y registro independiente por clase del punto de predicación y servicio de la tarde. Ambas cuentas registran asistencia; las limitadas no ven estadísticas. Incluye migración, controles de acceso, plazo, concurrencia y auditoría, sin alterar los totales de Secretaría.
