-- Ejecutar completo en Supabase > SQL Editor, con el rol postgres.
-- Requiere la migración 202610120001_activities_permissions.sql.
-- Repetible. No cambia contraseñas ni elimina asistencias.
-- Habilita los tres módulos globalmente: también podrán usarlos otros usuarios
-- que YA tengan permisos explícitos sobre esos módulos, y el administrador.
BEGIN;

DO $$
DECLARE
  cuenta public.profiles;
  clase uuid;
  coincidencias integer;
  actividad text;
BEGIN
  SELECT * INTO cuenta FROM public.profiles
  WHERE username = 'sancarlos.jupa' FOR UPDATE;
  IF cuenta.id IS NULL THEN
    RAISE EXCEPTION 'Primero crea el usuario sancarlos.jupa en la aplicación.';
  END IF;
  IF NOT cuenta.active THEN
    RAISE EXCEPTION 'sancarlos.jupa está desactivado. Revisa su estado antes de asignar permisos.';
  END IF;
  IF cuenta.role NOT IN ('clase', 'encargado') THEN
    RAISE EXCEPTION 'El usuario tiene perfil %. No se cambiará automáticamente a clase.', cuenta.role;
  END IF;
  SELECT count(*) INTO coincidencias FROM public.classes
  WHERE upper(regexp_replace(trim(name), '\s+', ' ', 'g')) = 'SAN CARLOS' AND active;
  IF coincidencias <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente una clase activa llamada San Carlos. Encontradas: %.', coincidencias;
  END IF;
  SELECT id INTO clase FROM public.classes
  WHERE upper(regexp_replace(trim(name), '\s+', ' ', 'g')) = 'SAN CARLOS' AND active;
  IF cuenta.class_id IS NOT NULL AND cuenta.class_id <> clase THEN
    RAISE EXCEPTION 'Esta cuenta está asignada a otra clase. Revisa profiles antes de continuar.';
  END IF;

  UPDATE public.profiles SET role = 'clase', class_id = clase WHERE id = cuenta.id;
  -- Desactiva permisos anteriores ajenos al alcance solicitado, sin borrarlos.
  UPDATE public.account_permissions
  SET can_view = false, can_manage = false, can_export = false
  WHERE profile_id = cuenta.id
    AND (class_id IS DISTINCT FROM clase OR module NOT IN
      ('escuela_dominical', 'servicio_domingo', 'reunion_mensual'));

  FOREACH actividad IN ARRAY ARRAY['escuela_dominical', 'servicio_domingo', 'reunion_mensual'] LOOP
    UPDATE public.activity_modules SET enabled = true WHERE code = actividad;
    IF NOT FOUND THEN RAISE EXCEPTION 'Falta el módulo %. Revisa la migración 2.0.', actividad; END IF;
    UPDATE public.account_permissions
    SET can_view = true, can_manage = true, can_export = true
    WHERE profile_id = cuenta.id AND module = actividad AND class_id = clase;
    IF NOT FOUND THEN
      INSERT INTO public.account_permissions(profile_id, module, class_id, can_view, can_manage, can_export)
      VALUES(cuenta.id, actividad, clase, true, true, true);
    END IF;
  END LOOP;
END $$;

-- Vistas de consulta: muestran nombres actuales junto con los IDs originales.
-- Se consultan en Supabase. No conceden acceso adicional desde la página web.
CREATE OR REPLACE VIEW public.usuarios_detalle WITH (security_invoker = true) AS
SELECT p.id, p.username AS usuario, p.name AS nombre, p.role AS perfil_codigo,
  CASE p.role WHEN 'admin' THEN 'Administrador' WHEN 'jefatura' THEN 'Jefatura del Templo Matriz'
    WHEN 'secretaria' THEN 'Secretaría JUPA' WHEN 'clase' THEN 'Cuenta de clase'
    WHEN 'encargado' THEN 'Encargado de visitas' ELSE p.role END AS perfil,
  p.class_id, coalesce(c.name, 'Sin clase asignada') AS clase,
  p.active AS activo, p.must_change_password AS debe_cambiar_contrasena
FROM public.profiles p LEFT JOIN public.classes c ON c.id = p.class_id;

CREATE OR REPLACE VIEW public.permisos_detalle WITH (security_invoker = true) AS
SELECT ap.id, ap.profile_id, u.usuario, u.nombre, u.perfil_codigo, u.perfil,
  u.class_id AS clase_cuenta_id, u.clase AS clase_cuenta,
  ap.module AS actividad_codigo, m.name AS actividad, m.enabled AS modulo_habilitado,
  ap.class_id, coalesce(c.name, 'Todas las clases permitidas por el perfil') AS alcance,
  ap.can_view AS puede_ver, ap.can_manage AS puede_gestionar, ap.can_export AS puede_exportar,
  u.activo AS cuenta_activa, u.debe_cambiar_contrasena
FROM public.account_permissions ap
JOIN public.usuarios_detalle u ON u.id = ap.profile_id
JOIN public.activity_modules m ON m.code = ap.module
LEFT JOIN public.classes c ON c.id = ap.class_id;

CREATE OR REPLACE VIEW public.personas_detalle WITH (security_invoker = true) AS
SELECT p.id, p.first_name AS nombres, p.last_name AS apellidos,
  p.class_id, c.name AS clase, p.category AS categoria, p.active AS activo
FROM public.people p JOIN public.classes c ON c.id = p.class_id;

CREATE OR REPLACE VIEW public.actividades_detalle WITH (security_invoker = true) AS
SELECT v.id, v.date AS fecha, v.activity_type AS actividad_codigo, m.name AS actividad,
  v.class_id, c.name AS clase_organizadora_o_destino, v.venue_class_id,
  coalesce(l.name,c.name) AS lugar, v."group" AS grupo, v.status AS estado,
  v.suspension_reason AS motivo_suspension
FROM public.visits v JOIN public.classes c ON c.id = v.class_id
JOIN public.activity_modules m ON m.code = v.activity_type
LEFT JOIN public.classes l ON l.id = v.venue_class_id;

CREATE OR REPLACE VIEW public.asistencias_detalle WITH (security_invoker = true) AS
SELECT a.visit_id, v.date AS fecha, m.name AS actividad, a.person_id,
  concat_ws(' ',p.first_name,p.last_name) AS participante,
  a.class_id, c.name AS clase_contabilizada, a.category AS categoria_historica,
  a.present AS presente, a.updated_by, u.username AS usuario_que_registro,
  u.name AS nombre_que_registro, a.updated_at AS actualizado
FROM public.attendance a JOIN public.visits v ON v.id = a.visit_id
JOIN public.activity_modules m ON m.code = v.activity_type
JOIN public.people p ON p.id = a.person_id
JOIN public.classes c ON c.id = a.class_id
LEFT JOIN public.profiles u ON u.id = a.updated_by;

REVOKE ALL ON public.usuarios_detalle, public.permisos_detalle, public.personas_detalle,
  public.actividades_detalle, public.asistencias_detalle FROM PUBLIC, anon, authenticated;
COMMENT ON VIEW public.permisos_detalle IS 'Consulta administrativa. Editar permisos en account_permissions. Los permisos efectivos dependen también del perfil, del módulo y del estado de la cuenta.';
COMMIT;

SELECT usuario, nombre, perfil, actividad, alcance,
  modulo_habilitado, puede_ver, puede_gestionar, puede_exportar
FROM public.permisos_detalle
WHERE usuario = 'sancarlos.jupa' AND puede_ver
ORDER BY actividad;
