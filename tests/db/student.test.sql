-- v1.1 : espace élève en lecture seule. À exécuter après rls.test.sql (même base).
\set ON_ERROR_STOP on
reset role;
insert into auth.users values
  ('cccccccc-0000-0000-0000-000000000003'),  -- élève S
  ('dddddddd-0000-0000-0000-000000000004');  -- élève T

-- ---------- A prépare deux fiches et des notes ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into students (id, name, student_code) values
  ('44444444-0000-0000-0000-000000000001', 'Élève Démo S', 'S001'),
  ('44444444-0000-0000-0000-000000000002', 'Élève Démo Autre', 'S002');
insert into grades (student_id, subject_id, value) values
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 10),
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 16),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 4);

do $$ declare c text; begin
  select access_code into c from students where id = '44444444-0000-0000-0000-000000000001';
  if c !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then raise exception 'FAIL format du code : %', c; end if;
  raise notice 'PASS code d''accès généré (format XXXX-XXXX-XXXX)';
  begin update students set user_id = 'cccccccc-0000-0000-0000-000000000003' where id = '44444444-0000-0000-0000-000000000001';
    raise exception 'FAIL l''enseignant écrit user_id directement'; exception when insufficient_privilege then null; end;
  begin update students set access_code = 'AAAA-AAAA-AAAA'; raise exception 'FAIL l''enseignant choisit le code'; exception when insufficient_privilege then null; end;
  raise notice 'PASS user_id et access_code non modifiables directement';
  begin perform claim_student(c); raise exception 'FAIL un compte enseignant se rattache'; exception when sqlstate 'P0001' then null; end;
  raise notice 'PASS compte enseignant refusé au rattachement';
end $$;
select set_config('test.code_s', (select access_code from students where id = '44444444-0000-0000-0000-000000000001'), false);
select set_config('test.code_o', (select access_code from students where id = '44444444-0000-0000-0000-000000000002'), false);

-- ---------- Élève S se rattache ----------
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
do $$ declare n int; v numeric; begin
  begin perform claim_student('0000-0000-0000'); raise exception 'FAIL code inconnu accepté'; exception when sqlstate 'P0002' then null; end;
  raise notice 'PASS code inconnu refusé';
  if claim_student(lower(current_setting('test.code_s'))) <> '44444444-0000-0000-0000-000000000001' then raise exception 'FAIL rattachement'; end if;
  raise notice 'PASS rattachement par code (insensible à la casse)';

  select count(*) into n from students; if n <> 1 then raise exception 'FAIL S voit % fiches', n; end if;
  select count(*) into n from grades;   if n <> 2 then raise exception 'FAIL S voit % notes', n; end if;
  select count(*) into n from subjects; if n <> 2 then raise exception 'FAIL S voit % matières', n; end if;
  select round(sum(g.value * m.coefficient) / sum(m.coefficient), 2) into v from grades g join subjects m on m.id = g.subject_id;
  if v <> 14 then raise exception 'FAIL moyenne élève %', v; end if;
  raise notice 'PASS S voit uniquement sa fiche, ses 2 notes, les matières de A ; moyenne 14';

  update grades set value = 20; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL S modifie ses notes'; end if;
  update students set name = 'X'; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL S modifie sa fiche'; end if;
  delete from grades; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL S supprime ses notes'; end if;
  update subjects set coefficient = 9; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL S modifie une matière'; end if;
  begin insert into grades (student_id, subject_id, value) values ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 20);
    raise exception 'FAIL S ajoute une note'; exception when insufficient_privilege then null; end;
  begin insert into students (name, student_code) values ('Fiche S', 'Z1'); raise exception 'FAIL S crée une fiche'; exception when insufficient_privilege then null; end;
  begin insert into subjects (name, coefficient) values ('Matière S', 1); raise exception 'FAIL S crée une matière'; exception when insufficient_privilege then null; end;
  raise notice 'PASS S en lecture seule (aucune écriture possible)';
  begin perform reset_student_access('44444444-0000-0000-0000-000000000002'); raise exception 'FAIL S réinitialise une fiche'; exception when sqlstate 'P0002' then null; end;
  raise notice 'PASS S ne peut pas réinitialiser une fiche';
end $$;

-- ---------- Élève T tente de réutiliser le code de S ----------
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
do $$ declare n int; begin
  begin perform claim_student(current_setting('test.code_s')); raise exception 'FAIL code réutilisé'; exception when sqlstate 'P0002' then null; end;
  select count(*) into n from grades; if n <> 0 then raise exception 'FAIL T voit des notes'; end if;
  raise notice 'PASS code déjà utilisé refusé, T ne voit rien';
end $$;

-- ---------- B ne peut pas révoquer l'accès d'une fiche de A ----------
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$ begin
  begin perform reset_student_access('44444444-0000-0000-0000-000000000001'); raise exception 'FAIL B réinitialise une fiche de A'; exception when sqlstate 'P0002' then null; end;
  raise notice 'PASS B ne peut pas révoquer un accès chez A';
end $$;

-- ---------- A révoque l'accès de S ----------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare c text; begin
  c := reset_student_access('44444444-0000-0000-0000-000000000001');
  if c = current_setting('test.code_s') then raise exception 'FAIL code non renouvelé'; end if;
  raise notice 'PASS révocation : nouveau code généré';
end $$;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
do $$ declare n int; begin
  select count(*) into n from grades; if n <> 0 then raise exception 'FAIL S voit encore % notes', n; end if;
  raise notice 'PASS après révocation, S ne voit plus rien';
end $$;

-- ---------- Non-régression : A continue d'écrire normalement ----------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare n int; begin
  update students set name = 'Élève Démo S (modifié)' where id = '44444444-0000-0000-0000-000000000001';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL A ne peut plus modifier sa fiche'; end if;
  insert into subjects (name, coefficient) values ('Anglais', 1);
  raise notice 'PASS l''enseignant écrit toujours normalement';
end $$;
