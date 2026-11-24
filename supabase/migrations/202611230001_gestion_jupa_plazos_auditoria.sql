-- V3.7. Aplicar completa después de V3.6.2. Conserva participantes, cuentas e historial.
BEGIN;

CREATE OR REPLACE FUNCTION jupa_v3.plazo_asistencia() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN solo_asistencia THEN 7 ELSE 21 END FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
$$;
CREATE OR REPLACE FUNCTION jupa_v3.check_edit(p_visit bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.actividades; hoy date:=(now() AT TIME ZONE 'America/Santiago')::date; plazo integer;
BEGIN
 SELECT * INTO v FROM public.actividades WHERE id=p_visit;
 IF v.id IS NULL OR v.eliminado_el IS NOT NULL OR NOT jupa_v3.can_visit(p_visit,'manage') THEN RAISE EXCEPTION 'No tienes permiso para registrar esta actividad.' USING errcode='42501'; END IF;
 IF jupa_v3.is_admin() THEN RETURN; END IF;
 plazo:=jupa_v3.plazo_asistencia();
 IF v.date>hoy THEN RAISE EXCEPTION 'La asistencia abre el día de la actividad.'; END IF;
 IF plazo IS NULL OR hoy>v.date+plazo THEN RAISE EXCEPTION 'Registro fuera del plazo de % días de esta cuenta.',plazo; END IF;
 -- El estado held indica que hay registro; nunca cierra la asistencia.
END $$;

CREATE OR REPLACE FUNCTION public.v36_guardar_clase(p_evento bigint, p_clase bigint, p_momento text, p_ids bigint[], p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u public.usuarios; e public.eventos; r public.registros_encuentro_clases; hoy date:=(now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR u.rol NOT IN('clase','admin','jefatura','secretaria') OR (u.rol='clase' AND p_clase IS DISTINCT FROM u.iglesia_id) THEN RAISE EXCEPTION 'Sin permiso para esta clase.' USING errcode='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=p_clase AND activo AND tipo<>'Local') THEN RAISE EXCEPTION 'Clase no disponible.'; END IF;
 IF p_momento NOT IN('punto','tarde') OR p_momento IS NULL OR p_ids IS NULL THEN RAISE EXCEPTION 'Datos inválidos.'; END IF;
 SELECT * INTO e FROM public.eventos WHERE id=p_evento AND tipo='jupa' AND publicado FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Evento no disponible.'; END IF;
 IF u.rol<>'admin' AND (e.date>hoy OR e.date<hoy-jupa_v3.plazo_asistencia()) THEN RAISE EXCEPTION 'Registro fuera del plazo de % días o fecha futura.',jupa_v3.plazo_asistencia(); END IF;
 IF p_momento='tarde' AND EXISTS(SELECT 1 FROM public.actividades WHERE evento_id=e.id AND tipo_actividad='servicio_jupa' AND (estado='suspended' OR eliminado_el IS NOT NULL)) THEN RAISE EXCEPTION 'Servicio suspendido o eliminado.'; END IF;
 SELECT * INTO r FROM public.registros_encuentro_clases WHERE evento_id=p_evento AND iglesia_id=p_clase AND momento=p_momento FOR UPDATE;
 IF coalesce(r.version,0) IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Otra cuenta modificó el registro. Recarga antes de guardar.' USING errcode='40001'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids)x WHERE NOT EXISTS(SELECT 1 FROM public.miembros m WHERE m.id=x AND m.fusionado_en IS NULL AND (m.iglesia_id=p_clase OR m.otra_iglesia_id=p_clase OR m.id=ANY(coalesce(r.participantes_ids,'{}'))) AND (m.activo OR m.id=ANY(coalesce(r.participantes_ids,'{}'))))) THEN RAISE EXCEPTION 'Solo participantes de tu clase.' USING errcode='42501'; END IF;
 INSERT INTO public.registros_encuentro_clases(evento_id,iglesia_id,momento,participantes_ids,actualizado_por)
 VALUES(p_evento,p_clase,p_momento,ARRAY(SELECT DISTINCT x FROM unnest(p_ids)x),u.id)
 ON CONFLICT(evento_id,iglesia_id,momento) DO UPDATE SET participantes_ids=excluded.participantes_ids,version=registros_encuentro_clases.version+1,actualizado_por=u.id,actualizado_el=now();
END $function$
;

CREATE OR REPLACE FUNCTION jupa_v3.can_activity(m text, c bigint, accion text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND (NOT p.solo_asistencia OR (accion IN('view','manage') AND m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND EXISTS(SELECT 1 FROM public.modulos am WHERE am.codigo=m AND am.habilitado)
 AND (p.rol='admin' OR (p.rol='secretaria' AND m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa')) OR (
 (p.rol<>'clase' OR (m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND (p.rol<>'secretaria' OR m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
 AND (p.rol<>'encargado' OR m='visita') AND (p.rol<>'coro' OR m IN('ensayo_coro','evento_coro'))
 AND EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND ap.puede_ver AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c)
 AND CASE accion WHEN 'manage' THEN ap.puede_registrar WHEN 'export' THEN ap.puede_exportar WHEN 'view' THEN true ELSE false END))));
$function$
;

CREATE OR REPLACE FUNCTION jupa_v3.puede_programar(m text,c bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT jupa_v3.solo_asistencia() AND EXISTS(SELECT 1 FROM public.modulos WHERE codigo=m AND habilitado) AND (
 EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='secretaria' AND m IN('visita','reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
 OR CASE WHEN m='visita' THEN EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave AND p.rol IN('admin','jefatura') AND (p.rol='admin' OR EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c) AND (ap.puede_programar OR ap.puede_ver AND ap.puede_registrar)))) ELSE jupa_v3.can_activity(m,c,'manage') END);
$$;

CREATE OR REPLACE FUNCTION public.v3_save_visit(p_values jsonb, p_assignments jsonb)
 RETURNS actividades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.actividades; old_v public.actividades; vid bigint; m text; c bigint; new_date date; secretary boolean;
BEGIN
 -- V35_LIMITED_GUARD
 IF jupa_v3.solo_asistencia() THEN RAISE EXCEPTION 'Esta cuenta solo registra asistencia y agrega participantes nuevos.' USING errcode='42501'; END IF;
 IF nullif(p_values->>'id','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.actividades WHERE id=(p_values->>'id')::bigint AND evento_id IS NOT NULL) THEN RAISE EXCEPTION 'Las actividades vinculadas se editan desde el evento mensual.'; END IF;
 m:=coalesce(p_values->>'activity_type','visita'); IF m IN('evento_coro','servicio_jupa') THEN RAISE EXCEPTION 'Programa o modifica este evento desde Avisos JUPA.'; END IF; c:=(p_values->>'class_id')::bigint; new_date:=(p_values->>'date')::date;
 IF NOT jupa_v3.puede_programar(m,c) THEN RAISE EXCEPTION 'No tienes permiso para programar esta actividad.' USING errcode='42501'; END IF;
 SELECT rol='secretaria' INTO secretary FROM public.usuarios WHERE id=auth.uid();
 vid:=nullif(p_values->>'id','')::bigint;
 IF vid IS NOT NULL THEN
  SELECT * INTO old_v FROM public.actividades WHERE id=vid FOR UPDATE;
  IF old_v.id IS NULL OR NOT jupa_v3.puede_programar(old_v.tipo_actividad,old_v.iglesia_id) THEN RAISE EXCEPTION 'Actividad no disponible.'; END IF;
  IF old_v.version<>coalesce((p_values->>'version')::integer,0) THEN RAISE EXCEPTION 'La actividad fue modificada. Actualiza antes de guardar.' USING errcode='40001'; END IF;
  IF m<>old_v.tipo_actividad OR (NOT jupa_v3.is_admin() AND (c<>old_v.iglesia_id OR new_date<>old_v.date OR p_values->>'group'<>old_v."group")) THEN RAISE EXCEPTION 'Fecha, clase, tipo y grupo no se cambian después de crear la actividad.'; END IF;
 END IF;
 IF new_date < (now() AT TIME ZONE 'America/Santiago')::date-21 AND NOT jupa_v3.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede modificar programación de hace más de 21 días.'; END IF;
 IF m='visita' THEN
  v:=jupa_v3.v3_save_visit_legacy(p_values,p_assignments);
 ELSE
  IF vid IS NULL THEN
   INSERT INTO public.actividades(date,iglesia_id,"group",notas,tipo_actividad,iglesia_sede_id) VALUES(new_date,c,'Todos',coalesce(p_values->>'notes',''),m,coalesce(nullif(p_values->>'venue_class_id','')::bigint,c)) RETURNING * INTO v;
  ELSE
   UPDATE public.actividades SET date=new_date,iglesia_id=c,notas=coalesce(p_values->>'notes',''),iglesia_sede_id=coalesce(nullif(p_values->>'venue_class_id','')::bigint,c),version=version+1 WHERE id=vid RETURNING * INTO v;
  END IF;
 END IF;
 IF vid IS NOT NULL AND (old_v.eliminado_el IS NOT NULL OR old_v.evento_id IS NOT NULL) THEN RAISE EXCEPTION 'Restaura la actividad eliminada o modifica el evento desde Avisos.'; END IF; UPDATE public.actividades SET hora=nullif(p_values->>'scheduled_time','')::time WHERE id=v.id RETURNING * INTO v;
 RETURN v;
END; $function$
;

-- Programar incluye consultar las asignaciones, sin habilitar asistencia de visitas.
DROP POLICY IF EXISTS v3_responsibilities_read ON public.responsabilidades;
CREATE POLICY v3_responsibilities_read ON public.responsabilidades FOR SELECT TO authenticated USING(
 jupa_v3.can_visit(actividad_id) OR EXISTS(SELECT 1 FROM public.actividades a WHERE a.id=actividad_id AND a.eliminado_el IS NULL AND jupa_v3.puede_programar(a.tipo_actividad,a.iglesia_id)));
CREATE OR REPLACE FUNCTION public.v3_archivar_actividad(p_id bigint,p_version integer,p_archivar boolean) RETURNS public.actividades
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.actividades; u public.usuarios;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 SELECT * INTO v FROM public.actividades WHERE id=p_id FOR UPDATE;
 IF u.id IS NULL OR u.solo_asistencia OR NOT (u.rol='admin' OR u.rol='secretaria' AND p_archivar AND v.tipo_actividad NOT IN('escuela_dominical','servicio_domingo','reunion_mensual') AND jupa_v3.puede_programar(v.tipo_actividad,v.iglesia_id)) THEN RAISE EXCEPTION 'Sin permiso para eliminar o restaurar esta actividad.' USING errcode='42501'; END IF;
 IF v.id IS NULL OR v.version IS DISTINCT FROM p_version OR p_archivar IS NULL THEN RAISE EXCEPTION 'La actividad cambió. Actualiza antes de continuar.' USING errcode='40001'; END IF;
 IF v.evento_id IS NOT NULL THEN RAISE EXCEPTION 'Elimina o restaura el encuentro mensual completo desde su programación.'; END IF;
 UPDATE public.actividades SET eliminado_el=CASE WHEN p_archivar THEN now() ELSE NULL END,version=version+1 WHERE id=p_id RETURNING * INTO v;
 RETURN v;
END $$;
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS eliminado_el timestamptz;
ALTER TABLE public.eventos DROP CONSTRAINT IF EXISTS evento_eliminado_no_publicado;
ALTER TABLE public.eventos ADD CONSTRAINT evento_eliminado_no_publicado CHECK(eliminado_el IS NULL OR NOT publicado);
CREATE OR REPLACE FUNCTION public.v3_archivar_evento(p_id bigint,p_version integer,p_archivar boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.eventos; u public.usuarios;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR u.solo_asistencia OR NOT (u.rol='admin' OR u.rol='secretaria' AND p_archivar) THEN RAISE EXCEPTION 'Sin permiso para eliminar o restaurar este evento.' USING errcode='42501'; END IF;
 SELECT * INTO e FROM public.eventos WHERE id=p_id FOR UPDATE;
 IF e.id IS NULL OR e.version IS DISTINCT FROM p_version OR p_archivar IS NULL THEN RAISE EXCEPTION 'El evento cambió. Actualiza antes de continuar.' USING errcode='40001'; END IF;
 -- Los disparadores existentes archivan/restauran sus tres servicios sin borrar marcas.
 UPDATE public.eventos SET eliminado_el=CASE WHEN p_archivar THEN now() ELSE NULL END,publicado=NOT p_archivar,version=version+1 WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION jupa_v3.plazo_asistencia(),public.v3_archivar_evento(bigint,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jupa_v3.plazo_asistencia(),public.v3_archivar_evento(bigint,integer,boolean) TO authenticated;


-- Vista de lectura reducida: no devuelve los documentos antes/después ni datos de contacto.
CREATE INDEX IF NOT EXISTS auditoria_actor_fecha ON public.auditoria(actor,creado_el DESC);
DROP TRIGGER IF EXISTS motivo_eliminacion_auditoria ON public.miembros_eliminados;
CREATE TRIGGER motivo_eliminacion_auditoria AFTER INSERT ON public.miembros_eliminados FOR EACH ROW EXECUTE FUNCTION jupa_v3.audit_change();
CREATE OR REPLACE FUNCTION public.v37_actividad_admin(p_desde date,p_hasta date,p_clase bigint DEFAULT NULL,p_actor uuid DEFAULT NULL,p_tabla text DEFAULT NULL,p_antes bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE respuesta jsonb;
BEGIN
 PERFORM jupa_v3.require_admin();
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND debe_cambiar_clave) THEN RAISE EXCEPTION 'Cambia tu contraseña antes de continuar.' USING errcode='42501'; END IF;
 IF p_desde IS NULL OR p_hasta IS NULL OR p_desde>p_hasta THEN RAISE EXCEPTION 'Revisa el período de consulta.'; END IF;
 WITH base AS (
 SELECT a.*,coalesce(a.despues,a.antes,'{}'::jsonb) d,
  coalesce(nullif(a.despues->>'iglesia_id','')::bigint,nullif(a.antes->>'iglesia_id','')::bigint) clase_registro
 FROM public.auditoria a
 WHERE a.creado_el>=p_desde::timestamp AT TIME ZONE 'America/Santiago'
 AND a.creado_el<(p_hasta+1)::timestamp AT TIME ZONE 'America/Santiago'
 AND (p_actor IS NULL OR a.actor=p_actor) AND (p_tabla IS NULL OR a.tabla=p_tabla)
 AND (p_antes IS NULL OR a.id<p_antes)
 ), enriched AS (
 SELECT b.*,coalesce(u.usuario,'Sistema') usuario,u.nombre actor_nombre,
  coalesce(b.clase_registro,v.iglesia_id,CASE WHEN b.tabla='eventos' THEN nullif(b.d->'anfitrionas_ids'->>0,'')::bigint WHEN b.tabla='miembros_eliminados' THEN (SELECT id FROM public.iglesias WHERE nombre=b.d->>'iglesia' LIMIT 1) END) clase_id,
  coalesce(v.tipo_actividad,b.d->>'tipo_actividad') tipo_actividad,coalesce(v.date::text,b.d->>'date',ev.date::text) fecha_actividad,
  coalesce(nullif(concat_ws(' ',m.nombres,m.apellidos),''),nullif(concat_ws(' ',b.d->>'nombres',b.d->>'apellidos'),''),b.d->>'nombre') persona,
  coalesce(ev.titulo,b.d->>'titulo') evento
 FROM base b
 LEFT JOIN public.usuarios u ON u.id=b.actor
 LEFT JOIN public.actividades v ON v.id=nullif(b.d->>'actividad_id','')::bigint
 LEFT JOIN public.miembros m ON m.id=nullif(b.d->>'miembro_id','')::bigint
 LEFT JOIN public.eventos ev ON ev.id=nullif(b.d->>'evento_id','')::bigint
 ), filtered AS (
 SELECT e.*,i.nombre clase_nombre FROM enriched e LEFT JOIN public.iglesias i ON i.id=e.clase_id
 WHERE p_clase IS NULL OR e.clase_id=p_clase OR nullif(e.antes->>'iglesia_id','')::bigint=p_clase
 OR (e.tabla='eventos' AND e.d->'anfitrionas_ids' @> jsonb_build_array(p_clase))
 ORDER BY e.id DESC LIMIT 50
 ) SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',f.id::text,'at',f.creado_el,'username',f.usuario,'actor_name',f.actor_nombre,'table',f.tabla,'class_name',f.clase_nombre,
 'action',CASE
 WHEN f.tabla='asistencias' THEN CASE WHEN f.accion='DELETE' OR f.d->>'presente'='false' THEN 'Retiró asistencia' ELSE 'Marcó presente' END
 WHEN f.tabla='registros_encuentro_clases' THEN 'Guardó asistencia de su clase'
 WHEN f.accion='DELETE' THEN 'Eliminó registro'
 WHEN f.tabla='miembros_eliminados' THEN 'Registró motivo de eliminación'
 WHEN f.tabla='miembros' AND f.accion='UPDATE' AND f.antes->>'activo' IS DISTINCT FROM f.despues->>'activo' THEN CASE WHEN f.d->>'activo'='true' THEN 'Reincorporó participante' ELSE 'Dejó participante inactivo' END
 WHEN f.tabla IN('actividades','eventos') AND f.accion='UPDATE' AND f.antes->>'eliminado_el' IS DISTINCT FROM f.despues->>'eliminado_el' THEN CASE WHEN f.d->>'eliminado_el' IS NULL THEN 'Restauró actividad' ELSE 'Eliminó actividad del calendario' END
 WHEN f.accion='INSERT' THEN 'Creó registro' ELSE 'Actualizó registro' END,
 'subject',concat_ws(' · ',f.persona,f.evento,
 CASE f.tipo_actividad WHEN 'visita' THEN 'Visita' WHEN 'escuela_dominical' THEN 'Escuela dominical' WHEN 'servicio_domingo' THEN 'Servicio del domingo' WHEN 'reunion_mensual' THEN 'Reunión mensual' WHEN 'ensayo_coro' THEN 'Ensayo Coro JUPA' WHEN 'evento_coro' THEN 'Coro en evento JUPA' WHEN 'reunion_encargados' THEN 'Reunión de encargados JUPA' WHEN 'devocional' THEN 'Devocional JUPA' WHEN 'servicio_jupa' THEN 'Servicio JUPA de la tarde' END,f.fecha_actividad),
 'detail',CASE WHEN f.tabla='registros_encuentro_clases' THEN concat(CASE f.d->>'momento' WHEN 'punto' THEN 'Punto de predicación' ELSE 'Servicio de la tarde' END,' · ',jsonb_array_length(coalesce(f.d->'participantes_ids','[]'::jsonb)),' presentes')
 WHEN f.tabla='responsabilidades' THEN f.d->>'rol'
 WHEN f.tabla='miembros_eliminados' THEN f.d->>'motivo'
 ELSE NULL END
 ) ORDER BY f.id DESC),'[]'::jsonb) INTO respuesta FROM filtered f;
 RETURN respuesta;
END $$;
REVOKE ALL ON FUNCTION public.v37_actividad_admin(date,date,bigint,uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v37_actividad_admin(date,date,bigint,uuid,text,bigint) TO authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
