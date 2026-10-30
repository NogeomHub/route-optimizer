# rennes-saint-brieuc — données réelles

**Exposition = km marqués à péage dans OSM, aucun montant en euros.**

|Recherche|/route|Candidats|Géométries|Pareto temps/exposition|Analyses uniques|Total hors statut/géocodage|
|---|---:|---:|---:|---:|---:|---:|
|Candidate gelée|12|24|2|1/1|2|14|
|Référence finie|105|210|2|1/1|2|107|
|Proposition arrêt précoce, rejeu postérieur|9|—|2|1/1|2|11|

## Coordonnées officielles

Centres communaux, longitude puis latitude. Le snapping routier est conservé dans les réponses.

- Rennes (35238) : [-1.6884, 48.1159] ; https://geo.api.gouv.fr/communes/35238?fields=nom,code,codesPostaux,centre
- Saint-Brieuc (22278) : [-2.7657, 48.5108] ; https://geo.api.gouv.fr/communes/22278?fields=nom,code,codesPostaux,centre

## Variantes de référence

|ID|Durée min|km|km marqués péage|%|Candidate|Pareto|Axes|
|---|---:|---:|---:|---:|---|---|---|
|G001|69.16|98.365|0.000|0.00|oui|oui|D 512, N 1012, N 12|
|G002|88.61|129.694|0.000|0.00|oui|non|D 137, D 437, N 12, N 176|

## Changements entre profils voisins

|Pénalité|use_tolls de → vers|Profils|Routes avant → après|
|---:|---|---|---|

Géométries, profils, alternatives, ordre et attributs : fichiers JSON voisins et archive réseau.
Données © OpenStreetMap contributors (ODbL), Valhalla/FOSSGIS. https://www.openstreetmap.org/fixthemap
