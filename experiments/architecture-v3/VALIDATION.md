# Vérifications de l’étude — 30 octobre 2026

- 52 observations de sources officielles conservées dans le manifeste, avec date, URL, statut HTTP et SHA-256 lorsque la réponse a été obtenue. Les échecs sont identifiés et ne servent pas de preuve tarifaire.
- Cinq sondes HTTP : statut Valhalla, deux prévols route/trace, géocodage IGN et complétion IGN ; HTTP 200/204 et en-têtes CORS observés avec l’Origin GitHub Pages. **Aucun POST de calcul de route/trace** pendant cette étude.
- L’adresse d’exemple a réellement été retournée par les services français ; ses autres candidats illustrent l’ambiguïté à traiter.
- Douze scénarios de consommation vérifiés arithmétiquement avec Decimal : volumes d’appels, crédits de routage et crédits Netlify à 240/600 s. Les hypothèses et limites contractuelles sont explicites ; ce ne sont pas des mesures de facture ou de latence.
- Liens locaux des documents et identifiants uniques de sources contrôlés ; `git diff --check` réussi.
- Diff produit contre `origin/main` vide (`src`, `public`, `scripts`, `data`, dépendances, Vite, workflows).
- Aucun code moteur, dépendance, compte, déploiement, clé ou secret ajouté. Aucun test de moteur nouveau n’est revendiqué : le travail est documentaire et les sondes sont de lecture uniquement.

Les vérifications de quotas, de durée réelle d’un job, de reprise, de facturation d’un compte et d’acceptation des paramètres chez un nouveau fournisseur restent des expérimentations proposées, pas des succès supposés.
