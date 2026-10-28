# COLLECT PRO — version 2

Site + serveur de collecte et de gestion de données, avec **base de données SQL réelle**, **administration protégée par mot de passe**, **analyse de sources externes en arrière-plan**, import vérifié et sauvegardes.

> **Point important sur la base de données.** Cette version utilise **SQLite** (le moteur SQL intégré à Node.js 22.13+, aucune installation) et **non PostgreSQL**. Le schéma (`001_init.sql`) est en SQL simple, pensé pour être porté vers PostgreSQL, mais ce portage **n'a pas été réalisé ni testé**. Voir « Limites ».

## Contenu (tous les fichiers sont à la racine, aucun sous-dossier)

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil du site |
| `app.html` | Espace de gestion : créer activités et champs, **publier** le formulaire |
| `admin.html` | **Administration** : connexion, vue générale, inscriptions (serveur), sources et analyse, synchronisation, import/export, journal, sauvegardes |
| `form.html` | Formulaire public `form.html?id=IDENTIFIANT` |
| `style.css`, `app.css`, `landing.css` | Styles (base commune, espace de gestion et administration, page d'accueil) |
| `app.js`, `admin.js`, `form.js`, `landing.js` | Code du navigateur (espace de gestion, administration, formulaire public, animations) |
| `server.js` | Serveur : site + API `/api/v1` |
| `db.js`, `auth.js`, `crypto.js`, `env.js`, `net.js`, `validate.js`, `sources.js`, `jobs.js`, `backup.js` | Modules du serveur (base, authentification, chiffrement, lecture de `.env`, accès réseau sécurisé, validation, sources externes, tâches de fond, sauvegardes) |
| `001_init.sql` | Schéma SQL (appliqué automatiquement au démarrage ; tout fichier `NNN_nom.sql` ajouté à la racine sera appliqué ensuite) |
| `create-admin.js`, `restore.js` | Créer/réinitialiser l'administrateur ; restaurer une sauvegarde |
| `api.test.js` | 28 tests automatisés |
| `package.json`, `start.bat`, `.env.example`, `.gitignore`, `README.md` | Démarrage, configuration, documentation |

**Dossier créé automatiquement à l'exécution :** `data/` (base `collect-pro.db`, `backups/`, `secret.key`). Il n'est pas dans le ZIP : le serveur le crée au premier lancement. **Ne jamais le partager.**

**Ce qui fonctionne avec Live Server seul (sans Node.js) :** `index.html` (page d'accueil) et `app.html` en mode local (activités, champs, formulaire local, exports, impression PDF, sauvegarde JSON ; données gardées dans le navigateur). **Ce qui exige `node server.js` :** `admin.html` (connexion), `form.html` (formulaire public), la publication et la récupération des réponses, la base de données, l'analyse des sources, les sauvegardes.

## Installation sous Windows avec Visual Studio Code

1. Installez **Node.js LTS (version 22.13 ou plus récente)** depuis https://nodejs.org, puis redémarrez VS Code. Vérifiez : `node -v` doit afficher `v22.13` ou plus.
2. Décompressez `collect-pro.zip`, puis **Fichier → Ouvrir un dossier** et choisissez `collect-pro`.
3. **Créez votre fichier de configuration** : copiez `.env.example` en `.env` (clic droit → Copier/Coller, puis renommez), ouvrez `.env` et remplacez :
   ```
   ADMIN_EMAIL=votre-adresse@exemple.com
   ADMIN_PASSWORD=un-mot-de-passe-long-et-unique
   ```
   Règles : une valeur par ligne, **pas d'espace autour du `=`**, pas de commentaire en fin de ligne. Un `#` à l'intérieur du mot de passe est accepté. Minimum 10 caractères.
4. Terminal VS Code (**Terminal → Nouveau terminal**) : `node server.js` (ou `npm start`, ou double-clic sur `start.bat`). Résultat attendu :
   ```
   Compte administrateur créé : votre-adresse@exemple.com
   COLLECT PRO démarré : http://localhost:3000
   Administration      : http://localhost:3000/admin.html
   ```
5. Ouvrez http://localhost:3000/admin.html et connectez-vous. Arrêt du serveur : `Ctrl + C`.

Le compte n'est créé qu'au **premier** lancement. Pour changer le mot de passe plus tard : modifiez `ADMIN_PASSWORD` dans `.env`, puis `npm run admin`.

> Live Server (extension VS Code) ne remplace pas `server.js` : sans le serveur, il n'y a ni base, ni connexion, ni réception de réponses.

## Utilisation

1. **Espace de gestion** (`/app.html`) : créez une activité et ses champs.
2. Onglet **Synchronisation et API** de l'activité → **Publier**. (Vous êtes déjà connecté si vous vous êtes connecté sur `/admin.html` dans le même navigateur.) Partagez le **lien public** affiché.
3. **Administration** (`/admin.html`) :
   - **Activités et inscriptions** : les réponses reçues, lues directement dans la base : recherche, pagination, modification, suppression récupérable, restauration, export.
   - **Sources et analyse** : ajoutez l'URL d'une API que vous êtes autorisé à interroger (avec sa clé si nécessaire), puis **Analyser les données**. Le système vérifie la joignabilité, cherche la documentation OpenAPI/Swagger aux emplacements habituels, liste les endpoints GET et signale les besoins d'authentification. Ensuite : **Configurer l'import** (activité cible, endpoint, correspondance des champs) → **Aperçu** → **Valider cette source** → **Lancer l'import**.
   - **Synchronisation** : historique, tâches, **Vérifier la cohérence**.
   - **Importer / Exporter** : fichiers CSV et JSON.
   - **Journal** et **Sauvegardes**.

Modifier les champs ou le statut d'une activité publiée : cliquez de nouveau sur **Republier**. Archiver ou supprimer une activité dans l'espace de gestion ferme son formulaire public.

## Ce que fait réellement « Analyser les données »

- Il travaille **uniquement** sur les sources que vous ajoutez. Il **ne recherche pas** de sources sur Internet de lui-même et n'invente aucune API.
- Il s'exécute en arrière-plan avec barre de progression ; vous pouvez l'annuler et continuer à utiliser le site.
- La découverte de documentation ne fonctionne que si l'API publie un fichier OpenAPI/Swagger JSON à un emplacement courant (`/openapi.json`, `/swagger.json`, `/v3/api-docs`, `/api-docs`, `/.well-known/openapi.json`). Sinon le système le dit et vous indiquez l'endpoint à la main.
- Une source qui répond 401/403 est signalée « accès refusé / clé requise » ; la clé se configure dans la source (chiffrée sur le serveur, jamais réaffichée).
- L'import : chaque ligne est validée selon les champs de l'activité ; les doublons (identifiant de la source ou e-mail) sont ignorés ; les lignes invalides sont rejetées avec leur motif ; un import est marqué « réussi » seulement après **vérification en base** du nombre de lignes insérées. Les réimports ne créent pas de doublons. Les erreurs temporaires (429, 5xx, réseau) sont retentées 2 fois.
- L'import ne lit qu'**une seule réponse** (pas de pagination automatique).
- **Protection SSRF** : par défaut, les adresses privées ou locales (127.0.0.1, 192.168.x.x, 10.x.x.x…) sont refusées. Pour interroger un service sur votre propre machine ou réseau, ajoutez `ALLOW_PRIVATE_SOURCES=1` dans `.env`.
- **Doublons** : pour les formulaires, le premier champ de type e-mail sert de clé (casse ignorée) ; une seconde réponse avec le même e-mail reçoit un refus clair. Les activités de type « messages » n'ont pas de détection automatique.

## Sécurité

- Mots de passe hachés (scrypt) ; verrouillage du compte 15 min après 5 échecs ; limitation du débit de connexion ; sessions de 12 h stockées sous forme hachée.
- Toutes les routes d'administration exigent une session, vérifiée côté serveur à chaque appel.
- Requêtes SQL paramétrées (testé avec des tentatives d'injection). Clés API des sources chiffrées (AES-256-GCM) avec `SECRET_KEY` ou `data/secret.key` : **sauvegardez cette clé avec vos données**, sans elle les clés API enregistrées sont illisibles.
- Le fichier `.env`, `data/` et le code serveur ne sont jamais servis au navigateur (testé). `.env` est exclu du ZIP et de `.gitignore`.
- Le journal ne contient ni mots de passe, ni clés, ni contenu des inscriptions.
- La session est conservée dans le navigateur (en-tête `Authorization`) ; utilisez un ordinateur de confiance. En production, placez le serveur derrière **HTTPS**.

## Sauvegarde et restauration

- Sauvegarde automatique au démarrage puis toutes les 6 h si la dernière a plus de 24 h ; 14 conservées (`data/backups/`). Manuelle : **Administration → Sauvegardes**.
- **Copiez régulièrement `data/backups/` et `data/secret.key` hors de l'ordinateur.**
- Restauration : arrêtez le serveur, puis `node restore.js data/backups/NOM.db`, puis relancez. La base actuelle est conservée à côté.

## Tests

```
npm test
```
28 tests, dont : authentification et verrouillage, lecture de `.env` (BOM, `#`), mot de passe haché, refus sans session, validation, doublons, injection SQL, modification/suppression/restauration, isolation entre activités, exports (neutralisation des formules CSV), import de fichier, **analyse et import contre une API factice locale** (documentation OpenAPI, mauvaise clé, source injoignable, nouvelles tentatives, idempotence), protection SSRF, cohérence, sauvegarde et restauration, reprise de l'ancienne base `db.json`, protection des fichiers privés.

## API (`/api/v1`)

Publiques : `GET /health`, `GET /public/activities/:id`, `POST /public/activities/:id/submissions` (201 si enregistré, 409 doublon).
Authentification : `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
Protégées (en-tête `Authorization: Bearer <jeton>`) : `GET /admin/overview`, `GET /admin/consistency`, `GET /activities`, `PUT /activities/:id`, `GET /activities/:id/records`, `GET /activities/:id/export?format=csv|json`, `POST /activities/:id/import`, `GET|PATCH|DELETE /records/:id`, `POST /records/:id/restore`, `GET|POST /sources`, `PUT|DELETE /sources/:id`, `PUT /sources/:id/import-config`, `POST /sources/:id/preview|validate`, `POST /jobs/analyze|import`, `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `GET /logs/audit|sync`, `GET|POST /backups`, `GET /backups/:nom`.

## Mise en ligne

Il faut un hébergeur qui exécute Node.js 22.13+ et conserve un disque persistant pour `data/`. Définissez `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SECRET_KEY` dans les variables d'environnement de l'hébergeur (jamais dans un dépôt public), placez le serveur derrière HTTPS, et sauvegardez `data/`. Les conditions et la gratuité éventuelle dépendent de l'hébergeur.

## Limites actuelles

- **SQLite et non PostgreSQL** (voir plus haut) ; adapté à un usage privé et à quelques dizaines de milliers de lignes. Un seul serveur.
- Un seul rôle (administrateur) ; création d'autres comptes uniquement via `create-admin.js`.
- Les activités sont **créées dans l'espace de gestion** (stocké dans le navigateur) puis **publiées** vers le serveur ; l'administration lit et modifie les données du serveur. Les deux interfaces ne partagent pas encore la même liste d'activités en temps réel : après publication, les réponses se consultent dans l'administration.
- Le tableau de bord se rafraîchit toutes les 10 s (pas de notifications instantanées).
- Pas d'envoi d'e-mails, pas de pièces jointes, PDF via « Enregistrer au format PDF » du navigateur (espace de gestion).
- Découverte d'API limitée aux sources que vous ajoutez et aux documentations OpenAPI JSON ; pas de pagination d'import, pas de planification automatique des imports.
- Non testé : navigateurs autres que Chromium, affichage mobile, déploiement chez un hébergeur, PostgreSQL.
