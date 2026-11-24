-- V3.8. Aplicar completa después de V3.7. No cambia contraseñas ni activa modalidades automáticamente.
BEGIN;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuario_solo_asistencia_clase;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuario_solo_asistencia_perfil;
ALTER TABLE public.usuarios ADD CONSTRAINT usuario_solo_asistencia_perfil
 CHECK(NOT solo_asistencia OR rol IN('coro','secretaria') OR rol='clase' AND iglesia_id IS NOT NULL);

CREATE OR REPLACE FUNCTION jupa_v3.can_activity(m text,c bigint,accion text DEFAULT 'view') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND accion IN('view','manage','export')
 AND EXISTS(SELECT 1 FROM public.modulos am WHERE am.codigo=m AND am.habilitado)
 AND CASE WHEN p.solo_asistencia THEN accion IN('view','manage') AND (
  p.rol='clase' AND m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id
  OR p.rol='coro' AND m IN('ensayo_coro','evento_coro')
  OR p.rol='secretaria' AND m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
 ELSE p.rol='admin' OR (p.rol='secretaria' AND m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa')) OR (
  (p.rol<>'clase' OR m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id)
  AND (p.rol<>'secretaria' OR m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
  AND (p.rol<>'encargado' OR m='visita') AND (p.rol<>'coro' OR m IN('ensayo_coro','evento_coro'))
  AND EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND ap.puede_ver AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c)
   AND CASE accion WHEN 'manage' THEN ap.puede_registrar WHEN 'export' THEN ap.puede_exportar ELSE true END)) END);
$$;
CREATE OR REPLACE FUNCTION jupa_v3.can_person(c bigint,accion text DEFAULT 'view') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND CASE WHEN p.solo_asistencia THEN accion='create'
  AND (p.rol IN('coro','secretaria') OR p.rol='clase' AND c=p.iglesia_id)
  AND EXISTS(SELECT 1 FROM public.iglesias i WHERE i.id=c AND i.activo AND i.tipo<>'Local')
 ELSE p.rol IN('admin','jefatura','secretaria') OR p.rol='encargado' AND accion IN('view','create','photo')
  OR p.rol='clase' AND p.iglesia_id=c AND accion IN('view','create','edit','photo','reactivate','retire','delete') END);
$$;
CREATE OR REPLACE FUNCTION jupa_v3.can_publish() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND NOT solo_asistencia AND rol IN('admin','jefatura','secretaria'));
$$;
CREATE OR REPLACE FUNCTION jupa_v3.puede_leer_miembro(p bigint,c bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT jupa_v3.solo_asistencia() AND (jupa_v3.puede_editar_miembro(p,'view') OR (EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='coro') AND jupa_v3.es_coralista(p)));
$$;
DROP POLICY IF EXISTS miembros_lectura ON public.miembros;
CREATE POLICY miembros_lectura ON public.miembros FOR SELECT TO authenticated USING(
 NOT jupa_v3.solo_asistencia() AND (
 jupa_v3.can_person(iglesia_id,'view') OR (otra_iglesia_id IS NOT NULL AND jupa_v3.can_person(otra_iglesia_id,'view'))
 OR (EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='coro') AND jupa_v3.es_coralista(id))));
-- Los datos de programación de encuentros publicados ya son públicos; no incluye fichas ni resúmenes.
DROP POLICY IF EXISTS eventos_para_asistencia ON public.eventos;
CREATE POLICY eventos_para_asistencia ON public.eventos FOR SELECT TO authenticated USING(
 publicado AND eliminado_el IS NULL AND jupa_v3.solo_asistencia()
 AND EXISTS(SELECT 1 FROM public.actividades a WHERE a.evento_id=eventos.id AND jupa_v3.can_visit(a.id)));

CREATE OR REPLACE FUNCTION public.v38_modalidad_cuenta(p_usuario uuid,p_limitada boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.usuarios;
BEGIN
 PERFORM jupa_v3.require_admin();
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND debe_cambiar_clave) THEN RAISE EXCEPTION 'Cambia tu contraseña antes de continuar.' USING errcode='42501'; END IF;
 SELECT * INTO u FROM public.usuarios WHERE id=p_usuario FOR UPDATE;
 IF u.id IS NULL OR p_limitada IS NULL OR u.rol NOT IN('clase','coro','secretaria') THEN RAISE EXCEPTION 'Solo las cuentas de Clase, Coro JUPA y Secretaría JUPA admiten esta modalidad.'; END IF;
 IF u.rol='clase' AND NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=u.iglesia_id AND tipo<>'Local') THEN RAISE EXCEPTION 'Asigna una clase válida a la cuenta.'; END IF;
 UPDATE public.usuarios SET solo_asistencia=p_limitada WHERE id=p_usuario AND solo_asistencia IS DISTINCT FROM p_limitada;
 -- La auditoría de usuarios registra actor, fecha y cambio. No se modifica Auth ni contraseña.
END $$;
REVOKE ALL ON FUNCTION public.v38_modalidad_cuenta(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v38_modalidad_cuenta(uuid,boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.v3_crear_participante_asistencia(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u public.usuarios; m public.miembros; c bigint;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND solo_asistencia AND rol IN('clase','coro','secretaria');
 IF u.id IS NULL THEN RAISE EXCEPTION 'Cuenta no autorizada.' USING errcode='42501'; END IF;
 c:=nullif(p_datos->>'iglesia_id','')::bigint;
 IF p_datos->>'id' IS NOT NULL OR (u.rol='clase' AND c IS DISTINCT FROM u.iglesia_id) OR nullif(p_datos->>'otra_iglesia_id','') IS NOT NULL THEN
  RAISE EXCEPTION 'Solo puedes agregar participantes nuevos de tu propia clase.' USING errcode='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=c AND activo AND tipo<>'Local') THEN RAISE EXCEPTION 'Clase no disponible.'; END IF;
 INSERT INTO public.miembros(nombres,apellidos,iglesia_id,categoria,rut,fecha_nacimiento,cuerpos_ids,observaciones,telefono,correo_contacto,nombre_contacto_emergencia,telefono_emergencia,direccion_completa)
 VALUES(trim(p_datos->>'nombres'),trim(p_datos->>'apellidos'),c,p_datos->>'categoria',nullif(p_datos->>'rut',''),nullif(p_datos->>'fecha_nacimiento','')::date,
 ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'cuerpos_ids','[]'::jsonb))::bigint),coalesce(p_datos->>'observaciones',''),
 nullif(p_datos->>'telefono',''),nullif(p_datos->>'correo_contacto',''),nullif(p_datos->>'nombre_contacto_emergencia',''),nullif(p_datos->>'telefono_emergencia',''),nullif(p_datos->>'direccion_completa','')) RETURNING * INTO m;
 RETURN jsonb_build_object('id',m.id,'nombres',m.nombres,'apellidos',m.apellidos,'iglesia_id',m.iglesia_id,'categoria',m.categoria,'cuerpos_ids',m.cuerpos_ids,'activo',m.activo);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya existe una ficha con ese identificador. Busca por nombre o pide ayuda a la cuenta general.';
END $function$
;

CREATE OR REPLACE FUNCTION public.v36_clase_panel(p_clase bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u public.usuarios; c bigint; salida jsonb;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR (u.solo_asistencia AND u.rol<>'clase') OR u.rol NOT IN('clase','admin','jefatura','secretaria') THEN RAISE EXCEPTION 'Sin acceso.' USING errcode='42501'; END IF;
 c:=coalesce(p_clase,u.iglesia_id);
 IF c IS NULL OR (u.rol='clase' AND c IS DISTINCT FROM u.iglesia_id) THEN RAISE EXCEPTION 'Selecciona tu propia clase.' USING errcode='42501'; END IF;
 SELECT jsonb_build_object(
 'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id::text,'first_name',m.nombres,'last_name',m.apellidos,'category',m.categoria,'active',m.activo,'current',(m.iglesia_id=c OR m.otra_iglesia_id=c))) FROM public.miembros m WHERE m.fusionado_en IS NULL AND (m.iglesia_id=c OR m.otra_iglesia_id=c OR EXISTS(SELECT 1 FROM public.registros_encuentro_clases r WHERE r.iglesia_id=c AND m.id=ANY(r.participantes_ids)) OR (NOT u.solo_asistencia AND EXISTS(SELECT 1 FROM public.asistencias a WHERE a.miembro_id=m.id AND a.iglesia_id=c AND a.presente)))),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'date',e.date,'title',e.titulo)) FROM public.eventos e WHERE e.tipo='jupa' AND e.publicado),'[]'::jsonb),
 'registers',coalesce((SELECT jsonb_agg(jsonb_build_object('event_id',r.evento_id::text,'moment',r.momento,'ids',ARRAY(SELECT x::text FROM unnest(r.participantes_ids)x),'version',r.version)) FROM public.registros_encuentro_clases r WHERE r.iglesia_id=c),'[]'::jsonb),
 'history',CASE WHEN u.solo_asistencia THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'date',a.date,'type',a.tipo_actividad,'group',a."group",'place',i.nombre,'ids',ARRAY(SELECT s.miembro_id::text FROM public.asistencias s WHERE s.actividad_id=a.id AND s.presente AND s.iglesia_id=c))) FROM public.actividades a JOIN public.iglesias i ON i.id=a.iglesia_id WHERE a.tipo_actividad IN('visita','ensayo_coro','evento_coro') AND a.eliminado_el IS NULL AND a.estado<>'suspended' AND a.date<=(now() AT TIME ZONE 'America/Santiago')::date AND (a.estado='held' OR EXISTS(SELECT 1 FROM public.asistencias s WHERE s.actividad_id=a.id AND s.presente))),'[]'::jsonb) END
 ) INTO salida;
 RETURN salida;
END $function$
;

CREATE OR REPLACE FUNCTION public.v36_guardar_clase(p_evento bigint, p_clase bigint, p_momento text, p_ids bigint[], p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u public.usuarios; e public.eventos; r public.registros_encuentro_clases; hoy date:=(now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave;
 IF u.id IS NULL OR (u.solo_asistencia AND u.rol<>'clase') OR u.rol NOT IN('clase','admin','jefatura','secretaria') OR (u.rol='clase' AND p_clase IS DISTINCT FROM u.iglesia_id) THEN RAISE EXCEPTION 'Sin permiso para esta clase.' USING errcode='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.v3_set_responsibility(p_id bigint, p_outcome text, p_actual bigint, p_note text, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.responsabilidades;
begin
 if jupa_v3.solo_asistencia() then raise exception 'Esta cuenta solo registra asistencia y agrega participantes nuevos.' using errcode='42501'; end if;
 select * into r from public.responsabilidades where id=p_id for update;
 if r.id is null then raise exception 'La función no existe.'; end if;
 perform jupa_v3.check_edit(r.actividad_id);
 if r.version<>p_version then raise exception 'Otro encargado modificó este resultado. Actualiza e inténtalo de nuevo.' using errcode='40001'; end if;
 if p_actual is not null and not exists(select 1 from public.miembros where id=p_actual and fusionado_en is null) then raise exception 'El reemplazo no está disponible.'; end if;
 update public.responsabilidades set resultado=p_outcome,realizado_por=p_actual,observacion=coalesce(p_note,''),version=version+1,actualizado_por=auth.uid(),actualizado_el=now() where id=p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.v37_actividad_admin(p_desde date, p_hasta date, p_clase bigint DEFAULT NULL::bigint, p_actor uuid DEFAULT NULL::uuid, p_tabla text DEFAULT NULL::text, p_antes bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 WHEN f.tabla='usuarios' AND f.accion='UPDATE' AND f.antes->>'solo_asistencia' IS DISTINCT FROM f.despues->>'solo_asistencia' THEN CASE WHEN f.d->>'solo_asistencia'='true' THEN 'Activó Solo asistencia' ELSE 'Restauró modalidad general' END
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
END $function$
;

NOTIFY pgrst,'reload schema';
COMMIT;
