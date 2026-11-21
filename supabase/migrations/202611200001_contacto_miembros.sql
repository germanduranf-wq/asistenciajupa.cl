-- Datos opcionales de contacto; conserva permisos e historial existentes.
BEGIN;
ALTER TABLE public.miembros
 ADD COLUMN IF NOT EXISTS telefono text,
 ADD COLUMN IF NOT EXISTS correo_contacto text,
 ADD COLUMN IF NOT EXISTS nombre_contacto_emergencia text,
 ADD COLUMN IF NOT EXISTS telefono_emergencia text,
 ADD COLUMN IF NOT EXISTS direccion_completa text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.miembros'::regclass AND conname='miembros_contacto_limites') THEN
 ALTER TABLE public.miembros ADD CONSTRAINT miembros_contacto_limites CHECK (
  coalesce(length(telefono),0)<=40 AND coalesce(length(correo_contacto),0)<=254
  AND coalesce(length(nombre_contacto_emergencia),0)<=120
  AND coalesce(length(telefono_emergencia),0)<=40 AND coalesce(length(direccion_completa),0)<=400);
 END IF;
END $$;
GRANT INSERT(telefono,correo_contacto,nombre_contacto_emergencia,telefono_emergencia,direccion_completa),
 UPDATE(telefono,correo_contacto,nombre_contacto_emergencia,telefono_emergencia,direccion_completa) ON public.miembros TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
