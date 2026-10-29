# Expérience réelle Valhalla : Crans → Le Pin — 29 octobre 2026

**Conclusion : oui, Valhalla produit automatiquement des compromis réels et des hybrides avec sortie du réseau payant, routes gratuites et reprise d’autoroute payante, sans waypoint forcé.** Cela valide une capacité de génération de candidats, pas une optimisation en euros ni une frontière exhaustive.

La V1, son interface, son fournisseur et ses données simulées sont inchangés. Aucun déploiement ni Pull Request. Travail limité à la branche `experiment/valhalla-hybrid-poc`.

## Exécution et provenance

- Service : `https://valhalla1.openstreetmap.de`, Valhalla `3.9.1-983da51`. Version et horodatage du jeu de tuiles identiques avant/après (`1793275492` ; ce timestamp ne garantit pas la fraîcheur de chaque donnée OSM).
- FOSSGIS : [conditions consultées](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) ; maximum 1 requête/s, scripts à une connexion. Expérience ponctuelle, séquentielle, pause de 5 s après chaque réponse, user-agent identifiant le projet ; aucune intégration de ce service public dans la V1.
- Origines vérifiées via `geo.api.gouv.fr` : Crans 01320 / INSEE 01129, centre `[5.1917,45.9667]` ; Le Pin 77181 / INSEE 77363, centre `[2.6286,48.9138]`. Coordonnées en longitude, latitude. Centres communaux, pas adresses précises. Corrélation routière retournée : `[5.191190,45.964963]` → `[2.628680,48.913865]`.
- 105 profils : 26 valeurs de `use_tolls` × 4 pénalités (0, 300, 900, 1800 s), plus un contrôle `exclude_tolls=true`. `use_highways=0.5`, `toll_booth_cost=15`, deux alternatives demandées, pas de départ horaire ni point intermédiaire imposé.

| Périmètre | /route | /trace_attributes | /status | Géocodage |
|---|---:|---:|---:|---:|
| Campagne complète | 105 | 28 | 1 | 2 |
| Session complète, probe et contrôles inclus | 106 | 31 | 4 | 6 |

**141 appels Valhalla au total**, dont 106 calculs route. La campagne seule reçoit **309 candidats**, ramenés à **28 variantes** (281 doublons/quasi-doublons écartés), avec **13 compromis de Pareto durée / km marqués à péage**. Aucun avertissement dans les réponses route, aucune erreur de campagne. Les 309 candidats sont tous attribués à un groupe et à leurs profils producteurs.

## Comparatif exhaustif

Les durées sont les estimations retournées, sans trafic temps réel garanti. Le détour est relatif au plus rapide observé. **Les kilomètres payants ne sont pas un tarif et leur réduction ne garantit pas une économie proportionnelle.**

`u` = use_tolls, `p` = toll_booth_penalty en secondes, `alt` = 0 principal / 1 ou 2 alternative. Le tableau donne le premier profil producteur ; le [détail complet](evidence/2026-10-29/COMPARISON.md) et le [JSON](evidence/2026-10-29/comparison.json) donnent TOUS les paramètres producteurs, passages, axes et transitions.

|ID|Durée min|Distance km|Km péage|% péage|+min|Pareto|Premier profil (u ; p ; alt)|Axes majeurs|
|---|---:|---:|---:|---:|---:|---|---|---|
|R18|298.6|492.0|434.2|88.3|0.0|oui|0.475 ; 0 ; 0|A6, A5, A40, A19, N104, A42|
|R16|302.0|491.9|408.4|83.0|3.4|oui|0.45 ; 0 ; 1|A6, A40, N104, A42, A104, D904|
|R23|302.4|490.6|426.7|87.0|3.8|non|0.475 ; 300 ; 0|A6, A5, A40, A19, N104, D984|
|R14|317.9|469.6|345.7|73.6|19.3|oui|0.425 ; 0 ; 1|A6, N104, D26, D7, D1079, A104|
|R17|318.9|530.3|472.6|89.1|20.3|non|0.45 ; 0 ; 2|A5, A39, A31, A40, N104, A42|
|R22|322.7|528.9|465.0|87.9|24.1|non|0.425 ; 300 ; 2|A5, A39, A31, A40, N104, D984|
|R28|325.7|530.3|466.4|88.0|27.1|non|0.5 ; 1800 ; 1|A6, A39, A5, A36, A19, A40|
|R26|327.1|530.2|409.5|77.2|28.5|non|0.5 ; 900 ; 2|A6, A39, A5, A38, A19, A40|
|R27|328.2|465.0|335.7|72.2|29.6|oui|0.475 ; 1800 ; 0|A6, A5, D975, A19, D22, N104|
|R11|331.7|464.8|309.8|66.7|33.1|oui|0.4 ; 0 ; 1|A6, D975, N104, D22, A104, D117|
|R19|346.9|543.2|223.3|41.1|48.3|oui|0.475 ; 0 ; 2|A77, N79, N7, A79, A40, A6|
|R13|359.6|515.9|158.1|30.7|60.9|oui|0.425 ; 0 ; 0|A77, N79, N7, A79, A6, N104|
|R24|363.9|517.3|152.7|29.5|65.3|oui|0.475 ; 300 ; 2|A77, N79, N7, A79, A6, N104|
|R8|369.0|507.7|135.1|26.6|70.4|oui|0.375 ; 0 ; 0|A77, N79, N7, A6, N104, A79|
|R15|386.2|465.1|223.5|48.1|87.6|non|0.425 ; 0 ; 2|A6, D905, A5, D980, D26, N104|
|R20|386.5|513.0|112.4|21.9|87.9|oui|0.4 ; 300 ; 0|A77, N79, N7, A6, N104, D7|
|R12|400.0|460.3|187.7|40.8|101.4|non|0.4 ; 0 ; 2|A6, D905, A5, D975, D980, D22|
|R25|403.2|486.7|215.3|44.2|104.6|non|0.475 ; 900 ; 2|A6, D906, A5, D981, D7, A19|
|R7|425.1|491.9|47.1|9.6|126.5|oui|0.35 ; 0 ; 0|A77, N79, N7, D2007, D607, A79|
|R4|443.4|478.4|22.7|4.7|144.8|oui|0.325 ; 0 ; 0|A77, N79, D979, D2007, D607, D981|
|R1|460.9|483.7|0.0|0.0|162.3|oui|0.0 ; 0 ; 0|A77, N79, D979, D2007, D7, D607|
|R10|465.2|472.6|72.4|15.3|166.6|non|0.375 ; 0 ; 2|D606, D906, A5, D981, D7, N104|
|R9|468.0|479.9|72.4|15.1|169.4|non|0.375 ; 0 ; 1|D905, D906, A5, D981, D980, D7|
|R21|472.4|481.3|67.0|13.9|173.8|non|0.4 ; 300 ; 2|D905, D906, A5, D981, D980, D7|
|R6|506.7|470.5|5.4|1.1|208.1|non|0.325 ; 0 ; 2|D606, D906, D981, D605, D7, N104|
|R5|509.6|477.7|5.4|1.1|211.0|non|0.325 ; 0 ; 1|D905, D906, D981, D980, D606, D605|
|R3|511.1|471.9|0.0|0.0|212.5|non|0.0 ; 0 ; 2|D606, D906, D981, D7, D605, N104|
|R2|514.0|479.2|0.0|0.0|215.3|non|0.0 ; 0 ; 1|D905, D906, D981, D980, D7, D606|

## Hybrides confirmés et nuance sur les transitions

- **R13**, `use_tolls=0.425`, pénalité 0, trajet principal : 359,6 min / 515,9 km / 158,1 km payants. Après utilisation de l’A79, instruction réelle **« Prenez la sortie Échangeur A79 / N7 dans N7 vers Nevers/Moulin - centre/Yzeure. »**. Sortie du marquage payant vers `[3.363513,46.495831]`, puis environ **127,2 km gratuits** incluant N7 et A77 ; reprise du marquage payant à `[2.939573,47.429151]`. Ce compromis est non dominé dans cette campagne.
- **R8**, `use_tolls=0.375`, pénalité 0, principal : 369,0 min / 507,7 km / 135,1 km payants, soit +70,4 min pour environ 299,1 km payants en moins que R18. Longue portion gratuite via D779/N7/A77 entre deux portions payantes.
- Les séries gratuit/payant exposées par `edge.toll` ne sont **pas systématiquement des sorties autoroutières** : certaines portions gratuites restent sur A79 ou A77. Les intervalles de 6,1 km sur A79 et 26,6 km sur A77 ne sont donc pas revendiqués comme détours hors autoroute. Le détail distingue références N/D et instructions de sortie présentes à moins de 2 km de la transition.

## A6, Avallon et secteur proche

**Pas de sortie A6 identifiée à Avallon même dans ces 105 profils.** Les rapides sur A6 passent à environ 6,9 km du centre indicatif d’Avallon mais restent sur A6 ; les variantes par D606 passent à environ 1 km de ce centre, sans avoir quitté A6 dans cette zone.

En revanche, **R12 et R15 quittent réellement A6 à la sortie 23**, avec instruction **« Prenez la sortie 23 vers Montbard. »**, signalisation vers Montbard et Semur-en-Auxois :

- Début de bretelle : `[4.309975,47.433387]` (lon, lat). Début de la portion marquée gratuite : `[4.309545,47.436544]`.
- Distance à vol d’oiseau du centre indicatif d’Avallon : **environ 31 km à l’est**, donc secteur élargi, pas Avallon même. La distance n’est pas une distance routière.
- Puis **143,3 km gratuits** via D980, D905, D660, D606 ; reprise du marquage payant vers `[3.262321,48.237013]`, par A19/A5.
- **R12** : `u=0.4`, `p=0`, alternative 2 ; 400,0 min, 460,3 km, 187,7 km payants, +101,4 min.
- **R15** : `u=0.425`, `p=0`, alternative 2 ; 386,2 min, 465,1 km, 223,5 km payants, +87,6 min.
- **R25** reprend le même secteur de sortie : `u=0.475`, `p=900`, alternative 2 ; 403,2 min, 486,7 km, 215,3 km payants.

Ces variantes répondent au schéma A6 → sortie → réseau gratuit → A19/A5, mais sont **dominées en durée / km payants** par d’autres candidats de cette campagne. Elles restent utiles pour prouver la capacité technique ; leur éventuel intérêt tarifaire devra être réévalué avec les vrais prix.

## Méthode, limites et contrôles

- Déduplication conservatrice : géométrie échantillonnée à ≤100 m, grille 0,002°, recouvrement pondéré ≥99,9 %, durée et distance à ±0,25 %. Les 28 groupes sont des variantes géométriques selon ce seuil, pas une preuve de 28 corridors totalement disjoints. Les réponses brutes et appartenances permettent une révision.
- Analyse par `trace_attributes`, mode strict `edge_walk`, sans repli map matching. Unités kilomètres vérifiées, absence d’attribut rejetée, bornes géométriques et longueurs contrôlées. Écart longueur trace / route observé entre environ 0,004 % et 0,014 % (arrondis des longueurs d’arête).
- Les attributs OSM ne sont pas une validation terrain du statut gratuit/payant. Les limites entre tronçons peuvent représenter un changement de marquage, du flux libre ou une barrière ; les instructions de sortie sont vérifiées séparément.
- Une aversion globale peut basculer brutalement de corridor ; elle ne garantit pas de découvrir chaque sortie intéressante. Les alternatives ne sont pas exhaustives. Une génération ciblée autour des échangeurs et une phase d’optimisation tarifaire restent à explorer.
- Les pénalités sont des coûts de recherche, pas des euros. Le poids constant par entrée peut décourager précisément les reprises recherchées. Ne pas augmenter `toll_booth_cost` pour imiter un prix : il affecte l’ETA.
- Aucun prix APRR/AREA calculé, aucune économie monétaire revendiquée ; pas de garantie de trafic, de durée réelle, de disponibilité de l’instance publique ou d’optimalité globale.
- Tests : **10 tests expérimentaux hors ligne réussis**, **6 tests V1 réussis**, **build TypeScript/Vite réussi**. Rapport HTML autonome testé dans Chromium, sélection et rendu sans erreur JavaScript.

## Livrables et conclusion

- [Détail exhaustif, profils et passages](evidence/2026-10-29/COMPARISON.md).
- [Visualisation autonome HTML](evidence/2026-10-29/comparison.html) : tracés réels sans tuiles externes, sélection des 28 variantes ; point orange = centre indicatif d’Avallon.
- [Données comparatives](evidence/2026-10-29/comparison.json), [GeoJSON](evidence/2026-10-29/routes.geojson), [compteurs et version](evidence/2026-10-29/stats.json).
- [Archive des requêtes/réponses réelles et conditions consultées](evidence/2026-10-29/raw-responses.tar.gz), [empreintes SHA-256](evidence/2026-10-29/SHA256SUMS).

**Valhalla semble adapté comme moteur de génération de candidats pour Route Optimizer.** La campagne démontre plusieurs compromis et de vrais hybrides sans waypoint imposé. Elle ne démontre pas encore un optimiseur tarifaire complet, ni une méthode exhaustive pour trouver les meilleurs échangeurs. Pour Avallon, le résultat positif concerne ici la sortie 23 vers Semur/Montbard, à ~31 km du centre ; pas une sortie à Avallon même.

Données © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/index.html). Calculs Valhalla / FOSSGIS. [Signaler une erreur cartographique](https://www.openstreetmap.org/fixthemap).
