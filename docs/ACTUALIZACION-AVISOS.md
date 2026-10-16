# Actualización: cuerpos, devocionales y Avisos JUPA

Esta entrega modifica la aplicación existente. No requiere cambiar claves, contraseñas, dominio ni la Edge Function de usuarios.

## Publicar en el orden correcto

1. En Supabase → SQL Editor, abre una consulta nueva y ejecuta completo `supabase/migrations/202610140001_bodies_notices.sql`. Es una migración de una sola ejecución y requiere que ya estén aplicadas las anteriores, hasta `202610120003_reactivate_people.sql`. No vuelvas a ejecutar la migración inicial sobre una base existente.
2. Ejecuta completo `supabase/admin/importar-direcciones.sql`. Incorpora el directorio de 21 templos, clases y locales. Conserva los IDs, participantes e historiales de las clases existentes. Puede repetirse. Si encuentra dos clases con el mismo nombre normalizado, detiene toda la importación para que revises la duplicidad.
3. Ejecuta `supabase/admin/habilitar-avisos-devocionales.sql`. Habilita Devocionales JUPA y da a las cuentas activas de Secretaría y Jefatura permisos para programarlos, registrar asistencia y exportar sus estadísticas. A Secretaría le permite programar visitas, sin dar acceso a la asistencia ni a las estadísticas de visitas. Conserva los permisos anteriores de reuniones de encargados y de las cuentas de clase.
4. En GitHub Desktop, selecciona `asistenciajupa.cl`, revisa los cambios, crea un commit y pulsa **Push origin**. Se deben subir también `package.json`, `pnpm-lock.yaml` y el nuevo `src/bulletin.jsx`. Cloudflare usará su compilación habitual.
5. Cuando Cloudflare termine, abre `https://asistenciajupa.cl/avisos` sin iniciar sesión y verifica el mes. En el acceso privado comprueba las opciones de Secretaría y una cuenta de clase.

La configuración real de conexión está en `public/config.js`; se conserva la del repositorio. La configuración de demostración usada en las pruebas no se publica. Publicar únicamente el frontend sin ejecutar primero la nueva migración provocaría errores por tablas o columnas inexistentes.

## Dónde está cada función

- **Participantes → Agregar/Editar:** Cuerpos JUPA opcionales, con selección múltiple. No cambian la categoría de la persona ni conceden permisos de acceso. La edad mínima actual de 10 años se conserva.
- **Administración → Cuerpos JUPA:** agregar cuerpos y desactivarlos sin borrar las asociaciones históricas.
- **Administración → Clases y locales → Editar:** dirección, comuna y Google Maps. San Carlos se importa como Avenida Las Nieves Oriente 0812, Puente Alto. México y San Pedro quedan en La Florida; las demás ubicaciones, en Puente Alto.
- **Actividades:** reuniones de encargados, devocionales y actividades locales según permisos. Los encuentros mensuales de los avisos y los devocionales de asistencia se crean por separado.
- **Actividades → Programar visitas:** Secretaría puede indicar fecha, grupo, destino y hora opcional. Jefatura y administrador también pueden usar esta pantalla. Las observaciones internas no aparecen en el aviso público.
- **Avisos JUPA:** Secretaría, Jefatura y administrador pueden programar encuentros mensuales, servicios especiales y un mensaje destacado para cada mes. Un encuentro mensual requiere dos clases anfitrionas, lugar, dirección, horarios del devocional y servicio de la tarde, y punto de predicación. Los enlaces de Google Maps son opcionales. Se puede retirar la publicación desmarcando «Publicar en Avisos JUPA».
- **Estadísticas → Participación durante el registro:** muestra conteos por clase y clases sin marcas para la actividad seleccionada, usando los filtros del informe. Se actualiza con la asistencia; una clase sin marcas no equivale a ausencia definitiva. Se usa Realtime cuando está disponible y una actualización de respaldo cada 20 segundos.
- **Salir:** botón superior derecho. La barra inferior reúne las actividades bajo una sola opción.

## Avisos públicos y descargas

`/avisos` abre el mes actual; `/avisos?mes=2026-11` abre un mes concreto. Las flechas permiten consultar meses anteriores y siguientes. Las visitas, reuniones de encargados y devocionales se obtienen automáticamente de la programación de los módulos habilitados. Los servicios especiales y encuentros se muestran cuando su opción de publicación está activa.

La página permite descargar una imagen PNG, descargar un PDF paginado con enlaces de ubicación y abrir WhatsApp con el enlace del mes. El usuario elige el destinatario y envía el mensaje. Para compartir el PNG o PDF como adjunto, descárgalo y adjúntalo desde WhatsApp.

La consulta pública expone únicamente programación, nombres y direcciones de templos, horarios, enlaces y mensajes publicados. No expone participantes, RUT, fotografías, responsables individuales, asistencia ni notas internas. Evita escribir datos personales en los mensajes públicos.

## Permisos y nuevas cuentas

`account_permissions.can_schedule` controla la programación de visitas independientemente de `can_view`, `can_manage` y `can_export`. En Secretaría, estos tres últimos no habilitan asistencia de visitas: el rol queda restringido también en la base de datos.

Los permisos se asignan por cuenta. Si creas otra cuenta de Secretaría o Jefatura, puedes volver a ejecutar `habilitar-avisos-devocionales.sql` para darle estos mismos permisos. Las reuniones de encargados siguen dependiendo de sus permisos y de que su módulo esté habilitado; el script no cambia esa configuración previa.

Los permisos de las clases siguen limitados a su juventud y actividades locales. Los cuerpos de una persona no son roles de usuario. Las cuentas inactivas o que deben cambiar su contraseña temporal no pueden publicar avisos.

## Validación de esta entrega

- Compilación de producción con Vite y pruebas Node/PostgreSQL (PGlite).
- Pruebas de aislamiento por clase, programación de Secretaría sin lectura de asistencia, publicación anónima sin datos privados, cuerpos múltiples, plazo de edición y conservación de IDs al importar direcciones.
- Revisión en navegador con anchos de celular y tablet; formulario de fecha y cuerpos, navegación y página pública.
- Descargas PNG y PDF comprobadas con datos ficticios. Revisión visual de las páginas del PDF y verificación de enlaces.

Las pruebas locales no modificaron Supabase. Aún se debe ejecutar el SQL y publicar mediante GitHub/Cloudflare. La revisión de tamaños en navegador no sustituye una prueba final en dispositivos físicos Samsung y iPhone/Safari.
