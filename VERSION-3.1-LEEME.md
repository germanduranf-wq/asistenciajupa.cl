# Publicar Asistencia JUPA 3.1

Esta actualización parte de la base V3 ya instalada (`miembros`, `iglesias`, `asistencias`, `usuarios`). No ejecutar nuevamente la migración completa de V3.

## Orden de publicación

1. En Supabase > SQL Editor, abrir una consulta nueva. Copiar y ejecutar **todo** `supabase/migrations/202610220001_clases_cartas.sql`, desde `BEGIN` hasta `COMMIT`.
2. Esperar el resultado satisfactorio. Si la consulta informa asistencias locales duplicadas, la actualización se revierte completa: revisar esos registros antes de continuar. No borrar participantes ni cuentas.
3. En GitHub Desktop, revisar y subir los archivos de esta versión con **Commit** y **Push origin**. Esperar que Cloudflare termine de compilar.
4. Recargar la página. No es necesario cambiar claves, contraseñas ni actualizar `super-responder` para esta versión.

El SQL es repetible y conserva los folios ya emitidos. No altera `auth.users`, las contraseñas, los identificadores ni la clase histórica de las asistencias existentes.

## Funcionalidad

- Ficha: clase principal, otra clase opcional y observaciones opcionales. Ambas clases editan la misma ficha y fotografía. La administración central conserva el permiso para cambiar la clase principal. Una clase no puede quitar su propio acceso a una ficha; debe solicitarlo a la administración central.
- Asistencia local: la marca cuenta para la clase que registra el servicio. Solo una presencia por persona, fecha y tipo (escuela dominical, servicio del domingo o reunión mensual), incluso si dos cuentas guardan a la vez. Escuela dominical y servicio de tarde son tipos distintos.
- Visitas: una única presencia por actividad, contabilizada en la clase principal al registrar la primera marca. Corregir marcas no cambia esa atribución histórica.
- Transferencias: los registros anteriores conservan clase y categoría. La clase anterior mantiene sus informes, con nombres mínimos de quienes se trasladaron; no obtiene sus nuevas observaciones. El historial individual permite consultar un período completo a los perfiles centrales y a las clases actuales de la persona. El coro y cuentas con alcance limitado solo consultan sus actividades autorizadas.
- Avisos: tarjetas adaptadas al tamaño de pantalla; secciones vacías ocultas; el mes actual muestra desde hoy, usando la fecha de Santiago. Los meses anteriores conservan toda su programación. Las descargas usan el mismo filtro visible.
- Actividades > Cartas y responsables: resumen mensual exclusivamente de visitas de viernes; PDF e imagen. Cartas individuales disponibles para Administración, Secretaría y Jefatura. El ZIP mensual corresponde solo a Administración y Secretaría.
- Se emite una carta por responsabilidad asignada, omitiendo visitas suspendidas. Si faltan responsables, el resumen indica «Por asignar». Las cartas del ZIP incluyen todas las visitas programadas del mes, aun si alguna visita excepcional no es viernes.
- Folios AJ 01, AJ 02… globales y persistentes. Repetir una descarga conserva folio y fecha de emisión para la misma persona, función y visita; corregir fecha/destino actualiza el contenido. Cambiar la persona genera otra carta y conserva el registro anterior. La numeración puede tener saltos si una operación se revierte; nunca se reutiliza un folio.
- Plantillas de jóvenes, coro y señoritas conservan firmantes, contactos y citas de los originales. Las firmas de jóvenes y señoritas proceden de los PDF entregados; coro se mantiene sin firma manuscrita como su original.

## Comprobación después de publicar

1. Editar una ficha para agregar su otra clase y una observación; comprobar acceso desde ambas cuentas de clase.
2. Marcar una escuela dominical en una clase: en la otra debe verse «Presente en…» y bloquear una nueva marca. El servidor vuelve a comprobarlo al guardar aunque el listado aún no se haya actualizado.
3. Consultar el historial de una persona trasladada y confirmar clase contabilizada por fecha.
4. Descargar carta, volver a descargar y comprobar mismo folio. Probar ZIP como Secretaría.
5. Abrir `/avisos` sin sesión: no debe publicar personas, responsables, observaciones ni asistencias.

La base productiva y Cloudflare no se actualizan por copiar archivos al repositorio. Los pasos de SQL y publicación son necesarios.
