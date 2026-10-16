-- Ejecutar después de 202610140001_bodies_notices.sql. Repetible.
-- Habilita lo solicitado para las cuentas centrales activas existentes.
-- Las cuentas de clase mantienen sus permisos y su ámbito sin cambios.
BEGIN;
UPDATE public.activity_modules SET enabled=true WHERE code='devocional';
INSERT INTO public.account_permissions(profile_id,module,can_view,can_manage,can_export)
SELECT id,'devocional',true,true,true FROM public.profiles WHERE active AND role IN ('secretaria','jefatura')
ON CONFLICT(profile_id,module,(coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid)))
DO UPDATE SET can_view=true,can_manage=true,can_export=true;
INSERT INTO public.account_permissions(profile_id,module,can_view,can_manage,can_export,can_schedule)
SELECT id,'visita',false,false,false,true FROM public.profiles WHERE active AND role='secretaria'
ON CONFLICT(profile_id,module,(coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid)))
DO UPDATE SET can_view=false,can_manage=false,can_export=false,can_schedule=true;
COMMIT;
SELECT p.username,p.name,p.role,m.name AS actividad,c.name AS clase,
 a.can_view,a.can_manage,a.can_export,a.can_schedule
FROM public.account_permissions a JOIN public.profiles p ON p.id=a.profile_id
JOIN public.activity_modules m ON m.code=a.module LEFT JOIN public.classes c ON c.id=a.class_id
WHERE p.role IN ('secretaria','jefatura') ORDER BY p.name,m.name;
