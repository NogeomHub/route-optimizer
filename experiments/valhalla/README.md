# POC Valhalla — expérience isolée, non connectée à la V1

**Statut : campagne réelle terminée le 29 octobre 2026 : 105 profils, 309 candidats, 28 variantes, 13 compromis de Pareto temps/km payants.** Voir [REPORT.md](REPORT.md). Aucun import dans React, changement de fournisseur V1 ou dépendance npm. Python 3.10+ et bibliothèque standard uniquement.

## Sources et possibilités vérifiées

Sources officielles examinées au commit Valhalla `983da51337573b43ac8b252fdaa3139922b8f3cd` (la version d'une future instance devra être enregistrée via `/status`) :

- [API route](https://github.com/valhalla/valhalla/blob/983da51337573b43ac8b252fdaa3139922b8f3cd/docs/docs/api/route/api-reference.md).
- [AutoCost](https://github.com/valhalla/valhalla/blob/983da51337573b43ac8b252fdaa3139922b8f3cd/src/sif/autocost.cc), [DynamicCost](https://github.com/valhalla/valhalla/blob/983da51337573b43ac8b252fdaa3139922b8f3cd/valhalla/sif/dynamiccost.h).
- [Map matching et trace_attributes](https://github.com/valhalla/valhalla/blob/983da51337573b43ac8b252fdaa3139922b8f3cd/docs/docs/api/map-matching.md), [sérialiseur des attributs](https://github.com/valhalla/valhalla/blob/983da51337573b43ac8b252fdaa3139922b8f3cd/src/tyr/trace_serializer.cc).

### Paramètres automobiles

- `use_tolls` : [0,1], neutre à 0,5. Sous 0,5, le facteur ajouté aux arêtes à péage est `4 - 8 × use_tolls`. Au-dessus, légère préférence : `(0.5 - use_tolls) × 0.03`. **0 n'est pas une interdiction** et 1 n'est pas une garantie de trajet le plus rapide.
- `toll_booth_penalty` : coût de recherche en secondes, sans ajout à l'ETA. Le code actuel l'applique aux barrières **ou aux transitions gratuit → payant**, pas uniquement aux objets barrières OSM. Il peut donc décourager les reprises du réseau payant.
- `toll_booth_cost` : 15 s par défaut, ajoute aussi du temps à l'ETA. Fixé à 15 pour ne pas confondre modification du temps estimé et aversion.
- `use_highways` : préférence autoroutière indépendante. Fixée à 0,5 pour isoler les effets liés aux péages. D'autres options auto existent (ferries, routes dégradées, pénalités de manœuvre, etc.) ; elles restent à leurs défauts.
- `exclude_tolls` : exclusion plus stricte mais possibilité de départ/arrivée sur péage ; peut rendre le trajet impossible. Profil de contrôle séparé.
- `alternates: 2` : demande jusqu'à deux alternatives, sans garantie d'en obtenir. Les alternatives ne sont pas prises en charge sur les trajets multipoints ou dépendants de l'heure selon la documentation actuelle. Ici deux lieux, sans date/heure.

Un changement de pondération peut modifier globalement la combinaison d'arêtes, donc produire un hybride sans waypoint imposé. Il ne garantit ni exhaustivité de la frontière de compromis, ni découverte de toutes les sorties intéressantes. Les objectifs sont des coûts généralisés, pas des prix en euros. Des solutions Pareto non supportées peuvent échapper à un balayage pondéré.

## Campagne préparée

1. Lire `/status`, puis géocoder **Crans / 01320** et **Le Pin / 77181** via `geo.api.gouv.fr`. Exiger une commune unique, nom et code postal concordants. Il s'agit du centre communal, pas d'une adresse exacte ; la réponse et les coordonnées sont archivées.
2. Balayer 26 préférences (`0…0,5` par pas de 0,025, puis `0,6…1` par pas de 0,1) × 4 pénalités (0, 300, 900, 1800 s), soit **104 requêtes route**, plus **1 contrôle `exclude_tolls`**. Maximum théorique 315 candidats si deux alternatives sont réellement retournées à chaque fois.
3. Regrouper les géométries quasi identiques : échantillonnage ≤100 m, grille 0,002°, recouvrement pondéré par longueur ≥99,9 %, durée et distance à ±0,25 %. Seuil volontairement strict pour ne pas masquer les détours. C'est une approximation de corridor, pas une équivalence topologique ; toutes les réponses brutes et les paramètres de chaque membre sont conservés pour révision.
4. Pour chaque représentant, appeler `trace_attributes` en **`edge_walk`**, sans repli permissif `map_snap`. Demander `edge.toll`, `edge.length`, noms et indices géométriques. Rejeter les attributs absents et les longueurs/positions incohérentes ; ne jamais interpréter une absence d'attribut comme « gratuit ».
5. Additionner les longueurs des arêtes marquées à péage ; les autres forment les portions gratuites. Relever les transitions, et particulièrement les séquences **payant → gratuit ≥2 km → payant**. Ce sont des indices à inspecter, pas des échangeurs ou barrières tarifaires vérifiés. Les noms OSM peuvent être absents ; le nom d'un échangeur n'est pas garanti.
6. Mesurer la proximité géométrique du centre approximatif d'Avallon (3,908° E, 47,490° N). Le seuil indicatif de 20 km ne prouve pas une sortie A6 : comparer axes et coordonnées des transitions. Aucun géocodage précis d'Avallon revendiqué.

## Exécution (validée sur Valhalla FOSSGIS 3.9.1-983da51)

Aucune instance publique par défaut. Avant utilisation d'un service tiers, vérifier ses conditions, quotas, licence et capacité pour **105 requêtes route + une trace par représentant + status**. L'accès gratuit ne constitue pas une autorisation d'usage intensif. Si les limites ne permettent pas cette campagne, utiliser sa propre instance Valhalla et des tuiles France à jour. La version du service peut ignorer ou limiter certains paramètres : contrôler les réponses, avertissements et configuration serveur, pas seulement l'absence d'erreur HTTP.

```sh
cd experiments/valhalla
python -m unittest -v
# Une seule requête route pour commencer ; nouveau dossier obligatoire.
python poc.py --endpoint https://VOTRE-INSTANCE --policy-reviewed --output runs/probe --max-routes 1
# Seulement après contrôle du probe et des règles de l'instance :
python poc.py --endpoint https://VOTRE-INSTANCE --policy-reviewed --output runs/sweep --max-routes 105 --delay 5
```

`--policy-reviewed` est une déclaration de l'opérateur, pas une vérification automatique des conditions. Pas de clé ni secret. Le client respecte le proxy/TLS du système, espace les requêtes, ne retente pas en boucle, et s'arrête sur échec. Le compteur inclut les tentatives réseau échouées. Les rapports partiels restent enregistrés. La campagne complète prend au minimum plusieurs minutes et davantage avec les analyses. Les dossiers `runs/` ne sont pas versionnés.

Sorties : requêtes et réponses JSON brutes, `/status`, coordonnées, profils, `results.json` (métriques, paramètres, axes, transitions, portions gratuites intermédiaires, proximité Avallon), `routes.geojson`, `REPORT.md`. L'écart de durée est relatif au **plus rapide observé**, pas à un optimum global. Les km péage reposent sur OSM et ne constituent ni un tarif ni une vérification juridique du statut de la route.

## Ancien blocage réseau (résolu lors de la reprise)

Lors de la première tentative, le proxy Codex refusait le tunnel HTTPS vers `valhalla1.openstreetmap.de` et `geo.api.gouv.fr` avec `CONNECT tunnel failed, response 403`. Il faut faire autoriser ces destinations dans les paramètres réseau de l'environnement, **sans supprimer les autorisations existantes**, puis vérifier les conditions de l'instance et réexécuter le probe. L'instance publique reste une candidate d'expérimentation, pas une dépendance de l'application. Ses conditions ont depuis été consultées : voir REPORT.md et l'archive de preuves. Une autre instance explicitement autorisée est possible.

Le moteur Valhalla et les tuiles routières françaises ne sont pas installés ici ; la seule présence de Docker ne fournit pas ces données. Aucune campagne locale auto-hébergée n'a été effectuée. Les tests unitaires utilisent des données synthétiques étiquetées, jamais présentées comme des résultats géographiques réels.

## Analyser les réponses archivées sans réseau

```sh
python analyse_campaign.py runs/sweep-live
```

Le dossier `evidence/2026-10-29` contient les résultats conservés, le rapport autonome et une archive des réponses réelles. Les données synthétiques restent exclusivement dans les tests. Les longues portions gratuites restant sur la même autoroute sont distinguées des sorties confirmées par les instructions. Aucun de ces fichiers n’est importé par la V1.
