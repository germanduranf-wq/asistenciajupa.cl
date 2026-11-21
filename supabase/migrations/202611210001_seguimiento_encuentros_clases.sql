BEGIN;
-- Registros anexos: nunca modifican asistencias ni resumenes_servicios.
CREATE TABLE IF NOT EXISTS public.registros_encuentro_clases (
 id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 evento_id bigint NOT NULL REFERENCES public.eventos(id), iglesia_id bigint NOT NULL REFERENCES public.iglesias(id),
 momento text NOT NULL CHECK(momento IN('punto','tarde')), participantes_ids bigint[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1, actualizado_por uuid NOT NULL REFERENCES public.usuarios(id), actualizado_el timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(evento_id,iglesia_id,momento)
);
ALTER TABLE public.registros_encuentro_clases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registros_encuentro_clases FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.v36_clase_panel(p_clase bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.usuarios; c bigint; salida jsonb;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR u.rol NOT IN('clase','admin','jefatura','secretaria') THEN RAISE EXCEPTION 'Sin acceso.' USING errcode='42501'; END IF;
 c:=coalesce(p_clase,u.iglesia_id);
 IF c IS NULL OR (u.rol='clase' AND c IS DISTINCT FROM u.iglesia_id) THEN RAISE EXCEPTION 'Selecciona tu propia clase.' USING errcode='42501'; END IF;
 SELECT jsonb_build_object(
 'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id::text,'first_name',m.nombres,'last_name',m.apellidos,'category',m.categoria,'active',m.activo,'current',(m.iglesia_id=c OR m.otra_iglesia_id=c))) FROM public.miembros m WHERE m.fusionado_en IS NULL AND (m.iglesia_id=c OR m.otra_iglesia_id=c OR EXISTS(SELECT 1 FROM public.registros_encuentro_clases r WHERE r.iglesia_id=c AND m.id=ANY(r.participantes_ids)) OR (NOT u.solo_asistencia AND EXISTS(SELECT 1 FROM public.asistencias a WHERE a.miembro_id=m.id AND a.iglesia_id=c AND a.presente)))),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'date',e.date,'title',e.titulo)) FROM public.eventos e WHERE e.tipo='jupa' AND e.publicado),'[]'::jsonb),
 'registers',coalesce((SELECT jsonb_agg(jsonb_build_object('event_id',r.evento_id::text,'moment',r.momento,'ids',ARRAY(SELECT x::text FROM unnest(r.participantes_ids)x),'version',r.version)) FROM public.registros_encuentro_clases r WHERE r.iglesia_id=c),'[]'::jsonb),
 'history',CASE WHEN u.solo_asistencia THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'date',a.date,'type',a.tipo_actividad,'group',a."group",'place',i.nombre,'ids',ARRAY(SELECT s.miembro_id::text FROM public.asistencias s WHERE s.actividad_id=a.id AND s.presente AND s.iglesia_id=c))) FROM public.actividades a JOIN public.iglesias i ON i.id=a.iglesia_id WHERE a.tipo_actividad IN('visita','ensayo_coro','evento_coro') AND a.eliminado_el IS NULL AND a.estado<>'suspended' AND a.date<=(now() AT TIME ZONE 'America/Santiago')::date AND (a.estado='held' OR EXISTS(SELECT 1 FROM public.asistencias s WHERE s.actividad_id=a.id AND s.presente))),'[]'::jsonb) END
 ) INTO salida;
 RETURN salida;
END $$;
CREATE OR REPLACE FUNCTION public.v36_guardar_clase(p_evento bigint,p_clase bigint,p_momento text,p_ids bigint[],p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.usuarios; e public.eventos; r public.registros_encuentro_clases; hoy date:=(now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR u.rol NOT IN('clase','admin','jefatura','secretaria') OR (u.rol='clase' AND p_clase IS DISTINCT FROM u.iglesia_id) THEN RAISE EXCEPTION 'Sin permiso para esta clase.' USING errcode='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=p_clase AND activo AND tipo<>'Local') THEN RAISE EXCEPTION 'Clase no disponible.'; END IF;
 IF p_momento NOT IN('punto','tarde') OR p_momento IS NULL OR p_ids IS NULL THEN RAISE EXCEPTION 'Datos inválidos.'; END IF;
 SELECT * INTO e FROM public.eventos WHERE id=p_evento AND tipo='jupa' AND publicado FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Evento no disponible.'; END IF;
 IF e.date>hoy OR (u.rol<>'admin' AND e.date<hoy-21) THEN RAISE EXCEPTION 'Registro fuera del plazo de 21 días o fecha futura.'; END IF;
 IF p_momento='tarde' AND EXISTS(SELECT 1 FROM public.actividades WHERE evento_id=e.id AND tipo_actividad='servicio_jupa' AND (estado='suspended' OR eliminado_el IS NOT NULL)) THEN RAISE EXCEPTION 'Servicio suspendido o eliminado.'; END IF;
 SELECT * INTO r FROM public.registros_encuentro_clases WHERE evento_id=p_evento AND iglesia_id=p_clase AND momento=p_momento FOR UPDATE;
 IF coalesce(r.version,0) IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Otra cuenta modificó el registro. Recarga antes de guardar.' USING errcode='40001'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids)x WHERE NOT EXISTS(SELECT 1 FROM public.miembros m WHERE m.id=x AND m.fusionado_en IS NULL AND (m.iglesia_id=p_clase OR m.otra_iglesia_id=p_clase OR m.id=ANY(coalesce(r.participantes_ids,'{}'))) AND (m.activo OR m.id=ANY(coalesce(r.participantes_ids,'{}'))))) THEN RAISE EXCEPTION 'Solo participantes de tu clase.' USING errcode='42501'; END IF;
 INSERT INTO public.registros_encuentro_clases(evento_id,iglesia_id,momento,participantes_ids,actualizado_por)
 VALUES(p_evento,p_clase,p_momento,ARRAY(SELECT DISTINCT x FROM unnest(p_ids)x),u.id)
 ON CONFLICT(evento_id,iglesia_id,momento) DO UPDATE SET participantes_ids=excluded.participantes_ids,version=registros_encuentro_clases.version+1,actualizado_por=u.id,actualizado_el=now();
END $$;
DROP TRIGGER IF EXISTS registro_clase_auditoria ON public.registros_encuentro_clases;
CREATE TRIGGER registro_clase_auditoria AFTER INSERT OR UPDATE ON public.registros_encuentro_clases FOR EACH ROW EXECUTE FUNCTION jupa_v3.audit_change();
REVOKE ALL ON FUNCTION public.v36_clase_panel(bigint),public.v36_guardar_clase(bigint,bigint,text,bigint[],integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v36_clase_panel(bigint),public.v36_guardar_clase(bigint,bigint,text,bigint[],integer) TO authenticated;
CREATE OR REPLACE FUNCTION jupa_v3.proteger_historial_encuentros() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.registros_encuentro_clases WHERE old.id=ANY(participantes_ids)) THEN RAISE EXCEPTION 'El participante tiene historial de encuentros por clase. Desactívalo para conservarlo.'; END IF;
 RETURN old;
END $$;
DROP TRIGGER IF EXISTS conservar_encuentros_clase ON public.miembros;
CREATE TRIGGER conservar_encuentros_clase BEFORE DELETE ON public.miembros FOR EACH ROW EXECUTE FUNCTION jupa_v3.proteger_historial_encuentros();
NOTIFY pgrst,'reload schema';
COMMIT;


