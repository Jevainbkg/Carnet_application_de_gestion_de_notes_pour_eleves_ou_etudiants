# Déploiement — Carnet de notes (Supabase + Vercel)

Légende : 👤 = toi · 🤖 = moi

## Étape 1 — Dépôt GitHub (5 min)
1. 👤 Sur github.com : **New repository** → nom `gestion-notes-etudiants` → **Public** → ne coche rien (ni README, ni .gitignore) → **Create**.
2. 👤 Ajoute ce dépôt au projet Claude (Paramètres du projet → Ressources), ou envoie-moi son URL.
3. 🤖 Je pousse le code (2 commits déjà prêts) et je vérifie qu'aucun secret n'est publié.

## Étape 2 — Base Supabase (10 min)
1. 👤 [supabase.com](https://supabase.com) → **New project** → nom `gestion-notes`, région proche (ex. *Europe West*), mot de passe de base fort (garde-le pour toi, ne me l'envoie pas).
2. 👤 Menu **SQL Editor** → **New query** → colle tout `supabase/schema.sql` → **Run**. Attendu : « Success. No rows returned ».
3. 👤 Menu **Table Editor** : vérifie que `students`, `subjects`, `grades` existent avec le badge **RLS enabled**.
4. 👤 **Project Settings → API** : copie **Project URL** et la clé **anon / publishable**. Envoie-les-moi.
   ⚠️ Jamais la clé `service_role` / `secret`.

## Étape 3 — Configuration (🤖, 2 min)
1. 🤖 Je renseigne `app/js/config.js` avec l'URL et la clé anon, puis je pousse.

## Étape 4 — Vercel (5 min)
1. 👤 [vercel.com](https://vercel.com) → connexion avec GitHub → **Add New → Project** → importe `gestion-notes-etudiants`.
2. 👤 Framework Preset : **Other**. Ne touche à rien d'autre (`vercel.json` publie le dossier `app/`). → **Deploy**.
3. 👤 Envoie-moi l'URL obtenue (ex. `https://gestion-notes-etudiants.vercel.app`).

## Étape 5 — Relier l'authentification (3 min)
1. 👤 Supabase → **Authentication → URL Configuration** :
   - *Site URL* : l'URL Vercel
   - *Redirect URLs* : l'URL Vercel + `http://localhost:3000`
2. 👤 Option démo : **Authentication → Providers → Email** → désactive « Confirm email » pour créer les comptes de test sans e-mail. (Sinon, l'envoi d'e-mails gratuit est limité à quelques messages par heure.)

## Étape 6 — Recette en ligne (🤖 + 👤, 15 min)
| Test | Attendu |
|---|---|
| Compte A : matières Maths coef 1, Physique coef 2 ; notes 10 et 16 | Moyenne **14,00** |
| Saisir −1 puis 21 | Refusées avec message |
| Compte B (autre e-mail) | Ne voit aucune donnée de A |
| Ouvrir l'URL sur ton téléphone | Site en HTTPS, lisible, sans défilement horizontal |
| Recharger la page connecté | Session conservée |

🤖 Je mets à jour le README (lien de démo, cases cochées) et je fais la revue finale.

## Retour arrière
- Site : Vercel → *Deployments* → **Promote** un déploiement précédent.
- Base : relancer `schema.sql` est sans risque (idempotent) ; il ne supprime aucune donnée.

## À savoir
- Supabase Free se met en pause après ~7 jours d'inactivité : ouvre le tableau de bord avant ta démo pour le réveiller.
- Vercel Hobby : usage personnel non commercial uniquement (c'est le cas ici).
