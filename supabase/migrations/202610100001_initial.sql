-- Asistencia JUPA: esquema, permisos y operaciones atómicas.
-- Ejecutar una vez en un proyecto Supabase nuevo. No contiene personas ni credenciales.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 email text not null,
 role text not null default 'encargado' check(role in ('admin','encargado')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.classes (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 kind text not null default 'Clase' check(kind in ('Clase','Local','Templo matriz')),
 active boolean not null default true
);
create unique index classes_name_unique on public.classes(lower(trim(name)));
create table public.people (
 id uuid primary key default gen_random_uuid(),
 first_name text not null check(length(trim(first_name)) between 1 and 80),
 last_name text not null check(length(trim(last_name)) between 1 and 80),
 class_id uuid not null references public.classes(id),
 category text not null check(category in ('Joven','Señorita','Encargado de jóvenes','Encargada de señoritas','Ayudante de jóvenes','Ayudante de señoritas')),
 rut text unique,
 photo_path text,
 active boolean not null default true,
 merged_into uuid references public.people(id),
 created_at timestamptz not null default now(),
 check(merged_into is null or merged_into <> id)
);
create table public.visits (
 id uuid primary key default gen_random_uuid(),
 date date not null,
 class_id uuid not null references public.classes(id),
 "group" text not null check("group" in ('Jóvenes','Señoritas')),
 notes text not null default '' check(length(notes)<=1000),
 version integer not null default 1,
 created_at timestamptz not null default now(),
 unique(date,class_id,"group")
);
create table public.attendance (
 visit_id uuid not null references public.visits(id),
 person_id uuid not null references public.people(id),
 present boolean not null,
 class_id uuid not null references public.classes(id),
 category text not null,
 version integer not null default 1,
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 primary key(visit_id,person_id)
);
create table public.responsibilities (
 id uuid primary key default gen_random_uuid(),
 visit_id uuid not null references public.visits(id),
 role text not null check(role in ('Predicación','Coordinación','Dirección del coro')),
 person_id uuid not null references public.people(id),
 actual_person_id uuid references public.people(id),
 outcome text not null default 'Pendiente' check(outcome in ('Pendiente','Cumplió','Se excusó','No asistió','Asistió sin realizar la función')),
 note text not null default '' check(length(note)<=1000),
 version integer not null default 1,
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 unique(visit_id,role)
);
create table public.audit_log (
 id bigint generated always as identity primary key,
 actor uuid,
 action text not null,
 table_name text not null,
 record_id text,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index attendance_person on public.attendance(person_id,visit_id);
create index visits_date on public.visits(date);
create index people_class on public.people(class_id);
create index audit_time on public.audit_log(created_at desc);

create function private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role='admin');
$$;
create function private.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin if not private.is_admin() then raise exception 'Acceso reservado al administrador.' using errcode='42501'; end if; end;
$$;
create function private.check_edit(p_visit uuid) returns void language plpgsql security definer set search_path='' as $$
declare d date; local_day date := (now() at time zone 'America/Santiago')::date;
begin
 if not private.is_member() then raise exception 'No tienes acceso.' using errcode='42501'; end if;
 select date into d from public.visits where id=p_visit;
 if d is null then raise exception 'La visita no existe.'; end if;
 if private.is_admin() then return; end if;
 if d>local_day then raise exception 'La asistencia abre el día de la visita.' using errcode='42501'; end if;
 if local_day>d+21 then raise exception 'Han pasado más de 21 días. Solo el administrador puede modificar esta visita.' using errcode='42501'; end if;
end;
$$;
create function private.valid_rut(r text) returns boolean language plpgsql immutable set search_path='' as $$
declare s integer:=0; m integer:=2; i integer; d integer; expected text;
begin
 if r is null then return true; end if;
 if r !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
 for i in reverse length(r)-1..1 loop s:=s+substring(r from i for 1)::integer*m; m:=case when m=7 then 2 else m+1 end; end loop;
 d:=11-(s%11); expected:=case when d=11 then '0' when d=10 then 'K' else d::text end;
 return right(r,1)=expected;
end;
$$;
create function private.normalize_person() returns trigger language plpgsql set search_path='' as $$
begin
 new.first_name:=upper(regexp_replace(trim(new.first_name),'\s+',' ','g'));
 new.last_name:=upper(regexp_replace(trim(new.last_name),'\s+',' ','g'));
 new.rut:=nullif(upper(regexp_replace(coalesce(new.rut,''),'[.\s-]','','g')),'');
 if not private.valid_rut(new.rut) then raise exception 'El RUT no es válido.'; end if;
 if new.merged_into is not null and new.active then raise exception 'Un registro fusionado no puede reactivarse.'; end if;
 return new;
end;
$$;
create trigger normalize_person before insert or update on public.people for each row execute function private.normalize_person();
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb;
begin
 if TG_OP<>'INSERT' then old_row:=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then new_row:=to_jsonb(new); end if;
 insert into public.audit_log(actor,action,table_name,record_id,before_data,after_data)
 values(auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(new_row->>'id',old_row->>'id',concat(new_row->>'visit_id',':',new_row->>'person_id')),old_row,new_row);
 return coalesce(new,old);
end;
$$;
create trigger people_audit after insert or update or delete on public.people for each row execute function private.audit_change();
create trigger attendance_audit after insert or update or delete on public.attendance for each row execute function private.audit_change();
create trigger visits_audit after insert or update or delete on public.visits for each row execute function private.audit_change();
create trigger responsibilities_audit after insert or update or delete on public.responsibilities for each row execute function private.audit_change();
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function private.audit_change();
create trigger classes_audit after insert or update or delete on public.classes for each row execute function private.audit_change();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.people enable row level security;
alter table public.visits enable row level security;
alter table public.attendance enable row level security;
alter table public.responsibilities enable row level security;
alter table public.audit_log enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or private.is_admin());
create policy classes_read on public.classes for select to authenticated using (private.is_member());
create policy classes_insert on public.classes for insert to authenticated with check (private.is_admin());
create policy classes_update on public.classes for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy people_read on public.people for select to authenticated using (private.is_member());
create policy people_insert on public.people for insert to authenticated with check (private.is_member() and active and merged_into is null and photo_path is null);
create policy people_update on public.people for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy visits_read on public.visits for select to authenticated using (private.is_member());
create policy attendance_read on public.attendance for select to authenticated using (private.is_member());
create policy responsibilities_read on public.responsibilities for select to authenticated using (private.is_member());
create policy audit_read on public.audit_log for select to authenticated using (private.is_admin());

-- Operación atómica con versión esperada: evita escrituras perdidas y duplicados.
create function public.set_attendance(p_visit uuid,p_person uuid,p_present boolean,p_version integer)
returns public.attendance language plpgsql security definer set search_path='' as $$
declare old_record public.attendance; person public.people; answer public.attendance;
begin
 perform private.check_edit(p_visit);
 -- Bloqueo compartido con la fusión: no se crean nuevas marcas en una persona ya fusionada.
 select * into person from public.people where id=p_person for share;
 if person.id is null or person.merged_into is not null then raise exception 'El participante no está disponible.'; end if;
 perform pg_advisory_xact_lock(hashtext(p_visit::text),hashtext(p_person::text));
 select * into old_record from public.attendance where visit_id=p_visit and person_id=p_person for update;
 if coalesce(old_record.version,0)<>p_version then raise exception 'Otro encargado modificó esta asistencia. Actualiza e inténtalo de nuevo.' using errcode='40001'; end if;
 if p_present is null then raise exception 'Indica el estado de asistencia.'; end if;
 insert into public.attendance(visit_id,person_id,present,class_id,category,version,updated_by)
 values(p_visit,p_person,p_present,coalesce(old_record.class_id,person.class_id),coalesce(old_record.category,person.category),p_version+1,auth.uid())
 on conflict(visit_id,person_id) do update set present=excluded.present,version=excluded.version,updated_by=excluded.updated_by,updated_at=now()
 returning * into answer;
 return answer;
end;
$$;
create function public.save_visit(p_values jsonb,p_assignments jsonb) returns public.visits language plpgsql security definer set search_path='' as $$
declare v public.visits; vid uuid; r text; pid uuid; assigned public.responsibilities;
begin
 perform private.require_admin();
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
create function public.set_responsibility(p_id uuid,p_outcome text,p_actual uuid,p_note text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.responsibilities;
begin
 select * into r from public.responsibilities where id=p_id for update;
 if r.id is null then raise exception 'La función no existe.'; end if;
 perform private.check_edit(r.visit_id);
 if r.version<>p_version then raise exception 'Otro encargado modificó este resultado. Actualiza e inténtalo de nuevo.' using errcode='40001'; end if;
 if p_actual is not null and not exists(select 1 from public.people where id=p_actual and merged_into is null) then raise exception 'El reemplazo no está disponible.'; end if;
 update public.responsibilities set outcome=p_outcome,actual_person_id=p_actual,note=coalesce(p_note,''),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;
$$;
create function public.set_photo(p_person uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() then raise exception 'No tienes acceso.' using errcode='42501'; end if;
 if split_part(p_path,'/',1)<>p_person::text or p_path !~ '^[0-9a-f-]+/[0-9a-f-]+\.webp$' then raise exception 'Ruta de imagen inválida.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='portraits' and name=p_path) then raise exception 'La foto no se ha subido.'; end if;
 update public.people set photo_path=p_path where id=p_person and merged_into is null;
 if not found then raise exception 'El participante no existe.'; end if;
end;
$$;
create function public.merge_people(p_source uuid,p_target uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.people; t public.people;
begin
 perform private.require_admin();
 if p_source=p_target then raise exception 'Selecciona dos registros diferentes.'; end if;
 perform 1 from public.people where id in(p_source,p_target) order by id for update;
 select * into s from public.people where id=p_source;
 select * into t from public.people where id=p_target;
 if s.id is null or t.id is null or s.merged_into is not null or t.merged_into is not null or not t.active then raise exception 'Los registros no están disponibles para fusionar.'; end if;
 insert into public.attendance(visit_id,person_id,present,class_id,category,version,updated_by)
 select visit_id,p_target,present,class_id,category,version+1,auth.uid() from public.attendance where person_id=p_source
 on conflict(visit_id,person_id) do update set present=public.attendance.present or excluded.present,version=public.attendance.version+1,updated_by=auth.uid(),updated_at=now();
 delete from public.attendance where person_id=p_source;
 update public.responsibilities set person_id=p_target,version=version+1,updated_by=auth.uid() where person_id=p_source;
 update public.responsibilities set actual_person_id=p_target,version=version+1,updated_by=auth.uid() where actual_person_id=p_source;
 update public.people set active=false,merged_into=p_target,rut=null where id=p_source;
 update public.people set rut=coalesce(t.rut,s.rut),photo_path=coalesce(t.photo_path,s.photo_path) where id=p_target;
end;
$$;

revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.classes,public.people,public.visits,public.attendance,public.responsibilities,public.audit_log to authenticated;
grant insert(name,kind,active),update(name,kind,active) on public.classes to authenticated;
grant insert(first_name,last_name,class_id,category,rut,active),update(first_name,last_name,class_id,category,rut,active) on public.people to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(),private.is_admin(),private.valid_rut(text) to authenticated;
revoke all on function public.set_attendance(uuid,uuid,boolean,integer),public.save_visit(jsonb,jsonb),public.set_responsibility(uuid,text,uuid,text,integer),public.set_photo(uuid,text),public.merge_people(uuid,uuid) from public,anon;
grant execute on function public.set_attendance(uuid,uuid,boolean,integer),public.save_visit(jsonb,jsonb),public.set_responsibility(uuid,text,uuid,text,integer),public.set_photo(uuid,text),public.merge_people(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portraits','portraits',false,524288,array['image/webp']) on conflict(id) do nothing;
create policy portraits_read on storage.objects for select to authenticated using(bucket_id='portraits' and private.is_member());
create policy portraits_insert on storage.objects for insert to authenticated with check(bucket_id='portraits' and private.is_member() and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.webp$' and exists(select 1 from public.people p where p.id::text=split_part(name,'/',1) and p.merged_into is null));
create policy portraits_delete on storage.objects for delete to authenticated using(bucket_id='portraits' and private.is_member() and not exists(select 1 from public.people p where p.photo_path=name));
-- Los objetos se crean con nombre único; no se permite sobreescribir una fotografía ajena en uso.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.classes,public.people,public.visits,public.attendance,public.responsibilities;
 end if;
end $$;
