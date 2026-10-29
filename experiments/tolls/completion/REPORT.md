# Audit complémentaire APRR / ALIAE — 29 octobre 2026

**Un des sept itinéraires est entièrement résolu : R26, 39,20 €. Le jeu expérimental passe de 21 à 22 totaux complets, avec six totaux toujours inconnus.** Les correspondances APRR des six autres progressent, mais aucune grille ALIAE 2026 suffisamment vérifiée n’a été obtenue. Aucun tarif 2024, taux d’augmentation moyen ou prix kilométrique n’est appliqué en remplacement.

Branche `experiment/toll-completion-a79`, créée depuis `origin/main` au commit `c7b3011`. Aucun changement de l’application, de ses données, de ses géométries publiques, de Vite ou du workflow Pages. Les résultats historiques et l’export V2 restent intacts. Aucun déploiement, Pull Request ou fusion.

Les [tableaux exhaustifs et transactions](RESULTS.md), le [JSON détaillé](results/pricing.json) et le [CSV](results/comparison.csv) sont générés hors ligne depuis les archives. Ce sont des résultats expérimentaux, pas de nouveaux tarifs déjà affichés dans la V2.

## Sources effectivement consultées

|Source officielle ou ouverte|Date / format|Usage et fiabilité|
|---|---|---|
|[APRR, grille officielle](https://voyage.aprr.fr/sites/default/files/2026-02/TARIFS_APRR.pdf)|1er février 2026, PDF texte|Source primaire des prix TTC classe 1 ; cellules relues par le parseur du POC, pages conservées. Original inchangé, SHA-256 `f05dfa58cb4ffba8b940b95319186fbf60f86d3791dce6a9df0919946b635d14`.|
|[Article tarifaire ALIAE](https://paiement.aliae.com/fr/quels-sont-les-tarifs-de-l-a79--8925819183911564158)|Page publique consultée le 29 octobre 2026, rendue dans Chromium|L’article complet, accessible depuis le centre d’aide, renvoie effectivement vers le PDF ci-dessous. Aucun compte, paiement ou clé requis.|
|[PDF effectivement lié par ALIAE](https://paiement.aliae.com/upload/TARIFS_24_v1.pdf)|**1er février 2024**, PDF, tableaux flux libre en image|Source officielle mais périmée pour cet audit 2026. Page 1 : millésime ; page 2 : classe 1 standard et très faible émission, groupes Est/Ouest/Transit et schéma ; autres pages : Deux-Chaises. **Aucun de ces prix n’est appliqué.**|
|[Règlement d’exploitation ALIAE](https://www.aliae.com/files/live/sites/aliae/files/Mediatheque/PDF/A.79%20-%20ALIAE%20-%20Reglement%20Exploitation.pdf)|Octobre 2022, PDF 24 pages|Fonctionnement, gratuités, paiement, schéma des portiques et barrière interconnectée de Deux-Chaises. Document structurel, pas grille 2026.|
|[Communiqué ALIAE de révision](https://www.aliae.com/files/live/sites/aliae/files/Mediatheque/PDF/CP_r%C3%A9vision%20des%20tarifs_ALIAE.pdf), lié depuis la [médiathèque](https://www.aliae.com/medias)|1er février 2025, PDF 1 page|Annonce une révision **moyenne** de +1,58 % toutes classes. Confirme qu’on ne peut considérer 2024 comme millésime courant. Aucun montant de section 2026 ; moyenne inutilisable pour extrapoler une cellule.|
|[Contrat APRR publié par le ministère](https://www.ecologie.gouv.fr/sites/default/files/documents/APRR_convention%20consolid%C3%A9e%20apr%C3%A8s%2019e%20avenant.pdf)|Consolidé au 31 janvier 2023, PDF|Réseaux A406/A77/A6 ; page imprimée 16 : dispositif Pouilly-en-Auxois raccordé RN81/A38 ; page 19 : Dordives/Val de Loing ; page 20 : A406. Confirme la topologie, sans corriger automatiquement les coordonnées MTE.|
|[Contrat ALIAE publié par le ministère](https://www.ecologie.gouv.fr/sites/default/files/documents/decret%20RCEA.pdf)|Décret du 12 mars 2020, JO du 15 mars 2020, PDF|Articles 10, 25, 26 : sections, classes, modulations et révisions. Les plafonds contractuels et TKM ne sont pas des tarifs de trajet.|
|[MTE, référentiel des gares](https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede)|01/01/2025, CSV, déjà archivé|ODC-BY selon métadonnées. Contrôle des noms, types et voies raccordées ; écarts conservés, pas d’alias déduit de la gare la plus proche.|
|[OpenStreetMap API 0.6](https://wiki.openstreetmap.org/wiki/API_v0.6)|Snapshots du 29 octobre 2026, JSON `way/full` et XML borné|ODbL, attribution OpenStreetMap contributors. Nœuds et voies orientées exactes : contrôle topologique indépendant de la seule distance. Snapshots pertinents intégralement versionnés.|

L’exploitant APRR d’ALIAE n’est pas traité comme le concessionnaire tarifaire APRR. Les publications gratuites APRR/ALIAE ne portent pas de licence ouverte de republication identifiée : PDF/HTML originaux conservés dans `sources/local/` ignoré par Git, URL/dates/empreintes dans le [manifeste](sources/manifest.json). Seules les cellules factuelles nécessaires à l’audit sont citées. Les publications ministérielles sont accompagnées de la mention Etalab 2.0 du portail ; les données OSM et MTE conservent leurs licences propres. Aucune conclusion sur des droits de redistribution commerciale des grilles complètes.

## Résolution des correspondances APRR

### Val-de-Loing : pleine voie et échangeur sont réellement distincts

Le snapshot borné `loing-map.osm` contient à la fois :

- le nœud **247393080**, « Val-de-Loing Barrière », sur la pleine voie nord de l’A77 ;
- les nœuds **35665218 / 35665220**, « Val-de-Loing-Souppes », sur les voies latérales, correspondant aux points MTE de type échangeur.

Les cinq géométries R8/R13/R19/R20/R24 traversent le premier, à environ 1 cm du segment, avec progression orientée sur les voies **601255126 puis 601255123**, toutes deux `motorway`, `oneway=yes`, A77, APRR. Elles ne traversent pas les gares latérales : la plus proche est à environ **16,89 m**, l’autre à **56,58 m**. Les points MTE proches n’étaient donc pas une preuve qu’il fallait appliquer Souppes.

La bonne cellule de grille pour ce passage pleine voie puis Fleury est **VAL DE LOING-BARRIERE → FLEURY-EN-BIERE : 10,00 €**, page 270. La cellule Souppes à 4,10 €, même page, est conservée comme contre-exemple **non appliqué**. La distance tarifaire de la grille n’est pas assimilée à la seule distance entre les coordonnées physiques : les barrières et systèmes mixtes peuvent intégrer la portion parcourue avant le point de perception. Aucun forfait supplémentaire de Val-de-Loing n’est ajouté au montant de cette cellule.

Confiance de correspondance : **suffisamment fiable**. Confiance dans le montant officiel et son millésime : **confirmé**.

### Val de Saône, R19

Le nœud **471330156** est une gare nommée « Péage Val de Saône », sur la voie **141709993**, pleine voie A406 APRR orientée d’est en ouest, venant de l’A40. La géométrie suit effectivement la voie, pas une rampe voisine. Le ticket commencé à Ambérieu se termine à cette gare avant la suite du parcours gratuit. Le nom tarifaire exact est unique ; il ne s’agit pas du forfait ouvert de Crottet, que R19 ne traverse pas.

Cellule **AMBERIEU → VAL DE SAONE : 7,70 €**, page 6. Le point MTE homonyme reste à environ **6,7 km** ; ses coordonnées ne sont ni déplacées ni déclarées corrigées. La correspondance retenue repose sur le nom exact, la gare réelle, la concession et la continuité orientée A40/A406 de l’archive, corroborées par le contrat du contournement de Mâcon. L’écart MTE interdit le niveau « confirmé » pour la correspondance.

Confiance de correspondance : **suffisamment fiable**, avec conflit MTE explicite. Montant : **confirmé**. Nouveau sous-total APRR de R19 : 4,20 + 7,70 + 10,00 = **21,90 €**, toujours hors A79 et donc **sans total réel**.

### Pouilly-en-Auxois, R26

Le nœud **28868663**, « Péage de Pouilly-en-Auxois », appartient à la voie orientée **404806183**, référence nationale de branche **21A900610CD_2D**, exploitée par APRR. L’archive R26 arrive par l’A38, traverse cette gare vers l’ouest, puis suit l’instruction **« Prenez la sortie vers Paris/Auxerre. »**, avant de continuer sur A6 nord, A19, A5 et Les Éprunes. Le contrat officiel décrit précisément le raccordement Pouilly RN81/A38. On ne sélectionne pas une gare d’après le seul point MTE situé environ **9,7 km** plus loin sur l’A6.

Confiance de correspondance : **suffisamment fiable**, conflit MTE conservé. Montants officiels : **confirmés**.

|Session distincte|Classe 1|Source|
|---|---:|---|
|Pont-d’Ain → Dijon-Crimolois|16,40 €|APRR 2026, page 202|
|Pouilly-en-Auxois → Les Éprunes|22,80 €|APRR 2026, page 205|
|**Total R26**|**39,20 €**|Somme en centimes ; aucun ticket fusionné à travers l’A38 gratuite|

Ce rapprochement est audité pour ces géométries. Il ne justifie pas un alias national automatique ni une affirmation de coordonnées ministérielles erronées pour tous les usages.

## A79 : ce qui est établi et ce qui manque

Les six géométries arrivent de la N79 à **[4.006004, 46.469110]**, secteur Digoin / échangeur 23. Aucun de ces six trajets ne rejoint Deux-Chaises ou l’A71.

|Itinéraires|Sortie réelle|A79, longueur des arêtes|Portiques réellement traversés, dans l’ordre|
|---|---|---:|---|
|R7, R8, R20|27, Dompierre-sur-Besbre Ouest, D779, [3.653195, 46.538667]|30,144 km|Molinet Est, Molinet Ouest|
|R13, R19, R24|30, Toulon-sur-Allier, N7, [3.359118, 46.494482]|53,835 km|Molinet Est, Molinet Ouest, Montbeugny Est, Montbeugny Ouest|

Les coordonnées, nœuds, voies, sens et distances au segment de **chaque** passage sont dans [RESULTS.md](RESULTS.md) et le JSON. Les portiques sont bien des nœuds OSM `highway=toll_gantry`, pas des péages traditionnels absents par erreur de la recherche `barrier=toll_booth` du premier POC.

Les portiques des chaussées opposées sont parfois séparés d’environ **10 m**. Le seuil initial de 12 m, utilisé seul, aurait pu compter les deux sens. Le nouveau contrôle exige une progression dans le sens de la voie OSM ; le portique du sens opposé est rejeté. Test de régression dédié sur Molinet Est.

Le règlement (pages 5–6, 21) décrit :

- identification par badge ou plaque, horodatage et reconstitution du trajet ; paiement dans les 72 h après le passage pour le cas sans règlement automatique ;
- six positions de portiques, organisées autour du Montet, de Montbeugny et de Molinet ;
- gratuités Cressanges–Toulon-sur-Allier et entre les échangeurs de Dompierre ; rester sur une zone gratuite n’est pas sortir de l’autoroute et n’ouvre pas un ticket supplémentaire ;
- tarification selon le trajet et la classe ; la référence 2024 distingue **Est / Ouest / Transit** par secteur, pas un montant uniforme par portique ;
- réduction spécifique aux véhicules à très faible émission, décrite à 20 % dans le règlement 2022 et une colonne dédiée dans la grille 2024 : **classe 1 seule ne décrit donc pas tous les profils tarifaires**. Aucun taux de remise n’est prolongé automatiquement à 2026 ;
- barrière interconnectée de Deux-Chaises pour l’A71, distincte du seul flux libre analysé ici.

Les schémas officiels 2022/2024 permettent d’identifier les groupes **Molinet Transit** pour les six variantes et **Montbeugny Transit** pour R13/R19/R24. Ce sont des rapprochements structurels à confirmer avec la prochaine grille courante, pas des sommes tarifaires calculées à partir des kilomètres. Aucun portique Le Montet détecté ni attendu sur ces six passages.

**Blocage précis :** l’article officiel public consulté le 29 octobre 2026 fournit un PDF explicitement daté du **1er février 2024**. La médiathèque fournit un communiqué 2025 (+1,58 % en moyenne), qui n’est pas une matrice de prix, et aucun document 2026 exploitable n’a été vérifié dans ces sources. Les noms de fichier 2026 testés sur le site de paiement ont renvoyé le shell HTML de l’application avec HTTP 200, **pas un PDF**. Aucun de ces retours n’a été pris pour une grille. Le portail ASFA consulté a répondu 503. Les recherches générales ont renvoyé une page non exploitable ou des résultats non pertinents, non utilisés comme preuve.

Les requêtes Overpass bornées ont répondu 406, et le serveur alternatif a expiré : les contrôles géographiques ont été réalisés via les endpoints publics standards de l’API OSM, avec des emprises bornées puis des snapshots `way/full`. Il n’y a donc **pas de blocage réseau empêchant tout travail réel**, mais une absence de **catalogue tarifaire courant vérifié** pour ALIAE dans les sources obtenues. Cela ne prouve pas qu’une telle publication n’existe nulle part.

Pour résoudre les six derniers totaux, il faut une **publication officielle ALIAE applicable en 2026** indiquant les montants classe 1 standard des groupes parcourus et les règles de cumul/Transit/gratuités. Une grille ou confirmation écrite précise de l’opérateur suffirait à poursuivre l’audit. Aucun message n’a été envoyé à l’opérateur. Ni une moyenne annuelle, ni le plafond contractuel, ni un calculateur payant ne remplace cette preuve.

## Résultat économique

|ID|Sous-total APRR nouvellement connu|A79|Total 2026|
|---|---:|---|---:|
|R7|5,00 €|inconnu|incomplet|
|R8|15,00 €|inconnu|incomplet|
|R13|15,00 €|inconnu|incomplet|
|R19|21,90 €|inconnu|incomplet|
|R20|10,00 €|inconnu|incomplet|
|R24|14,20 €|inconnu|incomplet|
|R26|39,20 €|non empruntée|**39,20 €**|

R26 dure **327,0553 min**, soit **+28,4503 min** par rapport à R18 (40,70 €). Économie : **1,50 €**, soit **0,0527 €/min** supplémentaire. R14 est à la fois plus rapide (317,8639 min) et moins cher (34,30 €) : R26 est dominé. Il n’ajoute donc aucune solution Pareto.

La frontière des **22 totaux complets** reste **R18, R23, R14, R27, R15, R12, R4, R1**. Les métriques complètes sont dans [RESULTS.md](RESULTS.md). Elle ne peut toujours pas être présentée comme la frontière finale des 28 tarifs réels.

La formule V2 est conservée : économie en euros − 0,20 × minutes supplémentaires + 2 × min(2, économie/minute), avec efficacité nulle si détour nul. **R27 reste recommandé au plafond par défaut +45 min**, devant R26 ; tous les six inconnus ont plus de 45 minutes supplémentaires et sont donc exclus par ce filtre indépendamment de leur futur prix. Pour des plafonds plus élevés, leur classement monétaire demeure ouvert. Les nouveaux résultats ne sont pas injectés dans l’interface publiée.

## Niveaux de confiance

Chaque section du JSON porte séparément `traversal.confidence`, `tariff_confidence`, les preuves et `accepted`.

|Niveau|Critères|Participe au total ?|
|---|---|---|
|confirmé|Cellule primaire au bon millésime/classe, référence exacte et non contradictoire ; pour une correspondance, il faudrait une identité officielle directionnelle non ambiguë|oui|
|suffisamment fiable|Identité exacte, réseau, voie orientée et continuité de l’itinéraire concordent ; conflit secondaire documenté, sans candidat concurrent compatible avec le passage|oui|
|ambigu|Plusieurs identités/règles compatibles, direction non vérifiée ou contradiction non arbitrable|non|
|inconnu|Source courante manquante, profil/classe/date non couverts ou section non rapprochée|non|

Les prix APRR cités sont **confirmés**, les correspondances retenues sont **suffisamment fiables** ; elles ne sont pas présentées comme des validations terrain. Les correspondances de portiques A79 sont **suffisamment fiables**, les prix 2026 **inconnus**. Les seules coordonnées MTE discordantes restent des preuves contradictoires, pas une nouvelle source de prix. Tout total exige une couverture explicite de toutes les sections et l’acceptation des deux niveaux de chaque section. Une liste vide sans couverture prouvée ne vaut pas 0 €.

## Généralisation du moteur

Les contrats minimaux sont implémentés dans [engine.py](engine.py), sans branchement à React. Architecture détaillée : [ARCHITECTURE.md](ARCHITECTURE.md). Les identités opérateur, système, véhicule, date, preuves et confiance sont séparées. Un fournisseur de matrice directionnelle datée applique les cellules APRR. Le fournisseur ALIAE refuse volontairement les prix non vérifiés. L’agrégateur conserve `null` et les sous-totaux.

Les trois rapprochements audités sont dans un registre de **données** de gares/nœuds/voies, sans règle du type « si R26 alors 39,20 ». La même correspondance Val-de-Loing s’applique aux cinq géométries qui vérifient effectivement la topologie. Le recensement de couverture et les visites uniques restent propres au corridor archivé : les boucles, re-passages et itinéraires nationaux arbitraires exigent le futur graphe orienté de transactions. Ne pas présenter ce petit matcher comme un moteur national.

## Reproduction et vérifications

Depuis la racine du dépôt :

```sh
# Facultatif : restaurer les originaux, avec contrôle d'empreintes.
python experiments/tolls/sources/fetch_sources.py
python experiments/tolls/completion/sources/fetch_sources.py

# Calcul / rapports hors ligne ; pas d'export vers la V2.
python -m experiments.tolls.completion.run
python -m experiments.tolls.completion.report

python -m unittest discover -s experiments/tolls -v
python -m unittest discover -s experiments/valhalla -v
npm test
npm run build
TEST_PREVIEW=1 npm run test:e2e
```

Les snapshots ouverts, cellules factuelles, manifestes et résultats sont versionnés. Les empreintes d’entrée incluent archives, baseline historique et formule V2. Le calcul vérifie tous les snapshots ouverts ; si le PDF APRR local existe, il vérifie son hash et relit réellement les quatre cellules. Une mutation des sources requiert un nouvel audit, pas un remplacement silencieux du hash. Le rendu HTML d’une page vivante n’est pas promis identique lors d’une consultation future ; il sert de trace locale de consultation et n’est pas requis pour recalculer les résultats.

Les tests historiques avec PDF peuvent être ignorés explicitement dans un environnement où l’original n’a pas été restauré ; **ils sont exécutés dans cette session**, avec le PDF piné. Les tests de calcul et de géométrie du nouvel audit sont exécutables hors ligne avec les sources factuelles versionnées. Les tuiles des tests navigateur sont isolées ; les géométries et tarifs V2 restent les véritables archives. Voir [VALIDATION.md](VALIDATION.md) pour les résultats de la session.

**Conclusion :** l’A79 peut être rapprochée de portiques directionnels et de groupes tarifaires de façon reproductible. Le blocage restant est la validation de la grille ALIAE 2026 et de ses règles, pas la géométrie ni l’addition en centimes. Un moteur multi-concessionnaires est techniquement faisable avec catalogues versionnés, identités directionnelles et refus des zones non couvertes ; il ne peut devenir fiable nationalement avec des tarifs anciens prolongés par supposition.

Données géographiques © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/). Référentiel MTE 2025, ODC-BY selon métadonnées. Sources tarifaires et droits ci-dessus.
