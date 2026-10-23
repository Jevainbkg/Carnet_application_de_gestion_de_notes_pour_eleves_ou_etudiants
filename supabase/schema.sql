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
