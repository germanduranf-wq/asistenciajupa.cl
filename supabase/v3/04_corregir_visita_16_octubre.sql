-- OPCIONAL: después de V3. Conserva asistencias y responsables.
-- Solo cambia la visita de Jóvenes del 16/10/2026 que figura en Templo Matriz.
-- Se detiene si el destino o la visita no son inequívocos.
BEGIN;
DO $$ DECLARE destino bigint; origen bigint; actividad bigint; n integer; BEGIN
 SELECT count(*),min(id) INTO n,destino FROM public.iglesias WHERE lower(trim(nombre)) IN('casas viejas','casa vieja','casas vieja');
 IF n<>1 THEN RAISE EXCEPTION 'Debe existir una única iglesia Casas Viejas. Corrige su nombre o utiliza la edición de la página.'; END IF;
 SELECT count(*),min(id) INTO n,origen FROM public.iglesias WHERE lower(trim(nombre)) IN('templo matriz','templo matriz jupa');
 IF n<>1 THEN RAISE EXCEPTION 'No se identificó inequívocamente Templo Matriz. Utiliza la edición de la página.'; END IF;
 SELECT count(*),min(id) INTO n,actividad FROM public.actividades WHERE date='2026-10-16' AND "group"='Jóvenes' AND tipo_actividad='visita' AND iglesia_id=origen AND eliminado_el IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'No hay una única visita por corregir; puede que ya esté corregida. No se cambió ningún registro.'; END IF;
 UPDATE public.actividades SET iglesia_id=destino,iglesia_sede_id=destino,version=version+1 WHERE id=actividad;
END $$;
COMMIT;
SELECT a.id,a.date AS fecha,i.nombre AS destino,a."group" AS grupo FROM public.actividades a JOIN public.iglesias i ON i.id=a.iglesia_id WHERE a.date='2026-10-16';

