# IziRDC — Backend MVP

Facilite la vie en RDC : actualités filtrées, taux de change, suivi de dépenses.

## Stack
Node.js/Express, Firebase Auth + Firestore, Chariow (abonnement $5/mois), Render, FCM (notifications push).

## Setup

1. `npm install`
2. Copier `.env.example` en `.env` et remplir les valeurs
3. Créer un projet Firebase → activer Authentication (Google) + Firestore
4. Générer une clé de service : Firebase Console > Project Settings > Service Accounts > Generate new private key
5. Créer un produit abonnement sur Chariow ($5/mois) → configurer le webhook vers `https://ton-app.onrender.com/api/chariow/webhook`
6. `npm start`

## Déploiement Render
- Build command: `npm install`
- Start command: `npm start`
- Ajouter toutes les variables de `.env.example` dans les Environment Variables de Render
- Ajouter un ping cron-job.org toutes les 10 min sur l'URL racine pour éviter le sleep (plan gratuit)

## Logique abonnement
- Compte créé → 3 jours d'essai gratuit (`trialEndsAt`)
- Après 3 jours → accès bloqué tant qu'aucun paiement Chariow n'est confirmé
- **Important** : le user doit payer sur Chariow avec l'email exact de son compte IziRDC (Google). Si erreur d'email de sa part, le webhook ignore silencieusement le paiement — à écrire clairement dans les CGU.

## Prochaines étapes (pas encore fait)
- [ ] Frontend PWA (manifest.json, service worker, UI React ou HTML/CSS/JS)
- [ ] Page de conditions d'utilisation (checkbox obligatoire à l'inscription)
- [ ] Intégration Firebase Cloud Messaging côté client (demande de permission notif)
- [ ] Dashboard admin (toi) pour modifier le taux + envoyer des notifs
- [ ] Dashboard user (graphiques dépenses avec Chart.js ou Recharts)
- [ ] Page checkout Chariow avec affichage clair de l'email à utiliser
