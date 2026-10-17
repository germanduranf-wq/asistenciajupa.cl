-- Solo lectura. Ejecutar antes de la migración y conservar los resultados.
DO $$ DECLARE t text; BEGIN
 IF to_regclass('public.miembros') IS NOT NULL OR to_regnamespace('respaldo_v2') IS NOT NULL THEN
  RAISE EXCEPTION 'V3 ya existe o hay una actualización anterior. No ejecutar de nuevo la migración.';
 END IF;
 FOREACH t IN ARRAY ARRAY['profiles','classes','people','visits','attendance','responsibilities','activity_modules','account_permissions','bodies','bulletin_events','bulletin_highlights','audit_log'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Falta la tabla %. No continuar.',t; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='body_ids') THEN RAISE EXCEPTION 'Falta migración de cuerpos y avisos.'; END IF;
END $$;
SELECT 'participantes' AS registro,count(*) AS cantidad FROM public.people
UNION ALL SELECT 'participantes activos',count(*) FROM public.people WHERE active
UNION ALL SELECT 'participantes con foto',count(*) FROM public.people WHERE photo_path IS NOT NULL
UNION ALL SELECT 'perfiles',count(*) FROM public.profiles
UNION ALL SELECT 'cuentas Auth',count(*) FROM auth.users
UNION ALL SELECT 'iglesias',count(*) FROM public.classes
UNION ALL SELECT 'actividades',count(*) FROM public.visits
UNION ALL SELECT 'asistencias',count(*) FROM public.attendance;
SELECT username AS usuario,role AS perfil,active AS activo FROM public.profiles ORDER BY username;
-- Debe devolver cero filas. No revela contraseñas.
SELECT p.username AS cuenta_sin_auth FROM public.profiles p LEFT JOIN auth.users a ON a.id=p.id WHERE a.id IS NULL;

