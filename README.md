# Route Optimizer

Prototype web responsive en français pour explorer le compromis entre durée de trajet et coût des péages. L’objectif est de comprendre immédiatement : « En acceptant 19 minutes supplémentaires, j’économise 13,20 € ».

> **V1 en mode démonstration uniquement.** Les durées, distances, péages et tracés sont fictifs. Les villes saisies servent de libellés : elles ne modifient pas les données. Aucun itinéraire réel n’est calculé, aucune géolocalisation ni navigation n’est proposée.

## Installation et lancement

Prérequis : Node.js 22+ et npm (validation réalisée avec Node 24).

```sh
cd /workspace/route-optimizer # dans Codex Cloud ; sinon votre dossier de clone
npm ci
npm run dev -- --port 5173
```

Vite écoute sur `0.0.0.0:5173`. Dans Codex Cloud, utilisez l’aperçu ou le transfert de port de votre interface s’il est disponible. À défaut, les requêtes HTTP locales permettent de contrôler le serveur ; une adresse localhost n’est pas accessible directement depuis votre téléphone. Sur une machine locale, ouvrez l’adresse indiquée par Vite. Aucun compte, clé secrète, backend ou service externe n’est requis.

Saisissez deux villes différentes, ajustez les critères et cliquez sur **Optimiser mon trajet**. Les préférences sont appliquées au clic. Le scénario initial utilise +45 minutes et aucun minimum d’économie. Cliquez sur une carte de résultat pour changer le tracé fictif mis en évidence.

```sh
npm test             # tests unitaires
npm run test:e2e     # tests navigateur, Chromium installé requis
npm run build        # TypeScript strict + compilation de production
npm run preview      # servir le build, port 4173 par défaut
```

## Déploiement gratuit avec GitHub Pages

Adresse prévue : **https://nogeomhub.github.io/route-optimizer/**.
Le site restera en mode démonstration, accessible depuis un navigateur sans installation.
GitHub Pages gratuit nécessite un dépôt public avec GitHub Free ; un dépôt privé peut nécessiter une offre GitHub compatible. Aucun hébergeur supplémentaire, clé API ou secret personnalisé n’est nécessaire.

### Activation initiale sur GitHub

1. Ouvrez le dépôt `NogeomHub/route-optimizer`, puis **Settings → Pages**.
2. Dans **Build and deployment → Source**, sélectionnez **GitHub Actions** (pas « Deploy from a branch »).
3. Intégrez la Pull Request de configuration dans `main`.
4. Dans **Actions**, ouvrez **Build and deploy GitHub Pages** et attendez la réussite de `build` puis `deploy`. L’adresse publiée apparaît aussi dans **Settings → Pages**.

Si Pages est activé après une première exécution échouée, relancez via **Actions → Build and deploy GitHub Pages → Run workflow**, choisissez `main`, puis **Run workflow**. Les permissions Actions/Pages du dépôt ou de l’organisation doivent autoriser ce workflow ; une règle d’approbation de l’environnement `github-pages` peut demander une validation.

### Fonctionnement automatique

`.github/workflows/deploy-pages.yml` installe les dépendances avec `npm ci`, exécute les tests unitaires et construit l’application avec vérification TypeScript. Les Pull Requests vers `main` sont vérifiées sans publication. Chaque push sur `main`, notamment après fusion d’une PR, publie `dist/` via les actions officielles GitHub Pages. Le déploiement exige la réussite du build et des tests. Seul le job de déploiement reçoit `pages: write` et `id-token: write` ; GitHub fournit son authentification automatiquement.

Vite utilise `/route-optimizer/` comme base de production. Le développement local reste à `/`. Pour vérifier le build sous le chemin réellement déployé :

```sh
npm run build
npm run preview -- --port 4173
# Ouvrir http://localhost:4173/route-optimizer/ sur la machine locale
```

La suite navigateur peut aussi tester ce build (Chromium requis, commande shell Linux/macOS) :

```sh
npm run build
TEST_PREVIEW=1 npm run test:e2e
```

Les tests démarrent automatiquement le serveur de prévisualisation. Aucun domaine personnalisé n’est configuré. Un renommage du dépôt ou un changement de domaine nécessitera d’adapter la base Vite. La réussite des tests locaux ne confirme pas encore le déploiement public : celui-ci ne sera vérifiable qu’après intégration dans `main` et activation de Pages.

## Architecture

- `src/App.tsx` : formulaire, état des préférences appliquées, comparaison et sélection des résultats.
- `src/styles.css` : interface responsive sans framework CSS ni police distante.
- `src/components/RouteMap.tsx` : schéma SVG fictif, indépendant de toute API cartographique.
- `src/domain/types.ts` : modèles de trajet et préférences ; les montants sont des entiers en centimes.
- `src/domain/optimization.ts` : fonctions pures de Pareto, métriques, filtrage et recommandation.
- `src/routing/RoutingProvider.ts` : contrat asynchrone du futur fournisseur de routage.
- `src/routing/DemoRoutingProvider.ts` et `demoData.ts` : fournisseur et scénario simulés.

Stack : React, TypeScript, Vite, icônes Lucide et Vitest. Application statique sans backend. Le lockfile npm est versionné pour une installation reproductible.

## Optimisation

La frontière de Pareto minimise **durée et péages**. Un candidat est dominé lorsqu’un autre est au moins aussi bon sur les deux axes et strictement meilleur sur au moins un axe. L’algorithme trie les candidats par durée puis péage, et conserve les nouveaux minima de coût : complexité O(n log n), sans mutation de l’entrée. Les doublons temps/coût sont départagés par distance puis identifiant. La distance et l’énergie éventuelle restent informatives. Les candidats invalides sont exclus.

Les préférences s’appliquent ensuite à la frontière : détour maximal et économie minimale, seuils inclusifs. Le trajet rapide reste visible comme **référence**, même hors critères. Tous les autres résultats affichés satisfont les critères. Le graphique montre la frontière complète, y compris les candidats hors critères ; les trajets dominés ne sont jamais affichés. Une absence de solution est explicitement signalée.

- Économie = péages du plus rapide − péages du candidat, en centimes.
- Détour = durée du candidat − durée du plus rapide.
- Efficacité = économie en euros / détour en minutes ; non définie pour un détour nul.
- Score = économie en euros − 0,55 × détour + 2 × min(2, efficacité).

La recommandation maximise ce score parmi les candidats admissibles. C’est une **heuristique de départ**, pas une formule scientifiquement optimale. Les poids sont regroupés dans `RECOMMENDATION_WEIGHTS`. À égalité, le trajet le plus rapide est choisi. Le trajet rapide peut lui-même être recommandé. Avec les critères par défaut, le scénario recommande 4 h 47 / 18,20 €, soit +19 min, 13,20 € économisés et environ 0,69 €/min.

## Tests et validation

`src/domain/optimization.test.ts` couvre élimination des dominés, égalités et doublons, candidats invalides, liste vide, non-mutation, économies, €/min, détour nul, recommandation, seuils inclusifs et absence de résultat. `e2e/app.spec.ts` contient 3 tests Playwright. Par défaut ils utilisent `/usr/bin/chromium` (présent dans cet environnement Cloud). Ailleurs, définissez `CHROMIUM_PATH` avec le chemin de votre navigateur Chromium. Playwright démarre automatiquement Vite pour ces tests. Les vérifications navigateur couvrent le formulaire, les filtres, la sélection, la validation et les tailles mobile/ordinateur.

## Limites de la V1

- Un scénario statique pour toutes les villes ; aucun géocodage, trafic, prix réel, péage par classe de véhicule ou contrainte routière.
- Schéma et graphique illustratifs, sans fond cartographique ni valeur de guidage.
- Économies limitées aux péages ; le coût énergétique n’intervient pas encore dans l’optimisation.
- Heuristique ajustable, sans apprentissage ni garantie de meilleure décision personnelle.
- Aucune persistance des recherches, aucun export ni application Android native.

## Prochaines étapes

1. Implémenter un `RoutingProvider` réel et remplacer l’instance de démonstration dans `App.tsx` ; conserver les fonctions du domaine et les tests.
2. Générer de vrais candidats hybrides : un simple moteur proposant « rapide / sans péage » ne suffit pas. Prévoir plusieurs points d’entrée et de sortie, puis vérifier les péages réels.
3. Étendre le contrat avec géométries, provenance, fraîcheur et incertitude des prix ; intégrer une carte réelle et ses règles d’attribution.
4. Ajouter une valeur du temps réglable, les coûts énergétiques et des critères de véhicule.
5. Évaluer couverture, licences et quotas des fournisseurs. Si une clé confidentielle devient nécessaire, l’isoler côté serveur et ne jamais l’inclure dans le frontend.
