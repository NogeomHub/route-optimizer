# Livraison personnelle — étape 1

Branche `feat/v3-personal-delivery-step1`, sans publication ni modification de
PR #15. Le routage reste national via FOSSGIS ; les données tarifaires et leur
moteur restent inchangés. Les prix incomplets, absents ou périmés sont affichés
« Péage non déterminé ». Les montants connus restent consultables en détail,
mais ni un sous-total ni un prix inconnu ne permettent de calculer une économie.

## Démarrer dans le navigateur

Depuis la racine du projet, avec Node 24 recommandé et les dépendances installées :

```bash
V3_FOSSGIS_POLICY_REVIEWED=true npm run dev:v3
```

Ouvrir **http://127.0.0.1:5173** sur la machine qui lance la commande. Dans Codex,
le port doit être transféré par l'environnement ; l'adresse n'est pas directement
celle de votre PC. Aucun compte ni clé TomTom requis pour cet usage local.
Le proxy Vite injecte le jeton local vers le backend ; ce jeton ne passe pas
dans le bundle ni dans le navigateur. Les endpoints d'accès hébergés conservent
leur protection et leurs trois secrets distincts.

PowerShell si Node et le dépôt sont disponibles sur le PC :

```powershell
$env:V3_FOSSGIS_POLICY_REVIEWED="true"
npm run dev:v3
```

Choisir explicitement chaque suggestion IGN, lancer une comparaison, puis
consulter les variantes et leurs tracés. Valhalla reste une estimation de durée,
sans trafic temps réel en local. Arrêter avec Ctrl+C. Aucun déploiement requis.

## Budget et limites

Configuration serveur, jamais paramètre libre du navigateur :

| Variable | Défaut économique | Valeurs admises |
| --- | --- | --- |
| `V3_MAX_PROVIDER_CALLS` | 32 | entier 4 à 192 |
| `V3_MAX_PROFILES` | 12 | entier 1 à 40 |

Exemple facultatif : `V3_MAX_PROVIDER_CALLS=48 V3_MAX_PROFILES=16
V3_FOSSGIS_POLICY_REVIEWED=true npm run dev:v3` (sur une seule ligne).
Ces options sont aussi lues par l'adaptateur Netlify existant, sans aucun
déploiement dans cette étape. La configuration fait partie de la clé du job.

Le plafond concerne les appels **Valhalla FOSSGIS du calcul**, pas la saisie IGN,
les tuiles de carte, le polling local ou l'ETA TomTom facultative de l'hébergement.
Une réservation initiale couvre le précontrôle du graphe (même s'il est partagé
ou en cache), puis chaque tentative `/status`, `/route`, `/trace_attributes` du
worker consomme un créneau persisté **avant** son envoi. Les échecs et réservations
interrompues comptent ; aucun reset lors d'une reprise ou de l'enrichissement
temporel du même job. Le compteur est donc conservateur, pas une facture exacte.

À la limite de profils, le calcul finit avec les variantes observées et une
mention explicite : aucun optimum global n'est garanti. À la limite d'appels,
il s'arrête avec `CALL_BUDGET`, état incomplet, checkpoints et géométries conservés.
Il ne prétend pas avoir terminé toutes les analyses ; les métriques absentes
restent inconnues. Une nouvelle recherche explicitement lancée peut disposer
d'un nouveau budget et réutiliser les caches compatibles. Ne pas la relancer
en boucle pour contourner un refus fournisseur.

Un ancien checkpoint sans compteur ne peut pas être repris en lançant des
appels non comptabilisés : `CALL_BUDGET_UNTRACKED`. Ses données restent lisibles ;
relancer sous la configuration actuelle crée une identité de recherche distincte.

FOSSGIS : une campagne à la fois, une connexion, **2 secondes après chaque
réponse**, y compris les statuts. Pas de retry HTTP automatique. Une reprise
ou réutilisation terminée peut effectuer un contrôle `/status` indépendant de la
campagne pour vérifier le graphe ; elle ne doit effectuer aucun nouveau routage
ou analyse lorsque les caches et métriques sont complets. Ce précontrôle d'accès
au cache n'est pas un nouveau budget de calcul. Les appels d'autocomplétion IGN
restent séparés. Une limite numérique locale n'est pas une autorisation de
consommer massivement le service : usage personnel à faible volume uniquement.

Conditions : https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/
Maximum annoncé une requête/seconde ; notre cadence est plus prudente. Quota,
saturation, délai, indisponibilité et plafond local ont des messages distincts.
Pas de recharge payante ni nouvelle infrastructure. Les offres gratuites de
l'hébergement existant restent limitées ; aucun usage hébergé nouveau n'est lancé.

## Recette manuelle préparée — NON EXÉCUTÉE

Même configuration 12 profils / 32 créneaux. Lancer **séquentiellement**, à la
demande, et arrêter en cas de quota ou d'indisponibilité. Choisir une suggestion
IGN précise pour chaque centre-ville et noter ses coordonnées/libellés ; ne pas
substituer une adresse ambiguë silencieusement. Détour 45 min, économie 0 €.

| Départ | Arrivée |
| --- | --- |
| Lille | Arras |
| Rouen | Amiens |
| Rennes | Saint-Brieuc |
| Nantes | Angers |
| Bordeaux | Agen |
| Toulouse | Montauban |
| Montpellier | Nîmes |
| Marseille | Aix-en-Provence |
| Lyon | Bourg-en-Bresse |
| Strasbourg | Colmar |

Au maximum **320 créneaux de calcul FOSSGIS** pour dix nouveaux jobs lancés une
fois, réservations initiales incluses. Les saisies d'adresses et les contrôles
de réutilisation sont distincts. Ce plan n'autorise ni campagne automatique ni
rafale ; il ne constitue pas un benchmark de qualité des tarifs ou un optimum.

Pour chaque recherche noter jobId, durée, compteur, statut et nombre de profils,
voir une géométrie, vérifier le texte du tarif et l'absence d'économie si le prix
de référence est inconnu. Un arrêt explicite sur budget est acceptable et doit
être enregistré comme incomplet, jamais comme recherche complète réussie.

Sur un job terminé, relancer exactement les lieux/paramètres sélectionnés :
même ID, cache indiqué, aucune nouvelle entrée réseau `route` ou
`trace_attributes` dans `.local-v3/network/`. Un contrôle `status` est attendu.
Vérifier aussi une annulation et une reprise après interruption, sans reset du
compteur, et une erreur de quota simulée dans les tests (ne pas provoquer de quota
réel). Ne pas partager les logs contenant des adresses personnelles.

Le stockage local `.local-v3` reste ignoré par Git. Après arrêt, le supprimer
efface données, caches et journaux locaux ; ne pas le faire pendant une recherche.
La purge hébergée et l'ouverture publique ne font pas partie de cette étape.

## Validation effectuée localement

| Vérification | Résultat |
| --- | --- |
| Backend `npm run test:server` | 121 tests réussis |
| Frontend `npm test` | 45 tests réussis |
| Netlify `npm run test:netlify` | 18 tests réussis |
| Chromium V3 `npm run test:e2e:v3` | 10 scénarios réussis |
| Chromium accès hébergé `npm run test:e2e:netlify` | 2 scénarios réussis |
| Chromium V2 `npm run test:e2e` | 10 scénarios réussis |
| `npm run build:v3:netlify` | TypeScript et Vite réussis |
| `npm run check:netlify:bundle` | empaquetage API/worker réussi, aucun déploiement |
| `npm run test:replay:v3` | 40 profils historiques, 28 représentants et 117 candidats retrouvés hors ligne |

Les tests réseau utilisent des fournisseurs synthétiques ou des serveurs HTTP
locaux ; les tests navigateur interceptent l'API et les tuiles. Ce ne sont pas
des recherches réelles France, ni une preuve de disponibilité actuelle FOSSGIS.
Les premières tentatives de tests HTTP locaux ont été bloquées par le bac à sable
(`listen EPERM`) ; elles ont ensuite réussi avec l'accès réseau local autorisé.

Neuf nouveaux tests backend vérifient notamment le plafond, les réservations
après panne/reprise, l'absence d'appels route/trace en cache chaud, l'identité du
budget, la cadence et les erreurs fournisseur. Le test temporel de panne a été
adapté à la nouvelle règle : erreur visible et relance **explicite** après le
délai de protection, plutôt qu'une relance par simple polling. Un sous-cas quota
a été ajouté. Les anciens tests de stratégie déclarent explicitement leur
budget historique de 40 profils pour continuer à tester ce mode sans modifier
les limites par défaut du produit. Le nouveau test Chromium vérifie plafond,
résultat partiel visible et absence de conseil/économie monétaires inventés.

Sur les réponses archivées Crans → Le Pin, les 12 premiers profils produisent
11 géométries distinctes : estimation froide 3 statuts + 12 routes + 11 traces
= **26 créneaux**, sous le plafond de 32. C'est un comptage hors ligne de
géométries, sans nouvel appel ni nouvelle validation de traces. Une recherche
différente peut épuiser le budget : l'interface l'annonce et garde le partiel.

Les contrôles de métriques payantes, le moteur tarifaire, les données APRR,
les fichiers du dépôt Valhalla autonome et PR #15 n'ont pas été modifiés.

## Clôture : trois recherches réelles du 6 novembre 2026

Recette limitée exécutée séquentiellement : Lille → Arras, Rennes → Saint-Brieuc,
Montpellier → Nîmes. Coordonnées de centres-villes fixées et conservées dans
[le rapport JSON](validation/personal-step1-live-2026-11-06.json) ; pas de sélection
IGN ambiguë. Ce sont de nouveaux appels FOSSGIS et un affichage Chromium connecté
au backend réel, sans simulation de réponses. Aucun des sept autres trajets lancé.

| Recherche | Variantes obtenues / visibles à +45 min | Créneaux de calcul | Durées Valhalla | Distances |
| --- | --- | --- | --- | --- |
| Lille → Arras | 2 / 2 | 17 / 32 | 41,84–46,05 min | 52,503–54,426 km |
| Rennes → Saint-Brieuc | 1 / 1 | 16 / 32 | 73,46 min | 99,082 km |
| Montpellier → Nîmes | 9 / 7 | 24 / 32 | 64,05–126,09 min | 56,488–78,812 km |

Douze profils par recherche. 60 appels FOSSGIS au total : 36 route, 12 trace,
12 statut, dont trois contrôles supplémentaires de réutilisation du cache.
57 appels de calcul comptés dans les budgets. Tous HTTP 200 ; espacement minimal
mesuré après la réponse précédente : 2 002 ms. Les trois répétitions en cache
récupèrent le même job et ne créent qu'un statut chacune, aucun route/trace.

Tous les prix sont `unavailable` avec total null dans ce périmètre non couvert
par le catalogue intégré. Les cartes visibles affichent « Péage non déterminé ».
Le repère est explicitement temporel : « économie non vérifiable », comparaison
monétaire indisponible, aucune affirmation « SELON VOS CRITÈRES » ni économie
chiffrée. Les deux variantes Montpellier exclues par le filtre restent archivées.
Les temps payants sont nuls sur les trajets marqués gratuits ; quatre variantes
Montpellier ont des temps payants positifs. Ils ne constituent aucun prix.

Aucune erreur fournisseur ni saturation observée pendant cette recette limitée.
Elle ne garantit pas la disponibilité future ni un optimum global. Le code
n'a pas été modifié pendant la recette. Les captures et réponses brutes restent
locales dans `/workspace/work/v3-step1-closure/`, hors publication du code.
