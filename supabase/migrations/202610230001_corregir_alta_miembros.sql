-- Corrección V3.1: ejecutar completa en SQL Editor. No borra ni altera fichas.
BEGIN;
-- INSERT ... RETURNING evalúa SELECT sobre la fila nueva. Una función STABLE
-- que vuelve a buscarla en miembros todavía no ve esa fila en su snapshot.
DROP POLICY IF EXISTS miembros_lectura ON public.miembros;
CREATE POLICY miembros_lectura ON public.miembros FOR SELECT TO authenticated
USING (
 jupa_v3.can_person(iglesia_id,'view')
 OR (otra_iglesia_id IS NOT NULL AND jupa_v3.can_person(otra_iglesia_id,'view'))
 OR (EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='coro') AND jupa_v3.es_coralista(id))
);
NOTIFY pgrst,'reload schema';
COMMIT;
