-- =====================================================================
-- Projet 07 — Gestion des notes des étudiants
-- Schéma Supabase (Postgres) : tables, contraintes, RLS.
-- À exécuter une fois dans Supabase > SQL Editor. Idempotent.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  student_code text not null check (char_length(btrim(student_code)) between 1 and 30),
  created_at   timestamptz not null default now(),
  constraint students_owner_code_key unique (owner_id, student_code)
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  coefficient integer not null check (coefficient between 1 and 100),
  created_at  timestamptz not null default now(),
  constraint subjects_owner_name_key unique (owner_id, name)
);

create table if not exists public.grades (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  value      numeric(4, 2) not null check (value >= 0 and value <= 20),
  updated_at timestamptz not null default now(),
  constraint grades_student_subject_key unique (student_id, subject_id)
);

create index if not exists students_owner_idx on public.students (owner_id);
create index if not exists subjects_owner_idx on public.subjects (owner_id);
create index if not exists grades_subject_idx on public.grades (subject_id);

-- owner_id ne peut pas être changé après création.
create or replace function public.keep_owner_id()
returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;

drop trigger if exists students_keep_owner on public.students;
create trigger students_keep_owner before update on public.students
  for each row execute function public.keep_owner_id();
drop trigger if exists subjects_keep_owner on public.subjects;
create trigger subjects_keep_owner before update on public.subjects
  for each row execute function public.keep_owner_id();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists grades_touch on public.grades;
create trigger grades_touch before update on public.grades
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security : chaque enseignant ne voit que ses données.
-- ---------------------------------------------------------------------
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.grades   enable row level security;

revoke all on public.students, public.subjects, public.grades from anon;
grant select, insert, update, delete on public.students, public.subjects, public.grades to authenticated;

drop policy if exists students_owner on public.students;
create policy students_owner on public.students
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists subjects_owner on public.subjects;
create policy subjects_owner on public.subjects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Une note est accessible si l'étudiant ET la matière appartiennent à l'enseignant.
drop policy if exists grades_owner on public.grades;
create policy grades_owner on public.grades
  for all to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.subjects m where m.id = subject_id and m.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.students s where s.id = student_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.subjects m where m.id = subject_id and m.owner_id = (select auth.uid()))
  );

-- =====================================================================
-- v1.1 — Espace élève / étudiant (lecture seule)
-- Migration additive et idempotente.
-- =====================================================================

-- Code d'accès lisible : XXXX-XXXX-XXXX (48 bits aléatoires ; gen_random_uuid est natif, sans extension).
create or replace function public.new_access_code()
returns text language sql volatile as $$
  select upper(regexp_replace(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), '(.{4})(.{4})(.{4})', '\1-\2-\3'))
$$;

alter table public.students add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.students add column if not exists access_code text;
update public.students set access_code = public.new_access_code() where access_code is null;
alter table public.students alter column access_code set default public.new_access_code();
alter table public.students alter column access_code set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'students_access_code_key') then
    alter table public.students add constraint students_access_code_key unique (access_code);
  end if;
end $$;
create index if not exists students_user_idx on public.students (user_id);

-- user_id et access_code ne s'écrivent que via les fonctions ci-dessous.
revoke insert, update on public.students from authenticated;
grant insert (id, name, student_code), update (name, student_code) on public.students to authenticated;

-- Vrai si le compte connecté est rattaché à au moins une fiche (compte élève).
create or replace function public.is_student()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students where user_id = auth.uid())
$$;

-- Un compte élève ne peut rien créer ni modifier côté enseignant.
drop policy if exists students_owner on public.students;
create policy students_owner on public.students
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not public.is_student());

drop policy if exists subjects_owner on public.subjects;
create policy subjects_owner on public.subjects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not public.is_student());

-- Lecture seule pour l'élève : sa fiche, ses notes, les matières de son enseignant.
drop policy if exists students_self_read on public.students;
create policy students_self_read on public.students
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists grades_self_read on public.grades;
create policy grades_self_read on public.grades
  for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));

drop policy if exists subjects_self_read on public.subjects;
create policy subjects_self_read on public.subjects
  for select to authenticated
  using (owner_id in (select s.owner_id from public.students s where s.user_id = (select auth.uid())));

-- Rattacher son compte à une fiche grâce au code donné par l'enseignant.
create or replace function public.claim_student(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if exists (select 1 from public.students where owner_id = v_uid)
     or exists (select 1 from public.subjects where owner_id = v_uid) then
    raise exception 'Ce compte est un compte enseignant : créez un compte séparé pour l''élève.' using errcode = 'P0001';
  end if;
  update public.students
     set user_id = v_uid
   where access_code = upper(btrim(p_code)) and user_id is null
  returning id into v_id;
  if v_id is null then
    raise exception 'Code invalide ou déjà utilisé.' using errcode = 'P0002';
  end if;
  return v_id;
end $$;

-- Révoquer l'accès d'un élève : délie le compte et génère un nouveau code.
create or replace function public.reset_student_access(p_student uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  update public.students
     set user_id = null, access_code = public.new_access_code()
   where id = p_student and owner_id = auth.uid()
  returning access_code into v_code;
  if v_code is null then
    raise exception 'Fiche introuvable.' using errcode = 'P0002';
  end if;
  return v_code;
end $$;

revoke all on function public.claim_student(text), public.reset_student_access(uuid), public.is_student() from public, anon;
grant execute on function public.claim_student(text), public.reset_student_access(uuid), public.is_student() to authenticated;
