# Cahier des charges — Projet 07 « Carnet » : gestion des notes

**Version 1.1 — 23/10/2026** · cahier des charges propre au projet Carnet

| Version | Changement |
|---|---|
| 1.0 | Application enseignant : apprenants, matières, notes, moyennes, isolation entre enseignants. |
| 1.1 | Ajout de l'**espace élève / étudiant** : consultation de ses propres notes, en lecture seule (section 3 bis). |

| Niveau | 7 / Premières données persistantes | Durée indicative | 1 à 2 semaines |
|---|---|---|---|
| **Technologies** | HTML + CSS + JavaScript + Supabase (Postgres) | **Déploiement** | Vercel (interface) + Supabase (base) |

## 1. Objectif du projet
Permettre à un enseignant ou à un formateur d'enregistrer ses apprenants, ses matières et ses notes, puis de calculer des moyennes pondérées fiables.

## 2. Utilisateurs cibles et contexte
- **Utilisateur** : enseignant de collège ou de lycée, enseignant du supérieur, formateur en centre de formation, professeur particulier ou de soutien scolaire.
- **Apprenants concernés** : élèves (secondaire) ou étudiants (supérieur, formation).
- **Contexte** : démonstration personnelle ; aucun nom réel d'apprenant ; données fictives uniquement.
- **Besoin commun** : noter sur 20 avec des coefficients, consulter un relevé et une moyenne fiables, sans partager ses données avec d'autres enseignants.

## 3. Fonctionnalités obligatoires
- Ajouter, modifier et retirer un apprenant (élève ou étudiant).
- Créer des matières avec un coefficient entier positif.
- Saisir une note de 0 à 20 pour un apprenant et une matière.
- Afficher le relevé de notes et la moyenne pondérée.
- Lister les apprenants, rechercher par nom et trier par moyenne.
- Ajouter un compte enseignant via Supabase Auth et restreindre l'accès aux données.
- Afficher les erreurs de validation et les états de chargement.
- Vocabulaire de l'interface adaptable au public (« élève » / « étudiant ») en un seul réglage.

## 3 bis. Espace élève / étudiant (v1.1)
- Chaque fiche reçoit un **code d'accès** unique (format `XXXX-XXXX-XXXX`), affiché à l'enseignant sur la fiche.
- L'élève crée un compte (« Je suis élève ou étudiant »), saisit le code : son compte est rattaché à sa fiche. Un code ne sert qu'une fois.
- L'élève voit **uniquement** sa fiche, ses notes, sa moyenne et les matières de son enseignant ; il peut imprimer son relevé.
- L'élève ne peut **rien** créer, modifier ni supprimer (garanti par la base, pas seulement par l'interface).
- L'enseignant voit si l'accès est « rattaché » ou « en attente » et peut **révoquer** l'accès (nouveau code, l'ancien compte ne voit plus rien).
- Un compte enseignant qui possède des données ne peut pas se rattacher à une fiche. Un élève peut saisir les codes de plusieurs enseignants.

## 4. Pages / écrans attendus
Connexion (avec choix enseignant / élève) ; Liste des apprenants ; Fiche apprenant (relevé + code d'accès) ; Matières ; Saisie des notes ; **Mes notes** (élève) ; **Saisir un code** (élève).

## 5. Données et structure
Tables : `students(id, owner_id, name, student_code, user_id, access_code)`, `subjects(id, owner_id, name, coefficient)`, `grades(id, student_id, subject_id, value)`. Relations et contrainte d'unicité apprenant/matière. Les noms techniques restent en anglais quel que soit le public.

## 6. Règles métier et contraintes
- Moyenne = somme(note × coefficient) / somme(coefficients des matières notées).
- Une matière non notée ne doit pas être assimilée silencieusement à zéro.
- Activer Row Level Security (RLS) : chaque enseignant voit uniquement ses données.
- Ne jamais mettre de clé `service_role` Supabase dans le navigateur.

## 7. Plan de réalisation conseillé
1. Créer la maquette et le schéma SQL.
2. Configurer Supabase Auth, relations et politiques RLS.
3. Construire les formulaires CRUD et le calcul des moyennes.
4. Ajouter listes, recherche et états d'erreur.
5. Déployer sur Vercel et tester l'isolation entre deux comptes.

## 8. Recette : tests d'acceptation
- Notes 10 (coef. 1) et 16 (coef. 2) donnent une moyenne de 14.
- Notes < 0 ou > 20 refusées.
- Un élève rattaché à la fiche ci-dessus voit la moyenne 14 ; il ne voit pas les autres élèves et ne peut modifier aucune note.
- Après révocation par l'enseignant, l'élève ne voit plus rien et l'ancien code est refusé.
- L'utilisateur B ne voit ni ne modifie les dossiers de A.
- En passant le vocabulaire à « élèves », tous les libellés de l'interface changent sans modification du code ni de la base.

## 9. Bonus facultatifs
- Exporter un relevé imprimable en PDF depuis le navigateur.
- Ajouter des groupes ou des classes.

## 10. Livrables et critères de validation
- Dépôt GitHub nommé clairement (`gestion-notes-etudiants`), avec commits significatifs et README (objectif, installation, utilisation, captures, limites).
- Lien HTTPS du site réellement accessible ; aucune clé secrète publiée dans le dépôt.
- Au moins trois captures d'écran : interface principale, fonctionnalité clé, affichage mobile.
- Petite démonstration de 2 à 5 minutes et checklist de tests signée par le mentor.

Barème inchangé (sur 20) : fonctionnalités 8 · fiabilité, validation et tests 4 · qualité du code 3 · responsive et ergonomie 2 · README, GitHub et déploiement 3.
