# Asistencia JUPA · V3.8.1

24 de noviembre de 2026. Actualización sobre V3.8.

## Publicación

1. Desde la carpeta `C:\Users\mandu\Documents\GitHub\asistenciajupa.cl`, crear el commit y subirlo a GitHub.
2. Esperar que Cloudflare termine de compilar e implementar.
3. Recargar la página y abrir cualquier asistencia: debe aparecer **Filtrar por género**.

Esta versión no agrega migraciones SQL ni cambia la Edge Function. Si aún no aplicaste V3.8, completa primero sus pasos descritos en `VERSION-3.8-LEEME.md`. No vuelvas a ejecutar la migración inicial V3 ni las importaciones de participantes.

## Filtro para todas las asistencias

- Opciones: **Todos**, **Hombres**, **Mujeres**.
- Disponible en escuela dominical, servicios del domingo, reuniones mensuales de clase, visitas, reuniones de encargados, devocionales, servicio JUPA, ensayos y coro en evento. También en los registros separados de punto de predicación y tarde dentro de **Participación de mi clase**.
- Funciona junto al buscador, clase, Coro JUPA, encargados/ayudantes, colaboradores/cuerpos y Solo presentes.
- Hombres incluye Joven, Encargado de jóvenes, Ayudante de jóvenes y Colaborador. Mujeres incluye Señorita, Encargada de señoritas, Ayudante de señoritas y Colaboradora.
- Se utiliza la categoría de la ficha, no el nombre. Una categoría desconocida o vacía aparece únicamente en Todos hasta que se corrija.
- Las actividades mixtas comienzan en Todos. Las visitas comienzan en el grupo de su convocatoria; seleccionar Todos permite incluir al otro grupo y reemplaza la antigua casilla Otros grupos.
- Cambiar el filtro no desmarca personas ni cambia el total del servicio. Las marcas que quedaron ocultas siguen guardándose.
- No amplía permisos ni acceso a fichas privadas. Se mantienen los plazos de cada cuenta y la separación entre registros de clases y los totales de Secretaría.

## Uso y trabajo con dos cuentas

1. Abrir el mismo servicio y la misma fecha.
2. Una persona puede elegir Hombres y otra Mujeres.
3. Tocar una vez a cada participante presente. Otro toque lo desmarca.
4. Pulsar **Guardar asistencia** y comprobar el mensaje de confirmación y que no queden cambios pendientes.

**No se necesita doble clic.** Marcar y luego guardar son dos acciones distintas. Un doble clic en la persona puede marcarla y desmarcarla.

La asistencia general envía solo las marcas modificadas. La base de datos conserva una sola marca por persona y actividad. Si dos cuentas cambian la misma marca con versiones distintas, se muestra un conflicto para revisar lo guardado, en vez de sobrescribirlo silenciosamente.

Los registros de encuentros de **Mi clase en JUPA** ahora consultan el registro reciente y aplican únicamente los cambios locales. Se conservan las marcas ocultas por el filtro, las históricas y las de otra cuenta. Si otra cuenta vuelve a cambiar el registro justo durante el guardado, se conserva el borrador y se solicita volver a guardar.

## Verificación realizada

- 81 pruebas automatizadas aprobadas, incluidas categorías, marcas ocultas, guardado por dos cuentas, versiones y conservación de totales.
- Compilación de producción correcta.
- Edge local con datos ficticios: dos pantallas abiertas en escuela dominical y encuentros, filtros por género, marcar/desmarcar y guardar ambos grupos.
- Diseño revisado en anchos de 390, 768 y 1280 píxeles.
- La publicación real en GitHub/Cloudflare queda pendiente; estas comprobaciones son locales.

## GitHub

Título: **feat: filtrar todas las asistencias por hombres y mujeres**

Descripción: Añade el filtro Todos/Hombres/Mujeres a las asistencias generales y a los encuentros de cada clase. Conserva marcas al cambiar de filtro e incorpora los cambios de otras cuentas al guardar encuentros. Aclara el uso de un toque para marcar y del botón Guardar asistencia. Incluye diseño adaptable y pruebas de guardado sin duplicados. No requiere SQL nuevo ni actualizar la Edge Function sobre V3.8.
