# Protocole gelé avant les nouvelles requêtes /route

30 octobre 2026. Départ du commit `6a8bcd1` (étude de budget), dont `main`
`e36a14b` est ancêtre. Les seules nouvelles modifications sont expérimentales.

- Fonction candidate **réutilisée sans modification** : `budget.study.adaptive`.
- 9 sondes : exclusion, puis u=0/1 pour chaque pénalité 0/300/900/1800.
- Budget 40, patience 8, minimum 12 avant arrêt ; alternatives 2.
- Milieux en indices de la grille initiale, priorité aux signatures différentes,
  puis largeur, pénalité croissante et borne basse. Aucun tarif/trace lu pour choisir.
- Déduplication historique conservatrice avant analyse ; cache exact en premier.
- Référence : **les 105 profils** historiques couvrant u=0 à 1 et les quatre
  pénalités ; ne pas restreindre la recherche à 0,30–0,50. La partie sous 0,5 est
  plus dense (coût automobile asymétrique documenté). La référence reste une
  grille finie, pas une preuve d’exhaustivité continue.
- Réponses communes réutilisées, aucun double appel route pour un même profil.
- Les trois mêmes corridors et centres communaux identifiés par code INSEE.
- Une connexion, pause ≥2 secondes après chaque requête, journal persistant,
  aucun retry automatique, aucune interpolation de réponse absente.
- Toutes les géométries uniques analysées en edge_walk après la référence ;
  aucune économie en euros calculée.
- Cas contrôle sans péage : règle candidate évaluée telle quelle. Les éventuels
  arrêts plus précoces seront **rejoués après**, étiquetés comme proposition,
  jamais utilisés pour raccourcir rétroactivement la candidate.
- Vérification version et graphe avant/après chaque corridor.

`freeze.json` conserve date UTC, règles, sources et SHA-256 des trois scripts.
Le client refuse les sources gelées modifiées. Le commit de ce protocole précède
les nouvelles observations. Pas de modification de règle après les résultats.

Données © OpenStreetMap contributors (ODbL), routage FOSSGIS/Valhalla.
https://www.openstreetmap.org/copyright
https://www.openstreetmap.org/fixthemap
