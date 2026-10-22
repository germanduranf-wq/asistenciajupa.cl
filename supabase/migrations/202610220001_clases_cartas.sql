-- Actualización incremental sobre V3. No recrea cuentas ni cambia contraseñas.
-- Ejecutar completa antes de publicar la interfaz 3.1. Repetible.
BEGIN;
ALTER TABLE public.miembros ADD COLUMN IF NOT EXISTS otra_iglesia_id bigint REFERENCES public.iglesias(id),
 ADD COLUMN IF NOT EXISTS observaciones text NOT NULL DEFAULT '';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='miembro_otra_iglesia_distinta') THEN
  ALTER TABLE public.miembros ADD CONSTRAINT miembro_otra_iglesia_distinta CHECK(otra_iglesia_id IS NULL OR otra_iglesia_id<>iglesia_id),
   ADD CONSTRAINT miembro_observaciones_limite CHECK(length(observaciones)<=2000);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS miembros_otra_iglesia ON public.miembros(otra_iglesia_id) WHERE otra_iglesia_id IS NOT NULL;
GRANT INSERT(otra_iglesia_id,observaciones),UPDATE(otra_iglesia_id,observaciones) ON public.miembros TO authenticated;

CREATE OR REPLACE FUNCTION jupa_v3.puede_editar_miembro(p bigint,accion text DEFAULT 'edit') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.miembros m WHERE m.id=p AND
 (jupa_v3.can_person(m.iglesia_id,accion) OR (m.otra_iglesia_id IS NOT NULL AND jupa_v3.can_person(m.otra_iglesia_id,accion))));
$$;
CREATE OR REPLACE FUNCTION jupa_v3.puede_leer_miembro(p bigint,c bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jupa_v3.puede_editar_miembro(p,'view') OR (EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND NOT debe_cambiar_clave AND rol='coro') AND jupa_v3.es_coralista(p));
$$;
DROP POLICY IF EXISTS v3_people_update ON public.miembros;
CREATE POLICY v3_people_update ON public.miembros FOR UPDATE TO authenticated
 USING(jupa_v3.puede_editar_miembro(id))
 WITH CHECK(jupa_v3.can_person(iglesia_id,'edit') OR (otra_iglesia_id IS NOT NULL AND jupa_v3.can_person(otra_iglesia_id,'edit')));
CREATE OR REPLACE FUNCTION jupa_v3.guard_person_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.fecha_nacimiento IS NOT NULL AND (new.fecha_nacimiento > (now() AT TIME ZONE 'America/Santiago')::date - interval '10 years' OR new.fecha_nacimiento < date '1900-01-01') THEN
  RAISE EXCEPTION 'La fecha de nacimiento debe corresponder a una persona de al menos 10 años y no ser anterior a 1900.';
 END IF;
 IF new.activo AND new.fusionado_en IS NOT NULL THEN RAISE EXCEPTION 'Este registro fue fusionado. Utiliza la ficha que se conservó.'; END IF;
 IF new.otra_iglesia_id IS NOT NULL AND (TG_OP='INSERT' OR new.otra_iglesia_id IS DISTINCT FROM old.otra_iglesia_id) AND NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=new.otra_iglesia_id AND activo) THEN RAISE EXCEPTION 'Selecciona otra clase activa.'; END IF;
 IF TG_OP='UPDATE' AND auth.uid() IS NOT NULL THEN
  IF new.activo IS DISTINCT FROM old.activo AND NOT jupa_v3.puede_editar_miembro(old.id,CASE WHEN new.activo THEN 'reactivate' ELSE 'retire' END) THEN RAISE EXCEPTION 'No tienes permiso para cambiar el estado del participante.' USING errcode='42501'; END IF;
  IF new.iglesia_id IS DISTINCT FROM old.iglesia_id AND NOT jupa_v3.can_person(old.iglesia_id,'retire') THEN RAISE EXCEPTION 'Solo la administración central puede trasladar participantes.' USING errcode='42501'; END IF;
 END IF;
 RETURN new;
END $$;
-- Las fotos y la reincorporación siguen el mismo alcance de ambas clases.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_set_photo(bigint,text)'::regprocedure) INTO def;
 def:=replace(def,'jupa_v3.can_person(p.iglesia_id,''photo'')','jupa_v3.puede_editar_miembro(p.id,''photo'')'); EXECUTE def;
 SELECT pg_get_functiondef('public.v3_reactivate_person(bigint)'::regprocedure) INTO def;
 def:=replace(def,'jupa_v3.can_person(person.iglesia_id,''reactivate'')','jupa_v3.puede_editar_miembro(person.id,''reactivate'')'); EXECUTE def;
END $$;
DROP POLICY IF EXISTS v3_portraits_insert ON storage.objects;
CREATE POLICY v3_portraits_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='portraits' AND name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|jpg|png)$' AND EXISTS(SELECT 1 FROM public.miembros p WHERE p.id::text=split_part(name,'/',1) AND p.fusionado_en IS NULL AND jupa_v3.puede_editar_miembro(p.id,'photo')));
DROP POLICY IF EXISTS v3_portraits_delete ON storage.objects;
CREATE POLICY v3_portraits_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='portraits' AND EXISTS(SELECT 1 FROM public.miembros p WHERE (p.id::text=split_part(name,'/',1) OR p.referencia_anterior::text=split_part(name,'/',1)) AND jupa_v3.puede_editar_miembro(p.id,'photo')) AND NOT EXISTS(SELECT 1 FROM public.miembros p WHERE p.ruta_foto=name));

-- Unicidad real, incluso con dos encargados guardando simultáneamente.
ALTER TABLE public.asistencias ADD COLUMN IF NOT EXISTS fecha_servicio date,
 ADD COLUMN IF NOT EXISTS tipo_servicio text, ADD COLUMN IF NOT EXISTS servicio_vigente boolean;
UPDATE public.asistencias a SET fecha_servicio=v.date,tipo_servicio=v.tipo_actividad,servicio_vigente=(v.eliminado_el IS NULL AND v.estado<>'suspended') FROM public.actividades v WHERE v.id=a.actividad_id AND (a.fecha_servicio,a.tipo_servicio,a.servicio_vigente) IS DISTINCT FROM (v.date,v.tipo_actividad,(v.eliminado_el IS NULL AND v.estado<>'suspended'));
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.asistencias WHERE presente AND servicio_vigente AND tipo_servicio IN ('escuela_dominical','servicio_domingo','reunion_mensual') GROUP BY miembro_id,fecha_servicio,tipo_servicio HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Hay asistencias locales duplicadas para una persona, fecha y tipo de servicio. Revísalas antes de aplicar 3.1; no se eliminó ningún registro.';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_local_unica ON public.asistencias(miembro_id,fecha_servicio,tipo_servicio)
 WHERE presente AND servicio_vigente AND tipo_servicio IN ('escuela_dominical','servicio_domingo','reunion_mensual');
CREATE OR REPLACE FUNCTION jupa_v3.datos_servicio_asistencia() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT v.date,v.tipo_actividad,v.eliminado_el IS NULL AND v.estado<>'suspended' INTO new.fecha_servicio,new.tipo_servicio,new.servicio_vigente FROM public.actividades v WHERE v.id=new.actividad_id;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS datos_servicio_asistencia ON public.asistencias;
CREATE TRIGGER datos_servicio_asistencia BEFORE INSERT OR UPDATE ON public.asistencias FOR EACH ROW EXECUTE FUNCTION jupa_v3.datos_servicio_asistencia();
CREATE OR REPLACE FUNCTION jupa_v3.sincronizar_datos_servicio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (new.date,new.tipo_actividad,new.estado,new.eliminado_el) IS DISTINCT FROM (old.date,old.tipo_actividad,old.estado,old.eliminado_el) THEN
  UPDATE public.asistencias SET fecha_servicio=new.date,tipo_servicio=new.tipo_actividad,servicio_vigente=(new.eliminado_el IS NULL AND new.estado<>'suspended') WHERE actividad_id=new.id;
 END IF; RETURN new;
END $$;
DROP TRIGGER IF EXISTS sincronizar_datos_servicio ON public.actividades;
CREATE TRIGGER sincronizar_datos_servicio AFTER UPDATE ON public.actividades FOR EACH ROW EXECUTE FUNCTION jupa_v3.sincronizar_datos_servicio();
CREATE OR REPLACE FUNCTION public.v3_set_attendance(p_visit bigint,p_person bigint,p_present boolean,p_version integer)
RETURNS public.asistencias LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_record public.asistencias; person public.miembros; answer public.asistencias; v public.actividades; otra text; local_service boolean;
BEGIN
 SELECT * INTO v FROM public.actividades WHERE id=p_visit FOR UPDATE;
 PERFORM jupa_v3.check_edit(p_visit);
 IF v.estado='suspended' THEN RAISE EXCEPTION 'La actividad está suspendida.'; END IF;
 SELECT * INTO person FROM public.miembros WHERE id=p_person FOR SHARE;
 SELECT * INTO old_record FROM public.asistencias WHERE actividad_id=p_visit AND miembro_id=p_person FOR UPDATE;
 local_service:=v.tipo_actividad IN ('escuela_dominical','servicio_domingo','reunion_mensual');
 IF person.id IS NULL OR person.fusionado_en IS NOT NULL OR (NOT jupa_v3.puede_leer_miembro(person.id,person.iglesia_id) AND old_record.miembro_id IS NULL) THEN RAISE EXCEPTION 'Participante no disponible.'; END IF;
 IF local_service AND v.iglesia_id<>person.iglesia_id AND v.iglesia_id IS DISTINCT FROM person.otra_iglesia_id AND old_record.miembro_id IS NULL THEN RAISE EXCEPTION 'Esta actividad registra solamente participantes de su clase.' USING errcode='42501'; END IF;
 IF v.tipo_actividad='reunion_encargados' AND person.categoria NOT IN ('Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas') AND old_record.miembro_id IS NULL THEN RAISE EXCEPTION 'La reunión corresponde a encargados y ayudantes.'; END IF;
 IF v.tipo_actividad IN ('ensayo_coro','evento_coro') AND NOT jupa_v3.es_coralista(p_person) AND old_record.miembro_id IS NULL THEN RAISE EXCEPTION 'La actividad corresponde solo a integrantes de Coro JUPA.'; END IF;
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
 IF v.tipo_actividad NOT IN ('escuela_dominical','servicio_domingo','reunion_mensual') THEN RETURN; END IF;
 RETURN QUERY SELECT a.miembro_id,i.nombre FROM public.asistencias a JOIN public.miembros m ON m.id=a.miembro_id JOIN public.iglesias i ON i.id=a.iglesia_id
 WHERE a.actividad_id<>v.id AND a.presente AND a.servicio_vigente AND a.fecha_servicio=v.date AND a.tipo_servicio=v.tipo_actividad
 AND (m.iglesia_id=v.iglesia_id OR m.otra_iglesia_id=v.iglesia_id) AND jupa_v3.puede_leer_miembro(m.id,m.iglesia_id);
END $$;
-- Nombres mínimos para que una clase conserve sus informes de antiguos participantes.
CREATE OR REPLACE FUNCTION public.v3_miembros_historicos() RETURNS TABLE(id bigint,nombres text,apellidos text,iglesia_id bigint,categoria text,activo boolean,historico boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT DISTINCT ON(m.id) m.id,m.nombres,m.apellidos,a.iglesia_id,a.categoria,false,true FROM public.miembros m JOIN public.asistencias a ON a.miembro_id=m.id
 WHERE a.presente AND jupa_v3.can_visit(a.actividad_id) AND NOT jupa_v3.puede_leer_miembro(m.id,m.iglesia_id) ORDER BY m.id,a.fecha_servicio DESC;
$$;
CREATE OR REPLACE FUNCTION public.v3_historial_miembro(p_miembro bigint,p_desde date,p_hasta date)
RETURNS TABLE(actividad_id bigint,date date,tipo_actividad text,"group" text,destino text,clase_contabilizada text,categoria text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE completo boolean;
BEGIN
 completo:=jupa_v3.puede_editar_miembro(p_miembro,'edit');
 IF NOT completo AND NOT EXISTS(SELECT 1 FROM public.asistencias h WHERE h.miembro_id=p_miembro AND jupa_v3.can_visit(h.actividad_id)) THEN RAISE EXCEPTION 'Sin acceso a este historial.' USING errcode='42501'; END IF;
 RETURN QUERY SELECT v.id,v.date,v.tipo_actividad,v."group",d.nombre,i.nombre,a.categoria FROM public.asistencias a JOIN public.actividades v ON v.id=a.actividad_id JOIN public.iglesias d ON d.id=v.iglesia_id JOIN public.iglesias i ON i.id=a.iglesia_id
 WHERE a.miembro_id=p_miembro AND a.presente AND a.servicio_vigente AND v.date BETWEEN p_desde AND p_hasta AND (completo OR jupa_v3.can_visit(v.id)) ORDER BY v.date DESC,v.id;
END $$;

-- Documentos privados de visitas: no habilitan a Secretaría a ver asistencias.
CREATE OR REPLACE FUNCTION public.v3_resumen_responsables(p_mes date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT jupa_v3.can_publish() THEN RAISE EXCEPTION 'Sin acceso a los documentos de visitas.' USING errcode='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'date',v.date,'group',v."group",'class_name',c.nombre,'status',v.estado,'responsables',
  coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'role',r.rol,'person_id',r.miembro_id,'name',m.nombres||' '||m.apellidos) ORDER BY r.rol) FROM public.responsabilidades r JOIN public.miembros m ON m.id=r.miembro_id WHERE r.actividad_id=v.id),'[]'::jsonb)) ORDER BY v.date,v."group",c.nombre)
 FROM public.actividades v JOIN public.iglesias c ON c.id=v.iglesia_id WHERE v.tipo_actividad='visita' AND v.eliminado_el IS NULL AND v.date>=date_trunc('month',p_mes)::date AND v.date<(date_trunc('month',p_mes)+interval '1 month')::date),'[]'::jsonb);
END $$;
CREATE TABLE IF NOT EXISTS public.cartas_visitas(
 numero bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actividad_id bigint NOT NULL REFERENCES public.actividades(id), miembro_id bigint NOT NULL REFERENCES public.miembros(id),
 rol text NOT NULL CHECK(rol IN ('Predicación','Coordinación','Dirección del coro')), fecha_emision date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
 emitido_por uuid REFERENCES public.usuarios(id), contenido jsonb NOT NULL,
 UNIQUE(actividad_id,miembro_id,rol)
);
ALTER TABLE public.cartas_visitas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cartas_visitas FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.v3_emitir_cartas(p_visita bigint DEFAULT NULL,p_mes date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v record; r record; carta public.cartas_visitas; resultado jsonb:='[]'; fecha date:=(now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
 IF NOT jupa_v3.can_publish() THEN RAISE EXCEPTION 'Sin acceso a cartas.' USING errcode='42501'; END IF;
 IF p_visita IS NULL AND (p_mes IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND rol IN ('admin','secretaria'))) THEN RAISE EXCEPTION 'La descarga mensual corresponde a Administración y Secretaría.' USING errcode='42501'; END IF;
 -- Orden y bloqueo estables: descargar otra vez conserva folio y fecha de emisión.
 PERFORM pg_advisory_xact_lock(72210,2);
 FOR v IN SELECT a.*,c.nombre AS clase FROM public.actividades a JOIN public.iglesias c ON c.id=a.iglesia_id
  WHERE a.tipo_actividad='visita' AND a.eliminado_el IS NULL AND a.estado<>'suspended'
  AND ((p_visita IS NOT NULL AND a.id=p_visita) OR (p_visita IS NULL AND a.date>=date_trunc('month',p_mes)::date AND a.date<(date_trunc('month',p_mes)+interval '1 month')::date)) ORDER BY a.date,a.id LOOP
  FOR r IN SELECT a.*,m.nombres||' '||m.apellidos AS nombre FROM public.responsabilidades a JOIN public.miembros m ON m.id=a.miembro_id WHERE a.actividad_id=v.id ORDER BY a.rol LOOP
   SELECT * INTO carta FROM public.cartas_visitas WHERE actividad_id=v.id AND miembro_id=r.miembro_id AND rol=r.rol;
   IF carta.numero IS NULL THEN
    INSERT INTO public.cartas_visitas(actividad_id,miembro_id,rol,emitido_por,contenido) VALUES(v.id,r.miembro_id,r.rol,auth.uid(),jsonb_build_object('name',r.nombre,'class_name',v.clase,'date',v.date,'group',v."group")) RETURNING * INTO carta;
   ELSE
    UPDATE public.cartas_visitas SET contenido=jsonb_build_object('name',r.nombre,'class_name',v.clase,'date',v.date,'group',v."group") WHERE numero=carta.numero RETURNING * INTO carta;
   END IF;
   resultado:=resultado||jsonb_build_array(carta.contenido||jsonb_build_object('folio','AJ '||CASE WHEN carta.numero<10 THEN '0' ELSE '' END||carta.numero,'issued',carta.fecha_emision,'role',r.rol,'visit_id',v.id));
  END LOOP;
 END LOOP;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION jupa_v3.puede_editar_miembro(bigint,text),jupa_v3.datos_servicio_asistencia(),jupa_v3.sincronizar_datos_servicio(),public.v3_presencias_otras_clases(bigint),public.v3_miembros_historicos(),public.v3_historial_miembro(bigint,date,date),public.v3_resumen_responsables(date),public.v3_emitir_cartas(bigint,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jupa_v3.puede_editar_miembro(bigint,text),public.v3_presencias_otras_clases(bigint),public.v3_miembros_historicos(),public.v3_historial_miembro(bigint,date,date),public.v3_resumen_responsables(date),public.v3_emitir_cartas(bigint,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
