# Actualización a JUPA 3

**No hagas Push antes de actualizar Supabase.**

Instrucciones completas: [docs/PUBLICACION-V3.md](docs/PUBLICACION-V3.md).

Orden:

1. Respaldo externo de la base y fotografías; pausa de asistencia.
2. SQL Editor: `supabase/v3/01_comprobar_antes.sql`.
3. SQL Editor: `supabase/migrations/202610170001_esquema_espanol.sql`, completo y una sola vez.
4. SQL Editor: `supabase/v3/03_verificar_despues.sql`.
5. Edge Function **super-responder**: reemplazar con `supabase/functions/manage-users/index.ts` y desplegar.
6. GitHub Desktop: commit y Push origin. Esperar despliegue Cloudflare.
7. Verificar acceso, participantes, fotos y asistencia en la web.

Las cuentas Auth y sus contraseñas se conservan. Las tablas anteriores quedan en `respaldo_v2`. Las demostraciones comienzan apagadas. No se eliminan actividades ficticias automáticamente.

Corrección opcional de la visita del 16 de octubre: `supabase/v3/04_corregir_visita_16_octubre.sql`, o editarla desde la aplicación como administrador.
