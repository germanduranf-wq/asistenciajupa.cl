# Publicar Asistencia JUPA 3.2

Requiere la versión 3.1 instalada: segunda clase, observaciones e historial. No ejecutar de nuevo la migración completa V3 ni volver a importar participantes.

## Pasos para publicar

1. En Supabase → SQL Editor, ejecutar **completo** `supabase/migrations/202610230001_corregir_alta_miembros.sql`. Corrige el error «new row violates row-level security policy for table miembros» al agregar participantes. Se puede aplicar de inmediato sin cambiar la web.
2. En una segunda consulta, ejecutar **completo** `supabase/migrations/202610230002_resumenes_secretaria.sql`. Esperar el resultado satisfactorio. Ambos archivos incluyen su propia transacción y se pueden repetir.
3. En GitHub Desktop, abrir `asistenciajupa.cl`, revisar los cambios, hacer Commit y Push origin. Esperar que Cloudflare termine correctamente y recargar la web.
4. No cambiar claves ni contraseñas ni actualizar la Edge Function `super-responder` para esta versión.

No se borra ningún participante, cuenta, contraseña, actividad, asistencia, foto ni carta. Se agregan resúmenes y la actividad de tarde; las clases y categorías históricas se conservan.

## Dónde encontrarlo

- **Actividades → Resúmenes de Secretaría**: formatos del servicio general JUPA, devocional y reunión mensual con ensayos. Se puede elegir el mes y descargar los tres formatos del año en Excel, más el detalle de solicitudes del tema bíblico.
- **Avisos JUPA → evento mensual JUPA**: al programarlo se crea automáticamente su asistencia de tarde, además de la asistencia del coro que ya existía. Los eventos mensuales existentes también reciben esta nueva actividad. El devocional continúa programándose por separado. Cambiar fecha, publicar o despublicar el evento sincroniza ambas listas sin borrar sus marcas.
- **Actividad → Exportar listado Excel**: asistentes guardados, clase y categoría históricas, ficha actual, cuerpos, RUT, nacimiento, observaciones y estado. También hojas de participación por clase y cuerpo. Hay que guardar o descartar marcas pendientes antes de exportar.
- **Participantes → Exportar todos los participantes**: solamente administrador. Incluye fichas activas, inactivas y fusionadas; las fotos aparecen como referencia privada, sin publicar enlaces.

## Cómo completar los resúmenes

**Servicio general JUPA:** las clases anfitrionas vienen del evento de Avisos. Vincular explícitamente el devocional correspondiente para ver sus encargados y ayudantes. Ingresar manualmente los totales generales del punto de predicación y de la tarde. Completar oportunidades, coordinación, predicación, pasaje, oración, predicadores presentes, agradecimientos y observaciones. Los invitados se escriben libremente; no es necesario crearles ficha.

**Devocional:** clases anfitrionas, oportunidades por clase, tema bíblico, expositor, lectura, pasaje, tema administrativo, coordinador, predicadores presentes, observaciones y selección múltiple de clases que solicitaron el tema. Sus totales se calculan desde la asistencia guardada.

**Reunión mensual:** se abre después de programar la reunión de encargados. Completar clases responsables de invitaciones, oración, lectura, pasaje, tema administrativo, oportunidades, bendición y observaciones. Seleccionar el primer y segundo ensayo de coro del mismo mes. Se calculan tanto los encargados/ayudantes presentes en esos ensayos como el total de asistentes del coro. La reunión y el ensayo simultáneos siguen siendo dos actividades diferentes.

En los listados de devocional y servicio JUPA de tarde se priorizan encargados, ayudantes y personas de cuerpos, pero aparecen todos los participantes activos para poder registrar a quienes estén mal categorizados. Corregir posteriormente su ficha no reescribe la categoría histórica de una marca ya registrada.

## Cartas actualizadas

Los PDF individuales y el ZIP mensual usan los modelos entregados: logo JUPA, tipografía EB Garamond incorporada, firmas originales y contactos de David Zenteno (jóvenes), Gerard Rosales (coro) y Mariela Vargas (señoritas). No aparece «Presente» junto al destinatario. Se conserva una carta por asignación y su folio AJ existente, sin reiniciar numeración. La firma inferior corresponde al fondo definido en los prototipos TeX.

Para revisar: abrir una visita con responsables, descargar sus cartas y, desde el resumen mensual de responsabilidades, descargar el ZIP. El ZIP continúa disponible para Administrador y Secretaría; no se amplían permisos por cambiar el diseño. No necesita instalación de LaTeX en Cloudflare ni servicios externos para generar el PDF.

## Criterios de conteo

- Total general manual y asistencia por nombre son medidas independientes: no se suman.
- Vacío significa «no informado»; 0 es un total confirmado sin asistentes.
- Una persona puede estar en varios cuerpos. La suma por cuerpos puede superar el número de personas.
- Las marcas nuevas conservan sus cuerpos al registrar. En las anteriores no existía ese dato histórico: se usan sus cuerpos actuales, indicándolo en pantalla y en el Excel.
- «Sin asistentes registrados» no confirma ausencia mientras se está pasando asistencia.
- Las listas de clases conservan la iglesia histórica de cada marca, aunque el participante se traslade.

## Permisos

Los resúmenes son privados para administrador, Secretaría y Jefatura, y respetan los permisos de consultar/registrar/exportar de cada actividad. Los cambios posteriores a 21 días quedan reservados al administrador. Los cambios concurrentes se detectan para no sobrescribir un resumen ajeno.

El módulo **Servicio JUPA de la tarde** se agrega habilitado y concede consulta, registro y exportación a las cuentas existentes de Secretaría/Jefatura que aún no tengan permisos para él. En cuentas nuevas, o para cambiar permisos, usar **Administración → Actividades y permisos**. Los módulos anteriores mantienen su configuración: revisar que devocional, reunión de encargados y ensayos de coro estén habilitados y autorizados para quien los vaya a usar. Las cuentas de clase y coro no reciben acceso a estos resúmenes.

## Verificación rápida después de publicar

1. Crear un participante con Administrador o Jefatura y comprobar que aparece una sola ficha.
2. Abrir un evento mensual publicado y comprobar su actividad de tarde.
3. Marcar una persona, guardar, recargar y exportar su listado.
4. Completar un resumen, cerrarlo y volver a abrirlo. Verificar que vacío y cero se conservan correctamente.
5. Descargar los resúmenes del año y el padrón completo con Administrador.
6. Descargar cartas de jóvenes, coro y señoritas, y el ZIP mensual.
7. Confirmar que una cuenta de clase no ve Resúmenes de Secretaría ni Exportar todos los participantes.

Pruebas locales: migraciones y permisos PostgreSQL/PGlite; creación con INSERT RETURNING; concurrencia; plazo; eventos vinculados; cuerpos históricos; conteos y lectura posterior de Excel. Flujo de los tres formularios y descargas verificado en navegador con datos ficticios y anchos de 320, 390 y 1280 px. No se ha ejecutado SQL ni probado con cuentas en la base productiva desde este entorno.

Las cartas se probaron en navegador, se abrió el ZIP y se revisaron visualmente los tres formatos PDF más un caso con nombre y lugar largos. La fuente incluye su licencia en public/cartas/fuentes/OFL.txt.
