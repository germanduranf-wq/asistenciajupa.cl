# V3.6.2 · Estado y eliminación de participantes por clase

## Publicación
1. Ejecutar completo en Supabase SQL Editor: `supabase/migrations/202611210002_estado_miembros_clases.sql`. Requiere las migraciones anteriores, incluida V3.6. Es repetible y no borra ni desactiva datos al aplicarse.
2. Subir los cambios de esta versión a GitHub y esperar Cloudflare. No requiere actualizar Edge Functions.

## Uso
La cuenta general .jupa puede editar Estado en la juventud (Activo/Inactivo), reincorporar y solicitar eliminación de miembros de su clase principal o compartida. La cuenta .asistencia conserva su restricción.

Inactivo no es una categoría ni una eliminación: conserva la ficha y todo el historial. En Participantes se muestra el estado y se mantiene Incluir inactivos.

Eliminar ficha exige escribir el nombre y un motivo. Solo se borra si no hay asistencias, registros de encuentros por clase, responsabilidades, cartas o fusiones. El borrado queda auditado. Si hay historial debe conservarse inactivo. No se concede permiso de traslado ni acceso a otras clases.

Participación de mi clase muestra solo participantes activos y actuales en la lista para marcar y en seguimiento. Los registros anteriores siguen íntegros; los totales históricos pueden incluir personas ya inactivas, lo que se informa. Guardar una lista no elimina silenciosamente las marcas históricas ocultas.

Verificaciones: pruebas SQL de alcance de clase, cuenta limitada, cambios de estado, bloqueo de traslados, confirmación, auditoría y conservación del historial; navegador con desactivación y listas activas; compilación.

## Commit
Título: v3.6.2: Gestiona estado y eliminación de participantes por clase
Descripción: Habilita a la cuenta general de clase para desactivar, reincorporar y eliminar fichas sin historial, con confirmación y auditoría. Muestra el estado en la juventud y limita las listas actuales de participación a miembros activos. Conserva asistencias históricas y restricciones de las cuentas de asistencia.
