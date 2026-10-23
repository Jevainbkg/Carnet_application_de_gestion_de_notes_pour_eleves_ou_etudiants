-- Tests de la base : contraintes et isolation entre deux enseignants (A et B).
-- Chaque bloc lève une exception si le comportement attendu n'est pas observé.
\set ON_ERROR_STOP on
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

-- ---------- Enseignant A crée ses données ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into students (id, name, student_code) values ('11111111-0000-0000-0000-000000000001', 'Étudiant Démo 1', 'E001');
insert into subjects (id, name, coefficient) values
  ('22222222-0000-0000-0000-000000000001', 'Mathématiques', 1),
  ('22222222-0000-0000-0000-000000000002', 'Physique', 2);
insert into grades (student_id, subject_id, value) values
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 10),
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 16);

do $$
declare avg numeric;
begin
  select round(sum(g.value * s.coefficient) / sum(s.coefficient), 2) into avg
  from grades g join subjects s on s.id = g.subject_id;
  if avg <> 14 then raise exception 'FAIL moyenne attendue 14, obtenue %', avg; end if;
  raise notice 'PASS moyenne 10 (coef 1) + 16 (coef 2) = 14';
end $$;

-- Contraintes
do $$ begin
  begin insert into grades (student_id, subject_id, value) values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 21);
    raise exception 'FAIL note 21 acceptée'; exception when check_violation or unique_violation then null; end;
  begin update grades set value = 20.5; raise exception 'FAIL note 20.5 acceptée'; exception when check_violation then null; end;
  begin update grades set value = -1; raise exception 'FAIL note -1 acceptée'; exception when check_violation then null; end;
  raise notice 'PASS notes < 0 ou > 20 refusées';
  begin insert into subjects (name, coefficient) values ('Zéro', 0); raise exception 'FAIL coef 0 accepté'; exception when check_violation then null; end;
  begin insert into subjects (name, coefficient) values ('Négatif', -2); raise exception 'FAIL coef négatif accepté'; exception when check_violation then null; end;
  raise notice 'PASS coefficients <= 0 refusés';
  begin insert into grades (student_id, subject_id, value) values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 12);
    raise exception 'FAIL deuxième note pour le même couple acceptée'; exception when unique_violation then null; end;
  raise notice 'PASS unicité étudiant/matière';
  begin insert into students (name, student_code) values ('Doublon', 'E001'); raise exception 'FAIL code étudiant dupliqué accepté'; exception when unique_violation then null; end;
  raise notice 'PASS code étudiant unique par enseignant';
end $$;

-- ---------- Enseignant B ----------
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$
declare n int;
begin
  select count(*) into n from students; if n <> 0 then raise exception 'FAIL B voit % étudiant(s) de A', n; end if;
  select count(*) into n from subjects; if n <> 0 then raise exception 'FAIL B voit % matière(s) de A', n; end if;
  select count(*) into n from grades;   if n <> 0 then raise exception 'FAIL B voit % note(s) de A', n; end if;
  raise notice 'PASS B ne voit pas les données de A';

  update students set name = 'Piraté' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL B modifie un étudiant de A'; end if;
  update grades set value = 0;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL B modifie une note de A'; end if;
  delete from subjects;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL B supprime une matière de A'; end if;
  raise notice 'PASS B ne modifie ni ne supprime les données de A';

  begin insert into students (owner_id, name, student_code) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Intrus', 'X1');
    raise exception 'FAIL B crée un étudiant au nom de A'; exception when insufficient_privilege then null; end;
  begin insert into grades (student_id, subject_id, value) values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 5);
    raise exception 'FAIL B note un étudiant de A'; exception when insufficient_privilege or unique_violation then null; end;
  raise notice 'PASS B ne peut rien créer chez A';

  -- B crée sa propre matière et tente d'y noter l'étudiant de A
  insert into subjects (id, name, coefficient) values ('33333333-0000-0000-0000-000000000001', 'Matière B', 1);
  begin insert into grades (student_id, subject_id, value) values ('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 5);
    raise exception 'FAIL B note un étudiant de A dans sa matière'; exception when insufficient_privilege then null; end;
  -- B tente de transférer sa matière à A
  update subjects set owner_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = '33333333-0000-0000-0000-000000000001';
  select count(*) into n from subjects; if n <> 1 then raise exception 'FAIL owner_id modifiable'; end if;
  raise notice 'PASS liaisons croisées et changement de propriétaire bloqués';
end $$;

-- ---------- Anonyme ----------
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  begin perform 1 from students; raise exception 'FAIL anon lit students'; exception when insufficient_privilege then null; end;
  raise notice 'PASS accès anonyme refusé';
end $$;

-- ---------- Cascade ----------
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from students where id = '11111111-0000-0000-0000-000000000001';
do $$ declare n int; begin
  select count(*) into n from grades; if n <> 0 then raise exception 'FAIL notes orphelines'; end if;
  raise notice 'PASS suppression d''un étudiant supprime ses notes';
end $$;
