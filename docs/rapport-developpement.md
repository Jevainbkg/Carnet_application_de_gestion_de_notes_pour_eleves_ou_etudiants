# Rapport de développement — Carnet

**Projet** : gestion-notes-etudiants · **Date** : 23/10/2026 · **Version** : 1.1.0
**Source de vérité** : [cahier des charges](cahier-des-charges.md).

## 1. Objectif
Permettre à un enseignant ou à un formateur (secondaire, supérieur, formation) d'enregistrer des élèves ou des étudiants, des matières et des notes, puis de calculer des moyennes pondérées fiables, chaque enseignant ne voyant que ses propres données.

## 2. Démarche
1. **Cadrage** : le cahier des charges a été transformé en prompt d'exécution précis ([prompt-execution.md](prompt-execution.md)), qui fixe les règles, les tests et les critères d'acceptation.
2. **Données et sécurité d'abord** : schéma SQL, contraintes et politiques RLS, testés avant d'écrire l'interface.
3. **Règles métier isolées** : calcul, validation et tri dans un module pur (`app/js/calc.js`), testé à part.
4. **Interface** : écrans en JavaScript vanilla, sans build, mobile d'abord.
5. **Vérification** : tests unitaires, tests de base de données, test d'interface dans un navigateur réel.

## 3. Choix techniques
| Décision | Raison | Alternative écartée |
|---|---|---|
| HTML/CSS/JS sans framework ni build | Imposé par le cahier des charges ; aucun outil à installer | React (prévu pour les projets suivants) |
| Supabase (Postgres + Auth) | Données relationnelles, RLS natif, imposé pour les projets 7 à 10 | Firebase : NoSQL, jointures et cascades à recoder |
| `supabase-js` 2.45.4 via CDN, version épinglée | Pas de build ; version figée = comportement reproductible | Version flottante (`@2`) |
| Sécurité dans la base (RLS), pas seulement dans l'interface | Le navigateur n'est pas une frontière de confiance | Filtrer côté client uniquement |
| Calculs côté client | Volume de démonstration faible ; logique testable | Vue SQL (envisageable pour des milliers d'étudiants) |
| Validation en double (interface + contraintes SQL) | Message clair pour l'utilisateur, et garantie en base | Une seule couche |

## 4. Architecture
```
Navigateur (Vercel, statique)
  index.html ── app.js (écrans, routeur #/…)
                 ├─ calc.js  (règles pures : moyenne, validation, tri, messages)
                 └─ api.js   (requêtes Supabase)
                        │ HTTPS + clé anon publique + jeton de session
                        ▼
Supabase : Auth (comptes enseignants) + Postgres (RLS)
  students(owner_id) · subjects(owner_id) · grades(student_id, subject_id)
```

## 5. Modèle de données
| Table | Colonnes | Contraintes |
|---|---|---|
| students | id, owner_id, name, student_code | nom 1-100 car. ; code unique par enseignant |
| subjects | id, owner_id, name, coefficient | coefficient entier 1-100 ; nom unique par enseignant |
| grades | id, student_id, subject_id, value | 0 ≤ value ≤ 20 (2 décimales) ; unique (étudiant, matière) ; cascade |

**RLS** : `owner_id = auth.uid()` pour students et subjects ; pour grades, l'étudiant **et** la matière doivent appartenir à l'enseignant. `owner_id` est rempli automatiquement et ne peut pas être modifié (déclencheur). Le rôle anonyme n'a aucun droit.

## 6. Règles métier
- Moyenne = Σ(note × coefficient) ÷ Σ(coefficients des matières **notées**), arrondie à 2 décimales.
- Une matière non notée n'est jamais comptée comme 0 ; un étudiant sans note n'a pas de moyenne (« — ») et apparaît en dernier dans le tri.
- Une seule note par couple étudiant/matière : ressaisir remplace la note.
- Supprimer un étudiant ou une matière supprime ses notes (avec confirmation).

## 7. Conformité au cahier des charges
| Exigence | Statut | Preuve |
|---|---|---|
| Ajouter / modifier / retirer un étudiant | ✅ | Test UI « ajout », « modification », « suppression » |
| Matières, coefficient entier positif | ✅ | Test UI + contrainte SQL (test base) |
| Note de 0 à 20 | ✅ | Tests unitaires, UI (−1 et 21 refusées), base |
| Relevé + moyenne pondérée | ✅ | Relevé : 14,00 (test UI) |
| Liste, recherche, tri par moyenne | ✅ | Tests unitaires + UI |
| Compte enseignant + accès restreint | ✅ | Test base : isolation A/B (5 vérifications) |
| Erreurs de validation et états de chargement | ✅ | États chargement / vide / erreur / réessayer sur chaque écran |
| Écrans : connexion, liste, fiche, matières, saisie | ✅ | Captures `docs/captures/` |
| Pas de clé service_role dans le navigateur | ✅ | Seule la clé anon est prévue (`config.js`) |
| Bonus : relevé imprimable PDF | ✅ | Bouton « Imprimer / PDF » |
| Vocabulaire adaptable (élève / étudiant) | ✅ | `app/js/labels.js`, un seul réglage |
| v1.1 : espace élève en lecture seule | ✅ | Tests base 13 vérifications + tests UI 6 parcours |
| Bonus : groupes / classes | ❌ | Non réalisé |
| Déploiement HTTPS et test sur un autre appareil | ⏳ | Voir [rapport-deploiement.md](rapport-deploiement.md) |

## 7 bis. Évolution v1.1 — espace élève / étudiant
Demande : permettre aux élèves ou étudiants de consulter leurs notes. Prompt : [prompt-execution-v1.1.md](prompt-execution-v1.1.md).

| Décision | Raison | Alternative écartée |
|---|---|---|
| Rattachement par **code d'accès** à usage unique | Aucun e-mail d'élève à collecter ; pas besoin de clé `service_role` ; l'enseignant contrôle qui accède | Invitation par e-mail (nécessite une fonction serveur avec clé secrète) |
| Mode élève **déduit des données** (fiche rattachée), pas d'un rôle déclaré | Le choix à l'inscription ne peut pas servir à usurper un rôle ; la base fait foi | Colonne `role` modifiable |
| Écriture de `user_id` / `access_code` seulement via `claim_student` et `reset_student_access` (droits par colonne) | Un enseignant ne peut pas rattacher de force un compte arbitraire ; un élève ne peut pas choisir sa fiche | Laisser la colonne modifiable et filtrer dans l'interface |
| Politiques de **lecture** séparées, écriture refusée aux comptes élèves (`is_student()`) | Lecture seule garantie côté serveur | Masquer simplement les boutons |
| Migration additive et idempotente | Les bases déjà créées en v1.0 se mettent à jour en relançant `schema.sql` (testé sur une base v1.0 avec données) | Recréer les tables |

Correctif découvert pendant les tests : un écran dont les données arrivaient après une déconnexion pouvait s'afficher par-dessus l'écran de connexion. Chaque navigation porte désormais un numéro ; un écran quitté n'affiche plus rien.

## 8. Tests
| Suite | Commande | Résultat |
|---|---|---|
| Règles métier (node:test) | `npm test` | **11/11 PASS** |
| Base (Postgres 16, émulation `auth.uid()`) | `npm run test:db` | **24/24 PASS** (dont 13 espace élève) |
| Interface (Chromium, faux Supabase en mémoire) | `npm run test:ui` | **20/20 PASS** (dont 6 espace élève) |

Le test d'interface utilise un faux Supabase. La sécurité réelle est prouvée par le test de base. Il reste à la confirmer en ligne (recette du rapport de déploiement).

## 9. Accessibilité et responsive
- Un seul H1 par écran, libellés associés aux champs, erreurs liées aux champs (`aria-invalid`), lien d'évitement, focus visible, annonces `aria-live`.
- Mobile d'abord : tableaux transformés en cartes sous 768 px ; aucun défilement horizontal à 375 px (vérifié automatiquement).
- Thèmes clair et sombre (vérifiés), animations désactivées si `prefers-reduced-motion`.

## 10. Difficultés rencontrées
| Problème | Cause | Solution |
|---|---|---|
| Test de tri en échec intermittent | Le test lisait le tableau de l'écran précédent pendant la transition | Sélecteur ciblé sur la liste des étudiants et attente explicite |
| Script de test SQL non relançable | Les rôles Postgres sont globaux au serveur | Création conditionnelle des rôles |
| Lignes décoratives du relevé mal alignées | Fond rayé indépendant de la hauteur des lignes | Remplacé par une marge colorée |

## 11. Limites et pistes
- Tri et recherche dans le navigateur : adapté à quelques centaines d'étudiants.
- Pistes : vue SQL des moyennes, gestion des classes, export CSV, tests de bout en bout contre un vrai projet Supabase de test.
