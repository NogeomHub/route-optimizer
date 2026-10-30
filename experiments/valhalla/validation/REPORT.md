# Validation externe de la recherche adaptative — 30 octobre 2026

**La candidate gelée retrouve toutes les géométries et tous les compromis temps/exposition de la référence sur les trois nouveaux corridors.** Elle utilise 40 profils sur Lyon → Bordeaux, 31 sur Paris → Rennes et 12 sur Rennes → Saint-Brieuc. Aucun tarif en euros n’est fabriqué : l’exposition est uniquement la distance d’arêtes marquées à péage par OSM/Valhalla.

Recommandation avant moteur dynamique : conserver la candidate à quatre pénalités et plafond 40 comme base expérimentale, conserver les alternatives, analyser après déduplication et ajouter à valider un arrêt conditionnel à neuf sondes pour les cas sans exposition. Les observations sont favorables, sans prouver une garantie nationale ni un coût total maximal de 68 appels.

## 1. Protocole réellement gelé avant observations

Branche `experiment/valhalla-corridor-validation`, issue de `experiment/valhalla-profile-budget` (`6a8bcd1`), qui conserve `main` (`e36a14b`) et les travaux précédents. Aucun fichier V2 ou workflow modifié.

Le commit **`3dc3150`**, daté du **30 octobre 2026 à 08:14:13, heure de Paris**, enregistre le [protocole](FREEZE.md), le [gel et les empreintes](freeze.json), le client et les conditions FOSSGIS. La première nouvelle requête `/route` est horodatée **08:14:22, heure de Paris**, après ce commit.

La fonction `budget.study.adaptive` est importée **sans modification**. Un adaptateur paresseux déclenche la requête seulement quand cette fonction demande un résultat :

- exclusion puis u=0/1 pour chacune des pénalités **0, 300, 900, 1800 secondes** : neuf sondes ;
- `use_highways=0,5`, `toll_booth_cost=15`, `alternates=2` ;
- priorité aux intervalles aux signatures différentes, puis largeur en u, pénalité croissante, borne basse ; milieu en indice de la grille historique ;
- arrêt après huit requêtes consécutives sans nouvelle géométrie, à partir de **12 profils minimum** ; plafond absolu **40** ;
- aucun attribut de trace, prix ou résultat futur utilisé pour choisir les profils ;
- référence **105 profils sur toute la plage 0–1**, quatre pénalités, plus exclusion : la densité est supérieure sous 0,5 selon le costing documenté, sans restreindre les observations à 0,30–0,50.

La référence n’est pas une preuve d’exhaustivité sur un espace continu : des fenêtres entre niveaux, d’autres costing ou des alternatives non renvoyées peuvent encore échapper à cette grille. Elle est identique pour les trois corridors, y compris le contrôle. Le contrôle complet a été réalisé une fois pour confronter l’hypothèse d’arrêt anticipé à une référence indépendante, plutôt que déduire l’insensibilité des seules premières sondes.

## 2. Réseau, géocodage et données conservées

Instance explicitement choisie : `https://valhalla1.openstreetmap.de`, **Valhalla 3.9.1-983da51**. Les conditions [FOSSGIS](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) sont conservées dans [la capture](evidence/fossgis-terms.html). Scripts à une connexion, routage limité à une requête/s ; cette campagne emploie une connexion séquentielle, une pause de **deux secondes après chaque réponse**, un user-agent identifiant le projet et un Referer. Aucun retry automatique, aucun compte, secret ou paiement. Cette instance publique ne devient pas une dépendance produit.

Les six observations `/status` confirment le même moteur et le même graphe **1793313041**, inchangés avant/après chacun des trois corridors. L’archive Crans du 29 octobre utilisait le même moteur mais un graphe **1793275492** : elle n’a pas été recalculée et n’est pas présentée comme une observation du graphe du 30 octobre.

Coordonnées réellement fournies par `geo.api.gouv.fr`, **centres communaux et non adresses**, longitude puis latitude :

|Commune|Code INSEE|Longitude|Latitude|
|---|---|---:|---:|
|Lyon|69123|4,8351|45,7580|
|Bordeaux|33063|-0,5848|44,8624|
|Paris|75056|2,3470|48,8589|
|Rennes|35238|-1,6884|48,1159|
|Saint-Brieuc|22278|-2,7657|48,5108|

Chaque réponse officielle et URL est archivée. Exemple reproductible : `https://geo.api.gouv.fr/communes/69123?fields=nom,code,codesPostaux,centre`. Nom et code sont vérifiés ; les coordonnées envoyées et les positions recalées par Valhalla restent dans les requêtes/réponses. Rennes est réutilisée depuis le cache : cinq géocodages pour six extrémités.

**Appels réellement effectués pour cette expérience : 315 `/route`, 27 `/trace_attributes`, six `/status` = 348 appels Valhalla ; cinq géocodages supplémentaires ; zéro erreur.** Les profils communs à la candidate et à la référence sont réutilisés : ce n’est pas 315 + 83 appels route. Les consultations HTML des conditions ne sont pas des appels Valhalla.

Toutes les alternatives, requêtes, réponses, paramètres, horodatages, polylines exactes, durées, distances, instructions et arêtes sont archivés. Cache exact de géométrie en premier, puis rapprochement historique conservateur ; **aucune fusion approximative supplémentaire n’a été nécessaire** : 15/10/2 polylines exactes distinctes correspondent aux 15/10/2 groupes. Les 27 analyses ne concernent que les représentants uniques, en `edge_walk`, sans repli permissif. L’absence d’un attribut `toll` est refusée et jamais interprétée comme gratuité.

## 3. Comparaison des quatre corridors

Les colonnes Pareto ci-dessous comparent **durée / kilomètres marqués à péage**, jamais durée / euros. Crans conserve séparément ses huit compromis monétaires connus, tous retrouvés également par cette candidate dans le rejeu antérieur.

|Corridor|Profils candidate|Candidats candidate / référence|Géométries candidate / référence|Pareto temps/exposition|Analyses après dédup|Budget candidate route + analyses|
|---|---:|---:|---:|---:|---:|---:|
|Crans → Le Pin, archive du 29/10|40|117 / 309|28 / 28|13 / 13|28|68|
|Lyon → Bordeaux, réel 30/10|40|91 / 226|15 / 15|6 / 6|15|55|
|Paris → Rennes, réel 30/10|31|88 / 303|10 / 10|5 / 5|10|41|
|Rennes → Saint-Brieuc, réel 30/10|12|24 / 210|2 / 2|1 / 1|2|14|

Chaque référence compte 105 profils. Les coûts référence route + analyses sont respectivement **133, 120, 115, 107**. La candidate récupère **100 % des géométries et des compromis de ces références finies** ; aucune variante importante de référence n’est manquée sur ces trois nouveaux cas. Toutes les plages de durée, distance et exposition sont donc également couvertes.

Les chiffres du futur budget candidate sont reconstruits à partir des appels réellement archivés : la campagne scientifique a aussi dû compléter la référence. Les budgets ne doivent pas être confondus avec les 348 appels Valhalla effectivement réalisés pour l’évaluation.

Données machine : [comparaison CSV](evidence/comparison.csv), [comparaison JSON](evidence/comparison.json), [évaluations détaillées](evidence/evaluations.json).

## 4. Lyon → Bordeaux

[Résultats exhaustifs, profils et variantes](evidence/lyon-bordeaux/RESULTS.md).

La candidate atteint son plafond de **40**, avec sept dernières requêtes sans nouveauté ; elle ne modifie pas sa règle pour économiser la dernière requête. Les 65 profils de référence supplémentaires n’ajoutent rien aux **15 géométries**. Six solutions constituent la frontière temps/exposition :

|Variante locale|Durée min|Distance km|km marqués payants|
|---|---:|---:|---:|
|G003|332,81|550,617|442,068|
|G015|359,89|530,242|369,822|
|G004|411,42|627,341|222,507|
|G007|438,61|601,078|68,704|
|G010|451,88|590,142|35,743|
|G001|475,72|596,233|0|

Les axes des variantes rapides comprennent A89/A71/A20 et les variantes à faible exposition davantage N7/N145/N141/N10 et A20/A714. Les noms d’autoroutes ne suffisent pas à conclure à leur gratuité : seuls les attributs d’arêtes alimentent cette mesure. Les alternatives G015 et G004, absentes des réponses principales seules, ajoutent des compromis importants. Certaines géométries ont des séquences payant/gratuit/payant, conservées dans les analyses, sans les présenter comme des transactions tarifaires vérifiées.

Plage de toutes les variantes : **332,807–557,881 min**, **530,242–689,055 km**, exposition **0–442,068 km**. Douze transitions d’ensemble de routes entre valeurs voisines sont observées, entre **0,35 et 0,50** selon la pénalité.

La pénalité 0, à elle seule avec toutes les préférences, produit les six Pareto d’exposition ; les autres lignes enrichissent néanmoins la diversité globale. Cela n’est pas une raison suffisante pour les supprimer avant d’étudier un trajet inconnu ou les véritables tarifs.

## 5. Paris → Rennes

[Résultats exhaustifs, profils et variantes](evidence/paris-rennes/RESULTS.md).

La règle s’arrête naturellement à **31 profils**, après huit requêtes sans nouvelle géométrie. La référence complète confirme les **10 géométries** et cinq compromis :

|Variante locale|Durée min|Distance km|km marqués payants|
|---|---:|---:|---:|
|G004|220,30|355,045|264,497|
|G005|267,88|383,064|198,740|
|G008|279,86|423,810|135,703|
|G007|305,62|354,048|23,409|
|G001|322,48|345,707|0|

Les alternatives ont un rôle concret : les principales seules ne retrouvent ni **G005 ni G008**, deux des cinq compromis. Les axes comprennent A11/A81 pour le rapide, et selon la variante N12/A12/A13 ou A84 et des raccordements départementaux. G008 possède plusieurs interruptions du marquage payant ; aucune somme en euros n’en est déduite.

Plage totale : **220,297–354,631 min**, **345,707–433,522 km**, exposition **0–264,497 km**. Treize transitions de réponse ; le premier changement est entre **0,275 et 0,30**, donc légèrement **avant** la zone 0,30–0,50 du premier POC. La zone est une observation utile, pas une limite universelle à coder dans le moteur. La pénalité 0 retrouve ici tous les Pareto d’exposition ; les autres pénalités font varier certains ensembles d’itinéraires.

## 6. Rennes → Saint-Brieuc : contrôle et arrêt plus précoce

[Résultats exhaustifs](evidence/rennes-saint-brieuc/RESULTS.md).

La candidate gelée s’arrête à **12 profils**, pas 40. Les neuf sondes d’amorçage donnent les deux mêmes géométries ; le compteur de doublons est déjà élevé mais le minimum de 12 s’applique. La référence confirme le même ensemble pour les 105 profils, **sans aucune transition de réponse** :

|Variante locale|Durée min|Exposition marquée|
|---|---:|---:|
|G001, N12/N1012 et raccordements|69,16|0 km|
|G002, alternative plus lente|88,61|0 km|

G001 mesure **98,365 km** et domine G002 sur durée/exposition. Les deux traces n’ont aucune séquence marquée à péage. Ce constat correspond à **l’absence d’enjeu péage détecté dans ces données**, pas à une certification juridique de gratuité de toutes les routes de la région.

### Proposition distincte, évaluée après la candidate

Une fonction générale est évaluée uniquement en rejeu après les campagnes, sans avoir piloté les nouvelles requêtes :

1. Les **neuf** sondes initiales sont présentes et retournent exactement les mêmes ensembles de géométries, alternatives comprises.
2. Les analyses de **tous les représentants uniques de ces sondes** ont réussi et leur exposition marquée vaut exactement zéro.
3. Si une analyse manque, échoue, ou détecte même une petite exposition positive, l’arrêt n’est pas autorisé par cette règle.

Aucun nom de ville ni identifiant de route n’intervient. Sur les trois nouveaux corridors, elle ne se déclenche que sur Rennes → Saint-Brieuc. Le rejeu donnerait **9 `/route` + 2 analyses = 11 appels**, contre 12 + 2 = 14 pour la candidate. Gain réel proposé : trois routages, **pas** une prétendue économie de 31 sur un algorithme qui s’arrêtait déjà à 12.

Cette proposition n’ajoute ni ne retire de compromis par rapport aux références disponibles. Elle reste **postérieure à l’évaluation**, n’a pas été exécutée comme nouvelle stratégie réseau et doit être validée sur d’autres cas sans péage, des cas à petit péage isolé et des données OSM imparfaites. Les extrémités identiques de plusieurs sondes ne prouvent pas à elles seules l’absence d’un îlot géométrique intéressant entre elles.

## 7. Réponses aux questions sur la stratégie

- **Plafond 40 :** suffisant sur les quatre cas disponibles, atteint sur Crans et Lyon, non consommé sur Paris et le contrôle. Pas de garantie nationale ni preuve de minimalité. Les détours hors grille et d’autres costing restent inexplorés.
- **Quatre pénalités :** elles ne sont pas toutes nécessaires pour les Pareto d’exposition des deux nouveaux longs trajets. Sur les quatre corridors, enlever 900 ne retire aucun Pareto d’exposition observé ; Crans exige néanmoins 1800 pour R27, 300 pour R20/R24 d’exposition, et 0 pour plusieurs autres. Trois valeurs 0/300/1800 méritent un futur test gelé indépendant. On n’a pas supprimé 900 ici : cette ligne produit des géométries distinctes, et les Pareto en euros nationaux ne sont pas connus.
- **Alternatives :** toujours utiles sur les longs trajets. G015/G004 sur Lyon et G005/G008 sur Paris ne sont pas retrouvées parmi les principales seules. Sur le contrôle, l’alternative est dominée. `alternates=2` est un maximum demandé, pas une promesse de trois candidats ; les réponses réelles en ont parfois deux ou un. Ces observations ne sont pas une campagne contrefactuelle avec `alternates=0`.
- **Zone 0,30–0,50 :** proche de la zone utile des deux nouveaux longs trajets, mais Paris change déjà entre 0,275 et 0,30. Aucune zone sensible sur le contrôle. Ne pas restreindre les recherches futures à cette seule bande.
- **Huit doublons :** pas de compromis perdu dans ces trois validations externes ; Paris et Rennes montrent une réduction effective du budget. Crans/Lyon atteignent le plafond avant cet arrêt. Le test synthétique antérieur d’îlot caché reste un contre-exemple à toute garantie ; quatre corridors ne permettent pas de déclarer le seuil universellement robuste.
- **Quantités payantes :** durée/exposition retrouve des hybrides mais ne remplace jamais les tarifs. Deux trajets à même exposition peuvent traverser des concessions et grilles différentes ; une domination temps/km payants ne justifie pas d’éliminer définitivement un futur compromis temps/euros.

## 8. Recommandation produit et coût réaliste

Budgets **hors géocodage et contrôle de santé**, sans cache de recherche antérieure :

|Usage|Routages|Analyses uniques supplémentaires|Total observé ou proposé|
|---|---:|---:|---:|
|Simple, candidate actuelle sur le contrôle|12|2|14 observés|
|Simple, proposition zéro exposition à valider|9|2 ici, au plus 3 si signatures identiques et deux alternatives|11 ici, environ 10–12 dans ce schéma|
|Classique, Paris → Rennes|31|10|41 observés|
|Complexe, Lyon → Bordeaux|40|15|55 observés|
|Complexe, Crans → Le Pin archivé|40|28|68 reconstitués|

Pour un futur prototype : amorcer avec neuf sondes ; utiliser le test conditionnel sans exposition à titre expérimental ; sinon continuer la candidate, jusqu’à **40 appels de routage maximum**. Les quatre exemples suggèrent **10–28 analyses** supplémentaires pour les longs trajets, mais ce n’est pas une borne nationale. Avec deux alternatives, **40 routages peuvent théoriquement renvoyer 120 géométries distinctes**, donc jusqu’à **160 appels route/analyse** si chacune exige une trace. Le plafond 40 ne plafonne pas le total à 68.

Un `/status` peut être mutualisé par service/session ; il ne faut pas reproduire les deux statuts par corridor du protocole scientifique dans chaque recherche utilisateur. Un géocodage froid ajoute normalement deux appels hors Valhalla, souvent évitables par cache. Les recherches et analyses peuvent être mises en cache par coordonnées, profil, forme géométrique et version du graphe. La mesure ne garantit pas la latence, les quotas ou la disponibilité d’un futur fournisseur.

La campagne initiale dédupliquait déjà avant les traces : pas de gain fictif de 309 à 28 analyses à lui attribuer à nouveau. Sur les nouveaux trajets, cette étude fait 27 analyses pour **739 candidats de référence** ; chaque représentant n’est analysé qu’une fois. Une analyse retardée jusqu’à la seule sélection peut accélérer un premier affichage, mais ne fournit pas un Pareto monétaire validé pour les routes non analysées.

Avant le moteur dynamique : geler et valider séparément la proposition zéro exposition sur d’autres trajets gratuits et mixtes, conserver une référence/campagne de régression, préparer un fournisseur avec politique d’usage adaptée et budgets serveur/cache, et maintenir explicitement les tarifs inconnus. Les résultats justifient un prototype dynamique limité ; ils ne justifient ni un moteur tarifaire national prêt ni une dépendance permanente au serveur de démonstration FOSSGIS.

## 9. Reproduction hors ligne et intégrité

Les **721 fichiers d’entrée** sont conservés sans modification de leurs octets dans [campaign-data.tar.xz](evidence/campaign-data.tar.xz), avec les [empreintes individuelles et de l’archive](evidence/archive-manifest.json). Les fichiers volumineux décompressés restent locaux et ignorés par Git ; les métadonnées, évaluations et tableaux sont consultables directement.

```sh
# Depuis la racine, sans réseau :
python -m experiments.valhalla.validation.archive restore
python -m experiments.valhalla.validation.analyze
python -m unittest discover -s experiments/valhalla -v
npm test
npm run build
TEST_PREVIEW=1 npm run test:e2e
```

L’outil de restauration vérifie les chemins autorisés, refuse les liens et les écritures divergentes, puis valide chaque SHA-256. `analyze` n’émet aucune requête réseau. Les nouveaux calculs peuvent être rejoués à l’identique. **Ne pas relancer `campaign --live` pour reproduire l’étude** : les réponses ont déjà été conservées. Le client live lui-même réutilise son journal et s’arrête sur un échec ; aucune répétition cachée n’a été nécessaire.

Validation exécutée : **34 tests Python Valhalla**, dont 12 nouveaux tests d’adaptateur/données réelles et les 22 tests existants ; **18 tests unitaires V2**, **10 tests navigateur sur le build Pages** ; build TypeScript/Vite Pages réussi. Tests de déterminisme, budgets, absence de réponse future, géométries et alternatives, cache, échecs, arrêt conditionnel et rejeu des trois campagnes. Les petites fixtures synthétiques sont explicitement des tests, jamais des résultats routiers.

Le seul code ajouté se trouve dans `experiments/valhalla/validation/`. Le diff de `src`, `public`, données produit, scripts d’export et workflows contre `main` est vide. Pas de déploiement, fusion ou Pull Request.

Données © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/). Calculs Valhalla/FOSSGIS. [Signaler une erreur cartographique](https://www.openstreetmap.org/fixthemap). Aucune certification terrain du marquage de péage.
