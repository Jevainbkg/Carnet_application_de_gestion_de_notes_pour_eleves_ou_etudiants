# Rapport de déploiement — Carnet (projet 07)

**Projet** : gestion-notes-etudiants · **Statut** : ⏳ en cours · **Dernière mise à jour** : 23/10/2026

> Ce rapport est complété à chaque étape. La procédure pas à pas est dans [deploiement.md](deploiement.md).

## 1. Cible
| Élément | Service | Offre | URL |
|---|---|---|---|
| Code source | GitHub (public) | Gratuit | https://github.com/Jevainbkg/Carnet_application_de_gestion_de_notes_pour_eleves_ou_etudiants |
| Base + authentification | Supabase | Free | https://znfqibgagcfuxkculkfv.supabase.co |
| Site | Vercel | Hobby (personnel, non commercial) | https://carnet-notes-rho.vercel.app |

## 2. Contrôles avant déploiement
| Contrôle | Résultat |
|---|---|
| Tests unitaires (`npm test`) | ✅ 11/11 |
| Tests base (`npm run test:db`) | ✅ 24/24 |
| Tests interface (`npm run test:ui`) | ✅ 20/20 |
| Aucun secret dans le dépôt (`.env` ignoré, pas de clé service_role) | ✅ |
| Script SQL idempotent (relançable sans perte) | ✅ |
| En-têtes de sécurité (CSP, X-Frame-Options, nosniff) dans `vercel.json` | ✅ |
| Critère de retour arrière défini | ✅ (section 5) |

## 3. Journal des étapes
| # | Étape | Responsable | Statut | Date | Remarques |
|---|---|---|---|---|---|
| 1 | Dépôt GitHub créé et code poussé | JevainBkg / Claude | ✅ | 23/10/2026 | `main` ; v1.1 via pull request |
| 2 | Projet Supabase créé, `schema.sql` exécuté, RLS vérifié | JevainBkg | ⏳ | | |
| 3 | `config.js` renseigné (URL + clé publishable) | Claude | ✅ | 23/10/2026 | PR #2 |
| 4 | Projet Vercel importé et déployé | JevainBkg | ✅ | 23/10/2026 | projet `carnet-notes` |
| 5 | URL Vercel ajoutée aux Redirect URLs Supabase | JevainBkg | ⏳ | | |
| 6 | Recette en ligne | JevainBkg / Claude | ⏳ | | |

## 4. Recette en ligne
| Test | Attendu | Résultat |
|---|---|---|
| Notes 10 (coef. 1) et 16 (coef. 2) | Moyenne 14,00 | ⏳ |
| Saisie de −1 et 21 | Refusées | ⏳ |
| Compte B | Ne voit ni ne modifie les données de A | ⏳ |
| Compte élève avec le code d'une fiche | Voit uniquement sa fiche, moyenne 14,00, aucune modification possible | ⏳ |
| Révocation par l'enseignant | L'élève ne voit plus rien | ⏳ |
| Ouverture sur téléphone | HTTPS, lisible, sans défilement horizontal | ⏳ |
| Rechargement de la page connecté | Session conservée | ⏳ |
| Console du navigateur | Aucune erreur (CSP comprise) | ⏳ |

## 5. Retour arrière
- **Déclencheur** : un test de recette en échec sur la sécurité (isolation A/B) ou la moyenne.
- **Site** : Vercel → Deployments → *Promote* le déploiement précédent.
- **Base** : `schema.sql` est idempotent et ne supprime aucune donnée ; en cas de doute, désactiver les inscriptions dans Supabase le temps de corriger.

## 6. Exploitation
- Supabase Free se met en pause après environ 7 jours d'inactivité : le réactiver depuis le tableau de bord avant une démonstration.
- Données fictives uniquement ; aucune donnée personnelle réelle.
