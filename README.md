# Route Optimizer — V2 intermédiaire

Web-app responsive en français pour comparer de vrais itinéraires **pré-calculés** entre **Crans (01320) et Le Pin (77181)**. Le design V1 est conservé ; la carte affiche maintenant les géométries réelles sur OpenStreetMap.

> **Prototype expérimental, un seul trajet, dans ce sens uniquement.** Aucun routage dynamique, géocodage, trafic actualisé ou guidage national. Les 28 variantes viennent de la campagne Valhalla du 29 octobre 2026 ; les tarifs documentés sont TTC standard APRR classe 1 au 1er février 2026, sans remise. Aucun montant n'est simulé ou estimé au kilomètre.

## Données et résultats

- **28 variantes réelles**, sans modification des coordonnées archivées.
- **22 totaux complets dans le périmètre audité**, dont 3 sans péage détecté, et **6 tarifs incomplets**.
- Frontière temps/euros : **R18, R23, R14, R27, R15, R12, R4, R1**. Les autres totaux complets sont dominés ; ils ne deviennent pas des compromis utiles en changeant les filtres.
- Les incomplets **R7, R8, R13, R19, R20, R24** restent consultables séparément pour leur tracé. Le sous-total APRR n'est jamais traité comme un total. Ni économie ni €/minute ne sont calculés pour eux ; ils ne participent pas au Pareto ou à la recommandation.
- Le volet des incomplets respecte le plafond de temps. Il indique explicitement que le seuil d'économie ne peut pas être évalué pour ces trajets.

Les villes sont en lecture seule. Les critères sont appliqués immédiatement. Le curseur va de 0 à 180 minutes pour permettre d'explorer l'option sans péage détecté, à environ +162,3 min. Avec +30 min, R12 (+101,4 min) n'est ni proposé ni sélectionnable. Si aucun total complet ne respecte les critères, un message l'indique et aucun trajet hors critères n'est choisi automatiquement.

Les huit compromis ne forment qu'une frontière **parmi les totaux complets connus**, pas un optimum global incluant les prix inconnus. Les zéros reposent sur l'absence de péage détecté dans les données routières, sans validation terrain des facturations.

R26 est complet à **39,20 €** : Pont-d’Ain → Dijon-Crimolois 16,40 € (PDF APRR 2026 p. 202), puis Pouilly-en-Auxois → Les Éprunes 22,80 € (p. 205). Références et confiance conservées : correspondances « suffisamment fiable », montants « confirmé ». L’[audit complémentaire](https://github.com/NogeomHub/route-optimizer/blob/430ad65e14803ca6033c6074764f030c5a890c25/experiments/tolls/completion/REPORT.md) est référencé sans importer ses scripts ou ses grilles ALIAE. R26 reste dominé par R14 ; il est consultable dans le volet des autres tarifs complets, filtré par temps et économie, sans participer aux recommandations.

## Installation et lancement

Prérequis : Node.js 22+ et npm (validation réalisée sous Node 24).

```sh
cd /workspace/route-optimizer # ou votre dossier de clone
npm ci
npm run dev -- --port 5173
```

En développement, l'application écoute sur `0.0.0.0:5173` et son chemin est `/`. Aucun backend, compte, clé API ou abonnement payant. Les géométries sont servies localement ; seul le fond OpenStreetMap nécessite Internet.

L'environnement d'onboarding Codex utilisé ici ne fournit pas d'aperçu public du port. Un serveur accessible dans la machine cloud n'est pas accessible au `localhost` de votre ordinateur. Utilisez un environnement disposant d'un transfert de port, ou lancez le projet sur votre ordinateur. Ne publiez pas cette branche sur le site Pages existant pour en faire un aperçu : cela remplacerait le site actuel.

## Prévisualiser la V2 sans toucher à main

La branche dédiée est `feat/v2-archived-real-routes`, issue de `experiment/valhalla-hybrid-poc`.

Pour un nouveau clone local :

```sh
git clone --branch feat/v2-archived-real-routes https://github.com/NogeomHub/route-optimizer.git
cd route-optimizer
npm ci
npm run dev
```

Pour prévisualiser exactement le build destiné à Pages :

```sh
npm run build
npm run preview -- --port 4173
```

Ouvrez alors **http://localhost:4173/route-optimizer/** sur la machine où le serveur tourne. La prévisualisation locale ne déploie rien. Une prévisualisation sans installation dans un navigateur distant nécessite un hébergement ou un transfert de port distinct, absent de l'interface d'onboarding actuelle. Aucune URL publique de prévisualisation n'est fabriquée par ce projet.

## Architecture

- `src/routing/RoutingProvider.ts` : contrat asynchrone de fournisseur ; mode `archived` et contrat séparé de chargement géométrique. Un fournisseur dynamique pourra les implémenter ultérieurement.
- `src/routing/ArchivedRoutingProvider.ts` : refuse toute autre origine/destination ; charge les métadonnées locales et, à la demande, le GeoJSON du trajet sélectionné. Cache mémoire, validation, erreurs et signal d'annulation.
- `src/data/archive.json` : durées précises, distances, totaux ou `null`, sous-totaux connus, axes et références des cellules tarifaires auditées.
- `public/data/routes/R*.geojson` : les 28 géométries exactes, une par fichier ; chargées seulement à la sélection. `public/data/manifest.json` conserve les empreintes des entrées et des fichiers exportés.
- `data/audited-pricing.json` : catalogue produit des 28 tarifs audités ; seule la donnée R26 a été mise à jour depuis l’audit complémentaire. Les six données A79 restent celles du POC initial.
- `scripts/export_archive.py` : export reproductible hors ligne depuis le catalogue tarifaire produit et les archives Valhalla, sans API. Les fichiers exportés sont versionnés : le build Pages n'a pas besoin de Python ou des PDF APRR.
- `src/pricing/pricing.ts` : distinction stricte total complet / inconnu, formatage des centimes et des durées.
- `src/domain/optimization.ts` : Pareto, filtres, métriques et recommandation indépendants de l'UI.
- `src/components/RouteMap.tsx` : Leaflet et tuiles OpenStreetMap, géométrie réelle, recalage et protection contre les réponses tardives.
- `src/components/CostChart.tsx` : graphique interactif accessible au clavier des compromis admis ; X = détour précis, Y = euros de péage ; sélection synchronisée avec carte et cartes de résultats.
- `src/components/PricingDetails.tsx` : total ou sous-total, gares et pages du PDF officiel, réserves et lien vers l'audit.
- `src/App.tsx`, `src/styles.css` : interface et identité visuelle conservées.

Les anciens fichiers `DemoRoutingProvider.ts` / `demoData.ts` restent pour les tests historiques ; ils ne sont plus utilisés par l'application ni présentés comme des résultats réels. Les POC Python et leurs preuves restent isolés dans `experiments/`.

## Pareto et recommandation

La frontière minimise la durée et le **total connu en centimes**, en O(n log n). Les trajets dominés et les doublons temps/coût sont écartés sans modifier l'entrée ; distance et énergie restent informatives. Un `null`, un sous-total ou un statut partiel n'est jamais considéré comme zéro.

Les filtres utilisent les durées non arrondies et les seuils inclusifs : détour ≤ plafond, économie ≥ minimum. La référence est R18 (298,605 min, 40,70 €), le plus rapide observé du jeu. La référence reste indiquée en texte si elle ne satisfait pas l'économie minimale, mais sa carte de résultat n'est pas proposée hors critères.

Parmi les compromis admissibles, on maximise cette **heuristique initiale**, sans prétendre à une optimalité scientifique :

```text
économie = (péage R18 − péage candidat), en euros
détour = durée candidat − durée R18, en minutes
efficacité = économie / détour, ou 0 si détour nul
score = économie − 0,20 × détour + 2 × min(2, efficacité)
```

Le coefficient 0,20 €/min correspond à une valeur du temps de départ de 12 €/h ; la prime favorise l'efficacité des économies et reste plafonnée. Les poids sont regroupés dans `RECOMMENDATION_WEIGHTS`. À égalité, le plus rapide puis l'identifiant départagent les candidats. Aucun identifiant Rxx n'est privilégié par le score.

Avec +45 min et aucun minimum, **R27** est recommandé : 31,40 €, +29,6 min, 9,30 € économisés, environ 0,31 €/min. Avec +20 min, c'est R14 ; avec zéro détour, R18. Une autre pondération peut changer ces choix. Le candidat le moins cher dans les critères est également identifié, même s'il n'est pas recommandé.

## Carte et limites réseau

Leaflet est gratuit et n'exige pas de clé. Le fond utilise `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, avec attribution visible, zoom raisonnable et aucun préchargement de zones. Respecter la [politique OSM des tuiles](https://operations.osmfoundation.org/policies/tiles/) ; les serveurs communautaires n'offrent pas de garantie de disponibilité et un déploiement à fort trafic devra revoir le fournisseur.

Le changement de sélection charge la vraie géométrie, efface l'ancien tracé et recadre la carte. Les extrémités utilisent des cercles Leaflet, sans dépendance à des images de marqueur sensibles au chemin de base. L'échec d'une géométrie produit un message et un bouton Réessayer ; aucun tracé fictif ne lui est substitué. Si le fond OSM échoue, un avertissement l'indique et le tracé reste disponible.

Un seul tracé coloré est utilisé. Le booléen OSM `toll` n'identifie pas de manière fiable les transactions de péage : colorer des sections tarifaires à partir de lui serait trompeur.

## Tests

```sh
npm test
npm run build
npm run test:e2e
TEST_PREVIEW=1 npm run test:e2e # build préalable ; shell Linux/macOS
```

Les tests navigateur utilisent Chromium (`/usr/bin/chromium` par défaut dans Codex, ou `CHROMIUM_PATH`). Ils démarrent le serveur si nécessaire. Les tests automatisés isolent uniquement les tuiles raster externes ; géométries et tarifs restent les vraies archives locales. Une vérification séparée avec le vrai fond OSM a également obtenu des tuiles HTTP 200.

Couverture : **18 tests unitaires**, dont parité avec les 28 archives, exactitude de toutes les coordonnées exportées, huit résultats Pareto, recommandation, seuils précis, statut partiel et erreurs du fournisseur. **10 tests navigateur** en développement et les mêmes sous la base Pages : tracé, sélection via graphique, filtres, tarifs incomplets, erreur/reprise de chargement, fond indisponible, réponse tardive, écrans 320/390/1280 px. Les tests POC Python existants ont aussi été exécutés : 18 tarifs et 10 Valhalla.

## GitHub Pages

La base de production reste **`/route-optimizer/`**, y compris pour les GeoJSON chargés avec `import.meta.env.BASE_URL`. Le workflow `.github/workflows/deploy-pages.yml` reste inchangé : tests et build sur PR vers `main`, déploiement uniquement sur `main`. Pousser la branche V2 ne remplace pas le site V1.

Après une éventuelle intégration future dans `main`, l'adresse restera `https://nogeomhub.github.io/route-optimizer/`, avec **Settings → Pages → Source : GitHub Actions**. Aucun déploiement de cette V2 n'est réalisé à cette étape, aucune Pull Request créée.

## Limites et suite

Trajet et sens uniques, données figées, pas de trafic actualisé ou navigation. Les tarifs incomplets concernent A79 et des correspondances non résolues à Val-de-Loing et Val de Saône dans le catalogue produit ; ils restent inconnus. Les droits de réutilisation générale des données tarifaires, les prix des autres concessions, les véhicules/remises et la qualité des référentiels restent à traiter avant un produit national. Les originaux PDF APRR ne sont pas distribués dans l'application.

Sources : [rapport Valhalla](experiments/valhalla/REPORT.md), [audit tarifaire](experiments/tolls/REPORT.md), [tarifs officiels APRR](https://voyage.aprr.fr/tarifs-de-peage). Géométries et fond © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL ; [signaler une erreur cartographique](https://www.openstreetmap.org/fixthemap).

## Prévisualisation publique V2 indépendante (préparée, non publiée)

Un projet **Cloudflare Pages Free distinct** peut publier la branche V2 sans remplacer le site GitHub Pages V1. La configuration et les étapes manuelles d'autorisation sont dans [docs/PREVIEW.md](docs/PREVIEW.md). Aucun compte ni déploiement tiers n'est créé automatiquement.

Build de ce projet séparé : `npm test && npm run build:preview`, sortie `dist`, base `/`. Le build GitHub Pages habituel conserve `/route-optimizer/`. L'URL attendue, uniquement après création et déploiement manuels et si le nom est libre, est `https://route-optimizer-v2-preview.pages.dev/`.
