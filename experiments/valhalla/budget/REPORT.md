# Budget de profils Valhalla — rejeu hors ligne, 29 octobre 2026

**Recommandation expérimentale : recherche adaptative multi-pénalités, neuf sondes initiales, raffinement jusqu’à 40 profils au maximum et arrêt possible après huit requêtes consécutives sans nouvelle géométrie (à partir de 12 profils).** Sur Crans → Le Pin, elle utilise **40 `/route` + 28 `/trace_attributes` = 68 appels**, retrouve **28/28 variantes et 8/8 compromis Pareto connus**. Référence exhaustive : 105 + 28 = 133 appels comparables. Réduction : **61,9 % des appels de routage, 48,9 % du total route/analyse**.

Les stratégies testées à 10–20 profils ne suffisent pas ici. **Ce n’est pas une preuve qu’aucune autre stratégie à 20 profils ne pourrait réussir**, ni une preuve que 40 est un minimum. La règle proposée est un candidat à valider, pas un moteur produit prêt à généraliser.

Travail depuis `main` au commit `e36a14b`, branche `experiment/valhalla-profile-budget`. Aucun fichier produit, donnée V2, configuration ou workflow modifié. **Aucune nouvelle requête Valhalla, géocodage ou campagne routière effectuée.** Seuls les échanges GitHub nécessaires à la branche utilisent le réseau.

## Sources et reproduction

- `experiments/valhalla/evidence/2026-10-29/raw-responses.tar.gz` : les vrais couples requête/réponse du balayage et leurs alternatives ; seuls les membres `sweep-live/` sont comptés.
- `comparison.json` et `routes.geojson` du même dossier : les 28 groupes géographiques audités, toutes les provenances paramètres/numéro d’alternative.
- `src/data/archive.json` de `main` : 22 tarifs complets, six incomplets ; R26 intégré à 39,20 € mais dominé. Aucun prix inconnu assimilé à zéro.
- Empreintes des quatre entrées : [results/input-hashes.json](results/input-hashes.json).

Le chargeur vérifie les **105 requêtes**, **309 candidats**, succès/unités/jambe unique et la bijection des 309 provenances vers les 28 groupes. Les géométries sont décodées ; une différence avec le représentant doit passer la déduplication historique (durée/distance à 0,25 %, recouvrement de corridor à 99,9 %). Les réponses archivées comptent aussi exactement **28 polylines encodées distinctes** : le simple cache exact suffit sur ce jeu, sans gain supplémentaire observé du rapprochement approximatif.

Les sélecteurs fixes reçoivent les paramètres ; la recherche adaptative n’utilise que les ensembles de géométries **déjà observées** aux points interrogés. Ni prix, ni frontière de référence, ni nom R14/R27 ne sont utilisés pour décider le prochain profil. Les noms Rxx sont des identifiants opaques d’équivalence géométrique. Les tests vérifient l’invariance au renommage de ces identifiants et à la modification de réponses encore inobservées. La frontière monétaire intervient **après la recherche**, pour l’évaluation uniquement.

```sh
python -m experiments.valhalla.budget.study
python -m unittest experiments.valhalla.budget.test_study -v
python -m unittest discover -s experiments/valhalla -v
npm test
npm run build
```

Python 3.10+, bibliothèque standard. Aucun service, dépendance, compte, clé ou original tarifaire supplémentaire. [RESULTS.md](RESULTS.md) contient toutes les comparaisons et plages ; [profiles.csv](results/profiles.csv) donne les 105 profils ; [study.json](results/study.json) conserve réponses associées, empreintes de polylines, changements, scores de couverture et journal de chaque décision adaptative. Les appels indiqués sont des coûts **reconstitués**, pas des requêtes effectuées pendant cette étude.

## 1. Redondance des 105 profils

Dans l’ordre original, **15 profils apportent au moins une variante nouvelle, 90 n’apportent que des doublons**. Ce nombre dépend de l’ordre et ne signifie pas que seuls ces 15 profils seraient bons sur un autre trajet.

|Profil|Nouvelles variantes dans l’ordre historique|
|---|---|
|P001|R1, R2, R3|
|P014|R4, R5, R6|
|P015|R7|
|P016|R8, R9, R10|
|P017|R11, R12|
|P018|R13, R14, R15|
|P019|R16, R17|
|P020|R18, R19|
|P043|R20, R21|
|P044|R22|
|P046|R23, R24|
|P072|R25|
|P073|R26|
|P098|R27|
|P099|R28|

Les réponses n’ont que **19 ensembles distincts de routes**, donc 86 profils répètent un ensemble déjà vu (ordre des alternatives ignoré). Cette notion diffère des 90 profils sans nouvelle route : une combinaison nouvelle peut ne contenir que des routes déjà vues.

**Neuf profils produisent au moins une route exclusive** dans tout l’archive : P014 (R4), P015 (R7), P016 (R9/R10), P017 (R12), P018 (R15), P019 (R16), P043 (R21), P046 (R24), P098 (R27). Les 96 autres sont individuellement supprimables sans perdre une route exclusive, mais **pas collectivement** : ils partagent des routes que personne d’autre ne produirait après suppression de tous leurs producteurs.

Les profils sans découverte initiale et sans exclusivité sont explicitement identifiables dans le CSV, plutôt que décrits comme « inutiles » universellement.

## 2. Paramètres réellement explorés et déterminants

- `use_tolls` : 26 niveaux, 0 à 0,5 par 0,025 puis 0,6/0,7/0,8/0,9/1. Les changements observés se concentrent entre **0,30 et 0,50**. Il y a **20 transitions** d’ensemble de routes entre niveaux voisins, réparties sur les quatre lignes de pénalité ; détail exact `transitions` dans le JSON.
- Pour chaque pénalité, les niveaux **0,5 à 1 produisent le même ensemble** sur ce trajet : 24 requêtes pour quatre réponses distinctes, sans bénéfice de densifier cette partie ici.
- De **0 à 0,30**, les quatre pénalités retournent le même ensemble R1/R2/R3 : 52 profils redondants sur cette région. Le test `exclude_tolls=true` retourne également R1/R2/R3 ; cela n’apporte pas une nouvelle route. L’archive seule ne prouve pas la reconnaissance de cette option par le moteur ; elle prouve sa réponse observée.
- `toll_booth_penalty` : **0, 300, 900, 1800 secondes**, dimension importante et non substituable à `use_tolls`. À `use_tolls=0,475`, les quatre pénalités produisent quatre ensembles différents. Les secondes de pénalité ne sont ni des euros ni un supplément de temps physique à additionner aux durées retournées.
- `use_highways=0,5` et `toll_booth_cost=15` : constants ; **aucune conclusion expérimentale sur leur effet**. Coût et pénalité des gares ne doivent pas être confondus. Aucune variation trafic, véhicule, date ou `shortest` étudiée.
- `alternates=2` sur les 105 requêtes : conserver les alternatives est essentiel dans ces réponses. Les principales seules couvrent 12 variantes et perdent R12/R15, présentes uniquement comme alternatives. Il ne s’agit pas d’une campagne contrefactuelle avec `alternates=0` : un serveur pourrait alors répondre autrement.

|Pénalité, toutes les valeurs de `use_tolls`|Variantes retrouvées|Pareto connus retrouvés|
|---|---:|---|
|0|19|R18, R14, R15, R12, R4, R1|
|300|10|R23, R14, R1|
|900|8|R23, R1|
|1800|8|R27, R1|

La pénalité 900 n’apporte pas de Pareto exclusif **sur ce jeu**, mais produit notamment R26 ; ce constat a posteriori ne justifie pas sa suppression sur un trajet inconnu.

### Producteurs des huit compromis connus

Observations explicatives uniquement, **pas une liste de profils utilisée comme stratégie** :

|Compromis|Paramètres producteurs observés (`u`, pénalité, alternative)|
|---|---|
|R18|u=0,475/0,5/0,6/0,7/0,8/0,9/1, p=0, principale|
|R23|u≥0,475 aux niveaux archivés, p=300 principale ; p=900 principale à 0,475, alternative à partir de 0,5|
|R14|u=0,425 p=0 alternative 1 ; u=0,45 p=300 principale|
|R27|**u=0,475 p=1800 principale seulement**|
|R15|**u=0,425 p=0 alternative 2 seulement**|
|R12|**u=0,4 p=0 alternative 2 seulement**|
|R4|**u=0,325 p=0 principale seulement**|
|R1|Nombreux profils bas et test d’exclusion ; liste exhaustive dans le CSV/JSON|

Les fenêtres étroites expliquent pourquoi espacer uniformément les paramètres peut rater de bons compromis même en retrouvant les deux extrêmes.

## 3. Stratégies fixes, règles générales

Trois familles sont évaluées, sans regarder les routes pour sélectionner leurs points :

1. **Maximin normalisé** : un point d’exclusion, puis échantillonnage progressif maximisant la distance au point déjà choisi le plus proche dans `(use_tolls, penalty/1800)`. Départ au coin bas u/p ; égalités résolues par l’ordre de profil archivé. Budgets exacts 8/12/16/20/32/48.
2. **Grilles cartésiennes** : niveaux 0/0,25/0,5/1, deux puis trois puis quatre pénalités ; ajout d’un niveau 0,125 et grilles plus denses. Le point d’exclusion explique les budgets 9/13/17/21/33.
3. **Grilles dyadiques** : subdiviser `[0,0,5]` en `2^d` intervalles, ajouter le point u=1, croiser les quatre pénalités et ajouter l’exclusion. Chaque niveau est projeté vers le niveau archivé le plus proche ; égalité vers le bas, calcul entier. Profondeurs 1 à 5 : 17/25/41/73/89 profils. Le choix de la demi-plage découle du plan initial dense et de l’analyse de sensibilité ; il est donc **informé par ce corridor**, et doit être gelé avant validation externe.

La grille dyadique de profondeur 5 (**89 profils**) est la moins coûteuse des **stratégies fixes testées qui récupèrent les huit compromis**. La profondeur 4 (73 profils) perd encore R4 ; elle récupère 7/8. Cette « meilleure grille » est limitée au critère 8/8 et à ces familles, pas un optimum sur tous les sous-ensembles possibles.

## 4. Recherche adaptative

Règle générale, codée sans identité des routes utiles :

1. Exclusion + u=0 et u=1 pour chaque pénalité : **neuf sondes**. Le budget 8 ne termine même pas cet amorçage.
2. Construire les intervalles entre profils adjacents déjà interrogés sur chaque ligne de pénalité.
3. Prioriser les intervalles dont les ensembles de géométries aux extrémités diffèrent, puis la largeur en u ; égalités par pénalité croissante et borne basse.
4. Interroger le milieu en **indice de grille archivée** : les niveaux sont non uniformes, il ne s’agit pas de prétendre connaître une réponse à u=0,4375 jamais demandé. Un futur client devra définir sa propre précision continue et recalibrer ce choix.
5. Mettre à jour les observations, sans relire le résultat des profils non interrogés. Si nécessaire explorer aussi les intervalles plats : deux extrémités égales ne prouvent pas l’absence d’un îlot intéressant au milieu.
6. Budget maximal, ou arrêt après stagnation. La stagnation porte sur la **nouvelle géométrie**, et non le « nouveau Pareto en euros », puisque les six tarifs A79 sont inconnus et que les analyses détaillées peuvent être différées.

Comparaison synthétique (toutes les variantes et plages dans [RESULTS.md](RESULTS.md)) :

|Stratégie|/route|Variantes /28|Pareto /8|Compromis perdus|Analyses uniques|Total route/analyse|
|---|---:|---:|---:|---|---:|---:|
|Maximin 8|8|11 (39,3 %)|3 (37,5 %)|R14, R27, R15, R12, R4|11|19|
|Maximin 12|12|11 (39,3 %)|3|idem|11|23|
|Maximin 16|16|11 (39,3 %)|3|idem|11|27|
|Maximin 20|20|11 (39,3 %)|3|idem|11|31|
|Adaptatif 12|12|11 (39,3 %)|3|idem|11|23|
|Adaptatif 16|16|16 (57,1 %)|4 (50 %)|R27, R15, R12, R4|16|32|
|Adaptatif 20|20|16 (57,1 %)|4|idem|16|36|
|Adaptatif 30|30|21 (75 %)|5 (62,5 %)|R15, R12, R4|21|51|
|Adaptatif 40, arrêt possible après 8 doublons|40|28 (100 %)|8 (100 %)|aucun|28|68|
|Adaptatif, arrêt après 4 doublons, plafond 105|13|11 (39,3 %)|3|R14, R27, R15, R12, R4|11|24|
|Adaptatif, arrêt après 8 doublons, plafond 105|47|28 (100 %)|8|aucun|28|75|
|Grille dyadique profondeur 5|89|28 (100 %)|8|aucun|28|117|
|Exhaustif|105|28 (100 %)|8|aucun|28|133|

L’algorithme découvre R14 à la **15e** requête, R27 à la **29e**, R4 à la **33e**, R12 à la **34e**, R15 à la **39e**. Ces positions sont un diagnostic a posteriori, **pas un critère d’arrêt qui saurait quand tous les bons résultats ont été trouvés**.

Avec la même heuristique, le plafond 40 est atteint avant la stagnation de huit doublons ; sans ce plafond, l’arrêt intervient à 47. Un arrêt après seulement quatre doublons échoue très tôt. Les budgets et patience 4/8 sont des variantes explicitement comparées, pas des seuils déclarés scientifiquement optimaux.

À 30 profils, les quatre compromis connus admissibles à +45 min sont tous retrouvés (R18/R23/R14/R27), mais les détours plus longs perdent des compromis importants. Ne pas présenter ce résultat comme une couverture globale de 100 %.

### Plage temps/péage : attention à une métrique trompeuse

Même Maximin 8 couvre les extrêmes **298,605–513,952 min** et **0–472,558 km marqués à péage**, tout en perdant cinq compromis sur huit. Retrouver les bornes ne valide donc pas le contenu entre les bornes. Le rapport généré conserve pour chaque stratégie les bornes exactes durée/km péage/prix connus, les routes et les six statuts partiels. Les kilomètres payants restent un indicateur descriptif, jamais un substitut aux euros.

## 5. Coût réel des appels et déduplication

**La déduplication avant `/trace_attributes` existait déjà dans le POC.** Il a fait 105 `/route`, produit 309 candidats, puis **28 analyses**, pas 309. Un calcul naïf « économiser 281 analyses par rapport au POC » serait donc faux.

Pour le futur client :

- conserver `alternates=2`, puis mettre en cache la géométrie complète (`polyline6`, précision identique, sens, contexte/version du graphe) avant toute analyse ; sur l’archive, 28 hashes exacts = 28 variantes ;
- rapprocher les quasi-doublons seulement avec des contrôles conservateurs, sans supprimer une sortie/reprise d’autoroute différente ;
- accumuler les résultats de `/route`, raffiner avec leur diversité géographique, puis lancer les analyses uniquement pour les géométries nouvelles, une fois chacune ;
- le report d’analyse **ne réduit pas à lui seul** les 28 analyses si toutes les 28 géométries sont retrouvées et requièrent une couverture tarifaire fiable ;
- charger éventuellement une analyse pour le trajet affiché en premier : **40 + 1** serait un budget d’affichage partiel, **pas un Pareto euros validé**. Les autres montants doivent rester inconnus jusqu’à leur analyse/rapprochement suffisant ;
- un fournisseur tarifaire capable de prouver les transactions et la couverture directement depuis la géométrie pourrait supprimer certains appels d’arêtes. Cette possibilité n’est pas démontrée nationalement ici ; on ne chiffre pas un gain non validé ;
- ne pas éliminer des candidats sur durée/distance ou durée/km payants avant de connaître les euros : cela pourrait supprimer les vrais compromis.

Les coûts comparables excluent les géocodages et le contrôle de santé : avec coordonnées déjà connues, le budget recommandé est **9 `/route` initiaux + jusqu’à 31 raffinements + 28 analyses = 68** sur ce cas, sans cache de session. Un `/status` par recherche ajouterait un appel (69), mais peut être mutualisé. Un géocodage à froid demanderait en plus deux appels hors Valhalla selon le fournisseur.

La campagne seule comprenait aussi un `/status` (134 appels Valhalla). Les **141 appels** rapportés historiquement concernent toute la session avec sondes : 106 `/route`, 31 analyses et quatre statuts ; les six géocodages étaient hors de ce total Valhalla. Aucune latence, limite de débit, parallélisation ou coût d’hébergement n’est déduite du seul nombre de requêtes. Pas de dépendance produit à une instance publique.

## 6. Biais et validation suivante

**Démontré :** rejeu exact des données de ce corridor, redondances, récupération des compromis connus par les règles décrites, échec des budgets courts testés et du seuil de stagnation 4. Les prix incomplets empêchent de connaître la frontière monétaire finale des 28 variantes ; les futures données ALIAE peuvent changer la cible.

**Suggéré :** conserver plusieurs lignes de pénalités et les alternatives ; raffiner les zones où les géométries changent ; préférer une recherche progressive à une grosse grille fixe.

**Non démontré :** garantie à 40 appels, optimalité de l’heuristique, minimum théorique, comportement sur un autre trajet ou un autre graphe Valhalla. Les paramètres, leur grille initiale, les familles comparées et le plafond 40 ont été étudiés sur un seul corridor connu : ce n’est pas un test aveugle externe. Les validations d’absence d’accès futur réduisent la fuite d’information dans l’exécution mais ne suppriment pas le biais de conception. Une petite zone aux extrémités identiques peut être ratée ; un test synthétique illustre ce cas.

Prochain protocole, **à proposer avant tout nouveau réseau**, non lancé ici : geler la règle, les budgets 20/30/40, la patience 8, les égalités, la déduplication et les métriques ; évaluer ensuite quelques corridors distincts, dans les deux sens si utile :

1. Lyon → Bordeaux : concurrence A89 et réseaux gratuits, relief et autre concession.
2. Paris → Rennes : succession de sections gratuites/payantes et autre structure de réseau.
3. Strasbourg → Lille : choix entre axes concédés, détours et concessionnaires différents.
4. Bordeaux → Bayonne : corridor plus simple et long tronc commun, utile pour détecter des requêtes inutiles.
5. Un trajet court à dominante gratuite, par exemple Rennes → Saint-Brieuc : contrôle négatif, coût d’amorçage et arrêt trop tardif.

Une référence doit être mesurée pour chaque corridor retenu, avec conditions de l’instance vérifiées, débit respecté et réutilisation des caches. Commencer par deux corridors contrastés plutôt qu’une campagne nationale. Pour les réseaux aux tarifs non audités, évaluer séparément la diversité routière ; ne pas annoncer une récupération monétaire réelle sans prix complets.

## 7. Tests et intégrité produit

- **12 nouveaux tests** de rejeu : 105/309/28, empreintes, absence de réseau, frontière connue, sélection fixe indépendante des réponses, sélection adaptative indépendante du nom des routes et des réponses futures, préfixes des budgets, métriques reproductibles, appels d’analyse dédupliqués, échec d’un arrêt trop tôt et îlot caché synthétique.
- **10 tests Valhalla historiques** ; `unittest discover` exécute **22 tests**, tous réussis.
- **18 tests V2 réussis**, build TypeScript/Vite GitHub Pages réussi ; aucun fichier produit changé.
- Aucun test de nouvelle requête routière : **zéro appel Valhalla réel supplémentaire**, les nombres du rapport sont issus des réponses historiques.

Les seules fixtures synthétiques sont explicitement identifiées dans les tests ; elles ne servent pas de résultats de campagne. Attribution des données géographiques : © OpenStreetMap contributors, ODbL ; calculs historiques Valhalla / FOSSGIS. Rapports tarifaires et limites de couverture restent ceux des archives de main.
