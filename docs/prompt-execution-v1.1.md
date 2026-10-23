# Prompt d'exécution — Carnet v1.1 « Espace élève / étudiant »

> Produit avec le skill `reprompt` (mode FEATURE, projet existant). Complète [prompt-execution.md](prompt-execution.md) (v1.0), qui reste valable pour tout ce qui n'est pas modifié ici.

# RÔLE
Développeur front-end + Supabase. Tu ajoutes une fonctionnalité à une application existante, testée et sur le point d'être déployée.

# CONTEXTE
Carnet (v1.0) permet à un enseignant de gérer élèves ou étudiants, matières et notes, avec isolation stricte entre enseignants (RLS). Les élèves n'ont aujourd'hui aucun accès : ce sont des fiches.

# OBJECTIF
Permettre à un élève ou étudiant de se connecter et de **consulter ses propres notes et sa moyenne, en lecture seule**.

# SOURCE DE VÉRITÉ
[cahier-des-charges.md](cahier-des-charges.md) section 3 bis (v1.1) ; code existant : `supabase/schema.sql`, `app/js/*.js`, tests `tests/`.

# SKILLS À UTILISER
- `kev` (dérivé de `kimi`) : porte de livraison, leçons L17 (secrets), L26 (un gestionnaire d'action n'échoue jamais en silence), L29 (double soumission), L44 (thèmes), L46 (tests réels), L49 (fonctionnalité réversible, décision datée).
- Repli : appliquer ce prompt et signaler l'absence.

# INSPECTER D'ABORD
Lire `schema.sql` (politiques existantes), `api.js`, `app.js` (routeur, `viewStudent`), `tests/db/rls.test.sql`, `tests/e2e/fake-supabase.js`. Réutiliser le rendu du relevé existant au lieu de le dupliquer.

# À CONSERVER (non-régression)
- Toutes les règles v1.0 : calcul de moyenne, validations, contraintes, isolation entre enseignants.
- Les 11 tests base, 10 tests unitaires et 14 tests interface existants doivent rester verts.
- Aucun changement des colonnes existantes ; migration additive et idempotente.

# À AJOUTER
1. **Liaison par code d'accès** : chaque fiche reçoit un code unique (format `XXXX-XXXX-XXXX`), visible par l'enseignant sur la fiche.
2. **Rattachement** : un élève crée un compte, saisit le code → la fiche est liée à son compte (`students.user_id`). Un code ne sert qu'une fois.
3. **Lecture seule** : un compte élève lié voit uniquement sa ou ses fiches, leurs notes et les matières de l'enseignant concerné. Il ne peut rien créer, modifier ni supprimer.
4. **Réinitialisation** : l'enseignant peut révoquer l'accès (délie le compte et génère un nouveau code).
5. **Interface** : à l'inscription, choix « Enseignant » / « Élève ou étudiant ». Mode élève : un seul écran « Mes notes » (relevé + moyenne + impression). Écran « Rejoindre » pour saisir un code.

# RÈGLES DÉTERMINISTES
- SI le compte est lié à au moins une fiche → mode élève ; SINON → mode enseignant.
- SI un compte qui possède déjà des étudiants ou des matières tente de rattacher un code → refus (« compte enseignant »).
- SI le code est inconnu ou déjà utilisé → refus avec message clair ; aucune information sur l'existence de la fiche.
- SI l'enseignant tente d'écrire `user_id` directement → refus (droits de colonne) ; seules les fonctions `claim_student` et `reset_student_access` le modifient.
- Le rôle choisi à l'inscription n'est qu'une préférence d'affichage : **la sécurité repose uniquement sur la base**.

# TESTS
- Base : élève S rattaché à une fiche de A → voit sa fiche, ses notes, les matières de A ; ne voit pas les autres fiches de A ; ne peut ni écrire ni supprimer ; code réutilisé refusé ; enseignant avec données refusé ; B ne peut pas réinitialiser une fiche de A ; écriture directe de `user_id` refusée ; après réinitialisation, S ne voit plus rien.
- Interface : parcours enseignant → code ; inscription élève → code → « Mes notes » affiche 14,00 ; élève sans navigation enseignant ; mobile sans débordement.

# CRITÈRES D'ACCEPTATION (PASS / FAIL)
- Un élève rattaché voit sa moyenne de 14,00 (notes 10 coef 1, 16 coef 2).
- Un élève ne voit aucune donnée d'un autre élève, même du même enseignant.
- Un élève ne peut modifier aucune note (refus par la base).
- Tous les tests v1.0 restent verts.

# LIVRAISON
Branche dédiée + pull request vers `main`, avec résultats des tests. Aucun déploiement sans accord.
