# POC backend V3 personnel — expérimentation isolée

Branche `experiment/netlify-v3-backend-poc`, à partir de `experiment/dynamic-v3-architecture`. **Aucun changement de la V2, de `main` ou de GitHub Pages. Aucun compte/site Netlify créé, aucun déploiement effectué.**

Le moteur a effectué de vrais appels FOSSGIS/IGN depuis Codex, à travers une API HTTP locale avec stockage sur disque. Cela **ne valide pas encore le runtime Background Functions ni Blobs hébergé**. Voir [REPORT.md](REPORT.md), les [mesures](evidence/live-validation.json) et [NETLIFY.md](NETLIFY.md) pour l’étape manuelle.

## Composants

- `src/jobs.mjs` : service de jobs, transitions, progression, checkpoints et runner réentrant.
- `src/strategy.mjs` : port déterministe de la candidate Python gelée, neuf sondes, quatre pénalités, alternatives, raffinement, stagnation huit/minimum douze, plafond quarante.
- `src/geometry.mjs` : polyline6, déduplication exacte/quasi-identique historique, trace stricte et Pareto temps/**exposition**. Jamais de prix simulé.
- `src/providers.mjs` : abstraction `RoutingProvider`, fournisseur FOSSGIS strictement personnel et géocodage IGN.
- `src/store.mjs` : port de stockage, adaptateur réel `@netlify/blobs`, leases/CAS, cache et adaptateurs de test/local.
- `netlify/functions/api.mjs`, `search-background.mjs` : API et Background Function Node 22, suffixe Netlify `-background`.
- `public/index.html` : petite console autonome, sans import dans React, ni clé embarquée. Choix des candidats ambigus, progression, annulation et lecture des GeoJSON.

Le SDK Blobs utilise le contexte injecté par Netlify ; aucun Personal Access Token Netlify n’est nécessaire à l’exécution. `FileStore` n’est utilisé que localement et suppose **un seul processus**. `MemoryStore` et toutes les réponses synthétiques sont réservés aux tests.

## Contrat HTTP

Chaque endpoint métier demande `Authorization: Bearer <POC_API_TOKEN>`. Le jeton est saisi par l’opérateur, conservé en mémoire et jamais placé dans une URL, le bundle ou un APK. C’est une protection de POC personnel, pas une gestion de comptes publique.

|Méthode|Chemin|Résultat|
|---|---|---|
|POST|`/api/search`|202 `{ jobId, status: "queued", reused: false }` ; job déjà connu : même ID, statut courant et `reused: true` (200 si terminé)|
|GET|`/api/search/:jobId`|Statut, progression, graphe, erreur et résultat terminé sans grosses géométries ; `?result=0` pour polling léger|
|POST|`/api/search/:jobId/cancel`|Job en attente annulé directement ; job actif passe à `cancel_requested`|
|POST|`/api/search/:jobId/resume`|Redéclenche un job queued/running interrompu ; le verrou empêche un second runner concurrent|
|GET|`/api/search/:jobId/routes/:routeId/geometry`|GeoJSON LineString réel, chargé individuellement|
|GET|`/api/geocode?q=...`|Candidats IGN, sans choisir le premier arbitrairement|
|GET|`/api/about`|Public : contact de l’opérateur et attribution OSM/IGN|

Entrée de recherche :

```json
{
  "origin": { "lat": 45.9667, "lon": 5.1917 },
  "destination": { "lat": 48.9138, "lon": 2.6286 },
  "parameters": { "maxExtraMinutes": 45, "vehicleClass": 1 }
}
```

Chaque lieu peut être un texte. Plusieurs candidats ou zéro résultat donnent **HTTP 409 `NEEDS_SELECTION`**, avec tous les candidats pertinents et les lieux déjà résolus. Le client resoumet des coordonnées explicitement choisies. Aucun job Valhalla n’est lancé tant que les deux lieux ne sont pas résolus. La sélection d’un candidat unique n’est possible que s’il est le seul retourné. La console permet ce choix et accepte un nouveau clic sur « lancer » après confirmation.

Le géocodage précède le 202 pour pouvoir renvoyer ces candidats. Le stade initial `geocodage` indique les lieux résolus ; les compteurs commencent ensuite en routage. Le POST froid peut donc prendre le temps de géocoder et lire `/status` ; **il n’attend jamais les quarante routages**. Pendant un accès froid concurrent au fournisseur, 429/503 temporaire reste possible.

Par route : `durationSeconds`, `distanceKm`, `geometryUrl`, `tollExposure` (si trace validée), `pricingStatus: "not_computed"`. Le résultat contient `exposurePareto` et les identifiants respectant le filtre de temps. Ce ne sont ni des tarifs ni une frontière monétaire. Toutes les alternatives sont conservées avec provenance, ou rattachées à leur représentant dédupliqué.

## Blobs et atomicité

Un store persistant **`route-optimizer-v3-poc`**, lectures fortes :

|Clé|Contenu|
|---|---|
|`jobs/<uuid>`|État, dates, paramètres, graphe, progression et checkpoint compact : historique des profils et références des routes|
|`results/<uuid>`|Métadonnées finales, exposition, Pareto, références des géométries ; aucun total en euros|
|`geometries/<hash>`|Polyline6 et géométrie réelle, dates, un objet par représentant/fournisseur/graphe|
|`search-index/<hash>`|Clé canonique de recherche → job actif/résultat récent ; réservation atomique avec fenêtre de création de 30 s|
|`locks/job/<uuid>`|Lease de runner, propriétaire aléatoire, échéance renouvelée|
|`locks/provider/<provider>`|Un seul job FOSSGIS actif pour **ce site**, même entre plusieurs invocations|
|`schedule/<provider>`|Fin du dernier appel réseau, pour espacer les suivants de deux secondes|
|`cache/geocoding/<hash>`|Candidats IGN normalisés, TTL positif 24 h/négatif 1 min|
|`cache/status/<hash>`|Version et graphe constatés, TTL 5 min|
|`cache/valhalla/<hash>`|Réponse `/route` complète et validée, alternatives comprises, TTL 24 h|
|`cache/analyses/<hash>`|Réponse trace stricte `edge_walk` et attributs, TTL 24 h|
|`network/<date>/<uuid>`|Requête/réponse amont brute, heures, HTTP/erreur et SHA-256 ; pas de jetons|

La clé de recherche comprend coordonnées **exactes et orientées**, paramètres utilisateur, classe, version de stratégie, option d’arrêt précoce, fournisseur et version/graphe. Les clés route/trace incluent toutes les options pertinentes ; le filtre d’affichage ne force pas de nouveaux appels route. Pas d’arrondi spatial dangereux.

`onlyIfNew` revendique une clé inexistante ; `onlyIfMatch`/ETag met à jour une version précise. Les changements du job passent par CAS avec tentatives bornées. Le runner utilise un propriétaire unique et vérifie ses leases ; un ancien runner ne doit pas réécrire l’état d’un successeur. Un lease dure 180 s et les appels HTTP sont bornés à 90 s, avec vérification/renouvellement entre opérations. Le verrou fournisseur reste acquis pour la campagne entière. Une recherche distincte concurrente est refusée/échoue explicitement `PROVIDER_BUSY` : **pas de file nationale** dans ce POC.

Si deux créations identiques se chevauchent avant l’écriture du job réservé, l’une peut recevoir 503 `CREATING` plutôt qu’un second job. Une livraison dupliquée du worker est inoffensive sous lease. L’exactement-une-fois réseau/facturation n’est pas garanti en cas de panne entre l’envoi amont et son stockage ; le checkpoint et le cache réduisent les répétitions, sans les prétendre impossibles.

**TTL logique** : jobs/résultats expirent après 24 h ; GET renvoie 410 et les entrées expirées ne sont plus réutilisées. **Pas de purge automatique physique ni de cron dans ce POC.** Supprimer les données expérimentales après les essais, ou ajouter une maintenance contrôlée avant tout usage prolongé. Les expirations n’autorisent pas une conservation illimitée d’adresses personnelles. Les archives versionnées ici ne concernent que des centres communaux et une adresse d’exemple publique, pas des recherches utilisateurs.

## Exécution longue, progression, reprise et annulation

L’API crée le job avant de déclencher le worker interne avec un second secret distinct. Le **202 Netlify background est vide** ; notre API renvoie son propre identifiant après cet accusé. Le payload interne ne contient que le jobId (<1 KB, sous la limite Netlify 256 KB). L’API a la limite synchrone de 60 s ; le worker a celle de 15 min. Le POC vérifie un budget interne de 8 min entre opérations ; il peut finir `failed/TIME_BUDGET` avec checkpoint conservé. Les I/O de stockage ne constituent pas une garantie d’arrêt exact à huit minutes.

Après chaque profil et analyse : stade, profil courant/paramètres, profils exécutés/plafond, géométries uniques, analyses effectuées et checkpoint. La géométrie est séparée pour garder le polling léger. La progression est persistante et survit à une lecture/reconnexion ; ce n’est pas un pourcentage de temps restant garanti.

Arrêt coopératif : l’appel amont déjà engagé n’est pas tué par une annulation. Le worker vérifie avant/après ses attentes, entre appels et avant la validation finale ; il n’en lance plus après détection. Un appel en cours peut encore durer jusqu’au timeout de 90 s, plus les opérations de stockage. L’invocation Netlify elle-même reste vivante jusqu’au retour du handler.

Un crash réel laisse `running` et un lease qui expire. Une redélivrance du même job reprend l’historique et les analyses, en hydratant ses géométries. Netlify annonce deux retries de fonction en erreur (1 min puis 2 min) ; un lease encore actif provoque une erreur de redélivrance pour permettre le retry suivant. Le bouton/endoint `resume` permet de redéclencher après expiration. **La livraison et le crash du runtime Netlify n’ont pas encore été testés en hébergement.** Une erreur attendue du fournisseur termine `failed`, sans flood de retries ; resoumettre la recherche crée un nouveau job qui réutilise les caches valides.

Erreurs explicites : 400 entrée, 401 jeton, 403 Origin, 404 job/route, 409 choix géographique/reprise impossible, 410 expiration, 429 fournisseur occupé, 502 données amont invalides ou réseau, 503 configuration/stockage/lancement. L’erreur du worker est dans le statut GET. HTTP 429 amont, JSON invalide, `edge.toll` absent, unités incorrectes, trace incohérente ou graphe changé ne donnent jamais un faux succès ni un péage gratuit.

## Arrêt expérimental facultatif

`POC_EARLY_NO_TOLLS=true` uniquement : après les neuf sondes, ensembles de géométries identiques, analyse stricte des représentants uniques et zéro km marqué à péage → arrêt. L’option participe à la clé de job. **Défaut : false** ; ce test Rennes n’est pas une preuve universelle qu’aucun compromis caché n’existe.

## Tester dans Codex

```sh
cd experiments/backend-v3
npm ci
npm test
npm run check:functions
npm run build:functions
npm run test:replay
```

Les tests ouvrant un émulateur sur localhost nécessitent un environnement autorisant les ports locaux. Le test de replay exige Python 3 et les archives déjà présentes dans le dépôt, sans réseau.

Pour démarrer le serveur local, fournir `POC_API_TOKEN` (aléatoire, >=32 caractères) et `POC_FOSSGIS_POLICY_REVIEWED=true` dans l’environnement du terminal, puis `npm run dev`. Pas de lecture automatique de `.env`. Console sur `http://127.0.0.1:8787` depuis l’environnement ; ce localhost n’est pas un lien public pour l’ordinateur professionnel. Le frontal V2 n’utilise pas ce backend.

Recalcul réel uniquement si justifié et après relecture des [conditions FOSSGIS](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) :

```sh
# Nouveau dossier exigé ; ne pas lancer en parallèle des campagnes locales/Netlify.
npm run test:live -- --live --policy-reviewed
npm run test:live -- --live --policy-reviewed --rennes --early-no-tolls
```

Ces scripts utilisent les coordonnées archivées explicitement documentées et testent IGN séparément ; ils ne choisissent jamais le premier candidat d’une adresse ambiguë. Deux secondes **après la réponse précédente**, une connexion logique, identification HTTP, Referer et arrêt sur erreur. Pas de changement d’IP/endpoint pour contourner un refus.

Les sources et réponses de cette exécution sont archivées dans `evidence/live-data.tar.xz` ; extraction dans `evidence/` puis `node scripts/validate-live.mjs` pour vérification hors ligne. Ne pas utiliser ces archives comme cache produit préchargé ou comme résultats dynamiques pour une autre saisie.
