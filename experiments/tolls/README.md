# POC péages — classe 1, Crans → Le Pin

Expérience isolée sur les 28 variantes déjà archivées. Aucun import dans la V1, aucun nouveau calcul Valhalla, aucune estimation en €/km. Voir [REPORT.md](REPORT.md).

Résultat retenu : **21 coûts complets dans le périmètre audité ; 7 partiels**, sans total inventé pour les sections non résolues. La frontière temps/euros porte uniquement sur le sous-ensemble complet.

**Audit complémentaire isolé :** [completion/REPORT.md](completion/REPORT.md) résout R26 à 39,20 € et augmente les sous-totaux APRR des variantes A79. Son résultat est de **22 complets / 6 partiels**, faute de grille ALIAE 2026 vérifiée. Les fichiers historiques ci-dessous et les données affichées par la V2 restent inchangés ; les nouveaux calculs et tests sont dans `completion/` et `test_completion.py`.

## Sources et droits

- Les PDF officiels APRR/AREA sont accessibles gratuitement, mais **aucune licence ouverte de republication n'a été trouvée** ; les mentions légales APRR réservent les droits de reproduction. Les originaux et pages HTML sont conservés localement dans `sources/local/`, ignorés par Git. Ils ne sont pas redistribués dans le dépôt public. Les URL, empreintes et dates sont conservées dans `sources/manifest.json` ; seules les cellules factuelles utilisées par cette expérience sont référencées dans les résultats. Une exploitation commerciale ou republication massive nécessite une clarification des droits, pas la seule accessibilité publique.
- Les snapshots OSM sont sous ODbL, avec attribution OpenStreetMap ; le référentiel MTE est publié sous ODC-BY selon ses métadonnées data.gouv.fr. Ces snapshots sont conservés dans `sources/open/`.
- La récupération conserve TLS et vérifie les empreintes. Si une publication change, le script s'arrête ; ne pas remplacer un hash pour faire passer les tests ou assimiler un nouveau millésime aux tarifs 2026.

## Reproduction

Prérequis : Python 3.10+, `pdftotext` (Poppler, déjà installé dans l'environnement utilisé). Aucune dépendance npm ni clé. Les PDF et pages consultés sont déjà présents localement dans cette session.

```sh
cd /workspace/route-optimizer
python experiments/tolls/sources/fetch_sources.py
python experiments/tolls/pricing.py
python experiments/tolls/audit_sources.py
python experiments/tolls/report.py
python -m unittest discover -s experiments/tolls -v
python -m unittest discover -s experiments/valhalla -v
npm test
npm run build
npm run test:e2e
TEST_PREVIEW=1 npm run test:e2e
```

`fetch_sources.py` restaure les sources ouvertes depuis les snapshots et télécharge les originaux APRR uniquement s'ils manquent. Des pages HTML vivantes peuvent avoir changé ; un échec d'empreinte signale alors que la capture exacte n'est plus restaurable depuis ce lien. Les copies locales de cette session et les résultats versionnés restent les références ; ne pas les écraser silencieusement. La reproduction des chiffres exige le PDF APRR dont l'empreinte est enregistrée. Les tests d'intégration sont explicitement ignorés si ce PDF n'a pas été récupéré ; les tests unitaires restent exécutables hors ligne.

## Architecture et règles

- `pricing.py` : parseur de grille classe 1, géométrie → passages de gares, sessions fermées / forfaits ouverts, cents entiers, inconnus conservés, Pareto et métriques.
- `audit_sources.py` : conversion Lambert-93 du CSV MTE et rapprochement indépendant avec les points OSM. Un point de contrôle EPSG est testé. L'audit n'impose pas automatiquement un alias à partir d'une simple proximité.
- `report.py` : tableaux Markdown et CSV reproductibles, pages/cellules sources, économies et détail des correspondances.
- `test_pricing.py` : tests unitaires avec fixtures synthétiques explicitement séparées des résultats réels.
- `test_archived.py` : régressions sur géométries réelles et cellules du PDF officiel (R18, R12, R26, R5, R13).

Le registre de noms est **audité manuellement pour ce corridor**, pas un moteur national de rapprochement flou. Une proximité à un nœud OSM à 12 m maximum est contrôlée sur les segments, puis les voies d'une même gare sont regroupées ; une rampe voisine n'est pas facturée par simple proximité kilométrique. Le référentiel MTE 2025 corrobore les noms/positions, avec des incohérences conservées et bloquantes pour certains passages.

Les sessions de péage suivent les passages aux gares, pas les séquences booléennes `edge.toll`. Une micro-interruption de ce marquage ne crée pas un deuxième ticket. Les trajets à boucles revisitant plusieurs fois le même nœud, le réseau national arbitraire, les entrées virtuelles et les systèmes mixtes ne sont pas couverts par ce rapprochement expérimental. Une généralisation exigerait un graphe orienté de gares et des règles opérateur.

Les tarifs sont TTC standard classe 1 au 1er février 2026, sans abonnement, remise, majoration de retard ni forfait de service. Les durées proviennent de la campagne Valhalla précédente et ne représentent pas le trafic réel garanti. Les champs inconnus restent `null` ; un sous-total connu de 0 € ne signifie pas un trajet gratuit. Aucun prix A79 n'a été fabriqué.

Les résultats comprennent les trois itinéraires où aucun péage n'est détecté : leur total de 0 € reste conditionné à l'exactitude des données routières, sans prétendre à une vérification terrain.

Données géographiques © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL ; [signaler une erreur](https://www.openstreetmap.org/fixthemap). Référentiel des gares : Ministère de la Transition écologique, millésime 2025, ODC-BY. Tarifs : publications APRR/AREA au 1er février 2026.
