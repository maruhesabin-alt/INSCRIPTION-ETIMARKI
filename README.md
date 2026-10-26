# ETIMARKI — Site public de préinscription

Site responsive, en français, prévisualisable avec VS Code + Live Server.

## Important
Le site public ne sauvegarde pas les inscriptions dans le navigateur. Il envoie les données au backend via l'API. Pour que les demandes soient réellement enregistrées, le backend doit être démarré et relié à PostgreSQL.

## Prévisualiser
1. Décompressez ce ZIP.
2. Ouvrez le dossier `ETIMARKI-INSCRIPTION-PUBLIC` dans VS Code.
3. Lancez `index.html` avec Live Server.
4. Le backend doit fonctionner sur `http://localhost:4000` pour que l'envoi fonctionne.

Modifier l'adresse de l'API dans `js/config.js` après déploiement. Ne mettez jamais de mot de passe administrateur ou de secret dans le frontend.

## Champs collectés
Nom complet, e-mail, téléphone/WhatsApp, ville, formation souhaitée, message facultatif et consentement.
