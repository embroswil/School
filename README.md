# School

Application de vie scolaire pour les établissements du Cameroun (maternelles, écoles primaires, collèges, lycées), par **Embroswil**.

- **Établissements** : élèves (import Excel, PDF ou photo), classes, enseignants, professeur principal, actualités, messagerie, scolarité (frais, paiements versés directement à l’école).
- **Enseignants** : appel en classe, évaluations et notes par séquence (6 séquences, 3 trimestres), résultats et coefficients pour le professeur principal.
- **Parents et proches** (père, mère, tuteur, oncle…) et **élèves** : notes publiées, moyenne et rang, absences, scolarité, annonces.
- **Plateforme** : demandes d’établissements, fiches des écoles, comptes, indicateurs.

## Architecture
- `frontend/` : React + Vite, déployé sur **Vercel** (application installable).
- `backend/` : Node.js + Express, déployé sur **Render** (`backend/`, `npm start`).
- Base de données : **PostgreSQL (Supabase)**. Schéma d’origine : `backend/src/config/schema.sql` ;
  évolutions multi-établissements : `backend/src/config/migrations/2026-10-multi-etablissements.sql`.

## Variables d’environnement (Render)
`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
et au lancement : `ANTHROPIC_API_KEY` (lecture des listes en photo).

## Modules de l’API
`/api/auth`, `/api/schools`, `/api/inscriptions`, `/api/demandes-etablissements`, `/api/etablissement`,
`/api/boite`, `/api/actualites`, `/api/scolarite`, `/api/notes`, `/api/suivi`, `/api/users`.
