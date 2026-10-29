# Rapport de l'expérience Crans → Le Pin — 29 octobre 2026

## Résultat observé

**Expérience routière bloquée avant tout calcul : aucune réponse d'itinéraire réelle.**

| Opération | Tentatives | Réponses exploitables |
|---|---:|---:|
| Valhalla `/status` sur `https://valhalla1.openstreetmap.de` | 1 | 0 |
| Valhalla `/route` | 0 | 0 |
| Valhalla `/trace_attributes` | 0 | 0 |
| Géocodage Crans via `geo.api.gouv.fr` | 1 | 0 |

Les lectures des sources officielles GitHub sont séparées de ces compteurs ; plusieurs URLs documentaires initiales ont retourné 404 avant localisation des documents dans le dépôt officiel.

Erreur exacte sur les deux services : `curl: (56) CONNECT tunnel failed, response 403`, statut cible `HTTP 000`. Il s'agit d'un refus du proxy avant connexion à la destination, pas d'un refus de Valhalla ni d'une preuve d'indisponibilité de son serveur.

## Comparatif demandé

**0 itinéraire observé ; nombre d'itinéraires distincts possible : non déterminé.**

| Itinéraire réel | Durée | Distance | Km / proportion péage | Paramètres effectifs | Axes / passages | Écart au plus rapide |
|---|---|---|---|---|---|---|
| Aucun résultat reçu | Non mesurée | Non mesurée | Non mesurés | Aucun calcul effectué | Non observés | Non calculable |

Les 105 profils préparés ne sont **pas des requêtes exécutées**. Il n'existe donc pas de paramètres ayant produit un trajet réel, de sortie/reprise autoroutière détectée ou de compromis hybride validé. Aucun passage dans le secteur d'Avallon ou sortie de l'A6 dans cette zone ne peut être confirmé ou exclu.

## Ce qui est établi / non établi

Le code officiel permet une préférence continue pour les arêtes à péage, des pénalités aux barrières/entrées et des alternatives. Les attributs de trace exposent le marquage péage et les longueurs par arête. Ces capacités rendent Valhalla **plausible pour générer des candidats hybrides**, mais ne prouvent pas la présence de compromis utiles sur Crans → Le Pin. Les pénalités d'entrée peuvent aussi décourager précisément les reprises d'autoroute recherchées : les deux axes doivent être étudiés séparément.

**Conclusion : candidat techniquement pertinent, aptitude au cœur de Route Optimizer non encore validée.** Ni un « oui » expérimental ni un « non » ne serait justifié. Une campagne réelle suivie d'une inspection des géométries/transitions est nécessaire. Le balayage ne garantira pas à lui seul la frontière de Pareto exhaustive, et la tarification APRR/AREA reste hors périmètre.

## Prochaine action nécessaire

Autoriser les domaines de l'instance retenue et du géocodeur dans le réseau Codex, vérifier les conditions et limites du service public (ou disposer d'une instance personnelle), puis exécuter le probe documenté et seulement ensuite le balayage. Aucune modification de la V1, de ses données ni de son interface n'est nécessaire.

## Livrables et contrôles locaux

- `poc.py` : client expérimental sans dépendances externes ; campagne explicite et opt-in, archivage, déduplication, analyse des arêtes et rapport.
- `test_poc.py` : **9 tests hors ligne réussis**, avec données synthétiques étiquetées (géométrie, profils, déduplication, transitions, unités et données manquantes).
- V1 : **6 tests unitaires réussis** et **build TypeScript/Vite réussi**. Aucun fichier existant de la V1 n'a été modifié pour cette expérience.
- Ces contrôles ne valident pas les réponses d'une instance Valhalla réelle : compatibilité de version, limites de taille, `edge_walk` et contenu des attributs restent à éprouver en ligne.
