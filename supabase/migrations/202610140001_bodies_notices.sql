-- Después de las migraciones 202610120001, 002 y 003. Ejecutar una vez.
BEGIN;
ALTER TABLE public.classes ADD COLUMN address text NOT NULL DEFAULT '', ADD COLUMN commune text NOT NULL DEFAULT 'Puente Alto', ADD COLUMN maps_url text NOT NULL DEFAULT '';
ALTER TABLE public.classes ADD CONSTRAINT class_maps_https CHECK(maps_url='' OR maps_url ~ '^https://');
GRANT INSERT(address,commune,maps_url), UPDATE(address,commune,maps_url) ON public.classes TO authenticated;
CREATE TABLE public.bodies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 80), active boolean NOT NULL DEFAULT true);
INSERT INTO public.bodies(name) VALUES('Comunicaciones JUPA'),('Audio JUPA'),('Enfermería JUPA'),('Secretaría JUPA'),('Coro JUPA');
ALTER TABLE public.people ADD COLUMN body_ids uuid[] NOT NULL DEFAULT '{}';
GRANT INSERT(body_ids),UPDATE(body_ids) ON public.people TO authenticated;
CREATE FUNCTION private.check_bodies() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(new.body_ids) b WHERE b IS NULL OR NOT EXISTS(SELECT 1 FROM public.bodies WHERE id=b)) THEN RAISE EXCEPTION 'Cuerpo no válido.'; END IF;
 SELECT coalesce(array_agg(DISTINCT b),'{}') INTO new.body_ids FROM unnest(new.body_ids) b;
 RETURN new;
END; $$;
CREATE TRIGGER check_bodies BEFORE INSERT OR UPDATE OF body_ids ON public.people FOR EACH ROW EXECUTE FUNCTION private.check_bodies();
ALTER TABLE public.bodies ENABLE ROW LEVEL SECURITY;
CREATE POLICY bodies_read ON public.bodies FOR SELECT TO authenticated USING(private.is_member());
CREATE POLICY bodies_insert ON public.bodies FOR INSERT TO authenticated WITH CHECK(private.is_admin());
CREATE POLICY bodies_update ON public.bodies FOR UPDATE TO authenticated USING(private.is_admin()) WITH CHECK(private.is_admin());
GRANT SELECT,INSERT,UPDATE ON public.bodies TO authenticated;
REVOKE ALL ON public.bodies FROM anon;
CREATE TRIGGER bodies_audit AFTER INSERT OR UPDATE ON public.bodies FOR EACH ROW EXECUTE FUNCTION private.audit_change();

INSERT INTO public.activity_modules(code,name,enabled) VALUES('devocional','Devocionales JUPA',false);
ALTER TABLE public.account_permissions ADD COLUMN can_schedule boolean NOT NULL DEFAULT false;
ALTER TABLE public.visits ADD COLUMN scheduled_time time;
-- Programar no concede lectura de asistencia ni de estadísticas.
CREATE OR REPLACE FUNCTION private.can_activity(m text,c uuid,action text DEFAULT 'view') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active AND NOT p.must_change_password
 AND EXISTS(SELECT 1 FROM public.activity_modules am WHERE am.code=m AND am.enabled)
 AND (p.role='admin' OR (
 (p.role<>'clase' OR (m IN ('escuela_dominical','servicio_domingo','reunion_mensual') AND c=p.class_id))
 AND (p.role<>'secretaria' OR m IN ('reunion_encargados','devocional'))
 AND (p.role<>'encargado' OR m='visita')
 AND EXISTS(SELECT 1 FROM public.account_permissions ap WHERE ap.profile_id=p.id AND ap.module=m AND ap.can_view AND (ap.class_id IS NULL OR ap.class_id=c)
 AND CASE action WHEN 'manage' THEN ap.can_manage WHEN 'export' THEN ap.can_export WHEN 'view' THEN true ELSE false END))));
$$;
CREATE FUNCTION private.can_schedule(m text,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN m='visita' THEN EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active AND NOT p.must_change_password
 AND p.role IN ('admin','jefatura','secretaria') AND EXISTS(SELECT 1 FROM public.activity_modules WHERE code=m AND enabled)
 AND (p.role='admin' OR EXISTS(SELECT 1 FROM public.account_permissions ap WHERE ap.profile_id=p.id AND ap.module=m
 AND (ap.class_id IS NULL OR ap.class_id=c) AND (ap.can_schedule OR (p.role='jefatura' AND ap.can_view AND ap.can_manage)))))
 ELSE private.can_activity(m,c,'manage') END;
$$;
DROP POLICY visits_read ON public.visits;
CREATE POLICY visits_read ON public.visits FOR SELECT TO authenticated USING(private.can_activity(activity_type,class_id) OR private.can_schedule(activity_type,class_id));
CREATE OR REPLACE FUNCTION public.save_visit(p_values jsonb,p_assignments jsonb) RETURNS public.visits LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.visits; old_v public.visits; vid uuid; m text; c uuid; new_date date; secretary boolean;
BEGIN
 m:=coalesce(p_values->>'activity_type','visita'); c:=(p_values->>'class_id')::uuid; new_date:=(p_values->>'date')::date;
 IF NOT private.can_schedule(m,c) THEN RAISE EXCEPTION 'No tienes permiso para programar esta actividad.' USING errcode='42501'; END IF;
 SELECT role='secretaria' INTO secretary FROM public.profiles WHERE id=auth.uid();
 vid:=nullif(p_values->>'id','')::uuid;
 IF vid IS NOT NULL THEN
  SELECT * INTO old_v FROM public.visits WHERE id=vid FOR UPDATE;
  IF old_v.id IS NULL OR NOT private.can_schedule(old_v.activity_type,old_v.class_id) THEN RAISE EXCEPTION 'Actividad no disponible.'; END IF;
  IF old_v.version<>coalesce((p_values->>'version')::integer,0) THEN RAISE EXCEPTION 'La actividad fue modificada. Actualiza antes de guardar.' USING errcode='40001'; END IF;
  IF m<>old_v.activity_type OR c<>old_v.class_id OR new_date<>old_v.date OR p_values->>'group'<>old_v."group" THEN RAISE EXCEPTION 'Fecha, clase, tipo y grupo no se cambian después de crear la actividad.'; END IF;
 END IF;
 IF new_date < (now() AT TIME ZONE 'America/Santiago')::date-21 AND NOT private.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede modificar programación de hace más de 21 días.'; END IF;
 IF m='visita' THEN
  v:=private.save_visit_legacy(p_values,CASE WHEN secretary THEN '{}'::jsonb ELSE p_assignments END);
 ELSE
  IF vid IS NULL THEN
   INSERT INTO public.visits(date,class_id,"group",notes,activity_type,venue_class_id) VALUES(new_date,c,'Todos',coalesce(p_values->>'notes',''),m,coalesce(nullif(p_values->>'venue_class_id','')::uuid,c)) RETURNING * INTO v;
  ELSE
   UPDATE public.visits SET notes=coalesce(p_values->>'notes',''),venue_class_id=coalesce(nullif(p_values->>'venue_class_id','')::uuid,c),version=version+1 WHERE id=vid RETURNING * INTO v;
  END IF;
 END IF;
 UPDATE public.visits SET scheduled_time=nullif(p_values->>'scheduled_time','')::time WHERE id=v.id RETURNING * INTO v;
 RETURN v;
END; $$;

CREATE FUNCTION private.can_publish() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active AND NOT must_change_password AND role IN ('admin','jefatura','secretaria'));
$$;
CREATE TABLE public.bulletin_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('especial','jupa')),
 date date NOT NULL, title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=3000), venue text NOT NULL DEFAULT '' CHECK(length(venue)<=200),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=300), maps_url text NOT NULL DEFAULT '' CHECK(maps_url='' OR maps_url ~ '^https://'),
 host_ids uuid[] NOT NULL DEFAULT '{}', morning_time time, evening_time time,
 preaching_place text NOT NULL DEFAULT '' CHECK(length(preaching_place)<=300), preaching_maps_url text NOT NULL DEFAULT '' CHECK(preaching_maps_url='' OR preaching_maps_url ~ '^https://'),
 published boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 CHECK(kind<>'jupa' OR (cardinality(host_ids)=2 AND morning_time IS NOT NULL AND evening_time IS NOT NULL AND length(trim(venue))>0 AND length(trim(address))>0 AND length(trim(preaching_place))>0))
);
CREATE TABLE public.bulletin_highlights(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), month date NOT NULL UNIQUE CHECK(extract(day FROM month)=1),
 message text NOT NULL CHECK(length(message)<=3000), published boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1
);
CREATE FUNCTION private.check_bulletin_hosts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF cardinality(new.host_ids)<>(SELECT count(DISTINCT x) FROM unnest(new.host_ids) x) OR EXISTS(SELECT 1 FROM unnest(new.host_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.classes WHERE id=x)) THEN RAISE EXCEPTION 'Selecciona clases anfitrionas diferentes y válidas.'; END IF;
 RETURN new;
END; $$;
CREATE TRIGGER bulletin_hosts BEFORE INSERT OR UPDATE ON public.bulletin_events FOR EACH ROW EXECUTE FUNCTION private.check_bulletin_hosts();
ALTER TABLE public.bulletin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_read ON public.bulletin_events FOR SELECT TO authenticated USING(private.can_publish());
CREATE POLICY events_insert ON public.bulletin_events FOR INSERT TO authenticated WITH CHECK(private.can_publish());
CREATE POLICY events_update ON public.bulletin_events FOR UPDATE TO authenticated USING(private.can_publish()) WITH CHECK(private.can_publish());
CREATE POLICY highlights_read ON public.bulletin_highlights FOR SELECT TO authenticated USING(private.can_publish());
CREATE POLICY highlights_insert ON public.bulletin_highlights FOR INSERT TO authenticated WITH CHECK(private.can_publish());
CREATE POLICY highlights_update ON public.bulletin_highlights FOR UPDATE TO authenticated USING(private.can_publish()) WITH CHECK(private.can_publish());
REVOKE ALL ON public.bulletin_events,public.bulletin_highlights FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.bulletin_events,public.bulletin_highlights TO authenticated;
GRANT ALL ON public.bodies,public.bulletin_events,public.bulletin_highlights TO service_role;
CREATE TRIGGER events_audit AFTER INSERT OR UPDATE ON public.bulletin_events FOR EACH ROW EXECUTE FUNCTION private.audit_change();
CREATE TRIGGER highlights_audit AFTER INSERT OR UPDATE ON public.bulletin_highlights FOR EACH ROW EXECUTE FUNCTION private.audit_change();

-- Proyección pública explícita: jamás incluye personas, responsables, notas privadas ni asistencia.
CREATE FUNCTION public.public_bulletin(p_month date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE first_day date; next_month date; result jsonb;
BEGIN
 IF p_month IS NULL OR p_month < date '2000-01-01' OR p_month > date '2100-12-31' THEN RAISE EXCEPTION 'Mes no válido.'; END IF;
 first_day:=date_trunc('month',p_month)::date; next_month:=(first_day+interval '1 month')::date;
 SELECT jsonb_build_object('month',first_day,
 'highlight',coalesce((SELECT message FROM public.bulletin_highlights WHERE month=first_day AND published),''),
 'activities',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'date',v.date,'type',v.activity_type,'group',v."group",'time',v.scheduled_time,'class_name',c.name,'address',c.address,'commune',c.commune,'maps_url',c.maps_url,'status',v.status) ORDER BY v.date,v."group") FROM public.visits v JOIN public.classes c ON c.id=coalesce(v.venue_class_id,v.class_id) JOIN public.activity_modules m ON m.code=v.activity_type AND m.enabled WHERE v.date>=first_day AND v.date<next_month AND v.activity_type IN ('visita','reunion_encargados','devocional')),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'date',e.date,'title',e.title,'description',e.description,'venue',e.venue,'address',e.address,'maps_url',e.maps_url,'morning_time',e.morning_time,'evening_time',e.evening_time,'preaching_place',e.preaching_place,'preaching_maps_url',e.preaching_maps_url,'hosts',(SELECT jsonb_agg(c.name ORDER BY c.name) FROM public.classes c WHERE c.id=ANY(e.host_ids))) ORDER BY e.date,e.title) FROM public.bulletin_events e WHERE e.published AND e.date>=first_day AND e.date<next_month),'[]'::jsonb)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION private.can_schedule(text,uuid),private.can_publish(),private.check_bodies(),private.check_bulletin_hosts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_schedule(text,uuid),private.can_publish() TO authenticated;
REVOKE ALL ON FUNCTION public.public_bulletin(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_bulletin(date) TO anon,authenticated;
COMMIT;
