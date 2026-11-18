-- V3.3: aplicar completa después de V3.2.1. No elimina participantes al migrar.
BEGIN;
CREATE TABLE IF NOT EXISTS public.miembros_eliminados (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 miembro_id bigint NOT NULL,
 nombre text NOT NULL,
 iglesia text NOT NULL,
 motivo text NOT NULL,
 eliminado_por uuid REFERENCES auth.users(id),
 nombre_usuario text NOT NULL,
 eliminado_el timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.miembros_eliminados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eliminados_lectura ON public.miembros_eliminados;
CREATE POLICY eliminados_lectura ON public.miembros_eliminados FOR SELECT TO authenticated USING(jupa_v3.can_publish());
REVOKE ALL ON public.miembros_eliminados FROM anon,authenticated;
GRANT SELECT ON public.miembros_eliminados TO authenticated;
CREATE OR REPLACE FUNCTION public.v3_eliminar_miembro(p_id bigint,p_confirmacion text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.miembros; ruta text;
BEGIN
 IF NOT jupa_v3.can_publish() THEN RAISE EXCEPTION 'Solo Administrador, Secretaría y Jefatura pueden eliminar participantes.' USING errcode='42501'; END IF;
 SELECT * INTO m FROM public.miembros WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El participante ya no existe.'; END IF;
 IF p_confirmacion IS DISTINCT FROM m.nombres||' '||m.apellidos THEN RAISE EXCEPTION 'Escribe el nombre completo para confirmar.'; END IF;
 IF length(trim(coalesce(p_motivo,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Indica un motivo de 5 a 500 caracteres.'; END IF;
 IF EXISTS(SELECT 1 FROM public.asistencias WHERE miembro_id=p_id)
 OR EXISTS(SELECT 1 FROM public.responsabilidades WHERE miembro_id=p_id OR realizado_por=p_id)
 OR EXISTS(SELECT 1 FROM public.cartas_visitas WHERE miembro_id=p_id)
 OR m.fusionado_en IS NOT NULL OR EXISTS(SELECT 1 FROM public.miembros WHERE fusionado_en=p_id)
 THEN RAISE EXCEPTION 'El participante tiene historial. Consérvalo inactivo o solicita la fusión de duplicados al administrador.'; END IF;
 INSERT INTO public.miembros_eliminados(miembro_id,nombre,iglesia,motivo,eliminado_por,nombre_usuario)
 SELECT m.id,m.nombres||' '||m.apellidos,i.nombre,trim(p_motivo),auth.uid(),u.nombre FROM public.iglesias i CROSS JOIN public.usuarios u WHERE i.id=m.iglesia_id AND u.id=auth.uid();
 ruta:=m.ruta_foto;
 DELETE FROM public.miembros WHERE id=m.id;
 RETURN jsonb_build_object('id',m.id,'photo_path',ruta);
END $$;
REVOKE ALL ON FUNCTION public.v3_eliminar_miembro(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v3_eliminar_miembro(bigint,text,text) TO authenticated;

-- Vincular el devocional existente, sin duplicar su asistencia. Preferir un
-- vínculo explícito del resumen; si no existe, exigir coincidencia única de fecha.
DO $$ DECLARE e public.eventos; candidato bigint; cantidad integer; BEGIN
 FOR e IN SELECT * FROM public.eventos WHERE tipo='jupa' ORDER BY id LOOP
  IF EXISTS(SELECT 1 FROM public.actividades WHERE evento_id=e.id AND tipo_actividad='devocional') THEN CONTINUE; END IF;
  SELECT min(d.id),count(*) INTO candidato,cantidad FROM public.actividades d
   WHERE d.tipo_actividad='devocional' AND d.evento_id IS NULL AND d.eliminado_el IS NULL AND d.date=e.date
   AND EXISTS(SELECT 1 FROM public.resumenes_servicios r JOIN public.actividades t ON t.id=r.actividad_id WHERE t.evento_id=e.id AND r.devocional_id=d.id);
  IF cantidad=0 THEN
   SELECT min(id),count(*) INTO candidato,cantidad FROM public.actividades WHERE tipo_actividad='devocional' AND evento_id IS NULL AND eliminado_el IS NULL AND date=e.date;
  END IF;
  IF cantidad>1 THEN RAISE EXCEPTION 'Hay varios devocionales el %. Vincula el correcto en el resumen del evento antes de repetir la migración.',e.date; END IF;
  IF cantidad=1 THEN UPDATE public.actividades SET evento_id=e.id,eliminado_el=CASE WHEN e.publicado THEN NULL ELSE now() END WHERE id=candidato; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION jupa_v3.sincronizar_devocional_jupa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.tipo='jupa' THEN
  INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
  VALUES(new.date,new.anfitrionas_ids[1],'Todos','devocional',new.titulo,new.hora_manana,new.id,CASE WHEN new.publicado THEN NULL ELSE now() END)
  ON CONFLICT(evento_id,tipo_actividad) DO UPDATE SET date=excluded.date,iglesia_id=excluded.iglesia_id,notas=excluded.notas,hora=excluded.hora,eliminado_el=excluded.eliminado_el,version=public.actividades.version+1;
 ELSE UPDATE public.actividades SET eliminado_el=now(),version=version+1 WHERE evento_id=new.id AND tipo_actividad='devocional'; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS evento_devocional_jupa ON public.eventos;
CREATE TRIGGER evento_devocional_jupa AFTER INSERT OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION jupa_v3.sincronizar_devocional_jupa();
INSERT INTO public.actividades(date,iglesia_id,"group",tipo_actividad,notas,hora,evento_id,eliminado_el)
SELECT date,anfitrionas_ids[1],'Todos','devocional',titulo,hora_manana,id,CASE WHEN publicado THEN NULL ELSE now() END FROM public.eventos WHERE tipo='jupa'
ON CONFLICT(evento_id,tipo_actividad) DO NOTHING;
-- Un devocional de un evento mensual no se reprograma por separado.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_save_visit(jsonb,jsonb)'::regprocedure) INTO def;
 -- La protección general de evento_id ya existente conserva todos los módulos.
 IF position('Las actividades vinculadas se editan desde el evento mensual' IN def)=0 THEN
  def:=replace(def,'BEGIN',E'BEGIN\n IF nullif(p_values->>''id'','''') IS NOT NULL AND EXISTS(SELECT 1 FROM public.actividades WHERE id=(p_values->>''id'')::bigint AND evento_id IS NOT NULL) THEN RAISE EXCEPTION ''Las actividades vinculadas se editan desde el evento mensual.''; END IF;');
  EXECUTE def;
 END IF;
END $$;
-- El devocional vinculado se muestra dentro del evento público, una sola vez.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.v3_public_bulletin(date)'::regprocedure) INTO def;
 IF position('v.evento_id IS NULL' IN def)=0 THEN
  def:=replace(def,'WHERE v.eliminado_el IS NULL','WHERE v.evento_id IS NULL AND v.eliminado_el IS NULL');
  def:=replace(def,'''morning_time'',e.hora_manana', '''morning_status'',(SELECT a.estado FROM public.actividades a WHERE a.evento_id=e.id AND a.tipo_actividad=''devocional''),''evening_status'',(SELECT a.estado FROM public.actividades a WHERE a.evento_id=e.id AND a.tipo_actividad=''servicio_jupa''),''morning_time'',e.hora_manana');
  EXECUTE def;
 END IF;
END $$;
REVOKE ALL ON FUNCTION jupa_v3.sincronizar_devocional_jupa() FROM PUBLIC,anon;
DROP POLICY IF EXISTS retratos_huerfanos_central ON storage.objects;
CREATE POLICY retratos_huerfanos_central ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='portraits' AND jupa_v3.can_publish() AND NOT EXISTS(SELECT 1 FROM public.miembros WHERE ruta_foto=name));
NOTIFY pgrst,'reload schema';
COMMIT;
