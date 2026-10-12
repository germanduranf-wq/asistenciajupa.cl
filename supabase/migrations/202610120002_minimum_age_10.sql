-- Ejecutar después de la migración 2.0. Repetible.
-- Actualiza solo la edad mínima; conserva las restricciones de edición y traslado.
begin;
create or replace function private.guard_person_changes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.birth_date is not null and (new.birth_date > (now() at time zone 'America/Santiago')::date - interval '10 years' or new.birth_date < date '1900-01-01') then raise exception 'La fecha de nacimiento debe corresponder a una persona de al menos 10 años y no ser anterior a 1900.'; end if;
 if TG_OP='UPDATE' and auth.uid() is not null then
  if new.active is distinct from old.active and not private.can_person(old.class_id,'retire') then raise exception 'No tienes permiso para retirar o reactivar participantes.' using errcode='42501'; end if;
  if new.class_id is distinct from old.class_id and not private.can_person(old.class_id,'retire') then raise exception 'Solo la administración central puede trasladar participantes.' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
commit;
