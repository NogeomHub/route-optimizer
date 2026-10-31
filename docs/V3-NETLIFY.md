# V3 personnelle sur Netlify — exploitation et validation

V2 reste sur GitHub Pages avec `npm run build`. V3 locale reste lancée par `V3_FOSSGIS_POLICY_REVIEWED=true npm run dev:v3`, avec son proxy et son FileStore. La configuration `netlify.toml` n'est pas utilisée par le workflow Pages.

## Architecture

Navigateur → frontend compilé en mode `netlify` → API même origine → Blobs fortement cohérent → `search-background` → **Jobs produit** → IGN/RoutingProvider/Valhalla → moteur tarifaire produit → Blobs → polling.

`server/netlify/` adapte les modules `server/src/` et `server/pricing/`. Aucun import de l'ancien moteur expérimental. Le suffixe `-background`, officiellement supporté, active les Background Functions : ACK 202 immédiat, exécution indépendante du navigateur, maximum annoncé 15 minutes. Le runner produit conserve son budget de 8 minutes, 40 profils maximum, une campagne fournisseur active et au moins 2 secondes après chaque réponse. Aucun `setImmediate` ni état mémoire persistant n'est utilisé par l'adaptateur hébergé.

Jobs, checkpoints, index, géométries, caches, verrous, date du dernier appel et logs résident dans le store **site-wide** `route-optimizer-v3`. Lectures fortes, `onlyIfNew`, `onlyIfMatch` et ETag obligatoires. ETag absent ou résultat conditionnel inconnu : échec, jamais repli fichier/mémoire/écriture libre. Les données survivent aux invocations et aux redéploiements, sous réserve du contrat Blobs réel à valider.

Les délais HTTP sont 20 s dans l'API synchrone et 90 s dans le worker. L'annulation est coopérative, pas une interruption de l'appel déjà parti. Une invocation redélivrée est protégée par les verrous/checkpoints ; le bouton Reprendre redéclenche un job queued/running, après expiration du lease si nécessaire (180 s). Un job explicitement annulé ou échoué n'est pas ressuscité : une nouvelle comparaison réutilise ses caches compatibles. La durée maximale d'une fonction ne garantit pas que tout trajet finira.

La projection tarifaire garde son cache indépendant et sa révision. Tarifs, modèles géographiques et règles temporelles sont inchangés. Seul le chemin des ressources du moteur est injectable pour permettre leur chargement dans l'archive Lambda. Les originaux nécessaires sont explicitement inclus dans chaque bundle ; aucune dépendance à `.local-v3/`.

## Accès personnel

Le JavaScript et les fichiers statiques sont publics ; l'API de recherche est protégée. Pas de service d'identité ni de protection Netlify payante requis.

Saisir une **clé aléatoire** dans l'écran de connexion. POST même origine à `/api/session`, comparaison serveur à temps constant, puis cookie signé `__Host-route-v3`, HttpOnly, Secure, SameSite=Strict, Path=/, durée 8 h. La clé n'est ni persistée dans localStorage/sessionStorage ni incorporée au build. Le navigateur envoie le cookie automatiquement aux appels et géométries sur la même origine. Expiration/401 : retour à la connexion ; déconnexion : suppression du cookie. Rotation de `V3_SESSION_SECRET` invalide toutes les sessions. Pour révoquer un accès compromis, renouveler aussi `V3_ACCESS_TOKEN` et redéployer.

Un secret différent, strictement serveur, autorise les invocations background. Le 202 natif Netlify ne prouve pas que l'authentification interne a réussi : une invocation non autorisée ne contacte pas Valhalla, mais peut consommer une invocation. Les mutations du navigateur exigent une origine exacte ; l'API et le worker refusent les URL d'origine différente de `V3_SITE_ORIGIN`, notamment les previews. Ce n'est pas une authentification multi-utilisateur ni une protection anti-DDoS.

## Incident réel : DISPATCH_FAILED avant invocation du worker

Diagnostic du 31/10/2026 sur `https://precious-custard-773d34.netlify.app` (version 39144ba) : sans session Netlify, GET `/api/about` et GET/POST `/.netlify/functions/search-background` retournent **401** avec la page `Login Redirect` vers `app.netlify.com/edge-access`. Avec un Bearer volontairement invalide et aucun job, le POST retourne également 401, sous la forme `Error - Request ID: ...`. Aucune clé réelle ni recherche fournisseur n'a été utilisée pour ces sondes.

Lors de cet incident, le projet était protégé au niveau de l'accès Netlify. Le navigateur connecté à Netlify peut atteindre notre API, mais le fetch serveur n'a pas cette session. Le Bearer `V3_WORKER_TOKEN` est une clé de notre application, pas un jeton d'accès Netlify. La requête est donc refusée **avant** l'ACK 202 et l'exécution du worker. Le chemin public de fonction est correct ; remplacer ce chemin par `/api/...` ne résout pas le refus.

L'architecture retenue exige **production accessible publiquement au niveau Netlify**, avec notre authentification personnelle pour les calculs. Dans le projet existant : **Project configuration → General → Visitor access → Project visibility → Edit visibility → Public** ; vérifier que la production n'est pas soumise à une protection héritée/team login. L'interface peut aussi proposer `Publish` pour sortir de l'état privé initial. Les fichiers statiques et `/api/about` deviennent accessibles, mais recherche, géocodage, résultats et géométries restent protégés par la session V3 ; le worker exige toujours sa clé séparée. Cette modification de visibilité doit être effectuée manuellement par l'opérateur, après revue. Aucun transfert de cookie Netlify ni contournement de sa protection n'est implémenté.

Source officielle : https://docs.netlify.com/manage/security/secure-access-to-sites/site-protection/ ; l'offre Free à crédits démarre privée avant publication (https://www.netlify.com/pricing/).

Le dispatch conserve POST vers `V3_SITE_ORIGIN + /.netlify/functions/search-background`, JSON `{jobId}`, Bearer interne et attente d'un **202 vide**, sans attendre la fin du calcul. Les redirections sont observées mais jamais suivies avec la clé. Les logs `[netlify dispatch]` donnent endpoint, statut, type de refus, identifiant Netlify et une classification de la réponse (aucun HTML/JSON brut, cookie ou secret). Les types distinguent protection Netlify, redirection, 404, autre erreur HTTP, réseau et timeout. Les logs `[netlify background]` donnent le début et l'issue d'une invocation interne authentifiée.

Après mise à jour du code : vérifier le SHA dans Deploys (le push peut déclencher le build automatique ; sinon Trigger deploy sur la branche), puis régler la visibilité. Conserver `V3_SITE_ORIGIN=https://precious-custard-773d34.netlify.app`, sans slash final. En navigation privée non connectée à Netlify, `/api/about` doit répondre JSON 200, `/api/session` JSON `authenticated:false`, et `/api/search` sans session doit rester 401 **JSON applicatif**, pas une page de connexion Netlify. Se connecter ensuite avec la clé V3 et lancer une seule comparaison : log dispatch `status:202,event:accepted`, puis worker `event:started`, progression, résultat. Un ancien job `failed/DISPATCH_FAILED` ne se reprend pas : relancer Comparer ; ses caches compatibles restent réutilisables. Vérifier ensuite la relance cache.

La réponse 202 ne prouve pas la réussite du job : l'acceptation, le démarrage authentifié, la progression et le résultat doivent être vérifiés séparément en production. Les tests locaux reproduisent la barrière observée et son absence d'invocation ; ils ne constituent pas cette validation finale. Aucun réglage de site ni déploiement manuel n'a été effectué pendant la correction.

## Validation réelle rapportée par l’opérateur le 31/10/2026

Le passage du projet de Private à **Public** a résolu DISPATCH_FAILED. Production : `https://precious-custard-773d34.netlify.app`. Accès en fenêtre InPrivate sans session Netlify, authentification V3, géocodage IGN, dispatch, progression 40/40, 28 itinéraires Crans → 8 Rue de Verdun au Pin, tarification complète/partielle, carte OSM et graphiques ont été validés. Le rechargement F5 restaure immédiatement les résultats sans nouveau calcul Valhalla. Cette validation est rapportée par l’opérateur ; aucune campagne supplémentaire n’a été lancée pour la finalisation.

Le projet Netlify doit rester **Public pour la production**, afin que le serveur puisse invoquer le background sans session Netlify. Notre application conserve `V3_ACCESS_TOKEN` et le cookie signé pour protéger les calculs ; le worker conserve `V3_WORKER_TOKEN`. `V3_SITE_ORIGIN` doit correspondre exactement à l’URL HTTPS canonique du site, sans slash final, actuellement `https://precious-custard-773d34.netlify.app`.

## Protocole court : annulation, relance et reprise

1. Vérifier le SHA du déploiement et ouvrir une fenêtre InPrivate. Se connecter avec la clé V3. Utiliser un trajet **non intégralement en cache** : si Crans → Le Pin revient instantanément, attendre son expiration ou sélectionner explicitement une adresse IGN proche différente. Ne pas purger Blobs ni multiplier les campagnes. Dans l’onglet Réseau, relever le `jobId` renvoyé par POST `/api/search` et les compteurs.
2. Après quelques profils, cliquer **Annuler** une seule fois. Attendre **Recherche annulée** (`status:cancelled`) et le log worker `finished` avec `CANCELLED`. Un appel déjà en vol peut finir ou attendre jusqu’à 90 secondes ; aucune nouvelle requête fournisseur ne doit partir après confirmation de l’annulation. Les compteurs cessent d’évoluer et F5 conserve l’état annulé.
3. Ressaisir les mêmes lieux IGN si F5 a vidé les champs, conserver les paramètres et cliquer **Comparer les itinéraires**. Le job annulé est terminal : un **nouveau jobId** est normal. Si le graphe et les TTL sont inchangés, ses réponses déjà conservées sont réutilisées, puis le calcul continue. Vérifier les compteurs et les nouveaux objets `network` Blobs : les profils déjà mis en cache ne doivent pas entraîner de nouveaux appels `/route`. Un appel interrompu avant écriture peut être répété.
4. Pendant ce nouveau calcul, cliquer une fois **Reprendre un calcul interrompu** : le jobId reste identique ; le verrou protège le runner actif (`noop/retry/already_running` possible), sans seconde campagne fournisseur. Fermer puis rouvrir l’onglet/F5 doit restaurer son suivi et laisser le worker progresser. Attendre le résultat final.
5. **Distinguer les preuves :** les étapes 2–3 testent annulation puis relance avec cache ; l’étape 4 teste l’idempotence et la restauration du suivi. Elles ne simulent pas une panne du worker. Une vraie reprise depuis checkpoint requiert un job encore `queued/running` dont l’invocation a effectivement été interrompue. Si cette situation survient, constater la fin de l’ancienne invocation, attendre l’expiration du lease (180 s depuis son dernier renouvellement), cliquer Reprendre et vérifier même jobId, incrément d’`attempts`, reprise au checkpoint et un seul runner. Ne pas provoquer un crash/redéploiement sur FOSSGIS pour ce seul test ; utiliser un fournisseur contrôlé pour une interruption forcée. Ce scénario est déjà couvert par les tests synthétiques, pas encore déclaré validé en production.

Noter jobIds, compteurs avant/après, heures et issues des workers. Ne jamais partager clé, cookie, en-tête Authorization ou capture réseau non expurgée. Une interruption réseau du navigateur ne coupe pas la Background Function.

## Variables à configurer dans l'interface

Exemple : `netlify/.env.example`, uniquement valeurs factices. Ne pas charger ce fichier avec ses placeholders en production. Aucune variable secrète préfixée `VITE_`.

| Variable | Valeur |
|---|---|
| `V3_HOSTING_ENABLED` | `true` pour activer explicitement les fonctions ; `false` pour les désactiver lors du prochain déploiement |
| `V3_SITE_ORIGIN` | URL HTTPS canonique réelle, ex. `https://nom.netlify.app`, sans slash final ni chemin |
| `V3_ACCESS_TOKEN` | première clé aléatoire, à saisir personnellement dans le navigateur |
| `V3_SESSION_SECRET` | deuxième secret aléatoire distinct, signature des cookies |
| `V3_WORKER_TOKEN` | troisième secret distinct, invocations internes uniquement |
| `V3_OPERATOR_CONTACT` | email valide, rendu public dans `/api/about` |
| `V3_FOSSGIS_POLICY_REVIEWED` | `true` après vérification des conditions pour l'usage personnel envisagé |
| `V3_EARLY_NO_TOLLS` | `false` par défaut, `true` pour l'arrêt expérimental à neuf sondes strictement qualifiées |

Générer trois secrets différents dans un terminal local avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, une fois par secret. Ne pas les publier dans Git, les logs, une issue ou une PR. Utiliser 64 caractères hexadécimaux aléatoires (256 bits), pas un mot de passe humain.

Rendre ces variables disponibles aux **Functions** via l'interface. Si l'offre Free ne propose pas de sélection de scopes, conserver le scope par défaut incluant Functions ; ne pas changer de plan pour cela. Les variables de `[build.environment]` ne sont pas disponibles au runtime des fonctions. `CONTEXT` n'est pas supposée disponible au runtime. Les identifiants/contexte Blobs sont fournis par Netlify ; aucun token personnel Netlify à configurer. Node 24 est sélectionné pour le build ; vérifier aussi la version de runtime Functions dans l'interface.

## Configuration de référence pour un nouveau projet

1. Netlify → **Add new project → Import an existing project → GitHub → NogeomHub/route-optimizer**. Créer un nouveau projet, pas de modification du site Pages.
2. Branche de production : **`feat/v3-netlify-hosting`** pour la première validation. Désactiver les Deploy Previews et les branch deploys pour ce projet personnel. Base directory : racine (vide). Aucun réglage utilisant `experiments/backend-v3`.
3. Configuration depuis `netlify.toml` : build `npm run build:v3:netlify`, publication `dist`, fonctions `netlify/functions`, bundler esbuild. Ne jamais choisir `npm run build` pour ce site V3. Le build local peut être reproduit avec `npm ci`, puis `npm run build:v3:netlify`.
4. Si l'interface propose de créer/configurer sans déployer, choisir ce parcours. Sinon rester à l'étape de revue et renseigner les variables proposées avant de déclencher. Si le nom/URL final n'est disponible qu'après création, les fonctions non configurées restent fermées (503) ; configurer ensuite l'origine exacte et les secrets, puis un nouveau déploiement. Aucun appel fournisseur n'est autorisé tant que la configuration est absente/invalide.
5. Garder le plan **Free à crédits**, sans recharge payante. Vérifier la limite annoncée et les réglages de visibilité avant de publier l'URL personnelle ; ne pas supposer qu'une protection par mot de passe Netlify est incluse.
6. Déclencher manuellement seulement après décision de l'opérateur. Après publication, vérifier d'abord `/api/session` sans connexion : `authenticated:false`, et `/api/search` sans session : 401. `/api/about` doit afficher le contact et les attributions.
7. Valider stockage/ETag/concurrence/reprise avec un fournisseur contrôlé avant une campagne réelle. Les tests automatisés locaux ne prouvent pas ces garanties cloud. Puis, si les conditions fournisseur le permettent, une seule recherche réelle et une relance cache, en observant la cadence, la durée et les crédits. Ne pas multiplier les appels pour tester les retries.

## Rollback et arrêt

Netlify → Deploys → choisir le dernier déploiement validé → option de restauration/publication de ce déploiement. Un rollback de code ne restaure pas les objets Blobs site-wide ; vérifier la compatibilité du schéma et des révisions. Pour le tout premier déploiement sans version antérieure, suspendre/dépublier le projet dans l'interface. Arrêter d'abord une recherche active et attendre sa fin/annulation : ne pas supposer qu'un rollback tue une fonction déjà engagée. Désactiver les déploiements automatiques pendant l'intervention. Modifier `V3_HOSTING_ENABLED` exige un nouveau déploiement pour prendre effet ; ce n'est pas un bouton d'arrêt instantané des invocations existantes. V2 Pages et V3 locale restent les replis disponibles.

## Free et validation encore nécessaire

Offre consultée le 31/10/2026 : Free 300 crédits/mois, Background Functions jusqu'à 15 min, compute 10 crédits/Go-heure, déploiement production 15 crédits, bande passante 20 crédits/Go et requêtes 2 crédits/10 000. Vérifier ces montants au moment de créer le projet : https://www.netlify.com/pricing/ ; https://docs.netlify.com/build/functions/background-functions/ . La consommation réelle inclut worker en attente, API, polling, I/O Blobs, logs, transferts et retries. Les crédits sont partagés ; un dépassement peut suspendre les projets. Aucun coût réel n'a été mesuré ici.

Le parcours nominal est maintenant validé en production par l’opérateur (voir ci-dessous). Restent à contrôler sur l’infrastructure réelle : annulation, relance avec cache, absence de double runner lors d’une reprise, reprise après interruption effective, garanties CAS entre invocations concurrentes, persistance après redéploiement et crédits consommés. Les tests locaux couvrent ces mécanismes avec un fournisseur synthétique, sans remplacer les vérifications cloud.

Les caches/objets expirent logiquement après 24 h mais aucune purge physique automatique n'est livrée : surveiller et supprimer les anciennes données sensibles avec la procédure opérateur appropriée, hors campagne active. Il n'y a pas de synchronisation des derniers jobs entre appareils : chaque navigateur conserve son propre identifiant local.

FOSSGIS n'est pas un fournisseur à disponibilité garantie : usage personnel occasionnel uniquement dans cette configuration, une connexion, identification/contact/attributions et délai actuel maintenus ; pas de contournement d'un refus ni de partage de la clé. Conditions : https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ . Les tuiles OSM et IGN ont leurs propres conditions. L’hébergement n’élargit pas la couverture tarifaire ni la période d'applicabilité des catalogues (réexamen prévu au 01/02/2027).

## Contrôles locaux

`npm test`, `npm run test:server`, `npm run test:netlify`, `npm run build`, `npm run build:v3:netlify`, `npm run check:netlify:bundle`, `npm run test:e2e`, `npm run test:e2e:v3`, `npm run test:e2e:netlify`.

Le contrôle de packaging utilise le bundler officiel, extrait **les deux archives**, charge le moteur tarifaire isolé et invoque leurs véritables points d'entrée avec contexte synthétique et réseau interdit. Aucun site, ressource cloud ou déploiement n'est créé. Les archives sont temporaires hors Git. Les tests de stockage utilisent le SDK Blobs réel sur transport synthétique explicitement étiqueté, pas une validation du service hébergé.
