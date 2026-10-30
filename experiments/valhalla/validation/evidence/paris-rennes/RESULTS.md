# paris-rennes — données réelles

**Exposition = km marqués à péage dans OSM, aucun montant en euros.**

|Recherche|/route|Candidats|Géométries|Pareto temps/exposition|Analyses uniques|Total hors statut/géocodage|
|---|---:|---:|---:|---:|---:|---:|
|Candidate gelée|31|88|10|5/5|10|41|
|Référence finie|105|303|10|5/5|10|115|
|Proposition arrêt précoce, rejeu postérieur|31|—|10|5/5|10|41|

## Coordonnées officielles

Centres communaux, longitude puis latitude. Le snapping routier est conservé dans les réponses.

- Paris (75056) : [2.347, 48.8589] ; https://geo.api.gouv.fr/communes/75056?fields=nom,code,codesPostaux,centre
- Rennes (35238) : [-1.6884, 48.1159] ; https://geo.api.gouv.fr/communes/35238?fields=nom,code,codesPostaux,centre

## Variantes de référence

|ID|Durée min|km|km marqués péage|%|Candidate|Pareto|Axes|
|---|---:|---:|---:|---:|---|---|---|
|G004|220.30|355.045|264.497|74.50|oui|oui|A 10, A 11, A 6b, A 81, D 137, D 437, N 136, N 157|
|G005|267.88|383.064|198.740|51.88|oui|oui|A 11, A 12, A 13, A 81, D 137, D 437, D 910, N 1154, N 12, N 123, N 136, N 154, N 157|
|G008|279.86|423.810|135.703|32.02|oui|oui|A 13, A 84, D 137, D 437, N 136, N 175, N 814|
|G009|292.45|371.449|136.897|36.86|oui|non|A 11, A 12, A 13, A 81, D 137, D 316, D 323, D 437, D 7928, D 828, D 920, D 923, D 928, N 12, N 136, N 154, N 157|
|G007|305.62|354.048|23.409|6.61|oui|oui|A 12, A 13, A 81, D 137, D 437, D 962, N 12, N 136, N 157|
|G001|322.48|345.707|0.000|0.00|oui|oui|A 12, A 13, A 84, D 137, D 437, N 12, N 136|
|G006|338.90|411.289|13.940|3.39|oui|non|A 13, A 84, D 1013, D 137, D 437, D 613, D6154, N 1013, N 13, N 136, N 175, N 814|
|G010|340.27|366.471|23.409|6.39|oui|non|A 12, A 13, A 81, D 137, D 437, D 438, D 840, D 908, D 909, D 909A, D 926, D 962, N 12, N 136, N 157|
|G003|353.07|414.431|0.000|0.00|oui|non|A 13, A 84, D 1013, D 113, D 137, D 437, D 613, D6154, N 1013, N 13, N 136, N 175, N 814|
|G002|354.63|433.522|0.000|0.00|oui|non|A 12, A 13, A 84, A 88, D 137, D 437, D 438, D 658, D 69, D 840, D 926, D 958, N 12, N 136, N 158, N 175, N 814|

## Changements entre profils voisins

|Pénalité|use_tolls de → vers|Profils|Routes avant → après|
|---:|---|---|---|
|0|0.275 → 0.3|P012 / P013|G001, G002, G003 → G001, G002, G006|
|0|0.3 → 0.325|P013 / P014|G001, G002, G006 → G007, G002, G006|
|0|0.35 → 0.375|P015 / P016|G007, G002, G006 → G007, G010, G006|
|0|0.375 → 0.4|P016 / P017|G007, G010, G006 → G007, G004, G008|
|0|0.475 → 0.5|P020 / P021|G004, G008, G007 → G004, G005|
|300|0.35 → 0.375|P041 / P042|G001, G002, G003 → G001, G002, G006|
|300|0.375 → 0.4|P042 / P043|G001, G002, G006 → G001, G004, G002|
|300|0.4 → 0.425|P043 / P044|G001, G004, G002 → G004, G007, G009|
|300|0.45 → 0.475|P045 / P046|G004, G007, G009 → G004, G005, G007|
|300|0.475 → 0.5|P046 / P047|G004, G005, G007 → G004, G005|
|900|0.4 → 0.425|P069 / P070|G001, G002, G003 → G001, G004, G002|
|900|0.45 → 0.475|P071 / P072|G004, G001, G002 → G004, G001, G005|
|1800|0.45 → 0.475|P097 / P098|G001, G002, G003 → G001, G004, G002|

Géométries, profils, alternatives, ordre et attributs : fichiers JSON voisins et archive réseau.
Données © OpenStreetMap contributors (ODbL), Valhalla/FOSSGIS. https://www.openstreetmap.org/fixthemap
