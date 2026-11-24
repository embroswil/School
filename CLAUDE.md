# Sùkûl — consignes pour Claude

Application de gestion scolaire multi-établissements pour le Cameroun (sukul.site).
Porteur du projet : Rostant. Répondre **toujours en français**.

## Architecture

- `frontend/` : React + Vite, PWA, routeur par hash (`#/…`). Pages dans `frontend/src/pages`, mise en page et barre de navigation dans `frontend/src/layout.jsx`, routes dans `frontend/src/App.jsx`, styles dans `frontend/src/index.css`, traductions FR → EN dans `frontend/src/i18n.jsx` (dictionnaire + regex `FORMULES`). Déployé sur **Vercel**.
- `backend/` : Node.js + Express, PostgreSQL (`pg`). Modules dans `backend/src/modules/<nom>/routes.js`, montés dans `backend/src/app.js`. Tâches planifiées dans `backend/src/taches/`. Déployé sur **Render**.
- Base de données : **Supabase** (PostgreSQL). Migrations SQL dans `backend/src/config/migrations/` (appliquées à la main). RLS activée sur toutes les tables.
- Rôles : `principal` (établissement), `teacher`, `parent`, `student`, `admin` (plateforme).

## Règles de livraison

- Livrer **uniquement les fichiers modifiés à l'étape en cours**, dans un zip, jamais ceux des livraisons précédentes.
- Terminer chaque réponse par le bloc de commandes avec **lg2** (le terminal de l'utilisateur n'a pas `git`) :
  ```
  cd ~/Documents/School.git
  tar -xf ~/Documents/<zip>
  lg2 add backend frontend
  lg2 commit -m "…"
  lg2 push
  ```
  Sans modification de fichiers : `lg2 status`.
- Réponses courtes : ce qui a changé, le fichier livré, la commande. Pas de récapitulatif des étapes.

## Règles de code

- **Code minimaliste (façon Ponytail)** : avant d'écrire, vérifier si c'est nécessaire, si ça existe déjà dans le projet, si la plateforme le fait déjà, si une dépendance installée s'en charge. Sinon, le strict minimum. Pas de nouvelle dépendance sans raison.
- Garder intacts : validation des entrées, contrôles d'accès, gestion d'erreurs.
- Chaque écran doit marcher en **mode ordinateur** (`html.ordi`, barre latérale) et sur **tous les téléphones**, Android compris (pas seulement l'iPhone).
- Interface professionnelle et simple : pas d'emojis, rien de surdimensionné, pas d'information inutile ni répétée.
- Nouveau texte visible : ajouter sa traduction anglaise dans `i18n.jsx` (sans créer de clé en double). `data-brut` empêche la traduction d'un texte.
- Montants en FCFA, format `fr-FR`.

## Paiements (à respecter)

- Le parent envoie l'argent **directement au numéro Orange Money ou MTN MoMo de l'établissement** (ordre de paiement avec code motif) ; l'établissement confirme la réception.
- Frais de retrait : **1 %**, fixe, non modifiable par l'établissement. Frais de service : **200 FCFA** par paiement, entièrement pour l'établissement. Calcul unique : `backend/src/utils/frais-paiement.js` et `frontend/src/fraisPaiement.js`.
- Pas de paiement automatique en ligne pour les parents.
- La boutique (`modules/boutique`) utilise le même ordre de paiement que la scolarité.

## Sécurité

- Aucun secret dans le dépôt (clé VAPID privée, Anthropic, WhatsApp, NotchPay, Brevo, JWT_SECRET) : ils vivent uniquement dans Render. Ne jamais les afficher.
- `JWT_SECRET` ne doit jamais changer.
- Ne jamais afficher l'adresse e-mail personnelle du porteur du projet, même dans les documents générés.

## Tests

- Après **chaque test** sur la vraie base : supprimer les données de test créées (paiements en attente, commandes, cours ajoutés, notifications, réglages modifiés) et dire à l'utilisateur ce qui a été supprimé.
- Établissement de test : Lycée de l'Avenir (id 12). Comptes de test : `@test.sukul.site`.
- Pour les petites modifications, une seule capture de contrôle suffit (limiter la consommation).
