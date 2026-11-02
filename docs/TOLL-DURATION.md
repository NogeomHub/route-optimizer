# Temps passé sur les sections payantes

## Analyse et choix de la source

Le snapshot source est `122486ce17240e7a5155271c9734a704c9ef9c64`.
`/route` fournit une durée globale et des manœuvres avec temps, distance et
indices géométriques. Les traces historiques `/trace_attributes` ne retiennent
que le marquage `edge.toll`, la longueur, les noms et les indices de forme.
25 des 28 géométries historiques ont des manœuvres mixtes gratuit/payant.
Les durées de ces manœuvres ne sont donc jamais additionnées pour ce calcul.

Valhalla permet de demander `node.elapsed_time`. La réponse place ce cumul,
en **secondes**, dans `edges[i].end_node.elapsed_time`. Le sérialiseur prend
le coût temporel du nœud à la fin de l'edge précédent. Le temps attribué à un
edge est le cumul à sa fin moins celui de l'edge précédent (zéro au départ).
On additionne ces différences uniquement pour `edge.toll === true`.
Les temps de transition à l'entrée de l'edge sont attribués à cet edge.
Ce sont des temps modélisés par Valhalla, pas une mesure d'un trajet effectué.

Sources Valhalla inspectées, révision `064dfda3a2af3590c9159a9312a099b8a2a25101` :

- [Attributs demandables](https://github.com/valhalla/valhalla/blob/064dfda3a2af3590c9159a9312a099b8a2a25101/valhalla/baldr/attributes_controller.h)
- [Sérialisation des edges et des cumuls](https://github.com/valhalla/valhalla/blob/064dfda3a2af3590c9159a9312a099b8a2a25101/src/tyr/trace_serializer.cc)
- [Construction des temps par segment de forme](https://github.com/valhalla/valhalla/blob/064dfda3a2af3590c9159a9312a099b8a2a25101/src/thor/triplegbuilder.cc)

`shape_attributes.time` existe également : le moteur calcule un temps par
segment géométrique à partir de vitesses, puis le sérialise en secondes. Ce
temps de déplacement n'est pas un remplacement évident des cumuls incluant les
transitions. `edge.speed` est sérialisé arrondi ; longueur/vitesse ne reproduirait
pas fidèlement la durée complète. Aucune de ces reconstructions n'est utilisée.

## Contrôles et dénominateur

La trace reste en `edge_walk`, avec les options de costing du premier profil
ayant produit la géométrie représentative. Son cache passe à `attributesVersion: 2`
et inclut ces options. Les anciennes traces v1 restent lisibles pour les prix et
pour l'enrichissement des résultats historiques, sans nouvel appel fournisseur.

Avant de publier une durée, on exige : analyse stricte existante réussie,
géométries décodées avec le même nombre de points dans le même ordre et une
distance géodésique **au plus égale à 0,20 m par point**, couverture continue des
indices du début à la fin, cumuls finis positifs ou nuls et non décroissants, total strictement
positif, et différence de total avec `/route` inférieure ou égale à une seconde.
Cette tolérance concerne la sérialisation ; aucune durée n'est remise à l'échelle.
La durée payante doit être inférieure ou égale aux deux totaux.
Les kilomètres continuent à provenir de la somme existante des `edge.length`
payants ; leur calcul et le moteur tarifaire sont inchangés.

La tolérance géométrique couvre les microécarts d'arrondi polyline6/projection
observés en production : à Crans, `[5.193890, 45.963565]` devient
`[5.193890, 45.963566]`, soit environ 11 cm. Elle ne permet ni rééchantillonnage,
ni suppression/insertion/inversion de sommets. Un déplacement de deux
microdegrés en latitude (environ 22 cm) est déjà rejeté. Les contrôles des indices
des edges, des cumuls et des durées restent indépendants et obligatoires.

Les métriques dérivées portent désormais `tollMetricsVersion: 2`, y compris les
valeurs inconnues. À la lecture, un résultat sans cette version courante est
recalculé depuis la trace v2 (ou v1 historique) et la géométrie conservées, même
s'il contient déjà `tollDurationSource: null` et `TRACE_SHAPE_MISMATCH`.
L'ancien résultat stocké n'est pas considéré comme valide sur la seule présence
du champ source. Cette migration à la lecture ne relance aucun appel fournisseur
et laisse les archives inchangées ; elle est répétée tant que le résultat stocké
reste ancien. Un worker reprenant un checkpoint ancien recalcule et conserve
également les métriques versionnées. Les caches de routage et de traces brutes
restent réutilisables : seule l'interprétation dérivée a changé. Une trace absente
ou insuffisante conserve des durées `null`, jamais un zéro fabriqué.

Le dénominateur exact du ratio est le cumul final **de cette même trace**,
stocké dans `tollDurationTotalSeconds`. Une différence supérieure à une seconde,
une réponse ancienne sans cumuls ou une couverture insuffisante rendent le temps
inconnu, sans empêcher de conserver la distance strictement analysée.

## Contrat public et TomTom

Chaque résultat V3 expose :

| Champ                      | Sens                                                 |
| -------------------------- | ---------------------------------------------------- |
| `tollMetricsVersion`       | Version du calcul dérivé (2 pour les réponses V3 courantes) |
| `tollDistanceKm`           | Distance payante, ou `null`                          |
| `tollDurationSeconds`      | Somme des temps des edges payants, ou `null`         |
| `tollDurationRatio`        | Durée payante / total de sa base Valhalla, ou `null` |
| `tollDurationTotalSeconds` | Dénominateur Valhalla en secondes, ou `null`         |
| `tollDurationSource`       | `valhalla_trace`, `verified_no_toll`, ou `null`      |
| `tollDurationReason`       | Motif d'indisponibilité, ou `null`                   |

TomTom reçoit le tracé complet en reconstruction stricte, mais le contrat actuel
demande `routeRepresentation=summaryOnly` et conserve uniquement des temps globaux.
Il ne fournit aucun temps segmenté permettant d'associer sa durée aux edges OSM.
Un contrat TomTom plus détaillé pourrait être étudié séparément ; il faudrait
vérifier les durées cumulées, les portions payantes et la correspondance des
géométries avant de l'utiliser. Il n'est pas introduit ici et aucun appel réel
TomTom n'est nécessaire aux tests.

Le ratio et la durée payante restent sur leur base Valhalla lorsque TomTom
réévalue l'ETA globale. Les cartes, la recommandation et le détail indiquent alors
« % du temps Valhalla » et précisent que l'ETA totale TomTom est distincte.
Il serait incorrect de diviser le temps payant Valhalla par l'ETA TomTom ou de
multiplier ce temps par le rapport des deux ETA ; aucun de ces calculs n'est fait.

## Archives et limites

L'export hors ligne associe les traces conservées aux géométries exactes. Les
28 distances payantes sont disponibles. Les trois routes dont la couverture
complète est explicitement `toll=false` ont un temps payant nul. Les 25 autres
gardent un temps et un ratio `null`, même si leur prix est connu. Si une ancienne
recherche dynamique n'a plus de trace exploitable, son temps reste inconnu.
L'enrichissement à la lecture ne relance jamais un routage ni TomTom.

Le marquage OSM peut être incomplet ou périmé : « gratuit » signifie absence de
section payante dans la trace vérifiée, pas garantie de facturation d'un opérateur.
La version Valhalla hébergée peut omettre les temps demandés : le comportement
est alors explicitement inconnu. La validation réelle ci-dessous confirme leur
présence sur la version FOSSGIS observée, sans garantir les versions futures.

La répartition autoroute/voie rapide gratuite/route classique n'est pas ajoutée :
les données conservées n'ont pas de classification suffisante et une référence
comme A77 ou N7 ne suffit pas à prouver le régime de chaque portion. Le marquage
payant est indépendant du statut autoroutier.

Exemples : `Route payante : 2 h 47 · 286 km (57 % du temps)` ;
`Route payante : 286 km · durée non déterminée` ;
`Route payante : 0 min · 0 km` lorsque l'absence de péage est vérifiée.

## Validation locale

| Suite                  | Résultat                                   |
| ---------------------- | ------------------------------------------ |
| Vitest frontend        | 44 réussis                                 |
| Backend produit        | 88 réussis                                 |
| Runtime Netlify        | 17 réussis                                 |
| POC backend historique | 34 réussis                                 |
| Playwright V2          | 10 réussis                                 |
| Playwright V3          | 9 réussis                                  |
| Playwright hébergé     | 2 réussis                                  |
| Python Valhalla        | 10 réussis                                 |
| Python péages          | 10 réussis, 1 ignoré (PDF officiel absent) |

Total : **224 tests réussis, 1 ignoré**, dont 22 nouveaux tests.
Le rejeu hors ligne conserve 40 profils, 117 candidats et 28 représentants.
Le packaging des deux fonctions Netlify, la syntaxe du POC et les builds V2/V3
réussissent. Les fournisseurs ETA sont simulés ; aucun appel réel TomTom.

## Validation réelle FOSSGIS du 2 novembre 2026

Deux recherches directes par l'adaptateur de production `FossgisProvider`, sans
cache ni réponse simulée, avec les coordonnées archivées Crans → Le Pin et
les profils V3 25 (payant autorisé) et 104 (`exclude_tolls=true`). Les appels sont
séquentiels, espacés de deux secondes après chaque réponse. Aucun appel TomTom.

Serveur : `3.9.1-63e4d1a`, graphe `1793611930`, identiques avant et après.

| Mesure                          | Profil payant | Profil excluant les péages |
| ------------------------------- | ------------- | -------------------------- |
| Durée `/route`                  | 17 916,298 s  | 27 651,953 s               |
| Distance totale                 | 492,044 km    | 483,655 km                 |
| Tarif audité calculé localement | 40,70 €       | 0 € (données routières)    |
| Edges avec cumul / total edges  | 831 / 831     | 2 670 / 2 670              |
| Cumul final de la trace         | 17 916,292 s  | 27 651,955 s               |
| Écart trace − route             | −0,006 s      | +0,002 s                   |
| Distance payante                | 434,242 km    | 0 km                       |
| Durée payante                   | 14 689,174 s  | 0 s                        |
| Ratio temporel                  | 0,8198780194  | 0                          |

Sur les deux traces : formes identiques, cumuls monotones, tous les indicateurs
`toll` booléens. Le calcul de production fournit des métriques exploitables.
Les prix viennent du catalogue audité local et non d'une tarification Valhalla.
Le zéro signifie absence de section payante dans les données OSM analysées.
Cette validation ne mesure pas un trajet effectué et n'apporte aucune garantie
de trafic en temps réel. Elle porte sur deux profils, pas sur une campagne
adaptative complète de 40 profils.

Le résumé et les empreintes des réponses brutes sont conservés dans
`docs/validation/toll-duration-live-2026-11-02.json`. Les réponses brutes
restent dans le dossier `work/` indiqué par ce résumé (hors suivi Git).
