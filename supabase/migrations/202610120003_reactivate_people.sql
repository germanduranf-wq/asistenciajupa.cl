-- Ejecutar después de 202610120001 y 202610120002. Repetible.
-- Permite reincorporar a una clase solo a sus propios participantes.
BEGIN;
CREATE OR REPLACE FUNCTION private.can_person(c uuid,action text default 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.active AND NOT p.must_change_password AND (
 p.role IN ('admin','jefatura','secretaria')
 OR (p.role='encargado' AND action IN ('view','create','photo'))
 OR (p.role='clase' AND p.class_id=c AND action IN ('view','create','edit','photo','reactivate'))));
$$;

CREATE OR REPLACE FUNCTION private.guard_person_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.birth_date IS NOT NULL AND (new.birth_date > (now() AT TIME ZONE 'America/Santiago')::date - interval '10 years' OR new.birth_date < date '1900-01-01') THEN
   RAISE EXCEPTION 'La fecha de nacimiento debe corresponder a una persona de al menos 10 años y no ser anterior a 1900.';
 END IF;
 IF new.active AND new.merged_into IS NOT NULL THEN
   RAISE EXCEPTION 'Este registro fue fusionado. Utiliza la ficha que se conservó.';
 END IF;
 IF TG_OP='UPDATE' AND auth.uid() IS NOT NULL THEN
   IF new.active IS DISTINCT FROM old.active THEN
     IF new.active AND NOT private.can_person(old.class_id,'reactivate') THEN
       RAISE EXCEPTION 'No tienes permiso para reincorporar a este participante.' USING errcode='42501';
     ELSIF NOT new.active AND NOT private.can_person(old.class_id,'retire') THEN
       RAISE EXCEPTION 'No tienes permiso para retirar participantes.' USING errcode='42501';
     END IF;
   END IF;
   IF new.class_id IS DISTINCT FROM old.class_id AND NOT private.can_person(old.class_id,'retire') THEN
     RAISE EXCEPTION 'Solo la administración central puede trasladar participantes.' USING errcode='42501';
   END IF;
 END IF;
 RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION public.reactivate_person(p_person uuid)
RETURNS public.people LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person public.people;
BEGIN
 SELECT * INTO person FROM public.people WHERE id=p_person FOR UPDATE;
 IF person.id IS NULL OR NOT private.can_person(person.class_id,'reactivate') THEN
   RAISE EXCEPTION 'No tienes permiso para reincorporar a este participante.' USING errcode='42501';
 END IF;
 IF person.merged_into IS NOT NULL THEN
   RAISE EXCEPTION 'Este registro fue fusionado. Utiliza la ficha que se conservó.';
 END IF;
 IF NOT person.active THEN
   UPDATE public.people SET active=true WHERE id=p_person RETURNING * INTO person;
 END IF;
 RETURN person;
END; $$;
REVOKE ALL ON FUNCTION public.reactivate_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_person(uuid) TO authenticated;
COMMIT;
