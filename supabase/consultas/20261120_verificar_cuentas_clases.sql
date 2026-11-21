-- Consulta informativa: no crea ni modifica cuentas.
-- Ejecutar después de la migración V3.5 y del proceso en Administración.
SELECT i.nombre AS clase, t.tipo_cuenta,
 u.usuario, u.activo, u.debe_cambiar_clave,
 CASE WHEN u.id IS NULL THEN 'Pendiente de crear'
      WHEN NOT u.activo THEN 'Existe, desactivada'
      ELSE 'Creada' END AS estado,
 ARRAY(SELECT m.nombre FROM public.permisos p JOIN public.modulos m ON m.codigo=p.modulo
       WHERE p.usuario_auth_id=u.id AND p.puede_ver AND m.habilitado
       ORDER BY m.nombre) AS actividades_habilitadas
FROM public.iglesias i
CROSS JOIN (VALUES(false,'General'),(true,'Solo asistencia')) t(limitada,tipo_cuenta)
LEFT JOIN public.usuarios u ON u.rol='clase' AND u.iglesia_id=i.id AND u.solo_asistencia=t.limitada
WHERE i.activo AND i.tipo<>'Local'
ORDER BY i.nombre,t.limitada,u.usuario;
