# Validation — 30 octobre 2026

## Exécuté

- **21 tests Python expérimentaux, tous réussis, aucun ignoré**. Inclut les 28 routes
  et traces V3 réelles, les six échantillons supplémentaires, et la comparaison de
  toutes les cellules APRR appliquées avec le PDF officiel retéléchargé.
- `run.py --prepare-catalog` : SHA-256 officiel vérifié, extraction des 16 cellules
  APRR réellement utilisées, catalogue validé, 22 complets et six partiels.
- `run.py` : reproduction hors ligne avec source géographique et topologies pinées.
- `other_corridors.py` : six routes réelles archivées ; une variante Paris–Rennes
  complète à 25,20 €, cinq résultats indisponibles, aucun total forcé.
- `report.py` : résultats Markdown/CSV et véritable Pareto monétaire générés.
- `fetch_sources.py aprr-2026.pdf` : restauration/vérification du pin officiel.
- Import TXT VINCI : 2055 lignes ASF (dont une avec cinq valeurs #N/A), 11004
  Cofiroute/Arcour, 141 Escota. A86/Arcos refusés par le parseur statique ; leurs
  conditions horaires et profils ne sont pas supprimés.
- **21 tests Vitest existants, tous réussis** (`npm test`).
- `git diff --check` ; vérification des chemins changés et de la branche V3
  `feat/v3-local-dynamic` toujours au commit initial `026de8c05e4294fba16950f78b5dc53f16e7cca4`.

Les tests synthétiques se limitent aux contrats et cas limites. Les prix des
résultats ne proviennent pas de ces fixtures. Aucun nouveau routage FOSSGIS,
aucun calculateur commercial, aucune API protégée ni compte n’ont été utilisés.

## Contrôles de non-régression précis

- inconnu et sous-total ne deviennent jamais un prix de trajet ; économies et
  €/minute restent null pour les partiels ; référence non tarifée = aucune économie ;
- paire directionnelle exacte, ni inversion implicite ni interpolation ;
- date, profil, classe, conditions et mapping contrôlés indépendamment ;
- prix entier, non négatif, hash/cellule, conflits et chevauchements détectés ;
- millésime suivant et classe 2 importés par plan/données, mauvais millésime refusé ;
- ordre des portiques pertinent, jamais somme automatique par portique ;
- géométrie hors périmètre, trace invalide ou sens opposé refusés ;
- G011 = Villefranche-Nord 37,90 €, pas Villefranche-Limas 42,00 € ;
- G009 = 16,40 + 22,80 = 39,20 €, avec deux vrais tickets ;
- A79 2024 n’est appliqué à aucune des six routes partiellement tarifées ;
- Paris–Rennes G005 = Chartres-Thivars → La Gravelle, 25,20 €, cellule TXT
  recoupée au PDF p36 et gares physiques sur chaussées orientées.

## Non revendiqué

Pas de garantie nationale, pas de tests de paiement ou de ticket opérateur,
pas de licence commerciale obtenue, pas de calendrier A86/Arcos implémenté,
pas de catalogue ALIAE 2026 vérifié, pas de total Lyon–Bordeaux qualifié,
pas d’intégration dans V3, pas de déploiement. Les tests navigateur et builds V3
ne sont pas répétés pour des fichiers expérimentaux que V3 n’importe pas.

Les preuves HTTP et empreintes sont versionnées dans `sources/observations.json`.
Les originaux soumis à droits restent dans `local/`, ignoré par Git ; seuls
références, hashes, extraits factuels nécessaires et données géographiques ouvertes
figurent dans le commit expérimental.
