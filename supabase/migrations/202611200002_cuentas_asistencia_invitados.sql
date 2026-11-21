-- V3.5. Ejecutar después de 202611200001_contacto_miembros.sql.
-- Repetible. No reemplaza cuentas, contraseñas, participantes ni asistencias.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS solo_asistencia boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.usuarios'::regclass AND conname='usuario_solo_asistencia_clase') THEN
 ALTER TABLE public.usuarios ADD CONSTRAINT usuario_solo_asistencia_clase CHECK(NOT solo_asistencia OR (rol='clase' AND iglesia_id IS NOT NULL));
 END IF;
END $$;
CREATE OR REPLACE VIEW public.v3_profiles WITH(security_invoker=true) AS
 SELECT id,nombre AS name,identificador_auth AS email,rol AS role,activo AS active,creado_el AS created_at,usuario AS username,iglesia_id AS class_id,debe_cambiar_clave AS must_change_password,solo_asistencia AS attendance_only FROM public.usuarios;

CREATE OR REPLACE FUNCTION jupa_v3.solo_asistencia() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND solo_asistencia);
$$;
CREATE OR REPLACE FUNCTION jupa_v3.can_person(c bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND (NOT p.solo_asistencia OR (accion='create' AND c=p.iglesia_id)) AND (
 p.rol IN('admin','jefatura','secretaria') OR (p.rol='encargado' AND accion IN('view','create','photo'))
 OR (p.rol='clase' AND p.iglesia_id=c AND accion IN('view','create','edit','photo','reactivate'))));
$$;
CREATE OR REPLACE FUNCTION jupa_v3.can_activity(m text,c bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND (NOT p.solo_asistencia OR (accion IN('view','manage') AND m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND EXISTS(SELECT 1 FROM public.modulos am WHERE am.codigo=m AND am.habilitado)
 AND (p.rol='admin' OR (
 (p.rol<>'clase' OR (m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND (p.rol<>'secretaria' OR m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
 AND (p.rol<>'encargado' OR m='visita') AND (p.rol<>'coro' OR m IN('ensayo_coro','evento_coro'))
 AND EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND ap.puede_ver AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c)
 AND CASE accion WHEN 'manage' THEN ap.puede_registrar WHEN 'export' THEN ap.puede_exportar WHEN 'view' THEN true ELSE false END))));
$$;
CREATE OR REPLACE FUNCTION jupa_v3.puede_programar(m text,c bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT jupa_v3.solo_asistencia() AND CASE WHEN m='visita' THEN EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND p.rol IN('admin','jefatura','secretaria') AND EXISTS(SELECT 1 FROM public.modulos WHERE codigo=m AND habilitado)
 AND (p.rol='admin' OR EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m
 AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c) AND (ap.puede_programar OR (p.rol='jefatura' AND ap.puede_ver AND ap.puede_registrar)))))
 ELSE jupa_v3.can_activity(m,c,'manage') END;
$$;

-- Protege también las llamadas directas a las funciones, no solo el menú.
DO $$ DECLARE signature text; definition text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.v3_save_visit(jsonb,jsonb)','public.v3_set_activity_status(bigint,text,text,bigint,integer)','public.v3_ensure_sundays(date,date)','public.v3_historial_miembro(bigint,date,date)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF position('V35_LIMITED_GUARD' IN definition)=0 THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n -- V35_LIMITED_GUARD\n IF jupa_v3.solo_asistencia() THEN RAISE EXCEPTION ''Esta cuenta solo registra asistencia y agrega participantes nuevos.'' USING errcode=''42501''; END IF;','i');
   EXECUTE definition;
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION jupa_v3.directorio_habilitado() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios u CROSS JOIN public.modulos m WHERE u.id=auth.uid() AND u.activo AND NOT u.debe_cambiar_clave
 AND EXISTS(SELECT 1 FROM public.iglesias i WHERE jupa_v3.can_activity(m.codigo,i.id,'view')));
$$;
CREATE OR REPLACE FUNCTION public.v3_directorio_asistencia()
RETURNS TABLE(id bigint,nombres text,apellidos text,iglesia_id bigint,otra_iglesia_id bigint,categoria text,cuerpos_ids bigint[],activo boolean,ruta_foto text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.id,m.nombres,m.apellidos,m.iglesia_id,m.otra_iglesia_id,m.categoria,m.cuerpos_ids,m.activo,m.ruta_foto
 FROM public.miembros m WHERE (SELECT jupa_v3.directorio_habilitado()) AND m.fusionado_en IS NULL
 AND (m.activo OR EXISTS(SELECT 1 FROM public.asistencias a WHERE a.miembro_id=m.id AND a.presente AND jupa_v3.can_visit(a.actividad_id)));
$$;
CREATE OR REPLACE FUNCTION jupa_v3.foto_directorio(p_ruta text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jupa_v3.directorio_habilitado() AND EXISTS(SELECT 1 FROM public.miembros WHERE ruta_foto=p_ruta AND activo AND fusionado_en IS NULL);
$$;
DROP POLICY IF EXISTS fotos_directorio_asistencia ON storage.objects;
CREATE POLICY fotos_directorio_asistencia ON storage.objects FOR SELECT TO authenticated USING(bucket_id='portraits' AND jupa_v3.foto_directorio(name));

-- La cuenta limitada nunca recupera una ficha completa, tampoco con INSERT RETURNING.
CREATE OR REPLACE FUNCTION public.v3_crear_participante_asistencia(p_datos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.usuarios; m public.miembros;
BEGIN
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND solo_asistencia AND rol='clase';
 IF u.id IS NULL THEN RAISE EXCEPTION 'Cuenta no autorizada.' USING errcode='42501'; END IF;
 IF p_datos->>'id' IS NOT NULL OR nullif(p_datos->>'iglesia_id','')::bigint IS DISTINCT FROM u.iglesia_id OR nullif(p_datos->>'otra_iglesia_id','') IS NOT NULL THEN
  RAISE EXCEPTION 'Solo puedes agregar participantes nuevos de tu propia clase.' USING errcode='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=u.iglesia_id AND activo AND tipo<>'Local') THEN RAISE EXCEPTION 'Clase no disponible.'; END IF;
 INSERT INTO public.miembros(nombres,apellidos,iglesia_id,categoria,rut,fecha_nacimiento,cuerpos_ids,observaciones,telefono,correo_contacto,nombre_contacto_emergencia,telefono_emergencia,direccion_completa)
 VALUES(trim(p_datos->>'nombres'),trim(p_datos->>'apellidos'),u.iglesia_id,p_datos->>'categoria',nullif(p_datos->>'rut',''),nullif(p_datos->>'fecha_nacimiento','')::date,
 ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'cuerpos_ids','[]'::jsonb))::bigint),coalesce(p_datos->>'observaciones',''),
 nullif(p_datos->>'telefono',''),nullif(p_datos->>'correo_contacto',''),nullif(p_datos->>'nombre_contacto_emergencia',''),nullif(p_datos->>'telefono_emergencia',''),nullif(p_datos->>'direccion_completa','')) RETURNING * INTO m;
 RETURN jsonb_build_object('id',m.id,'nombres',m.nombres,'apellidos',m.apellidos,'iglesia_id',m.iglesia_id,'categoria',m.categoria,'cuerpos_ids',m.cuerpos_ids,'activo',m.activo);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya existe una ficha con ese identificador. Busca por nombre o pide ayuda a la cuenta general.';
END $$;
-- Impide saltarse el formulario usando INSERT directo con una segunda clase.
CREATE OR REPLACE FUNCTION jupa_v3.validar_alta_limitada() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jupa_v3.solo_asistencia() AND (NOT jupa_v3.can_person(new.iglesia_id,'create') OR new.otra_iglesia_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Solo puedes agregar participantes nuevos de tu propia clase.' USING errcode='42501';
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS alta_limitada ON public.miembros;
CREATE TRIGGER alta_limitada BEFORE INSERT ON public.miembros FOR EACH ROW EXECUTE FUNCTION jupa_v3.validar_alta_limitada();

-- Filtros de coro/cargo/clase son ayudas de búsqueda, no impiden registrar invitados.
-- Conserva el control de sesión, plazo, actividad, versiones y dobles marcas locales.
CREATE OR REPLACE FUNCTION public.v3_set_attendance(p_visit bigint,p_person bigint,p_present boolean,p_version integer)
RETURNS public.asistencias LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_record public.asistencias; person public.miembros; answer public.asistencias; v public.actividades; otra text; local_service boolean;
BEGIN
 SELECT * INTO v FROM public.actividades WHERE id=p_visit FOR UPDATE;
 PERFORM jupa_v3.check_edit(p_visit);
 IF v.estado='suspended' THEN RAISE EXCEPTION 'La actividad está suspendida.'; END IF;
 SELECT * INTO person FROM public.miembros WHERE id=p_person FOR SHARE;
 SELECT * INTO old_record FROM public.asistencias WHERE actividad_id=p_visit AND miembro_id=p_person FOR UPDATE;
 local_service:=v.tipo_actividad IN('escuela_dominical','servicio_domingo','reunion_mensual');
 IF person.id IS NULL OR person.fusionado_en IS NOT NULL THEN RAISE EXCEPTION 'Participante no disponible.'; END IF;
 IF p_present AND NOT person.activo AND NOT coalesce(old_record.presente,false) THEN RAISE EXCEPTION 'Reactiva a la persona antes de marcar una nueva asistencia.'; END IF;
 IF coalesce(old_record.version,0)<>p_version THEN RAISE EXCEPTION 'Otro encargado modificó esta asistencia. Actualiza e inténtalo de nuevo.' USING errcode='40001'; END IF;
 IF p_present IS NULL THEN RAISE EXCEPTION 'Indica el estado de asistencia.'; END IF;
 IF p_present AND local_service THEN
  SELECT i.nombre INTO otra FROM public.asistencias a JOIN public.iglesias i ON i.id=a.iglesia_id WHERE a.miembro_id=p_person AND a.actividad_id<>p_visit AND a.fecha_servicio=v.date AND a.tipo_servicio=v.tipo_actividad AND a.presente AND a.servicio_vigente LIMIT 1;
  IF otra IS NOT NULL THEN RAISE EXCEPTION 'Esta persona ya está presente en este servicio en %. No se puede registrar dos veces.',otra; END IF;
 END IF;
 INSERT INTO public.asistencias(actividad_id,miembro_id,presente,iglesia_id,categoria,version,actualizado_por)
 VALUES(p_visit,p_person,p_present,coalesce(old_record.iglesia_id,CASE WHEN local_service THEN v.iglesia_id ELSE person.iglesia_id END),coalesce(old_record.categoria,person.categoria),p_version+1,auth.uid())
 ON CONFLICT(actividad_id,miembro_id) DO UPDATE SET presente=excluded.presente,version=excluded.version,actualizado_por=excluded.actualizado_por,actualizado_el=now() RETURNING * INTO answer;
 IF p_present AND v.estado='pending' THEN UPDATE public.actividades SET estado='held',version=version+1 WHERE id=p_visit; END IF;
 RETURN answer;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Esta persona acaba de ser marcada en otra clase para el mismo servicio. Actualiza el listado.' USING errcode='23505';
END $$;
CREATE OR REPLACE FUNCTION public.v3_presencias_otras_clases(p_actividad bigint) RETURNS TABLE(miembro_id bigint,clase_presente text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.actividades;
BEGIN
 SELECT * INTO v FROM public.actividades WHERE id=p_actividad;
 IF NOT jupa_v3.can_visit(p_actividad) THEN RAISE EXCEPTION 'Sin acceso a esta actividad.' USING errcode='42501'; END IF;
 IF v.tipo_actividad NOT IN('escuela_dominical','servicio_domingo','reunion_mensual') THEN RETURN; END IF;
 RETURN QUERY SELECT a.miembro_id,i.nombre FROM public.asistencias a JOIN public.iglesias i ON i.id=a.iglesia_id
 WHERE a.actividad_id<>v.id AND a.presente AND a.servicio_vigente AND a.fecha_servicio=v.date AND a.tipo_servicio=v.tipo_actividad;
END $$;
CREATE OR REPLACE FUNCTION public.v3_miembros_historicos() RETURNS TABLE(id bigint,nombres text,apellidos text,iglesia_id bigint,categoria text,activo boolean,historico boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT DISTINCT ON(m.id) m.id,m.nombres,m.apellidos,a.iglesia_id,a.categoria,false,true FROM public.miembros m JOIN public.asistencias a ON a.miembro_id=m.id
 WHERE NOT jupa_v3.solo_asistencia() AND a.presente AND jupa_v3.can_visit(a.actividad_id) AND NOT jupa_v3.puede_leer_miembro(m.id,m.iglesia_id) ORDER BY m.id,a.fecha_servicio DESC;
$$;

-- Solo el backend crea Auth con su API oficial; esta operación guarda perfil y permisos juntos.
CREATE OR REPLACE FUNCTION public.v3_completar_cuenta_clase(p_id uuid,p_clase bigint,p_limitada boolean,p_usuario text,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.iglesias;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND rol='admin' AND activo AND NOT debe_cambiar_clave) THEN RAISE EXCEPTION 'Administrador no autorizado.' USING errcode='42501'; END IF;
 SELECT * INTO c FROM public.iglesias WHERE id=p_clase AND activo AND tipo<>'Local' FOR SHARE;
 IF c.id IS NULL OR p_limitada IS NULL OR p_usuario !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN RAISE EXCEPTION 'Clase o usuario no válido.'; END IF;
 PERFORM pg_advisory_xact_lock(p_clase);
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE rol='clase' AND iglesia_id=p_clase AND solo_asistencia=p_limitada) THEN RAISE EXCEPTION 'La clase ya tiene una cuenta de este tipo. Se conserva sin cambios.'; END IF;
 INSERT INTO public.usuarios(id,nombre,usuario,identificador_auth,rol,iglesia_id,debe_cambiar_clave,solo_asistencia)
 VALUES(p_id,left(c.nombre||CASE WHEN p_limitada THEN ' · Asistencia' ELSE ' · Cuenta general' END,100),p_usuario,p_usuario||'@usuarios.jupa.invalid','clase',p_clase,true,p_limitada);
 INSERT INTO public.permisos(usuario_auth_id,modulo,iglesia_id,puede_ver,puede_registrar,puede_exportar,puede_programar)
 SELECT p_id,m,p_clase,true,true,NOT p_limitada,NOT p_limitada FROM unnest(ARRAY['escuela_dominical','servicio_domingo','reunion_mensual']) m;
 INSERT INTO public.auditoria(actor,accion,tabla,registro_id) VALUES(p_actor,'CREATE_CLASS_ACCOUNT','usuarios',p_id::text);
END $$;
REVOKE ALL ON FUNCTION public.v3_completar_cuenta_clase(uuid,bigint,boolean,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.v3_completar_cuenta_clase(uuid,bigint,boolean,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION jupa_v3.solo_asistencia(),jupa_v3.directorio_habilitado(),jupa_v3.foto_directorio(text),jupa_v3.validar_alta_limitada(),public.v3_directorio_asistencia(),public.v3_crear_participante_asistencia(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jupa_v3.solo_asistencia(),jupa_v3.directorio_habilitado(),jupa_v3.foto_directorio(text),public.v3_directorio_asistencia(),public.v3_crear_participante_asistencia(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
