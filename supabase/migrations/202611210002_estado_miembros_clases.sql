-- V3.6.2: aplicar después de V3.6. No elimina ni desactiva personas al ejecutarse.
BEGIN;
CREATE OR REPLACE FUNCTION jupa_v3.can_person(c bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND (NOT p.solo_asistencia OR (accion='create' AND c=p.iglesia_id)) AND (
 p.rol IN('admin','jefatura','secretaria') OR (p.rol='encargado' AND accion IN('view','create','photo'))
 OR (p.rol='clase' AND p.iglesia_id=c AND accion IN('view','create','edit','photo','reactivate','retire','delete'))));
$$;
CREATE OR REPLACE FUNCTION public.v3_eliminar_miembro(p_id bigint,p_confirmacion text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.miembros; ruta text;
BEGIN

 SELECT * INTO m FROM public.miembros WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El participante ya no existe.'; END IF;
 IF NOT jupa_v3.puede_editar_miembro(p_id,'delete') THEN RAISE EXCEPTION 'No tienes permiso para eliminar este participante.' USING errcode='42501'; END IF;
 IF p_confirmacion IS DISTINCT FROM m.nombres||' '||m.apellidos THEN RAISE EXCEPTION 'Escribe el nombre completo para confirmar.'; END IF;
 IF length(trim(coalesce(p_motivo,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Indica un motivo de 5 a 500 caracteres.'; END IF;
 IF EXISTS(SELECT 1 FROM public.registros_encuentro_clases WHERE p_id=ANY(participantes_ids))
 OR EXISTS(SELECT 1 FROM public.asistencias WHERE miembro_id=p_id)
 OR EXISTS(SELECT 1 FROM public.responsabilidades WHERE miembro_id=p_id OR realizado_por=p_id)
 OR EXISTS(SELECT 1 FROM public.cartas_visitas WHERE miembro_id=p_id)
 OR m.fusionado_en IS NOT NULL OR EXISTS(SELECT 1 FROM public.miembros WHERE fusionado_en=p_id)
 THEN RAISE EXCEPTION 'El participante tiene historial. Consérvalo inactivo o solicita la fusión de duplicados al administrador.'; END IF;
 INSERT INTO public.miembros_eliminados(miembro_id,nombre,iglesia,motivo,eliminado_por,nombre_usuario)
 SELECT m.id,m.nombres||' '||m.apellidos,i.nombre,trim(p_motivo),auth.uid(),u.nombre FROM public.iglesias i CROSS JOIN public.usuarios u WHERE i.id=m.iglesia_id AND u.id=auth.uid();
 ruta:=m.ruta_foto;
 DELETE FROM public.miembros WHERE id=m.id;
 RETURN jsonb_build_object('id',m.id,'photo_path',ruta);
END $$;

-- Desactivar no concede trasladar participantes a otra clase.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('jupa_v3.guard_person_changes()'::regprocedure) INTO def;
 def:=replace(def,'new.iglesia_id IS DISTINCT FROM old.iglesia_id AND NOT jupa_v3.can_person(old.iglesia_id,''retire'')','new.iglesia_id IS DISTINCT FROM old.iglesia_id AND NOT jupa_v3.can_publish()');
 EXECUTE def;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
