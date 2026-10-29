# Validation — 29 octobre 2026

Branche : `experiment/toll-completion-a79`, issue de `origin/main` (`c7b3011`).

|Contrôle exécuté|Résultat|
|---|---|
|`python -m experiments.tolls.completion.run`|28 archives réelles ; 22 complets / 6 partiels ; R26 = 3 920 centimes ; aucun montant ALIAE 2026 inventé|
|`python -m experiments.tolls.completion.report`|Markdown, CSV et empreintes produits ; aucune modification de l’export de l’application|
|`python -m unittest discover -s experiments/tolls -v`|**42 tests réussis** : 18 historiques + 24 nouveaux ; aucun ignoré dans cette session|
|`python -m unittest discover -s experiments/valhalla -v`|**10 tests réussis**|
|`npm test`|**17 tests V2 réussis**|
|`npm run build`|TypeScript et Vite réussis ; base `/route-optimizer/` conservée|
|`TEST_PREVIEW=1 npm run test:e2e`|**8 tests navigateur réussis**, dont carte réelle/GeoJSON, sélection, filtres, tarifs incomplets, erreurs et affichages 320/390/1280 px|
|`python experiments/tolls/completion/sources/fetch_sources.py`|20 sources locales/versionnées vérifiées par empreinte ; pas de nouvelle interrogation nécessaire|
|Recalcul comparé au JSON versionné|Identique après sérialisation JSON ; SHA-256 des résultats vérifiés|
|Diff contre `origin/main` pour `src`, `public`, packages, Vite, Playwright et workflows|**Aucun changement**|
|`git diff --check`|Réussi|

Le PDF APRR officiel piné est présent et utilisé pour relire les quatre cellules de cet audit ; les régressions historiques géométrie/PDF ont donc réellement été exécutées. Les tests génériques emploient de petites fixtures synthétiques explicitement identifiées ; les nouveaux résultats et tests d’intégration emploient les véritables archives.

Les tests navigateur isolent les tuiles raster externes afin de ne pas solliciter OpenStreetMap inutilement. Les géométries et prix chargés sont ceux de la V2 inchangée. Ils vérifient sa non-régression, pas l’affichage des nouveaux résultats expérimentaux, qui ne sont volontairement pas injectés dans l’application.

Les nouveaux contrôles portent notamment sur les sens opposés de portiques à moins de 12 m, la pleine voie A77 contre Souppes, les sessions indépendantes via l’A38, l’ordre géographique inter-concessionnaires, la confiance ambiguë, les dates/classes/profils non couverts, les conflits de cellules, les lacunes de couverture, les inconnus non assimilés à zéro et le Pareto/recommandation recalculés.

Le workflow Pages ne déploie que `main`. Aucun déclenchement manuel, fusion, Pull Request ou déploiement n’a été réalisé dans cette expérience.
