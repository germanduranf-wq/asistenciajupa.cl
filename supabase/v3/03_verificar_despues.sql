-- Solo lectura. Tras la migración, las tres primeras comprobaciones deben ser true.
SELECT
 (SELECT count(*) FROM public.miembros)=(SELECT count(*) FROM respaldo_v2.people) AS participantes_conservados,
 (SELECT count(*) FROM public.usuarios)=(SELECT count(*) FROM respaldo_v2.profiles) AS cuentas_conservadas,
 (SELECT count(*) FROM public.asistencias)=(SELECT count(*) FROM respaldo_v2.attendance) AS asistencias_conservadas;
SELECT numero,nombre,usuario,rol,iglesia,activo FROM public.usuarios_detalle_v3 ORDER BY numero;
SELECT id,nombres,apellidos,iglesia,categoria,activo FROM public.miembros_detalle ORDER BY id;
SELECT perfil,habilitada FROM public.demostraciones ORDER BY perfil;
SELECT codigo,nombre,habilitado FROM public.modulos ORDER BY codigo;
-- Cero filas confirma que todos los perfiles conservan su cuenta Auth original.
SELECT u.usuario FROM public.usuarios u LEFT JOIN auth.users a ON a.id=u.id WHERE a.id IS NULL;

