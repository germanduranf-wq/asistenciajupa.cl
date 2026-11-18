-- Aplicar después de 202611180001. No reasigna personas ni borra historial.
BEGIN;
CREATE OR REPLACE FUNCTION jupa_v3.validar_clase_miembro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF new.iglesia_id IS NOT DISTINCT FROM old.iglesia_id AND new.otra_iglesia_id IS NOT DISTINCT FROM old.otra_iglesia_id THEN RETURN new; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.iglesias WHERE tipo='Local' AND id IN(new.iglesia_id,new.otra_iglesia_id)) THEN
  RAISE EXCEPTION 'Los locales son destinos de visita. Selecciona la clase o el Templo Matriz al que pertenece el participante.';
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS validar_clase_miembro ON public.miembros;
CREATE TRIGGER validar_clase_miembro BEFORE INSERT OR UPDATE OF iglesia_id,otra_iglesia_id ON public.miembros FOR EACH ROW EXECUTE FUNCTION jupa_v3.validar_clase_miembro();
REVOKE ALL ON FUNCTION jupa_v3.validar_clase_miembro() FROM PUBLIC,anon;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_ensure_sundays(date,date)'::regprocedure) INTO def;
 def:=replace(def,'from public.iglesias where activo loop','from public.iglesias where activo and tipo<>''Local'' loop');
 EXECUTE def;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
