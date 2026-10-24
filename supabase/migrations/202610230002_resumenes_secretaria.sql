-- V3.2. Aplicar después de 202610230001. Repetible, conserva datos y cuentas.
BEGIN;
INSERT INTO public.modulos(codigo,nombre,habilitado) VALUES('servicio_jupa','Servicio JUPA de la tarde',true) ON CONFLICT(codigo) DO NOTHING;
CREATE OR REPLACE FUNCTION jupa_v3.can_activity(m text,c bigint,accion text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios p WHERE p.id=auth.uid() AND p.activo AND NOT p.debe_cambiar_clave
 AND EXISTS(SELECT 1 FROM public.modulos am WHERE am.codigo=m AND am.habilitado)
 AND (p.rol='admin' OR (
 (p.rol<>'clase' OR (m IN('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.iglesia_id))
 AND (p.rol<>'secretaria' OR m IN('reunion_encargados','devocional','ensayo_coro','evento_coro','servicio_jupa'))
 AND (p.rol<>'encargado' OR m='visita') AND (p.rol<>'coro' OR m IN('ensayo_coro','evento_coro'))
 AND EXISTS(SELECT 1 FROM public.permisos ap WHERE ap.usuario_auth_id=p.id AND ap.modulo=m AND ap.puede_ver AND (ap.iglesia_id IS NULL OR ap.iglesia_id=c)
 AND CASE accion WHEN 'manage' THEN ap.puede_registrar WHEN 'export' THEN ap.puede_exportar WHEN 'view' THEN true ELSE false END))));
$$;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_guardar_permisos(uuid,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'''visita'',''reunion_encargados'',''devocional'',''ensayo_coro'',''evento_coro'')','''visita'',''reunion_encargados'',''devocional'',''ensayo_coro'',''evento_coro'',''servicio_jupa'')');
 EXECUTE def;
 SELECT pg_get_functiondef('public.v3_save_visit(jsonb,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'IF m=''evento_coro'' THEN','IF m IN(''evento_coro'',''servicio_jupa'') THEN'); EXECUTE def;
END $$;
INSERT INTO public.permisos(usuario_auth_id,modulo,puede_ver,puede_registrar,puede_exportar)
 SELECT id,'servicio_jupa',true,true,true FROM public.usuarios u WHERE rol IN('secretaria','jefatura')
 AND NOT EXISTS(SELECT 1 FROM public.permisos p WHERE p.usuario_auth_id=u.id AND p.modulo='servicio_jupa');

-- Cada evento publicado tiene una lista para el coro y otra para el servicio.
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_evento_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS actividad_evento_tipo_unico ON public.actividades(evento_id,tipo_actividad);
CREATE OR REPLACE FUNCTION jupa_v3.sincronizar_coro() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.tipo='jupa' THEN
  INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
  VALUES(new.date,new.anfitrionas_ids[1],'Todos','evento_coro',new.titulo,new.hora_manana,new.id,CASE WHEN new.publicado THEN NULL ELSE now() END)
  ON CONFLICT(evento_id,tipo_actividad) DO UPDATE SET date=excluded.date,iglesia_id=excluded.iglesia_id,notas=excluded.notas,hora=excluded.hora,eliminado_el=excluded.eliminado_el,version=public.actividades.version+1;
 ELSE UPDATE public.actividades SET eliminado_el=now(),version=version+1 WHERE evento_id=new.id AND tipo_actividad='evento_coro'; END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION jupa_v3.sincronizar_servicio_jupa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.tipo='jupa' THEN
  INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
  VALUES(new.date,new.anfitrionas_ids[1],'Todos','servicio_jupa',new.titulo,new.hora_tarde,new.id,CASE WHEN new.publicado THEN NULL ELSE now() END)
  ON CONFLICT(evento_id,tipo_actividad) DO UPDATE SET date=excluded.date,iglesia_id=excluded.iglesia_id,notas=excluded.notas,hora=excluded.hora,eliminado_el=excluded.eliminado_el,version=public.actividades.version+1;
 ELSE UPDATE public.actividades SET eliminado_el=now(),version=version+1 WHERE evento_id=new.id AND tipo_actividad='servicio_jupa'; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS evento_servicio_jupa ON public.eventos;
CREATE TRIGGER evento_servicio_jupa AFTER INSERT OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION jupa_v3.sincronizar_servicio_jupa();
INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
 SELECT date,anfitrionas_ids[1],'Todos','servicio_jupa',titulo,hora_tarde,id,CASE WHEN publicado THEN NULL ELSE now() END FROM public.eventos WHERE tipo='jupa'
 ON CONFLICT(evento_id,tipo_actividad) DO NOTHING;

-- Conserva los cuerpos que tenía la persona al registrar una nueva asistencia.
-- NULL identifica marcas antiguas sin fotografía histórica de sus cuerpos.
ALTER TABLE public.asistencias ADD COLUMN IF NOT EXISTS cuerpos_ids bigint[];
CREATE OR REPLACE FUNCTION jupa_v3.cuerpos_asistencia() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN SELECT cuerpos_ids INTO new.cuerpos_ids FROM public.miembros WHERE id=new.miembro_id;
 ELSE new.cuerpos_ids:=old.cuerpos_ids; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS cuerpos_asistencia ON public.asistencias;
CREATE TRIGGER cuerpos_asistencia BEFORE INSERT OR UPDATE ON public.asistencias FOR EACH ROW EXECUTE FUNCTION jupa_v3.cuerpos_asistencia();

CREATE TABLE IF NOT EXISTS public.resumenes_servicios (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actividad_id bigint NOT NULL UNIQUE REFERENCES public.actividades(id),
 devocional_id bigint REFERENCES public.actividades(id),
 anfitrionas_ids bigint[] NOT NULL DEFAULT '{}',
 total_punto integer CHECK(total_punto BETWEEN 0 AND 100000),
 total_general integer CHECK(total_general BETWEEN 0 AND 100000),
 primer_ensayo_id bigint REFERENCES public.actividades(id),
 segundo_ensayo_id bigint REFERENCES public.actividades(id),
 oportunidades text NOT NULL DEFAULT '', coordinador text NOT NULL DEFAULT '', predicador text NOT NULL DEFAULT '',
 pasaje_biblico text NOT NULL DEFAULT '', oracion_palabra text NOT NULL DEFAULT '', predicadores_presentes text NOT NULL DEFAULT '',
 agradecimientos text NOT NULL DEFAULT '', observaciones text NOT NULL DEFAULT '', tema_biblico text NOT NULL DEFAULT '',
 expositor text NOT NULL DEFAULT '', lectura text NOT NULL DEFAULT '', tema_administrativo text NOT NULL DEFAULT '',
 bendicion text NOT NULL DEFAULT '', oracion text NOT NULL DEFAULT '',
 invitaciones_ids bigint[] NOT NULL DEFAULT '{}', oportunidades_ids bigint[] NOT NULL DEFAULT '{}', solicitaron_tema_ids bigint[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1, actualizado_por uuid REFERENCES auth.users(id), actualizado_el timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resumenes_servicios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resumenes_lectura ON public.resumenes_servicios;
CREATE POLICY resumenes_lectura ON public.resumenes_servicios FOR SELECT TO authenticated
 USING(jupa_v3.can_publish() AND jupa_v3.can_visit(actividad_id));
REVOKE ALL ON public.resumenes_servicios FROM anon,authenticated;
GRANT SELECT ON public.resumenes_servicios TO authenticated;
DROP TRIGGER IF EXISTS resumen_auditoria ON public.resumenes_servicios;
CREATE TRIGGER resumen_auditoria AFTER INSERT OR UPDATE ON public.resumenes_servicios FOR EACH ROW EXECUTE FUNCTION jupa_v3.audit_change();

CREATE OR REPLACE FUNCTION public.v3_guardar_resumen(p_actividad bigint,p_datos jsonb,p_version integer)
RETURNS public.resumenes_servicios LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.actividades; old_r public.resumenes_servicios; r public.resumenes_servicios; k text; ids bigint[];
BEGIN
 SELECT * INTO v FROM public.actividades WHERE id=p_actividad FOR UPDATE;
 IF NOT jupa_v3.can_publish() OR NOT coalesce(jupa_v3.can_visit(v.id,'manage'),false) OR v.tipo_actividad NOT IN('servicio_jupa','devocional','reunion_encargados') THEN RAISE EXCEPTION 'No tienes permiso para completar este resumen.' USING errcode='42501'; END IF;
 IF v.estado='suspended' THEN RAISE EXCEPTION 'La actividad está suspendida.'; END IF;
 IF NOT jupa_v3.is_admin() AND v.date < (now() AT TIME ZONE 'America/Santiago')::date-21 THEN RAISE EXCEPTION 'El plazo de edición de 21 días terminó.' USING errcode='42501'; END IF;
 IF p_datos IS NULL OR jsonb_typeof(p_datos)<>'object' OR length(p_datos::text)>40000 OR p_version IS NULL THEN RAISE EXCEPTION 'Resumen inválido.'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_datos) LOOP
  IF k NOT IN('devocional_id','anfitrionas_ids','total_punto','total_general','primer_ensayo_id','segundo_ensayo_id','oportunidades','coordinador','predicador','pasaje_biblico','oracion_palabra','predicadores_presentes','agradecimientos','observaciones','tema_biblico','expositor','lectura','tema_administrativo','bendicion','oracion','invitaciones_ids','oportunidades_ids','solicitaron_tema_ids') THEN RAISE EXCEPTION 'Campo del resumen no permitido: %',k; END IF;
  IF jsonb_typeof(p_datos->k)='string' AND length(p_datos->>k)>4000 THEN RAISE EXCEPTION 'Un texto del resumen supera 4000 caracteres.'; END IF;
 END LOOP;
 SELECT * INTO old_r FROM public.resumenes_servicios WHERE actividad_id=p_actividad FOR UPDATE;
 IF coalesce(old_r.version,0)<>p_version THEN RAISE EXCEPTION 'Otra persona modificó el resumen. Vuelve a abrirlo antes de guardar.' USING errcode='40001'; END IF;
 r:=jsonb_populate_record(null::public.resumenes_servicios,p_datos);
 IF r.devocional_id IS NOT NULL AND (v.tipo_actividad<>'servicio_jupa' OR NOT EXISTS(SELECT 1 FROM public.actividades d WHERE d.id=r.devocional_id AND d.tipo_actividad='devocional' AND d.eliminado_el IS NULL AND d.estado<>'suspended' AND date_trunc('month',d.date)=date_trunc('month',v.date) AND jupa_v3.can_visit(d.id))) THEN RAISE EXCEPTION 'Selecciona un devocional vigente del mismo mes.'; END IF;
 IF r.primer_ensayo_id IS NOT NULL AND r.primer_ensayo_id=r.segundo_ensayo_id THEN RAISE EXCEPTION 'Selecciona ensayos diferentes.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[r.primer_ensayo_id,r.segundo_ensayo_id]) eid WHERE eid IS NOT NULL AND (v.tipo_actividad<>'reunion_encargados' OR NOT EXISTS(SELECT 1 FROM public.actividades e WHERE e.id=eid AND e.tipo_actividad='ensayo_coro' AND e.eliminado_el IS NULL AND e.estado<>'suspended' AND date_trunc('month',e.date)=date_trunc('month',v.date) AND jupa_v3.can_visit(e.id)))) THEN RAISE EXCEPTION 'Selecciona ensayos vigentes del mismo mes.'; END IF;
 ids:=coalesce(r.anfitrionas_ids,'{}')||coalesce(r.invitaciones_ids,'{}')||coalesce(r.oportunidades_ids,'{}')||coalesce(r.solicitaron_tema_ids,'{}');
 IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.iglesias WHERE id=x)) THEN RAISE EXCEPTION 'Hay una clase no válida en el resumen.'; END IF;
 INSERT INTO public.resumenes_servicios(actividad_id,devocional_id,anfitrionas_ids,total_punto,total_general,primer_ensayo_id,segundo_ensayo_id,oportunidades,coordinador,predicador,pasaje_biblico,oracion_palabra,predicadores_presentes,agradecimientos,observaciones,tema_biblico,expositor,lectura,tema_administrativo,bendicion,oracion,invitaciones_ids,oportunidades_ids,solicitaron_tema_ids,version,actualizado_por)
 VALUES(p_actividad,r.devocional_id,coalesce(r.anfitrionas_ids,'{}'),r.total_punto,r.total_general,r.primer_ensayo_id,r.segundo_ensayo_id,coalesce(r.oportunidades,''),coalesce(r.coordinador,''),coalesce(r.predicador,''),coalesce(r.pasaje_biblico,''),coalesce(r.oracion_palabra,''),coalesce(r.predicadores_presentes,''),coalesce(r.agradecimientos,''),coalesce(r.observaciones,''),coalesce(r.tema_biblico,''),coalesce(r.expositor,''),coalesce(r.lectura,''),coalesce(r.tema_administrativo,''),coalesce(r.bendicion,''),coalesce(r.oracion,''),coalesce(r.invitaciones_ids,'{}'),coalesce(r.oportunidades_ids,'{}'),coalesce(r.solicitaron_tema_ids,'{}'),p_version+1,auth.uid())
 ON CONFLICT(actividad_id) DO UPDATE SET devocional_id=excluded.devocional_id,anfitrionas_ids=excluded.anfitrionas_ids,total_punto=excluded.total_punto,total_general=excluded.total_general,primer_ensayo_id=excluded.primer_ensayo_id,segundo_ensayo_id=excluded.segundo_ensayo_id,oportunidades=excluded.oportunidades,coordinador=excluded.coordinador,predicador=excluded.predicador,pasaje_biblico=excluded.pasaje_biblico,oracion_palabra=excluded.oracion_palabra,predicadores_presentes=excluded.predicadores_presentes,agradecimientos=excluded.agradecimientos,observaciones=excluded.observaciones,tema_biblico=excluded.tema_biblico,expositor=excluded.expositor,lectura=excluded.lectura,tema_administrativo=excluded.tema_administrativo,bendicion=excluded.bendicion,oracion=excluded.oracion,invitaciones_ids=excluded.invitaciones_ids,oportunidades_ids=excluded.oportunidades_ids,solicitaron_tema_ids=excluded.solicitaron_tema_ids,version=excluded.version,actualizado_por=excluded.actualizado_por,actualizado_el=now() RETURNING * INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.v3_guardar_resumen(bigint,jsonb,integer),jupa_v3.cuerpos_asistencia(),jupa_v3.sincronizar_servicio_jupa() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v3_guardar_resumen(bigint,jsonb,integer) TO authenticated;
-- Las estadísticas ya escuchan asistencias; también refrescar resúmenes compartidos.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='resumenes_servicios') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.resumenes_servicios;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
