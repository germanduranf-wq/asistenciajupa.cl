-- JUPA 2.0. Ejecutar una vez DESPUÉS de las dos migraciones anteriores.
-- Transacción: conserva UUID, cuentas, fotos, visitas y marcas históricas.
begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','encargado','jefatura','secretaria','clase'));
alter table public.profiles add column class_id uuid references public.classes(id);
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add constraint class_account_requires_class check(role<>'clase' or class_id is not null);
alter table public.people add column birth_date date;
alter table public.people drop constraint people_category_check;
alter table public.people add constraint people_category_check check(category in ('Joven','Señorita','Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas','Colaborador','Colaboradora'));
create table public.activity_modules(code text primary key, name text not null, enabled boolean not null default false);
insert into public.activity_modules values ('visita','Visitas',true),('reunion_encargados','Reuniones de encargados JUPA',false),('escuela_dominical','Escuela dominical',false),('servicio_domingo','Servicio del domingo',false),('reunion_mensual','Reunión mensual',false);
create table public.account_permissions (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
 module text not null references public.activity_modules(code), class_id uuid references public.classes(id),
 can_view boolean not null default true, can_manage boolean not null default false, can_export boolean not null default false,
 check(can_view or (not can_manage and not can_export))
);
create unique index account_permissions_scope on public.account_permissions(profile_id,module,coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid));
-- Conserva exclusivamente el acceso a visitas de los operadores actuales.
insert into public.account_permissions(profile_id,module,can_manage) select id,'visita',true from public.profiles where role='encargado';
alter table public.visits add column activity_type text not null default 'visita' references public.activity_modules(code);
alter table public.visits add column venue_class_id uuid references public.classes(id);
alter table public.visits add column status text not null default 'pending' check(status in ('pending','held','suspended'));
alter table public.visits add column suspension_reason text not null default '' check(length(suspension_reason)<=500);
alter table public.visits drop constraint visits_group_check;
alter table public.visits add constraint visits_group_check check("group" in ('Jóvenes','Señoritas','Todos'));
alter table public.visits drop constraint visits_date_class_id_group_key;
alter table public.visits add constraint activity_unique unique(date,class_id,"group",activity_type);
alter table public.visits add constraint activity_group check(activity_type='visita' or "group"='Todos');
alter table public.visits add constraint sunday_date check(activity_type not in ('escuela_dominical','servicio_domingo') or extract(dow from date)=0);
alter table public.visits add constraint suspension_reason_required check(status<>'suspended' or length(trim(suspension_reason))>0);
update public.visits v set status='held' where exists(select 1 from public.attendance a where a.visit_id=v.id and a.present);

create or replace function private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password);
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and role='admin');
$$;
create function private.can_activity(m text,c uuid,action text default 'view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.must_change_password
 and exists(select 1 from public.activity_modules am where am.code=m and am.enabled)
 and (p.role='admin' or (
  (p.role<>'clase' or (m in ('escuela_dominical','servicio_domingo','reunion_mensual') and c=p.class_id))
  and (p.role<>'secretaria' or m='reunion_encargados')
  and (p.role<>'encargado' or m='visita')
  and exists(select 1 from public.account_permissions ap where ap.profile_id=p.id and ap.module=m and ap.can_view and (ap.class_id is null or ap.class_id=c)
   and case action when 'manage' then ap.can_manage when 'export' then ap.can_export when 'view' then true else false end)
 )));
$$;
create function private.can_person(c uuid,action text default 'view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.must_change_password and (
 p.role in ('admin','jefatura','secretaria') or (p.role='encargado' and action in ('view','create','photo')) or (p.role='clase' and p.class_id=c and action in ('view','create','edit','photo'))));
$$;
create function private.can_visit(vid uuid,action text default 'view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.visits v where v.id=vid and private.can_activity(v.activity_type,v.class_id,action));
$$;
create or replace function private.check_edit(p_visit uuid) returns void language plpgsql security definer set search_path='' as $$
declare v public.visits; local_day date := (now() at time zone 'America/Santiago')::date;
begin
 select * into v from public.visits where id=p_visit;
 if v.id is null or not private.can_visit(p_visit,'manage') then raise exception 'No tienes permiso para modificar esta actividad.' using errcode='42501'; end if;
 if private.is_admin() then return; end if;
 if v.date>local_day then raise exception 'La asistencia abre el día de la actividad.' using errcode='42501'; end if;
 if local_day>v.date+21 then raise exception 'Han pasado más de 21 días. Contacta al administrador.' using errcode='42501'; end if;
end;
$$;

drop policy people_read on public.people;
drop policy people_insert on public.people;
drop policy people_update on public.people;
create policy people_read on public.people for select to authenticated using(private.can_person(class_id));
create policy people_insert on public.people for insert to authenticated with check(private.can_person(class_id,'create') and active and merged_into is null and photo_path is null);
create policy people_update on public.people for update to authenticated using(private.can_person(class_id,'edit')) with check(private.can_person(class_id,'edit'));
create function private.guard_person_changes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.birth_date is not null and (new.birth_date > (now() at time zone 'America/Santiago')::date - interval '18 years' or new.birth_date < date '1900-01-01') then raise exception 'La fecha de nacimiento debe corresponder a una persona adulta y ser posterior a 1900.'; end if;
 if TG_OP='UPDATE' and auth.uid() is not null then
  if new.active is distinct from old.active and not private.can_person(old.class_id,'retire') then raise exception 'No tienes permiso para retirar o reactivar participantes.' using errcode='42501'; end if;
  if new.class_id is distinct from old.class_id and not private.can_person(old.class_id,'retire') then raise exception 'Solo la administración central puede trasladar participantes.' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
create trigger guard_person_changes before insert or update on public.people for each row execute function private.guard_person_changes();
grant insert(birth_date),update(birth_date) on public.people to authenticated;
drop policy visits_read on public.visits;
drop policy attendance_read on public.attendance;
drop policy responsibilities_read on public.responsibilities;
create policy visits_read on public.visits for select to authenticated using(private.can_activity(activity_type,class_id));
create policy attendance_read on public.attendance for select to authenticated using(private.can_visit(visit_id));
create policy responsibilities_read on public.responsibilities for select to authenticated using(private.can_visit(visit_id));
alter table public.activity_modules enable row level security;
alter table public.account_permissions enable row level security;
create policy modules_read on public.activity_modules for select to authenticated using(private.is_member());
create policy permissions_read on public.account_permissions for select to authenticated using(private.is_member() and (profile_id=auth.uid() or private.is_admin()));
revoke all on public.activity_modules,public.account_permissions from anon,authenticated;
grant select on public.activity_modules,public.account_permissions to authenticated;
create trigger permissions_audit after insert or update or delete on public.account_permissions for each row execute function private.audit_change();
create trigger modules_audit after insert or update or delete on public.activity_modules for each row execute function private.audit_change();

create or replace function public.set_attendance(p_visit uuid,p_person uuid,p_present boolean,p_version integer)
returns public.attendance language plpgsql security definer set search_path='' as $$
declare old_record public.attendance; person public.people; answer public.attendance; v public.visits;
begin
 select * into v from public.visits where id=p_visit for update;
 perform private.check_edit(p_visit);
 if v.status='suspended' then raise exception 'La actividad está suspendida. Reactívala antes de registrar asistencia.'; end if;
 select * into person from public.people where id=p_person for share;
 if person.id is null or person.merged_into is not null or not private.can_person(person.class_id) then raise exception 'Participante no disponible.'; end if;
 if v.activity_type in ('escuela_dominical','servicio_domingo','reunion_mensual') and person.class_id<>v.class_id then raise exception 'Esta actividad registra solamente participantes de su clase.' using errcode='42501'; end if;
 if v.activity_type='reunion_encargados' and person.category not in ('Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas') then raise exception 'La reunión corresponde a encargados y ayudantes.'; end if;
 select * into old_record from public.attendance where visit_id=p_visit and person_id=p_person for update;
 if p_present and not person.active and not coalesce(old_record.present,false) then raise exception 'Reactiva a la persona antes de marcar una nueva asistencia.'; end if;
 if coalesce(old_record.version,0)<>p_version then raise exception 'Otro encargado modificó esta asistencia. Actualiza e inténtalo de nuevo.' using errcode='40001'; end if;
 if p_present is null then raise exception 'Indica el estado de asistencia.'; end if;
 insert into public.attendance(visit_id,person_id,present,class_id,category,version,updated_by)
 values(p_visit,p_person,p_present,coalesce(old_record.class_id,person.class_id),coalesce(old_record.category,person.category),p_version+1,auth.uid())
 on conflict(visit_id,person_id) do update set present=excluded.present,version=excluded.version,updated_by=excluded.updated_by,updated_at=now() returning * into answer;
 if p_present and v.status='pending' then update public.visits set status='held',version=version+1 where id=p_visit; end if;
 return answer;
end; $$;

-- Conserva la implementación de responsables; el envoltorio comprueba permisos.
alter function public.save_visit(jsonb,jsonb) rename to save_visit_legacy;
alter function public.save_visit_legacy(jsonb,jsonb) set schema private;
revoke all on function private.save_visit_legacy(jsonb,jsonb) from public,anon,authenticated;
create or replace function private.save_visit_legacy(p_values jsonb,p_assignments jsonb) returns public.visits language plpgsql security definer set search_path='' as $$
declare v public.visits; vid uuid; r text; pid uuid; assigned public.responsibilities;
begin
 -- Solo invocada desde save_visit tras comprobar permisos.
 vid:=coalesce((p_values->>'id')::uuid,gen_random_uuid());
 select * into v from public.visits where id=vid for update;
 if v.id is not null then
  if v.version<>coalesce((p_values->>'version')::integer,0) then raise exception 'La visita fue modificada por otro usuario. Actualiza antes de guardar.' using errcode='40001'; end if;
  update public.visits set date=(p_values->>'date')::date,class_id=(p_values->>'class_id')::uuid,"group"=p_values->>'group',notes=coalesce(p_values->>'notes',''),version=version+1 where id=vid returning * into v;
 else
  insert into public.visits(id,date,class_id,"group",notes) values(vid,(p_values->>'date')::date,(p_values->>'class_id')::uuid,p_values->>'group',coalesce(p_values->>'notes','')) returning * into v;
 end if;
 foreach r in array array['Predicación','Coordinación','Dirección del coro'] loop
  if p_assignments ? r then
   pid:=nullif(p_assignments->>r,'')::uuid;
   select * into assigned from public.responsibilities where visit_id=vid and role=r;
   if pid is null then
    if assigned.id is not null and (assigned.outcome<>'Pendiente' or assigned.actual_person_id is not null or assigned.note<>'') then raise exception 'No se puede quitar una función con resultado registrado. Conserva su historial.'; end if;
    delete from public.responsibilities where visit_id=vid and role=r;
   elsif assigned.id is null then
    if not exists(select 1 from public.people where id=pid and active and merged_into is null) then raise exception 'El responsable no está activo.'; end if;
    insert into public.responsibilities(visit_id,role,person_id,updated_by) values(vid,r,pid,auth.uid());
   elsif assigned.person_id<>pid then
    if assigned.outcome<>'Pendiente' or assigned.actual_person_id is not null or assigned.note<>'' then raise exception 'La función ya tiene resultado. Registra el reemplazo en quién realizó la función.'; end if;
    if not exists(select 1 from public.people where id=pid and active and merged_into is null) then raise exception 'El responsable no está activo.'; end if;
    update public.responsibilities set person_id=pid,version=version+1,updated_by=auth.uid(),updated_at=now() where id=assigned.id;
   end if;
  end if;
 end loop;
 return v;
end;
$$;

create function public.save_visit(p_values jsonb,p_assignments jsonb) returns public.visits language plpgsql security definer set search_path='' as $$
declare v public.visits; old_v public.visits; vid uuid; m text; c uuid; new_date date;
begin
 m:=coalesce(p_values->>'activity_type','visita'); c:=(p_values->>'class_id')::uuid; new_date:=(p_values->>'date')::date;
 if not private.can_activity(m,c,'manage') then raise exception 'No tienes permiso para programar esta actividad.' using errcode='42501'; end if;
 vid:=nullif(p_values->>'id','')::uuid;
 if vid is not null then
  select * into old_v from public.visits where id=vid for update;
  if old_v.id is null or not private.can_visit(vid,'manage') then raise exception 'Actividad no disponible.'; end if;
  if old_v.date <= (now() at time zone 'America/Santiago')::date then perform private.check_edit(vid); end if;
  if old_v.version<>coalesce((p_values->>'version')::integer,0) then raise exception 'La actividad fue modificada. Actualiza antes de guardar.' using errcode='40001'; end if;
  if m<>old_v.activity_type or c<>old_v.class_id or new_date<>old_v.date or p_values->>'group'<>old_v."group" then raise exception 'Fecha, clase, tipo y grupo no se cambian después de crear la actividad. Conserva el historial.'; end if;
 end if;
 if new_date < (now() at time zone 'America/Santiago')::date-21 and not private.is_admin() then raise exception 'Solo el administrador puede crear actividades de hace más de 21 días.'; end if;
 if m='visita' and not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','jefatura')) then raise exception 'Solo la administración central programa visitas.'; end if;
 if m='visita' then
  v:=private.save_visit_legacy(p_values,p_assignments);
 else
  if vid is null then
   insert into public.visits(date,class_id,"group",notes,activity_type,venue_class_id) values(new_date,c,case when m='visita' then p_values->>'group' else 'Todos' end,coalesce(p_values->>'notes',''),m,coalesce(nullif(p_values->>'venue_class_id','')::uuid,c)) returning * into v;
  else
   update public.visits set notes=coalesce(p_values->>'notes',''),venue_class_id=coalesce(nullif(p_values->>'venue_class_id','')::uuid,c),version=version+1 where id=vid returning * into v;
  end if;
 end if;
 return v;
end; $$;
-- Encargados registran visitas existentes; la programación central corresponde a admin/jefatura.
create function public.set_activity_status(p_id uuid,p_status text,p_reason text,p_venue uuid,p_version integer) returns public.visits language plpgsql security definer set search_path='' as $$
declare v public.visits;
begin
 select * into v from public.visits where id=p_id for update;
 perform private.check_edit(p_id);
 if v.version<>p_version then raise exception 'La actividad cambió. Actualiza antes de guardar.' using errcode='40001'; end if;
 if p_status not in ('pending','held','suspended') then raise exception 'Estado inválido.'; end if;
 if p_status in ('suspended','pending') and exists(select 1 from public.attendance where visit_id=p_id and present) then raise exception 'Hay asistentes registrados. Revisa las marcas antes de suspender o dejar pendiente.'; end if;
 if p_status='suspended' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'Indica por qué no hubo actividad.'; end if;
 update public.visits set status=p_status,suspension_reason=case when p_status='suspended' then p_reason else '' end,venue_class_id=coalesce(p_venue,class_id),version=version+1 where id=p_id returning * into v;
 return v;
end; $$;
create function public.ensure_sundays(p_from date,p_to date) returns integer language plpgsql security definer set search_path='' as $$
declare c public.classes; m text; d date; n integer:=0; inserted integer;
begin
 if not private.is_member() then raise exception 'Sin acceso.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>93 then raise exception 'Selecciona un período de hasta tres meses.'; end if;
 for c in select * from public.classes where active loop
  foreach m in array array['escuela_dominical','servicio_domingo'] loop
   if not private.can_activity(m,c.id,'manage') then continue; end if;
   for d in select x::date from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') x where extract(dow from x)=0 loop
    if not private.is_admin() and d<(now() at time zone 'America/Santiago')::date-21 then continue; end if;
    insert into public.visits(date,class_id,"group",activity_type,venue_class_id) values(d,c.id,'Todos',m,c.id) on conflict(date,class_id,"group",activity_type) do nothing;
    get diagnostics inserted=row_count; n:=n+inserted;
   end loop;
  end loop;
 end loop;
 return n;
end; $$;

-- Fotografías: reparar bucket existente y permisos; cada objeto pertenece a una persona.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('portraits','portraits',false,524288,array['image/webp','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=excluded.allowed_mime_types;
drop policy portraits_read on storage.objects;
drop policy portraits_insert on storage.objects;
drop policy portraits_delete on storage.objects;
create policy portraits_read on storage.objects for select to authenticated using(bucket_id='portraits' and exists(select 1 from public.people p where p.id::text=split_part(name,'/',1) and private.can_person(p.class_id)));
create policy portraits_insert on storage.objects for insert to authenticated with check(bucket_id='portraits' and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|jpg|png)$' and exists(select 1 from public.people p where p.id::text=split_part(name,'/',1) and p.merged_into is null and private.can_person(p.class_id,'photo')));
create policy portraits_delete on storage.objects for delete to authenticated using(bucket_id='portraits' and exists(select 1 from public.people p where p.id::text=split_part(name,'/',1) and private.can_person(p.class_id,'photo')) and not exists(select 1 from public.people p where p.photo_path=name));
create or replace function public.set_photo(p_person uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare p public.people;
begin
 select * into p from public.people where id=p_person for update;
 if p.id is null or p.merged_into is not null or not private.can_person(p.class_id,'photo') then raise exception 'No tienes permiso para modificar esta foto.' using errcode='42501'; end if;
 if split_part(p_path,'/',1)<>p_person::text or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|jpg|png)$' then raise exception 'Ruta de imagen inválida.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='portraits' and name=p_path) then raise exception 'La foto no se ha subido.'; end if;
 update public.people set photo_path=p_path where id=p_person;
end; $$;
revoke all on function private.can_activity(text,uuid,text),private.can_person(uuid,text),private.can_visit(uuid,text),private.guard_person_changes() from public,anon;
grant execute on function private.can_activity(text,uuid,text),private.can_person(uuid,text),private.can_visit(uuid,text) to authenticated;
revoke all on function public.save_visit(jsonb,jsonb),public.set_activity_status(uuid,text,text,uuid,integer),public.ensure_sundays(date,date) from public,anon;
grant execute on function public.save_visit(jsonb,jsonb),public.set_activity_status(uuid,text,text,uuid,integer),public.ensure_sundays(date,date) to authenticated;
grant all on public.activity_modules,public.account_permissions to service_role;
commit;
