-- Ejecutar después de la migración inicial. Compatible con la columna opcional creada manualmente.
begin;
alter table public.profiles add column if not exists username text;
-- No inventar usuarios para cuentas existentes: asignarlos siguiendo docs/USUARIOS.md.
create unique index if not exists profiles_username_unique on public.profiles(lower(username));
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
check (username is null or (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'));
commit;
