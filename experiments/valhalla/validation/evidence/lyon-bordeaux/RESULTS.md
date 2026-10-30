# lyon-bordeaux — données réelles

**Exposition = km marqués à péage dans OSM, aucun montant en euros.**

|Recherche|/route|Candidats|Géométries|Pareto temps/exposition|Analyses uniques|Total hors statut/géocodage|
|---|---:|---:|---:|---:|---:|---:|
|Candidate gelée|40|91|15|6/6|15|55|
|Référence finie|105|226|15|6/6|15|120|
|Proposition arrêt précoce, rejeu postérieur|40|—|15|6/6|15|55|

## Coordonnées officielles

Centres communaux, longitude puis latitude. Le snapping routier est conservé dans les réponses.

- Lyon (69123) : [4.8351, 45.758] ; https://geo.api.gouv.fr/communes/69123?fields=nom,code,codesPostaux,centre
- Bordeaux (33063) : [-0.5848, 44.8624] ; https://geo.api.gouv.fr/communes/33063?fields=nom,code,codesPostaux,centre

## Variantes de référence

|ID|Durée min|km|km marqués péage|%|Candidate|Pareto|Axes|
|---|---:|---:|---:|---:|---|---|---|
|G003|332.81|550.617|442.068|80.29|oui|oui|A 20, A 6, A 630, A 71, A 89, N 230, N 89|
|G015|359.89|530.242|369.822|69.75|oui|oui|A 20, A 6, A 630, A 710, A 89, D 2089, D 941, D 942, N 230, N 89|
|G004|411.42|627.341|222.507|35.47|oui|oui|A 10, A 20, A 6, A 630, A 71, A 714, A 89, N 10, N 141, N 145, N 520|
|G007|438.61|601.078|68.704|11.43|oui|oui|A 10, A 20, A 6, A 630, A 71, A 714, A 89, D 2009, D 46, N 10, N 141, N 145, N 209, N 520, N 7, N 82|
|G010|451.88|590.142|35.743|6.06|oui|oui|A 10, A 20, A 6, A 630, A 71, A 714, A 89, D 2009, D 307, D 46, N 10, N 141, N 145, N 209, N 520, N 7|
|G014|453.46|611.507|142.787|23.35|oui|non|A 10, A 20, A 6, A 630, A 71, A 89, D 2009, D 2144, D 745, D 943, N 10, N 141, N 145, N 520|
|G013|454.89|604.083|44.701|7.40|oui|non|A 10, A 20, A 6, A 630, A 714, A 89, D 2009, D 2371, D 39, D 46, D 94, N 10, N 141, N 145, N 209, N 520, N 7, N 82|
|G005|461.00|615.404|131.903|21.43|oui|non|A 10, A 20, A 6, A 630, A 710, A 89, D 2009, D 2144, D 745, D 943, N 10, N 141, N 145, N 520|
|G008|463.60|644.015|100.038|15.53|oui|non|A 10, A 20, A 406, A 6, A 630, A 714, A 79, D 11, D 134, D 2009, D 73, D 94, D 945, N 10, N 141, N 145, N 520, N 79|
|G001|475.72|596.233|0.000|0.00|oui|oui|A 10, A 20, A 6, A 630, A 714, A 89, D 2009, D 2371, D 307, D 39, D 46, D 94, N 10, N 141, N 145, N 209, N 520, N 7|
|G012|479.15|621.873|131.903|21.21|oui|non|A 10, A 20, A 6, A 630, A 710, A 89, D 2009, D 446, D 941, D 943, D 986, D 990, D 997, N 10, N 141, N 145, N 520|
|G009|481.36|650.851|172.086|26.44|oui|non|A 10, A 20, A 6, A 630, A 71, A 719, A 89, D 2209, D 273, D 307, D 6, D 67, D 907, D 941, N 10, N 141, N 7|
|G006|506.95|689.055|202.483|29.39|oui|non|A 10, A 20, A 6, A 630, A 71, A 89, D 2009, D 307, D 46, D 941, N 10, N 141, N 209, N 7|
|G011|550.32|682.696|11.740|1.72|oui|non|A 10, A 20, A 6, A 630, A 89, D 2076, D 300, D 307, D 46, D 920, D 925, D 925e, D 940, D 951, D 951e, N 10, N 141, N 151, N 209, N 520, N 7|
|G002|557.88|685.782|0.000|0.00|oui|non|A 10, A 20, A 6, A 630, A 89, D 2076, D 300, D 307, D 46, D 920, D 925, D 925e, D 940, D 951, D 951e, N 10, N 141, N 151, N 209, N 520, N 7|

## Changements entre profils voisins

|Pénalité|use_tolls de → vers|Profils|Routes avant → après|
|---:|---|---|---|
|0|0.35 → 0.375|P015 / P016|G001, G002 → G010, G011, G012|
|0|0.375 → 0.4|P016 / P017|G010, G011, G012 → G010, G014, G015|
|0|0.4 → 0.425|P017 / P018|G010, G014, G015 → G007, G003, G008|
|0|0.45 → 0.475|P019 / P020|G003, G007, G008 → G003, G004|
|0|0.475 → 0.5|P020 / P021|G003, G004 → G003|
|300|0.375 → 0.4|P042 / P043|G001, G002 → G001, G002, G012|
|300|0.4 → 0.425|P043 / P044|G001, G002, G012 → G001, G005, G003|
|300|0.45 → 0.475|P045 / P046|G001, G003, G005 → G003, G004, G013|
|300|0.475 → 0.5|P046 / P047|G003, G004, G013 → G003, G004|
|900|0.425 → 0.45|P070 / P071|G001, G002 → G001, G002, G009|
|900|0.45 → 0.475|P071 / P072|G001, G002, G009 → G001, G003, G005|
|1800|0.475 → 0.5|P098 / P099|G001, G002 → G001, G002, G006|

Géométries, profils, alternatives, ordre et attributs : fichiers JSON voisins et archive réseau.
Données © OpenStreetMap contributors (ODbL), Valhalla/FOSSGIS. https://www.openstreetmap.org/fixthemap
