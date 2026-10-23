# Prompt d'exécution — Projet 07 « Gestion des notes des étudiants »

> Produit avec le skill `reprompt` à partir du cahier des charges « 10 cahiers des charges — parcours développeur junior » (édition du 23/10/2026, pages 14-15). Mode : FEATURE + ARCHITECTURE (création).

# RÔLE
Développeur front-end + Supabase. Tu livres une application pédagogique complète, testée et déployable gratuitement.

# CONTEXTE
Projet 7 d'un parcours de 10 projets (étudiant de 1re année). Premières données persistantes. Démonstration personnelle, sans usage commercial. Aucun nom réel d'étudiant : uniquement des données fictives.

# OBJECTIF
Permettre à un enseignant fictif d'enregistrer des étudiants, des matières et des notes, puis de calculer des moyennes pondérées fiables. Chaque enseignant n'accède qu'à ses propres données.

# SOURCE DE VÉRITÉ
Le cahier des charges (projet 07). Barème : fonctionnalités 8, fiabilité/validation/tests 4, qualité du code 3, responsive/ergonomie 2, README/GitHub/déploiement 3. Passage : ≥ 14/20, exigences critiques vérifiées, démo ouvrable sur un autre appareil. Un bonus ne compense pas une faille de sécurité.

# SKILLS À UTILISER
- `kev` (dérivé de `kimi`, qui sert de référence) — conduite d'ensemble, porte de livraison, registre des leçons (L17 secrets, L24 erreurs lisibles, L29 doubles soumissions, L35 pas de valeur par défaut inventée, L44 thèmes clair/sombre, L46 tests réels).
- `deploy` — uniquement à l'étape de déploiement Vercel, après accord explicite de l'utilisateur.
- Repli : si un skill est indisponible, appliquer ce prompt et le signaler.

# STACK (imposée)
HTML + CSS + JavaScript vanilla (modules ES, sans build) ; Supabase (Postgres + Auth) via `@supabase/supabase-js` chargé depuis un CDN en version épinglée ; hébergement Vercel (statique).

# FONCTIONNALITÉS OBLIGATOIRES
1. Ajouter, modifier, retirer un étudiant (avec confirmation de suppression).
2. Créer des matières avec coefficient entier strictement positif (modifier / supprimer aussi).
3. Saisir une note de 0 à 20 pour un couple étudiant/matière (une seule note par couple ; ressaisir = mettre à jour).
4. Afficher le relevé de notes d'un étudiant et sa moyenne pondérée.
5. Lister les étudiants, rechercher par nom, trier par moyenne (et par nom).
6. Compte enseignant via Supabase Auth (inscription, connexion, déconnexion) ; accès aux données restreint.
7. Afficher erreurs de validation et états de chargement / vide / erreur.

# ÉCRANS
Connexion ; Liste des étudiants ; Fiche étudiant (relevé) ; Matières ; Saisie des notes.

# DONNÉES
- `students(id, owner_id, name, student_code)` — code unique par enseignant.
- `subjects(id, owner_id, name, coefficient)` — coefficient entier > 0.
- `grades(id, student_id, subject_id, value)` — 0 ≤ value ≤ 20, unicité (student_id, subject_id), suppression en cascade.

# RÈGLES MÉTIER (déterministes)
- Moyenne = Σ(note × coefficient) / Σ(coefficients des matières **notées**).
- Si un étudiant n'a aucune note → moyenne « — » (non calculée), jamais 0. Au tri, ces étudiants sont placés en dernier.
- Une matière non notée n'apparaît pas comme 0 dans le relevé : elle est affichée « non notée ».
- Note < 0, > 20, vide ou non numérique → refusée côté interface **et** par contrainte SQL.
- Coefficient non entier ou ≤ 0 → refusé côté interface **et** par contrainte SQL.
- RLS activé sur les trois tables : un enseignant ne lit, crée, modifie ni ne supprime que ses lignes ; une note n'est acceptée que si l'étudiant **et** la matière lui appartiennent.
- Seule la clé `anon` (publique) est dans le navigateur ; jamais la clé `service_role`.

# TESTS
- Unitaires (node:test) : moyenne 10 (coef 1) + 16 (coef 2) = 14 ; aucune note → null ; validation note/coef ; tri.
- Base (Postgres local avec émulation de `auth.uid()`) : contraintes 0-20 et coefficient, unicité, isolation A/B (B ne voit, ne modifie, ne supprime rien de A ; B ne peut pas noter un étudiant de A).
- Manuel : parcours complet en 375 px et 1440 px, thème clair et sombre, clavier.

# CRITÈRES D'ACCEPTATION (PASS / FAIL)
- Notes 10 (coef 1) et 16 (coef 2) donnent 14,00.
- Notes < 0 ou > 20 refusées (interface et base).
- L'utilisateur B ne voit ni ne modifie les dossiers de A.
- Aucun secret dans le dépôt ; site en HTTPS accessible depuis un autre appareil.
- README : objectif, installation, utilisation, captures, limites.

# LIVRABLE
Dépôt GitHub public, application déployée sur Vercel, script SQL, tests, README, 3 captures (interface, fonction clé, mobile).

# HORS PÉRIMÈTRE
Bonus (export PDF, classes) seulement après validation des exigences obligatoires. Aucun déploiement ni création de projet externe sans accord de l'utilisateur.
