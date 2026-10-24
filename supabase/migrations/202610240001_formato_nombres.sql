-- Ejecutar completo sobre V3.2. Repetible. No recrea fichas ni cuentas.
BEGIN;
CREATE OR REPLACE FUNCTION jupa_v3.formato_nombre(valor text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT initcap(lower(btrim(regexp_replace(normalize(coalesce(valor,''),NFC),'\s+',' ','g'))));
$$;
REVOKE ALL ON FUNCTION jupa_v3.formato_nombre(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jupa_v3.formato_nombre(text) TO authenticated,service_role;

-- La misma regla se aplica a la web, al SQL Editor y a futuras importaciones.
-- Se mantienen las validaciones de RUT y de registros fusionados.
CREATE OR REPLACE FUNCTION jupa_v3.normalize_person()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 new.nombres:=jupa_v3.formato_nombre(new.nombres);
 new.apellidos:=jupa_v3.formato_nombre(new.apellidos);
 new.rut:=nullif(upper(regexp_replace(coalesce(new.rut,''),'[.\s-]','','g')),'');
 IF NOT jupa_v3.valid_rut(new.rut) THEN RAISE EXCEPTION 'El RUT no es válido.'; END IF;
 IF new.fusionado_en IS NOT NULL AND new.activo THEN RAISE EXCEPTION 'Un registro fusionado no puede reactivarse.'; END IF;
 RETURN new;
END;
$$;

UPDATE public.miembros
SET nombres=jupa_v3.formato_nombre(nombres),apellidos=jupa_v3.formato_nombre(apellidos)
WHERE nombres IS DISTINCT FROM jupa_v3.formato_nombre(nombres)
   OR apellidos IS DISTINCT FROM jupa_v3.formato_nombre(apellidos);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Comprobación: pendientes_de_formato debe ser 0.
SELECT count(*) AS total_participantes,
 count(*) FILTER (WHERE nombres IS DISTINCT FROM jupa_v3.formato_nombre(nombres)
 OR apellidos IS DISTINCT FROM jupa_v3.formato_nombre(apellidos)) AS pendientes_de_formato
FROM public.miembros;
