# Étude et prototype tarifaire français 2026

Prototype **isolé du produit**, branche `experiment/fr-toll-engine-2026`, base V3
`026de8c05e4294fba16950f78b5dc53f16e7cca4`. Aucun import dans React ou le backend V3.

- [Rapport et architecture](REPORT.md)
- [28 résultats, Pareto monétaire et détails de chaque transaction](RESULTS.md)
- [Inventaire structuré des réseaux](sources/networks.json)
- [Sources réellement consultées : URL, HTTP, date, hash](sources/observations.json)

Python 3.10+ ; aucun nouveau paquet requis. Poppler (`pdftotext`) uniquement pour
réimporter les cellules APRR depuis l’original officiel. Exécution hors ligne :

```sh
python3 experiments/fr-toll-engine/src/run.py
python3 experiments/fr-toll-engine/src/other_corridors.py
python3 experiments/fr-toll-engine/src/report.py
python3 -m unittest discover -s experiments/fr-toll-engine/tests -v
```

Réimport contrôlé :

```sh
python3 experiments/fr-toll-engine/src/fetch_sources.py aprr-2026.pdf
python3 experiments/fr-toll-engine/src/run.py --prepare-catalog
```

Le téléchargement est privé dans `local/`, ignoré par Git. Une différence
SHA-256 **arrête** la restauration : ne pas modifier l’empreinte attendue pour
faire passer un contrôle ; créer un nouveau staging, vérifier le millésime,
les droits et la structure, puis revoir les cellules avant activation.
Les seuls prix publiés ici sont les 16 cellules APRR et la cellule Cofiroute
nécessaires aux essais, avec localisation et provenance ; aucune matrice complète
ou PDF d’opérateur n’est redistribué.

`inputs/` contient les vraies géométries et traces V3 (28) et six échantillons des
anciennes campagnes complémentaires. Données géographiques dérivées ©
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL ;
[signaler une erreur](https://www.openstreetmap.org/fixthemap). Les sources OSM
ouvertes ont le même régime. Les coordonnées du référentiel MTE 2025 utilisé en
corroboration viennent de `experiments/tolls/sources/open/`, sous ODC-BY selon
ses métadonnées. Les copies privées ne sont pas des artefacts à publier.

`complete_verified` signifie **prix et couverture justifiés dans le périmètre
manuel audité** ; pas un reçu opérateur ni une garantie nationale. Les trois
zéros sont conditionnés aux données routières. Une utilisation produit publique
demande notamment droits de réutilisation, catalogue complet et matching orienté
national. `partial`, `unavailable` et `stale` conservent un total `null`.
