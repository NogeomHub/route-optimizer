# Étape manuelle Netlify — aucun compte ou site créé ici

Le code et ses deux bundles ont été préparés localement. Pour valider le **vrai** background, le store Blobs hébergé, les ETag, les retries et la consommation, il faut maintenant un nouveau site. Ne pas réutiliser le projet qui publie la V2.

1. Connectez-vous à Netlify, ou créez vous-même un compte gratuit si nécessaire. Choisissez l’offre **Free à crédits**, sans activer de recharge payante. Arrêtez si l’interface impose un paiement pour ce parcours et vérifiez l’offre proposée.
2. Dans le tableau de bord : **Add new project → Import an existing project → GitHub**. Autorisez uniquement le dépôt nécessaire `NogeomHub/route-optimizer`.
3. Créez un **nouveau projet** nommé par exemple `route-optimizer-v3-backend-poc`, avec **Branch to deploy : `experiment/netlify-v3-backend-poc`**. Ne sélectionnez pas `main`.
4. Réglages du sous-projet :
   - Base directory : `experiments/backend-v3` ;
   - Package directory, si ce champ de monorepo est proposé : `experiments/backend-v3` ;
   - Build command : `npm run check:functions` ;
   - Publish directory : `public`, relatif à cette base ;
   - Functions directory : `netlify/functions`, relatif à cette base ;
   - fichier de configuration : `experiments/backend-v3/netlify.toml`.
   Vérifiez le résumé avant de déployer. Netlify construit ensuite les fonctions automatiquement avec esbuild. Le script `build:functions` est la vérification locale du bundler, pas nécessaire à doubler dans le build Netlify.
5. Avant la première recherche, ajoutez dans **Project configuration → Environment variables** (scope Functions, et contexte Production de ce nouveau site) :

|Variable|Valeur à fournir|
|---|---|
|`POC_API_TOKEN`|Secret aléatoire personnel, au moins 32 caractères ; utilisé dans la console, jamais commité|
|`POC_WORKER_TOKEN`|Deuxième secret aléatoire différent, au moins 32 caractères ; reste uniquement dans les fonctions|
|`POC_OPERATOR_CONTACT`|Votre adresse email de contact, rendue publique dans `/api/about`|
|`POC_ALLOWED_ORIGINS`|`https://VOTRE-NOUVEAU-SITE.netlify.app,https://nogeomhub.github.io` ; liste exacte sans slash final|
|`POC_FOSSGIS_POLICY_REVIEWED`|`true`, après lecture des règles pour votre essai personnel|
|`POC_EARLY_NO_TOLLS`|`false` pour le premier essai ; option expérimentale distincte|

Les deux secrets peuvent être générés dans le terminal Codex avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` ; ne pas les copier dans ce dépôt ou dans le chat public. Aucun token d’API Netlify, aucune clé Valhalla payante et aucune clé IGN n’est requis. Si l’interface demande de qualifier une variable comme secrète, marquez les deux tokens. Ne pas donner aux secrets un préfixe `VITE_`.

6. Déployez uniquement ce nouveau projet. Après un changement de variables, redéployez pour disposer du contexte actuel. Choisissez une région européenne pour les fonctions et le store si l’offre/configuration le permet ; sinon ne promettez pas une résidence européenne des données. Blobs doit exposer le contexte SDK, des lectures fortes et des ETag ; aucun fallback non atomique n’est activé.
7. L’URL sera **`https://<nom-réel-du-nouveau-projet>.netlify.app/`**. Le nom exact dépend de sa disponibilité. L’API est sur la même origine, par exemple `/api/search`. Aucune URL Netlify réelle n’existe encore pour ce POC.

## Checklist d’acceptation sur le service réel

- `/api/about` affiche le contact/attribution ; la console se charge ; une requête sans jeton est refusée.
- Vérifiez les Functions logs : `api` et `search-background` distincts, Node 22 ; aucun `BLOBS_ETAG_MISSING`.
- Lancez une seule recherche depuis la console, confirmez explicitement les lieux proposés ; relevez le jobId, le 202, la durée et les crédits consommés.
- Fermez l’onglet pendant le calcul. Rouvrez-le, saisissez le jeton, collez l’identifiant dans « ID d’un job existant » puis cliquez « Relire ce job » ; la console n’enregistre pas les tokens ni l’ID automatiquement. Le bouton Reprendre sert si l’exécution s’est interrompue, pas pour recréer un job terminé.
- Envoyez deux POST identiques : même jobId ou refus transitoire `CREATING`, jamais deux campagnes actives. Vérifiez `jobs`, `results`, `search-index`, `geometries`, `cache` et `locks` dans le store Blobs du nouveau site.
- Vérifiez la récupération individuelle des 28 géométries, puis la relance sur résultat compatible sans nouvelle campagne.
- Annulez un job : `cancel_requested` puis `cancelled`, sans nouvel appel après détection ; ne supposez pas que l’appel en cours a été tué.
- Les crashs/leases et erreurs sont simulés dans les tests locaux. Ne coupez pas artificiellement une campagne publique FOSSGIS plusieurs fois : utilisez un fournisseur de test contrôlé pour les essais de retries forcés en hébergement.
- Contrôlez l’écart réseau dans les journaux (>=2 s après réponse), le temps mural, les I/O Blobs et la facturation. Le compteur de crédits Free est partagé avec les autres projets de l’équipe.
- Après les essais, supprimez les données sensibles/expirées et désactivez le POC ou ses accès si vous ne l’utilisez plus. Aucun cron de purge ni protection anti-DDoS complète n’est installé ici.

L’ACK natif de background est toujours 202 avant l’exécution : une invocation interne non autorisée ne lance aucun routage mais peut tout de même consommer une invocation. Les budgets/jetons de ce POC ne sont pas une protection suffisante pour ouvrir un service public.
