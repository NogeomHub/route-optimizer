# POC tarifs réels classe 1 — Crans → Le Pin — 29 octobre 2026

**Résultat retenu : 21 coûts complets dans le périmètre audité, 7 partiels. Aucun prix estimé au kilomètre.** Les coûts complets restent conditionnés à la classe 1 standard, aux tarifs officiels 2026 et à l’exactitude des données routières ; ils ne constituent pas des reçus de transactions terrain.

Travail exclusivement dans `experiment/valhalla-hybrid-poc`, dossier `experiments/tolls/`. Aucune modification de la V1, aucun déploiement, aucune Pull Request.

## 1. Sources, dates, formats et droits

| Source | Millésime / format | Informations réellement disponibles | Fiabilité et droits |
|---|---|---|---|
| [APRR officiel](https://voyage.aprr.fr/tarifs-de-peage) / TARIFS_APRR.pdf | 1er février 2026 ; PDF texte, 300 pages | Gare entrée, gare sortie, distance tarifaire, prix TTC classes 1 à 5. Noms de gares, sans identifiant numérique universel ni coordonnées dans cette grille. | Source tarifaire primaire ; 21 505 lignes directionnelles extraites. Aucune licence ouverte de republication trouvée. |
| Même publication / TARIFS_AREA.pdf | 1er février 2026 ; PDF texte, 13 pages | Codes numériques entrée/sortie, noms, distance tarifaire, classes 1 à 5. | Officiel, mais aucun tarif AREA utilisé pour ces 28 géométries. |
| Même publication / systèmes ouverts APRR-AREA | 1er février 2026 ; PDF 1 page, table principalement en image | Autoroute, numéro de gare, nom, forfait TTC par classe. Crottet 09443 : 0,80 € ; Myennes 09405 : 4,20 €. | Contre-vérification visuelle ; le calcul automatique utilise les mêmes forfaits présents dans le PDF APRR texte. |
| [MTE / data.gouv.fr](https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede) | Référentiel 01/01/2025, CSV publié juillet 2025 ; métadonnées actualisées août 2025 | Noms de gares, route/PR, côté, type, voies, coordonnées Lambert-93. Le CSV effectivement récupéré ne porte pas une colonne concessionnaire explicite malgré la description générale du jeu. | Officiel, ODC-BY selon métadonnées ; positions parfois incohérentes, donc pas une vérité suffisante seule. |
| OpenStreetMap / Overpass | Snapshots du 29 octobre 2026, JSON | Nœuds barrier=toll_booth, noms, opérateur déclaré, références, coordonnées. Deux requêtes bornées réussies après un premier essai régional en échec HTTP 502. | ODbL, attribution requise ; rapprochement de segment ≤12 m, puis audit manuel et MTE. |
| [ALIAE officiel](https://www.aliae.com/le-peage-en-flux-libre), aide officielle paiement.aliae.com | Pages consultées le 29 octobre 2026, HTML/JS | Concession A79, six portiques de flux libre, exploitation par APRR. | Pas de grille 2026 et de correspondance portiques/trajet suffisamment vérifiées dans les sources consultées ; aucune conclusion sur l’inexistence d’une telle grille ailleurs. |

Les PDF/HTML APRR sont conservés **localement** dans `sources/local/` (ignorés par Git) : [mentions légales](https://voyage.aprr.fr/mentions-legales) réservant les droits de reproduction, aucun droit de republication massive supposé. URL, date et empreinte de chaque source : [manifest.json](sources/manifest.json). Les captures ouvertes MTE/OSM sont versionnées dans `sources/open/`. Les seules cellules tarifaires citées sont celles nécessaires aux calculs de cette expérience.

L’aide ALIAE est une interface JavaScript. Une lecture non authentifiée du service FAQ découvert dans son application a reçu HTTP 401 ; aucune authentification ni extraction de clé n’a été tentée. L’A79 reste donc explicitement non tarifée ici, sans proxy €/km.

## 2. Réseaux et correspondances

- Réseau tarifé : **APRR**, gares A42, A40, A406, A6, A19, A5 et A77. Les références autoroutières communes A39/A31/A36 n’imposent pas de nouveaux tickets si le parcours reste dans le même système fermé.
- **AREA** : grille examinée, mais aucune portion payante de ces variantes rattachée à AREA. Le groupe APRR et la société AREA ne sont pas confondus.
- **ALIAE, concession A79** : R7, R8, R13, R19, R20, R24. APRR en est l’exploitant selon ALIAE, mais cela ne transforme pas les tarifs A79 en tarifs de la grille APRR utilisée.
- A4/A104/A5b et autres sections gratuites traversées : aucun péage additionnel détecté ; la présence d’un nom d’autoroute ne suffit pas à facturer. Ne pas attribuer un tarif SANEF à une portion A4 gratuite.
- Géométries réutilisées à l’identique depuis les archives Valhalla. Aucun nouveau routage pour adapter artificiellement un trajet à un tarif.
- Chaque passage conserve nœuds OSM, coordonnées, distance au segment, nom canonique et candidats MTE. Les 79 observations de nœuds/itinéraires sont dans [official-station-audit.json](results/official-station-audit.json).

## 3. Ambiguïtés conservées, sans montant appliqué

1. **Val-de-Loing / A77** : un nœud OSM nommé « Val-de-Loing Barrière » est traversé, mais le référentiel 2025 place à proximité des gares « Val De Loing-Souppes » sur échangeur. La grille distingue VAL DE LOING-BARRIERE → FLEURY-EN-BIERE (10,00 €) de VAL DE LOING-SOUPPES → FLEURY-EN-BIERE (4,10 €). Aucune de ces valeurs n’est choisie par simple ressemblance. R8/R13/R19/R20/R24 gardent cette section inconnue.
2. **Val de Saône / R19** : le nœud OSM et la gare de même nom du CSV MTE sont séparés d’environ 6,7 km. La cellule AMBERIEU → VAL DE SAONE existe (7,70 €), mais n’est pas comptée dans le sous-total certain tant que cette discordance n’est pas résolue.
3. **Pouilly-en-Auxois / R26** : discordance d’environ 9,7 km entre point OSM et point MTE de même nom. PONT D AIN → DIJON-CRIMOLOIS est retenu (16,40 €), mais POUILLY-EN-AUXOIS → LES EPRUNES (22,80 €) reste candidat non appliqué ; total réel incomplet.
4. Les changements `edge.toll` ne découpent pas automatiquement des facturations : R5 comporte plusieurs tronçons marqués payants mais une seule gare Crottet traversée, donc un seul forfait de 0,80 €. Les changements de classe de route ne créent pas un ticket supplémentaire.
5. Les écarts MTE/OSM ne prouvent pas lequel est faux. Ils déclenchent un refus de tarification, pas une correction arbitraire du référentiel.

## 4. Tableau exhaustif des 28 variantes

Total complet uniquement quand toutes les transactions sont rapprochées et tarifées ; sinon la colonne « connu APRR » est un **sous-total**, pas un total de trajet. 0,00 € connu pour R20 ne signifie surtout pas que ce trajet est gratuit. AREA = aucune section identifiée dans ce jeu.

|ID|Durée min|Total classe 1|Connu APRR|Statut|Pareto sous-ensemble complet|
|---|---:|---:|---:|---|---|
|R18|298.6|40,70 €|40,70 €|complete|oui|
|R16|302.0|41,30 €|41,30 €|complete|non|
|R23|302.4|39,90 €|39,90 €|complete|oui|
|R14|317.9|34,30 €|34,30 €|complete|oui|
|R17|318.9|40,70 €|40,70 €|complete|non|
|R22|322.7|39,90 €|39,90 €|complete|non|
|R28|325.7|39,90 €|39,90 €|complete|non|
|R26|327.1|incomplet|16,40 €|partial|exclu|
|R27|328.2|31,40 €|31,40 €|complete|oui|
|R11|331.7|31,50 €|31,50 €|complete|non|
|R19|346.9|incomplet|4,20 €|partial|exclu|
|R13|359.6|incomplet|5,00 €|partial|exclu|
|R24|363.9|incomplet|4,20 €|partial|exclu|
|R8|369.0|incomplet|5,00 €|partial|exclu|
|R15|386.2|20,30 €|20,30 €|complete|oui|
|R20|386.5|incomplet|0,00 €|partial|exclu|
|R12|400.0|17,50 €|17,50 €|complete|oui|
|R25|403.2|19,70 €|19,70 €|complete|non|
|R7|425.1|incomplet|5,00 €|partial|exclu|
|R4|443.4|5,00 €|5,00 €|complete|oui|
|R1|460.9|0,00 €|0,00 €|complete|oui|
|R10|465.2|7,80 €|7,80 €|complete|non|
|R9|468.0|7,80 €|7,80 €|complete|non|
|R21|472.4|7,00 €|7,00 €|complete|non|
|R6|506.7|0,80 €|0,80 €|complete|non|
|R5|509.6|0,80 €|0,80 €|complete|non|
|R3|511.1|0,00 €|0,00 €|complete|non|
|R2|514.0|0,00 €|0,00 €|complete|non|

## 5. Frontière de Pareto temps / euros

**Frontière du sous-ensemble de 21 totaux complets, pas une frontière globale des 28 trajets.** Un trajet incomplet pourrait modifier ce classement ; il n’est ni assimilé à zéro ni arbitrairement déclaré dominé. La référence est R18, le plus rapide observé, 298,605 min et 40,70 €.

|ID|Durée min|Péages €|+min vs R18|Économie €|€/min supplémentaire|
|---|---:|---:|---:|---:|---:|
|R18|298.6|40,70 €|0.0|0,00 €|—|
|R23|302.4|39,90 €|3.8|0,80 €|0.21|
|R14|317.9|34,30 €|19.3|6,40 €|0.33|
|R27|328.2|31,40 €|29.6|9,30 €|0.31|
|R15|386.2|20,30 €|87.6|20,40 €|0.23|
|R12|400.0|17,50 €|101.4|23,20 €|0.23|
|R4|443.4|5,00 €|144.8|35,70 €|0.25|
|R1|460.9|0,00 €|162.3|40,70 €|0.25|

Les montants sont calculés en centimes entiers ; les ratios utilisent les durées non arrondies. Les résultats détaillés conservent aussi les économies négatives des candidats plus chers. Aucun rapport €/min n’est calculé pour un coût incomplet ou un détour nul.

## 6. Analyse particulière demandée

- **R18 : 40,70 €**, AMBERIEU → LES EPRUNES, une session fermée, même si le trajet emprunte plusieurs autoroutes. Référence la plus rapide.
- **R14 : 34,30 €**, REPLONGES → FLEURY-EN-BIERE. +19,26 min, **6,40 € économisés**, **0,33 €/min**.
- **R27 : 31,40 €**, TOURNUS → LES EPRUNES. +29,64 min, **9,30 € économisés**, **0,31 €/min**.
- **R13 : incomplet**, 0,80 € Crottet + 4,20 € Myennes = **5,00 € connus APRR**. A79/ALIAE et Val-de-Loing → Fleury non résolus. Aucun total, aucune économie ni €/min affirmés.
- **R12 : 17,50 €**, TOURNUS → BIERRE-LES-SEMUR **10,50 €** + ST-DENIS-LES-SENS → LES EPRUNES **7,00 €**. +101,44 min, **23,20 € économisés**, **0,23 €/min**.
- **R15 : 20,30 €**, REPLONGES → BIERRE-LES-SEMUR **13,30 €** + ST-DENIS-LES-SENS → LES EPRUNES **7,00 €**. +87,63 min, **20,40 € économisés**, **0,23 €/min**.

Les sorties A6 à Bierre-lès-Semur, sortie 23 vers Montbard/Semur, restent les observations réelles du POC précédent, à environ 31 km d’Avallon, pas une sortie démontrée à Avallon même. R12 et R15 empruntent environ 143 km gratuits avant de reprendre A19/A5.
**Résultat important : R12 et R15, dominés en temps/km payants dans la première expérience, deviennent non dominés en temps/euros parmi les coûts complets.** Inversement R16 a moins de km marqués payants que R18 mais coûte 41,30 €, et R11 coûte 31,50 € contre 31,40 € pour R27 plus rapide. Le substitut « kilomètres payants » peut donc inverser les décisions.

## 7. Détail des transactions et preuves

Chaque cellule ci-dessous renvoie au PDF APRR officiel du 1er février 2026, numéro de page physique (base 1), colonne Classe 1. L’empreinte du PDF est dans le manifeste ; la ligne source exacte est aussi enregistrée dans pricing.json. Les forfaits ouverts sont recoupés visuellement avec le PDF systèmes ouverts.

### R18

Passages, dans l’ordre réel :
- AMBERIEU (Ambérieu-en-Buguey), lon/lat [5.3127036, 45.9776595], nœuds OSM [36534628], écart minimal à la géométrie 0.04 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : AMBERIEU → LES EPRUNES : 40,70 €**, PDF page 5, classe 1.
### R16

Passages, dans l’ordre réel :
- AMBERIEU (Ambérieu-en-Buguey), lon/lat [5.3127036, 45.9776595], nœuds OSM [36534628], écart minimal à la géométrie 0.04 m, mode closed.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : AMBERIEU → FLEURY-EN-BIERE : 41,30 €**, PDF page 5, classe 1.
### R23

Passages, dans l’ordre réel :
- PONT D AIN (Pont-d'Ain), lon/lat [5.3278855, 46.0481257], nœuds OSM [84428307], écart minimal à la géométrie 0.05 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : PONT D AIN → LES EPRUNES : 39,90 €**, PDF page 202, classe 1.
### R14

Passages, dans l’ordre réel :
- REPLONGES (Replonges), lon/lat [4.8958474, 46.3007635], nœuds OSM [228876004], écart minimal à la géométrie 0.02 m, mode closed.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : REPLONGES → FLEURY-EN-BIERE : 34,30 €**, PDF page 212, classe 1.
### R17

Passages, dans l’ordre réel :
- AMBERIEU (Ambérieu-en-Buguey), lon/lat [5.3127036, 45.9776595], nœuds OSM [36534628], écart minimal à la géométrie 0.04 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : AMBERIEU → LES EPRUNES : 40,70 €**, PDF page 5, classe 1.
### R22

Passages, dans l’ordre réel :
- PONT D AIN (Pont-d'Ain), lon/lat [5.3278855, 46.0481257], nœuds OSM [84428307], écart minimal à la géométrie 0.05 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : PONT D AIN → LES EPRUNES : 39,90 €**, PDF page 202, classe 1.
### R28

Passages, dans l’ordre réel :
- PONT D AIN (Pont-d'Ain), lon/lat [5.3278855, 46.0481257], nœuds OSM [84428307], écart minimal à la géométrie 0.05 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : PONT D AIN → LES EPRUNES : 39,90 €**, PDF page 202, classe 1.
### R26

Passages, dans l’ordre réel :
- PONT D AIN (Pont-d'Ain), lon/lat [5.3278855, 46.0481257], nœuds OSM [84428307], écart minimal à la géométrie 0.05 m, mode closed.
- DIJON-CRIMOLOIS (Péage de Dijon-Crimolois), lon/lat [5.1380486, 47.2770761], nœuds OSM [24922276], écart minimal à la géométrie 0.00 m, mode closed.
- POUILLY-EN-AUXOIS (Péage de Pouilly-en-Auxois), lon/lat [4.5611821, 47.2525558], nœuds OSM [28868663], écart minimal à la géométrie 0.02 m, mode closed_unverified.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : PONT D AIN → DIJON-CRIMOLOIS : 16,40 €**, PDF page 202, classe 1.
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "POUILLY-EN-AUXOIS", "exit": "LES EPRUNES", "candidate_tariff_not_applied": {"entry": "POUILLY-EN-AUXOIS", "exit": "LES EPRUNES", "cents": 2280, "pdf_page": 205, "source": "APRR-2026.pdf", "effective": "2026-02-01", "vehicle_class": 1, "original_line": "POUILLY-EN-AUXOIS      LES EPRUNES                256,81       22,80 €     34,60 €      57,30 €    79,10 €   13,60 €"}}
### R27

Passages, dans l’ordre réel :
- TOURNUS (Tournus), lon/lat [4.9012462, 46.579117], nœuds OSM [211475830], écart minimal à la géométrie 0.01 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : TOURNUS → LES EPRUNES : 31,40 €**, PDF page 261, classe 1.
### R11

Passages, dans l’ordre réel :
- TOURNUS (Tournus), lon/lat [4.9012462, 46.579117], nœuds OSM [211475830], écart minimal à la géométrie 0.01 m, mode closed.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : TOURNUS → FLEURY-EN-BIERE : 31,50 €**, PDF page 260, classe 1.
### R19

Passages, dans l’ordre réel :
- AMBERIEU (Ambérieu-en-Buguey), lon/lat [5.3127036, 45.9776595], nœuds OSM [36534628], écart minimal à la géométrie 0.04 m, mode closed.
- VAL DE SAONE (Péage Val de Saône), lon/lat [4.8977845, 46.2954456], nœuds OSM [471330156], écart minimal à la géométrie 0.02 m, mode closed_unverified.
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- VAL-DE-LOING-AMBIGUOUS (Val-de-Loing Barrière), lon/lat [2.7670699, 48.1763396], nœuds OSM [247393080], écart minimal à la géométrie 0.01 m, mode unknown.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "AMBERIEU", "exit": "VAL DE SAONE", "candidate_tariff_not_applied": {"entry": "AMBERIEU", "exit": "VAL DE SAONE", "cents": 770, "pdf_page": 6, "source": "APRR-2026.pdf", "effective": "2026-02-01", "vehicle_class": 1, "original_line": "AMBERIEU               VAL DE SAONE                74,16         7,70 €    12,30 €      19,80 €    27,10 €    4,90 €"}}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "VAL-DE-LOING-AMBIGUOUS", "exit": "FLEURY-EN-BIERE", "candidate_tariff_not_applied": null}
### R13

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- VAL-DE-LOING-AMBIGUOUS (Val-de-Loing Barrière), lon/lat [2.7670699, 48.1763396], nœuds OSM [247393080], écart minimal à la géométrie 0.01 m, mode unknown.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "VAL-DE-LOING-AMBIGUOUS", "exit": "FLEURY-EN-BIERE", "candidate_tariff_not_applied": null}
### R24

Passages, dans l’ordre réel :
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- VAL-DE-LOING-AMBIGUOUS (Val-de-Loing Barrière), lon/lat [2.7670699, 48.1763396], nœuds OSM [247393080], écart minimal à la géométrie 0.01 m, mode unknown.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "VAL-DE-LOING-AMBIGUOUS", "exit": "FLEURY-EN-BIERE", "candidate_tariff_not_applied": null}
### R8

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- VAL-DE-LOING-AMBIGUOUS (Val-de-Loing Barrière), lon/lat [2.7670699, 48.1763396], nœuds OSM [247393080], écart minimal à la géométrie 0.01 m, mode unknown.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "VAL-DE-LOING-AMBIGUOUS", "exit": "FLEURY-EN-BIERE", "candidate_tariff_not_applied": null}
### R15

Passages, dans l’ordre réel :
- REPLONGES (Replonges), lon/lat [4.8958474, 46.3007635], nœuds OSM [228876004], écart minimal à la géométrie 0.02 m, mode closed.
- BIERRE-LES-SEMUR (Bierre-lès-Semur), lon/lat [4.3095455, 47.4365435], nœuds OSM [289537324], écart minimal à la géométrie 0.07 m, mode closed.
- ST-DENIS-LES-SENS (Saint-Denis-lès-Sens), lon/lat [3.2623845, 48.2370235], nœuds OSM [332248643, 6134878380, 6134878383, 6134879085], écart minimal à la géométrie 4.84 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : REPLONGES → BIERRE-LES-SEMUR : 13,30 €**, PDF page 211, classe 1.
- **Retenu : ST-DENIS-LES-SENS → LES EPRUNES : 7,00 €**, PDF page 246, classe 1.
### R20

Passages, dans l’ordre réel :
- VAL-DE-LOING-AMBIGUOUS (Val-de-Loing Barrière), lon/lat [2.7670699, 48.1763396], nœuds OSM [247393080], écart minimal à la géométrie 0.01 m, mode unknown.
- FLEURY-EN-BIERE (Péage de Fleury-en-Bière), lon/lat [2.5403018, 48.4281502], nœuds OSM [1801078049], écart minimal à la géométrie 0.00 m, mode closed.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
- **Non tarifé :** {"operator": "APRR", "reason": "Unverified station correspondence or missing directed pair", "entry": "VAL-DE-LOING-AMBIGUOUS", "exit": "FLEURY-EN-BIERE", "candidate_tariff_not_applied": null}
### R12

Passages, dans l’ordre réel :
- TOURNUS (Tournus), lon/lat [4.9012462, 46.579117], nœuds OSM [211475830], écart minimal à la géométrie 0.01 m, mode closed.
- BIERRE-LES-SEMUR (Bierre-lès-Semur), lon/lat [4.3095455, 47.4365435], nœuds OSM [289537324], écart minimal à la géométrie 0.07 m, mode closed.
- ST-DENIS-LES-SENS (Saint-Denis-lès-Sens), lon/lat [3.2623845, 48.2370235], nœuds OSM [332248643, 6134878380, 6134878383, 6134879085], écart minimal à la géométrie 4.84 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : TOURNUS → BIERRE-LES-SEMUR : 10,50 €**, PDF page 260, classe 1.
- **Retenu : ST-DENIS-LES-SENS → LES EPRUNES : 7,00 €**, PDF page 246, classe 1.
### R25

Passages, dans l’ordre réel :
- BIERRE-LES-SEMUR (Bierre-lès-Semur), lon/lat [4.3094489, 47.4366313], nœuds OSM [289537367], écart minimal à la géométrie 0.03 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : BIERRE-LES-SEMUR → LES EPRUNES : 19,70 €**, PDF page 49, classe 1.
### R7

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
- **Non tarifé :** {"operator": "ALIAE (concession A79; exploitation APRR)", "reason": "No verified 2026 gantry/entry-exit tariff matched in this POC"}
### R4

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- MYENNES (Myennes), lon/lat [2.9408131, 47.4373143], nœuds OSM [48837113], écart minimal à la géométrie 0.01 m, mode open.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : MYENNES → Système Ouvert : 4,20 €**, PDF page 188, classe 1.
### R1

Passages, dans l’ordre réel :
- Aucun péage détecté dans les géométries et référentiels consultés.
### R10

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- ST-DENIS-LES-SENS (Saint-Denis-lès-Sens), lon/lat [3.2623845, 48.2370235], nœuds OSM [332248643, 6134878380, 6134878383, 6134879085], écart minimal à la géométrie 4.84 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : ST-DENIS-LES-SENS → LES EPRUNES : 7,00 €**, PDF page 246, classe 1.
### R9

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- ST-DENIS-LES-SENS (Saint-Denis-lès-Sens), lon/lat [3.2623845, 48.2370235], nœuds OSM [332248643, 6134878380, 6134878383, 6134879085], écart minimal à la géométrie 4.84 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
- **Retenu : ST-DENIS-LES-SENS → LES EPRUNES : 7,00 €**, PDF page 246, classe 1.
### R21

Passages, dans l’ordre réel :
- ST-DENIS-LES-SENS (Saint-Denis-lès-Sens), lon/lat [3.2623845, 48.2370235], nœuds OSM [332248643, 6134878380, 6134878383, 6134879085], écart minimal à la géométrie 4.84 m, mode closed.
- LES EPRUNES (Péage des Eprunes), lon/lat [2.6573054, 48.5893808], nœuds OSM [1389350280], écart minimal à la géométrie 0.01 m, mode closed.
- **Retenu : ST-DENIS-LES-SENS → LES EPRUNES : 7,00 €**, PDF page 246, classe 1.
### R6

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
### R5

Passages, dans l’ordre réel :
- CROTTET (Crottet), lon/lat [4.8700113, 46.2867832], nœuds OSM [471322065], écart minimal à la géométrie 0.00 m, mode open.
- **Retenu : CROTTET → Système Ouvert : 0,80 €**, PDF page 93, classe 1.
### R3

Passages, dans l’ordre réel :
- Aucun péage détecté dans les géométries et référentiels consultés.
### R2

Passages, dans l’ordre réel :
- Aucun péage détecté dans les géométries et référentiels consultés.

## 8. Couverture, limites et faisabilité nationale

- Les 21 totaux sont des calculs documentés au tarif TTC standard classe 1. Ni reçu de paiement, ni validation terrain exhaustive, ni garantie face à un référentiel routier erroné. Les zéros R1/R2/R3 reposent sur l’absence de péage détecté, pas sur une facturation interrogée chez un opérateur.
- Aucun abonnement/remise, variation future de prix, reclassement du véhicule, majoration de retard ou service annexe pris en compte. La nationalité de la plaque ne change pas ce tarif standard classe 1.
- Le rapprochement utilise un registre de gares audité pour ce corridor. Il ne couvre pas un itinéraire arbitraire, les boucles répétées sur une même gare ou tous les systèmes mixtes. Il faut un graphe orienté, distinguer entrée/sortie et barrières ouvertes, et modéliser les portiques de flux libre avant d’en faire un service national.
- Données manquantes prioritaires : règle/identité officielle Val-de-Loing, confirmation géographique de Val de Saône et Pouilly, grille A79 2026 et règles portiques/sections gratuites.
- Pour la France : catalogues de tarifs versionnés et droits de réutilisation de chaque concession, identifiants stables et positions directionnelles des gares, règles inter-réseaux et flux libre, classes de véhicules, remises et gestion des changements de millésime. Réseaux à couvrir ensuite, sans affirmer qu’ils sont empruntés ici : ASF, ESCOTA, COFIROUTE, SANEF/SAPN, ARCOUR, ATMB, SFTRF, ALIS, ADELAC, CEVM, autres concessions/tunnels.
- Des matrices entrée/sortie officielles peuvent contenir des interconnexions ; la présence d’une autoroute d’un autre groupe ne suffit ni à ajouter ni à supprimer une transaction. Les règles applicables doivent être documentées.
- Licences : données tarifaires accessibles gratuitement ne signifie pas données sous licence ouverte. Pour une intégration produit, clarifier les droits, la redistribution, les mises à jour et la couverture ; ne pas dépendre d’une API interne authentifiée ni d’un calculateur payant.

**Conclusion : le calcul gare/parcours → grille officielle est faisable et utile, avec un premier Pareto monétaire concret. Un moteur national suffisamment fiable reste à construire ; la couverture et la qualité des correspondances sont ici les obstacles principaux, pas l’addition des montants. Les 7 cas incomplets restent incomplets.**

## 9. Reproduction et contrôles

Voir [README.md](README.md). Sources pinées par SHA-256, parseur classe 1 directionnel, calcul en centimes, `null` explicites et refus des correspondances incertaines. Aucun original APRR redistribué publiquement ; snapshots MTE/OSM attribués et conservés. Les résultats CSV/JSON, l’audit indépendant et les cellules employées sont versionnés.

Validation : **18 tests tarifs** (unitaires et géométries/PDF réels), **10 tests Valhalla existants**, **6 tests unitaires V1**, **3 tests navigateur V1 en développement**, **3 sur build Pages**, **compilation TypeScript/Vite réussie**. Les tests avec PDF sont ignorés explicitement si l’original n’a pas été restauré ; dans cette session ils ont été exécutés.

Données géographiques © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL ; [signaler une erreur](https://www.openstreetmap.org/fixthemap). Gares : Ministère de la Transition écologique, référentiel 2025, ODC-BY. Tarifs : APRR/AREA, publications au 1er février 2026.
