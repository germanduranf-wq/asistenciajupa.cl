# Asistencia JUPA 3.4

La ficha de participantes incorpora teléfono, correo de contacto, nombre y teléfono de emergencia y dirección completa. Son opcionales, se pueden editar y aparecen en las exportaciones de participantes y listados de asistencia. El correo de contacto es independiente del identificador de acceso.

## Publicación

1. Ejecutar en Supabase SQL Editor `supabase/migrations/202611200001_contacto_miembros.sql`. Es repetible y conserva las reglas RLS existentes.
2. Revisar y subir los cambios de esta versión a GitHub. Cloudflare compila con el procedimiento habitual.
3. Probar una ficha autorizada: completar los nuevos campos, guardar, abrir de nuevo y comprobar el Excel.

No volver a ejecutar la migración completa del esquema V3. No se necesita modificar la Edge Function para estos campos.

## Importación privada

Los SQL con datos personales del Excel se entregan aparte, fuera del repositorio. Contienen una previsualización que termina en ROLLBACK y una aplicación que termina en COMMIT. Revisar el resultado de la primera antes de aplicar la segunda. Las coincidencias dudosas quedan fuera de las altas automáticas. Una tabla privada registra antes/después de cada ficha procesada.

La importación no reactiva cuentas ni participantes y no cambia clases, categorías, fotos o historial de las fichas existentes. Completa vacíos, amplía nombres compatibles y agrega cuerpos. Los datos existentes en conflicto se conservan y se informan. La unión de un duplicado confirmado se entrega como SQL separado.

## Validación

61 pruebas automatizadas aprobadas, compilación de producción y prueba del formulario a 390 px con guardado de contacto en modo de demostración. La importación y su repetición se probaron en PostgreSQL local mediante PGlite, incluyendo identificación de conflictos y conservación de datos.

La validación local no sustituye la ejecución de la migración ni la comprobación en la base productiva.
