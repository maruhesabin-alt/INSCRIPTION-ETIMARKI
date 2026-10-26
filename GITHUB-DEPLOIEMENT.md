# ETIMARKI — publier le site public sur GitHub

## Prévisualiser en local
1. Ouvrez ce dossier dans Visual Studio Code.
2. Installez l'extension Live Server si nécessaire.
3. Faites un clic droit sur `index.html` puis **Open with Live Server**.
4. Le backend doit fonctionner pour que l'envoi du formulaire soit enregistré.

## Configurer l'API
Le fichier `js/config.js` contient actuellement `http://localhost:4000/api`.
Cette adresse fonctionne seulement sur l'ordinateur où tourne le backend. Après avoir hébergé le backend, remplacez-la par son URL HTTPS publique, en gardant le suffixe `/api`.

Ne mettez jamais le mot de passe PostgreSQL, un secret JWT ou le fichier `.env` dans le dépôt public.

## Publier avec GitHub Pages
1. Créez un dépôt GitHub vide, par exemple `etimarki-inscription-public`.
2. Téléversez le contenu de ce dossier, pas le dossier parent : `index.html` doit être à la racine du dépôt.
3. Ouvrez **Settings → Pages**.
4. Sélectionnez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis enregistrez.
5. Attendez que GitHub fournisse l'adresse du site.

## Important
GitHub Pages héberge seulement le frontend statique. Il n'exécute pas Node.js ni PostgreSQL. Le backend doit être hébergé séparément, avec une base PostgreSQL accessible au backend et CORS configuré pour autoriser le domaine du site.
