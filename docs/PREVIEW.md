# Prévisualisation publique V2 séparée — configuration prête, non déployée

## Choix : projet Cloudflare Pages Free indépendant

GitHub documente **un seul site Pages par dépôt**. Une branche de publication différente ne crée pas un deuxième site indépendant : elle remplace la source du même site. Un sous-chemin demanderait un artefact combinant les deux versions et toucherait le déploiement existant. Un second dépôt serait possible mais ajouterait copie, synchronisation et permissions. Aucune de ces opérations n'est réalisée ici.

On recommande donc un **nouveau projet Cloudflare Pages**, lié au même dépôt public, avec `feat/v2-archived-real-routes` comme branche de production **de ce seul projet Cloudflare**. Le libellé « production » de Cloudflare ne désigne pas `main` ni le site GitHub Pages V1.

La V1 demeure à `https://nogeomhub.github.io/route-optimizer/`. Aucun changement de `main`, du workflow GitHub Pages, de sa source, de son domaine ou de son artefact. Aucun compte Cloudflare, projet ou déploiement tiers n'a été créé par Codex.

## Gratuité et limites

Ce projet est un site statique : pas de Functions, Worker, base de données, R2, domaine payant ou API payante. Choisir **Pages Free**, sans carte bancaire ni mise à niveau. Les limites documentées du plan gratuit incluent 500 builds/mois, un build simultané, 20 minutes/build, 20 000 fichiers et 25 MiB par fichier. Le build de cette application est largement en dessous. Les conditions et quotas du fournisseur restent susceptibles d'évoluer.

La connexion GitHub demande une autorisation de l'application Cloudflare, pas une clé à mettre dans le dépôt. Restreindre l'accès au seul dépôt nécessaire. Le site sera public et pourra être bloqué par le filtrage de votre entreprise ; un hébergement public ne garantit pas son accessibilité depuis tout réseau professionnel.

## Action manuelle et accord de publication

Ces étapes se déroulent **sur le site Cloudflare**, depuis le navigateur. Elles constituent votre autorisation de connecter le dépôt et de publier chez ce tiers. Aucune commande locale n'est nécessaire.

1. Ouvrir https://dash.cloudflare.com/ et se connecter, ou créer soi-même un compte gratuit. Ne pas choisir d'offre payante ni renseigner de carte pour ce besoin.
2. Ouvrir **Workers & Pages → Create application → Pages → Connect to Git**. Choisir **Pages**, pas un déploiement Workers.
3. Choisir **GitHub**, puis autoriser l'application Cloudflare. Sur GitHub, sélectionner **Only select repositories** et uniquement `NogeomHub/route-optimizer` ; confirmer avec **Install & Authorize** si ce bouton est présenté. Aucun secret à copier dans le chat ou dans GitHub Actions.
4. Sélectionner le dépôt `NogeomHub/route-optimizer`, puis **Begin setup** si présenté.
5. Nommer le projet **`route-optimizer-v2-preview`**, si disponible. Choisir explicitement la **Production branch : `feat/v2-archived-real-routes`** ; ne pas laisser `main` par défaut.
6. Renseigner les paramètres ci-dessous. Ne pas ajouter de domaine personnalisé, Functions, secret ou service annexe.
7. Vérifier les choix. **Save and Deploy** déclenche la publication chez Cloudflare : cliquer uniquement lorsque vous acceptez cette publication publique séparée.
8. Après réussite, ouvrir l'URL `pages.dev` affichée par Cloudflare. Dans **Settings → Builds → Branch control**, conserver la branche de production V2 et régler **Preview branch control : None** pour ne pas construire les autres branches de ce dépôt. Selon la version du tableau de bord, cette rubrique peut être regroupée dans les paramètres de builds/deployments.
9. Pour arrêter la preview temporaire : projet Cloudflare → **Settings → Delete project**. Aucun effet sur GitHub Pages ou `main`.

| Paramètre                                | Valeur                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| Projet                                   | `route-optimizer-v2-preview` (ou un nom libre avec suffixe) |
| Branche de production de CE projet       | `feat/v2-archived-real-routes`                              |
| Framework preset                         | `Vite` / `React (Vite)` si proposé, sinon `None`            |
| Root directory                           | Racine du dépôt, vide ou `/`                                |
| Build command                            | `npm test && npm run build:preview`                         |
| Build output directory                   | `dist`                                                      |
| Variable de build, non secrète           | `NODE_VERSION` = `24`                                       |
| Domaine personnalisé, Functions, secrets | Aucun                                                       |

## URL attendue, pas encore attribuée

Si ce nom est libre et accepté par Cloudflare :

**https://route-optimizer-v2-preview.pages.dev/**

Ce n'est pas une URL déjà déployée. Si le nom est pris, Cloudflare demandera un autre nom : l'URL finale sera celle affichée après le déploiement. Aucun lien `localhost` n'est nécessaire pour l'utilisateur final.

Les futurs pushes sur la branche V2 reconstruiront ce projet, après tests. Ils ne reconstruisent pas la V1 GitHub Pages, dont le workflow ne déploie que `main`.

## Deux bases distinctes, sans changer la V1

- `npm run build` conserve `/route-optimizer/` pour GitHub Pages, comme précédemment.
- `npm run build:preview` utilise `vite build --base=/` pour ce projet `pages.dev` dédié.
- Les GeoJSON utilisent déjà `import.meta.env.BASE_URL` : `/data/routes/R27.geojson` sur la preview et `/route-optimizer/data/routes/R27.geojson` pour Pages.
- Leaflet est livré dans le bundle ; les marqueurs sont des cercles sans image distante. Les tuiles OSM restent en HTTPS, avec attribution visible. Aucune clé ou API de routage en direct.

## Validation effectuée avant proposition

```sh
npm test
npm run build:preview
TEST_PREVIEW=1 TEST_PREVIEW_ROOT=1 npm run test:e2e
npm run build
TEST_PREVIEW=1 npm run test:e2e
```

Les tests navigateur vérifient les vrais fichiers GeoJSON, leurs chemins, le tracé, les filtres, la sélection, les erreurs et le responsive. Ils isolent les tuiles raster externes. Un contrôle navigateur séparé vérifie le vrai chargement OSM et le référent de la preview simulée. Le comportement depuis le vrai domaine Cloudflare reste à vérifier après votre publication ; un build local n'en constitue pas la preuve.

Le fond OSM dépend d'Internet et de la politique de l'entreprise. S'il est bloqué, l'application l'indique et conserve la géométrie. Les données archivées et les tarifs incomplets restent inchangés.

## Sources officielles consultées

- GitHub Pages, types de sites et limite par dépôt : https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Cloudflare Pages, connexion Git et étapes du tableau de bord : https://developers.cloudflare.com/pages/get-started/git-integration/
- Contrôle des branches : https://developers.cloudflare.com/pages/configuration/branch-build-controls/
- Limites du plan gratuit : https://developers.cloudflare.com/pages/platform/limits/
- Vite sur Pages : https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
- Politique des tuiles OSM : https://operations.osmfoundation.org/policies/tiles/
