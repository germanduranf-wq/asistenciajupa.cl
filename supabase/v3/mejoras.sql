-- Extensiones de la versión 3. Las cuentas Auth y sus contraseñas no se modifican.
ALTER TABLE public.usuarios ADD COLUMN numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
-- El número es la clave primaria administrativa; Auth conserva su UUID único interno.
DO $$ DECLARE r record; BEGIN
 CREATE TABLE jupa_v3.fk_usuario_v3 AS SELECT conrelid::regclass AS tabla,conname AS nombre,pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE contype='f' AND confrelid='public.usuarios'::regclass;
 ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_auth_unico UNIQUE(id);
 ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_pkey CASCADE;
 ALTER TABLE public.usuarios ADD PRIMARY KEY(numero);
 FOR r IN SELECT * FROM jupa_v3.fk_usuario_v3 LOOP EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tabla,r.nombre,r.definicion); END LOOP;
 DROP TABLE jupa_v3.fk_usuario_v3;
END $$;
CREATE TABLE public.categorias(id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,nombre text NOT NULL UNIQUE);
INSERT INTO public.categorias(nombre) VALUES('Joven'),('Señorita'),('Encargado de jóvenes'),('Encargada de señoritas'),('Ayudante de jóvenes'),('Ayudante de señoritas'),('Colaborador'),('Colaboradora');
ALTER TABLE public.miembros ADD CONSTRAINT miembro_categoria_catalogo FOREIGN KEY(categoria) REFERENCES public.categorias(nombre);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_lectura ON public.categorias FOR SELECT TO authenticated USING(jupa_v3.is_member());
GRANT SELECT ON public.categorias TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;

ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check CHECK(rol IN('admin','encargado','jefatura','secretaria','clase','coro'));
ALTER TABLE public.actividades ADD COLUMN eliminado_el timestamptz, ADD COLUMN evento_id bigint UNIQUE REFERENCES public.eventos(id);
ALTER TABLE public.actividades DROP CONSTRAINT v3_activity_unique;
CREATE UNIQUE INDEX actividades_vigentes_unicas ON public.actividades(date,iglesia_id,"group",tipo_actividad) WHERE eliminado_el IS NULL AND evento_id IS NULL;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_ensure_sundays(date,date)'::regprocedure) INTO def;
 def:=replace(def,'on conflict(date,iglesia_id,"group",tipo_actividad) do nothing','on conflict(date,iglesia_id,"group",tipo_actividad) where eliminado_el is null and evento_id is null do nothing');
 -- No regenerar un domingo que el administrador eliminó intencionalmente.
 def:=replace(def,'insert into public.actividades(date,iglesia_id', 'if exists(select 1 from public.actividades where date=d and iglesia_id=c.id and tipo_actividad=m) then continue; end if; insert into public.actividades(date,iglesia_id');
 EXECUTE def;
END $$;
INSERT INTO public.modulos(codigo,nombre,habilitado) VALUES('ensayo_coro','Ensayos Coro JUPA',true),('evento_coro','Coro en evento JUPA',true);

CREATE OR REPLACE FUNCTION jupa_v3.can_activity(m text,c bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND EXISTS(SELECT 1 FROM public.modulos am WHERE am.codigo=m AND am.habilitado)
 AND (p.rol='admin' OR (
 (p.rol<>'clase' OR (m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND (p.rol<>'secretaria' OR m IN('reunion_encargados','devocional','ensayo_coro','evento_coro'))
 AND (p.rol<>'encargado' OR m='visita') AND (p.rol<>'coro' OR m IN('ensayo_coro','evento_coro'))
 AND EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND ap.puede_ver AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c)
 AND CASE accion WHEN 'manage' THEN ap.puede_registrar WHEN 'export' THEN ap.puede_exportar WHEN 'view' THEN true ELSE false END))));
$$;
CREATE FUNCTION jupa_v3.es_coralista(p bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.miembros m JOIN public.cuerpos c ON c.id=ANY(m.cuerpos_ids) WHERE m.id=p AND c.nombre='Coro JUPA');
$$;
CREATE FUNCTION jupa_v3.puede_leer_miembro(p bigint,c bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jupa_v3.can_person(c) OR (EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='coro') AND jupa_v3.es_coralista(p));
$$;
DROP POLICY v3_people_read ON public.miembros;
CREATE POLICY miembros_lectura ON public.miembros FOR SELECT TO authenticated USING(jupa_v3.puede_leer_miembro(id,iglesia_id));
DROP POLICY v3_visits_read ON public.actividades;
CREATE POLICY actividades_lectura ON public.actividades FOR SELECT TO authenticated USING((eliminado_el IS NULL OR jupa_v3.is_admin()) AND (jupa_v3.can_activity(tipo_actividad,iglesia_id) OR jupa_v3.puede_programar(tipo_actividad,iglesia_id)));
CREATE OR REPLACE FUNCTION jupa_v3.can_visit(vid bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.actividades v WHERE v.id=vid AND v.eliminado_el IS NULL AND jupa_v3.can_activity(v.tipo_actividad,v.iglesia_id,accion));
$$;
-- Envolver el guardado individual conserva todos los controles de categoría, plazo y versión.
-- La implementación numérica original se ajusta para lectura acotada del coro.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_set_attendance(bigint,bigint,boolean,integer)'::regprocedure) INTO def;
 def:=replace(def,'not jupa_v3.can_person(person.iglesia_id)','not jupa_v3.puede_leer_miembro(person.id,person.iglesia_id)');
 def:=replace(def,'select * into old_record from public.asistencias',
 'if v.tipo_actividad in (''ensayo_coro'',''evento_coro'') and not jupa_v3.es_coralista(p_person) then raise exception ''La actividad corresponde solo a integrantes de Coro JUPA.''; end if; select * into old_record from public.asistencias');
 EXECUTE def;
END $$;
CREATE FUNCTION public.v3_guardar_asistencias(p_visit bigint,p_changes jsonb) RETURNS SETOF public.asistencias LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>500 THEN RAISE EXCEPTION 'Lote inválido.'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_changes))<>(SELECT count(DISTINCT x->>'person_id') FROM jsonb_array_elements(p_changes) x) THEN RAISE EXCEPTION 'Participante repetido en el lote.'; END IF;
 PERFORM 1 FROM public.actividades WHERE id=p_visit FOR UPDATE;
 PERFORM jupa_v3.check_edit(p_visit);
 FOR c IN SELECT value FROM jsonb_array_elements(p_changes) ORDER BY (value->>'person_id')::bigint LOOP
  RETURN NEXT public.v3_set_attendance(p_visit,(c->>'person_id')::bigint,(c->>'present')::boolean,(c->>'version')::integer);
 END LOOP;
END $$;
-- Administrador puede corregir destino/fecha/grupo. Se conserva clase histórica de cada asistente.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_save_visit(jsonb,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'m:=coalesce(p_values->>''activity_type'',''visita'');', 'm:=coalesce(p_values->>''activity_type'',''visita''); IF m=''evento_coro'' THEN RAISE EXCEPTION ''Programa o modifica este evento desde Avisos JUPA.''; END IF;');
 def:=replace(def,'IF m<>old_v.tipo_actividad OR c<>old_v.iglesia_id OR new_date<>old_v.date OR p_values->>''group''<>old_v."group" THEN',
 'IF m<>old_v.tipo_actividad OR (NOT jupa_v3.is_admin() AND (c<>old_v.iglesia_id OR new_date<>old_v.date OR p_values->>''group''<>old_v."group")) THEN');
 def:=replace(def,'SET notas=coalesce(p_values->>''notes'',''''),iglesia_sede_id=', 'SET date=new_date,iglesia_id=c,notas=coalesce(p_values->>''notes'',''''),iglesia_sede_id=');
 def:=replace(def,'UPDATE public.actividades SET hora=', 'IF vid IS NOT NULL AND (old_v.eliminado_el IS NOT NULL OR old_v.evento_id IS NOT NULL) THEN RAISE EXCEPTION ''Restaura la actividad eliminada o modifica el evento desde Avisos.''; END IF; UPDATE public.actividades SET hora=');
 EXECUTE def;
END $$;
CREATE FUNCTION public.v3_archivar_actividad(p_id bigint,p_version integer,p_archivar boolean) RETURNS public.actividades LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.actividades;
BEGIN
 PERFORM jupa_v3.require_admin();
 SELECT * INTO v FROM public.actividades WHERE id=p_id FOR UPDATE;
 IF v.id IS NULL OR v.version<>p_version THEN RAISE EXCEPTION 'La actividad cambió. Actualiza antes de continuar.'; END IF;
 IF v.evento_id IS NOT NULL THEN RAISE EXCEPTION 'Esta asistencia depende del evento de Avisos. Modifica su publicación allí.'; END IF;
 UPDATE public.actividades SET eliminado_el=CASE WHEN p_archivar THEN now() ELSE NULL END,version=version+1 WHERE id=p_id RETURNING * INTO v;
 RETURN v;
END $$;
-- Vínculo estable 1:1: mover o despublicar un evento no destruye sus marcas.
CREATE FUNCTION jupa_v3.sincronizar_coro() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.tipo='jupa' THEN
  INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
  VALUES(new.date,new.anfitrionas_ids[1],'Todos','evento_coro',new.titulo,new.hora_manana,new.id,CASE WHEN new.publicado THEN NULL ELSE now() END)
  ON CONFLICT(evento_id) DO UPDATE SET date=excluded.date,iglesia_id=excluded.iglesia_id,notas=excluded.notas,hora=excluded.hora,eliminado_el=excluded.eliminado_el,version=public.actividades.version+1;
 ELSE UPDATE public.actividades SET eliminado_el=now(),version=version+1 WHERE evento_id=new.id; END IF;
 RETURN new;
END $$;
CREATE TRIGGER evento_coro AFTER INSERT OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION jupa_v3.sincronizar_coro();
UPDATE public.eventos SET publicado=publicado WHERE tipo='jupa';
INSERT INTO public.permisos(usuario_auth_id,modulo,puede_ver,puede_registrar,puede_exportar)
 SELECT u.id,m.codigo,true,u.rol IN('coro','secretaria','jefatura'),true FROM public.usuarios u CROSS JOIN public.modulos m
 WHERE u.rol IN('coro','secretaria','jefatura') AND m.codigo IN('ensayo_coro','evento_coro');

CREATE TABLE public.demostraciones(perfil text PRIMARY KEY CHECK(perfil IN('admin','jefatura','secretaria','clase','coro')),habilitada boolean NOT NULL DEFAULT false);
INSERT INTO public.demostraciones(perfil) VALUES('admin'),('jefatura'),('secretaria'),('clase'),('coro');
ALTER TABLE public.demostraciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_admin ON public.demostraciones TO authenticated USING(jupa_v3.is_admin()) WITH CHECK(jupa_v3.is_admin());
GRANT SELECT,UPDATE ON public.demostraciones TO authenticated;
CREATE FUNCTION public.v3_demostraciones() RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT perfil FROM public.demostraciones WHERE habilitada ORDER BY perfil $$;

CREATE FUNCTION public.v3_guardar_permisos(p_usuario uuid,p_permisos jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.usuarios; x jsonb; m text; c bigint;
BEGIN
 PERFORM jupa_v3.require_admin();
 SELECT * INTO u FROM public.usuarios WHERE id=p_usuario FOR UPDATE;
 IF u.id IS NULL THEN RAISE EXCEPTION 'Cuenta no disponible.'; END IF;
 IF jsonb_typeof(p_permisos)<>'array' THEN RAISE EXCEPTION 'Permisos inválidos.'; END IF;
 DELETE FROM public.permisos WHERE usuario_auth_id=u.id;
 FOR x IN SELECT value FROM jsonb_array_elements(p_permisos) LOOP
  m:=x->>'module'; c:=CASE WHEN u.rol='clase' THEN u.iglesia_id ELSE nullif(x->>'class_id','')::bigint END;
  IF u.rol='clase' AND m NOT IN('escuela_dominical','servicio_domingo','reunion_mensual') OR u.rol='coro' AND m NOT IN('ensayo_coro','evento_coro') OR u.rol='secretaria' AND m NOT IN('visita','reunion_encargados','devocional','ensayo_coro','evento_coro') OR u.rol='encargado' AND m<>'visita' THEN RAISE EXCEPTION 'Actividad no permitida para este perfil.'; END IF;
  IF u.rol='secretaria' AND m='visita' AND (coalesce((x->>'can_view')::boolean,false) OR coalesce((x->>'can_manage')::boolean,false) OR coalesce((x->>'can_export')::boolean,false)) THEN RAISE EXCEPTION 'Secretaría solamente programa visitas.'; END IF;
  INSERT INTO public.permisos(usuario_auth_id,modulo,iglesia_id,puede_ver,puede_registrar,puede_exportar,puede_programar)
   VALUES(u.id,m,c,coalesce((x->>'can_view')::boolean,false),coalesce((x->>'can_manage')::boolean,false),coalesce((x->>'can_export')::boolean,false),coalesce((x->>'can_schedule')::boolean,false));
 END LOOP;
END $$;
GRANT UPDATE(habilitado) ON public.modulos TO authenticated;
CREATE POLICY modulos_admin ON public.modulos FOR UPDATE TO authenticated USING(jupa_v3.is_admin()) WITH CHECK(jupa_v3.is_admin());

-- Conserva fotografías de rutas UUID antiguas y permite las nuevas rutas numéricas.
DROP POLICY IF EXISTS portraits_read ON storage.objects;
DROP POLICY IF EXISTS portraits_insert ON storage.objects;
DROP POLICY IF EXISTS portraits_delete ON storage.objects;
DROP POLICY v3_portraits_read ON storage.objects;
DROP POLICY v3_portraits_delete ON storage.objects;
CREATE POLICY v3_portraits_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='portraits' AND EXISTS(SELECT 1 FROM public.miembros p WHERE (p.ruta_foto=name OR p.id::text=split_part(name,'/',1)) AND jupa_v3.puede_leer_miembro(p.id,p.iglesia_id)));
CREATE POLICY v3_portraits_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='portraits' AND EXISTS(SELECT 1 FROM public.miembros p WHERE (p.id::text=split_part(name,'/',1) OR p.referencia_anterior::text=split_part(name,'/',1)) AND jupa_v3.can_person(p.iglesia_id,'photo')) AND NOT EXISTS(SELECT 1 FROM public.miembros p WHERE p.ruta_foto=name));
-- Una actividad eliminada deja de publicarse; nunca se borran sus marcas.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_public_bulletin(date)'::regprocedure) INTO def;
 def:=replace(def,'WHERE v.date>=first_day','WHERE v.eliminado_el IS NULL AND v.date>=first_day');
 EXECUTE def;
END $$;

-- Vistas legibles; no conceden más acceso que las tablas subyacentes (security_invoker).
CREATE VIEW public.miembros_detalle WITH(security_invoker=true) AS SELECT m.id,m.nombres,m.apellidos,i.nombre AS iglesia,m.categoria,m.fecha_nacimiento,m.rut,m.activo,m.ruta_foto,ARRAY(SELECT c.nombre FROM public.cuerpos c WHERE c.id=ANY(m.cuerpos_ids)) AS cuerpos FROM public.miembros m JOIN public.iglesias i ON i.id=m.iglesia_id;
CREATE VIEW public.responsables_por_actividad WITH(security_invoker=true) AS
 SELECT a.id,a.date AS fecha,i.nombre AS iglesia,a."group" AS grupo,
 max(CASE WHEN r.rol='Predicación' THEN concat(m.nombres,' ',m.apellidos) END) AS predicacion,
 max(CASE WHEN r.rol='Coordinación' THEN concat(m.nombres,' ',m.apellidos) END) AS coordinacion,
 max(CASE WHEN r.rol='Dirección del coro' THEN concat(m.nombres,' ',m.apellidos) END) AS direccion_coro
 FROM public.actividades a JOIN public.iglesias i ON i.id=a.iglesia_id LEFT JOIN public.responsabilidades r ON r.actividad_id=a.id LEFT JOIN public.miembros m ON m.id=r.miembro_id GROUP BY a.id,i.nombre;
CREATE VIEW public.usuarios_detalle_v3 WITH(security_invoker=true) AS SELECT u.numero,u.nombre,u.usuario,u.rol,i.nombre AS iglesia,u.activo,u.debe_cambiar_clave FROM public.usuarios u LEFT JOIN public.iglesias i ON i.id=u.iglesia_id;
CREATE VIEW public.permisos_detalle_v3 WITH(security_invoker=true) AS SELECT p.id,u.usuario,u.nombre,u.rol,m.nombre AS actividad,i.nombre AS iglesia,p.puede_ver,p.puede_registrar,p.puede_exportar,p.puede_programar FROM public.permisos p JOIN public.usuarios u ON u.id=p.usuario_auth_id JOIN public.modulos m ON m.codigo=p.modulo LEFT JOIN public.iglesias i ON i.id=p.iglesia_id;
GRANT SELECT ON public.miembros_detalle,public.responsables_por_actividad,public.usuarios_detalle_v3,public.permisos_detalle_v3 TO authenticated;
-- Adaptador exclusivo de la función de administración de cuentas.
CREATE VIEW public.v3_profiles WITH(security_invoker=true) AS SELECT id,nombre AS name,identificador_auth AS email,rol AS role,activo AS active,creado_el AS created_at,usuario AS username,iglesia_id AS class_id,debe_cambiar_clave AS must_change_password FROM public.usuarios;
CREATE VIEW public.v3_classes WITH(security_invoker=true) AS SELECT id,nombre AS name,activo AS active FROM public.iglesias;
CREATE VIEW public.v3_audit_log WITH(security_invoker=true) AS SELECT id,actor,accion AS action,tabla AS table_name,registro_id AS record_id,antes AS before_data,despues AS after_data,creado_el AS created_at FROM public.auditoria;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.v3_profiles TO authenticated;

-- Retirar la API anterior para impedir escrituras accidentales en la copia de respaldo.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('set_attendance','save_visit','set_responsibility','set_photo','merge_people','reactivate_person','ensure_sundays','set_activity_status','public_bulletin') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
 END LOOP;
END $$;
CREATE SCHEMA respaldo_v2;
REVOKE ALL ON SCHEMA respaldo_v2 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.profiles SET SCHEMA respaldo_v2;
ALTER TABLE public.classes SET SCHEMA respaldo_v2;
ALTER TABLE public.people SET SCHEMA respaldo_v2;
ALTER TABLE public.visits SET SCHEMA respaldo_v2;
ALTER TABLE public.attendance SET SCHEMA respaldo_v2;
ALTER TABLE public.responsibilities SET SCHEMA respaldo_v2;
ALTER TABLE public.audit_log SET SCHEMA respaldo_v2;
ALTER TABLE public.activity_modules SET SCHEMA respaldo_v2;
ALTER TABLE public.account_permissions SET SCHEMA respaldo_v2;
ALTER TABLE public.bodies SET SCHEMA respaldo_v2;
ALTER TABLE public.bulletin_events SET SCHEMA respaldo_v2;
ALTER TABLE public.bulletin_highlights SET SCHEMA respaldo_v2;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldo_v2 FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.v3_guardar_asistencias(bigint,jsonb),public.v3_archivar_actividad(bigint,integer,boolean),public.v3_guardar_permisos(uuid,jsonb),public.v3_demostraciones(),jupa_v3.es_coralista(bigint),jupa_v3.puede_leer_miembro(bigint,bigint),jupa_v3.sincronizar_coro() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v3_guardar_asistencias(bigint,jsonb),public.v3_archivar_actividad(bigint,integer,boolean),public.v3_guardar_permisos(uuid,jsonb),jupa_v3.es_coralista(bigint),jupa_v3.puede_leer_miembro(bigint,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v3_demostraciones() TO anon,authenticated;
