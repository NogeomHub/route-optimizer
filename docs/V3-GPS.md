# Trajet conseillé et repères GPS

Après un job terminé, V3 présente le trajet conseillé, ses étapes GPS, puis carte/graphique et les autres variantes. Les données financières, la recherche adaptative, le cache de routage, les verrous et les règles tarifaires ne sont pas modifiés.

## Recommandation

La référence est toujours le trajet observé le plus rapide (égalité : identifiant). Une économie n'est calculable que si référence et variante sont `complete_verified` avec total complet. Parmi les variantes satisfaisant le détour et l'économie minimale, choisir le péage le plus bas, puis la durée la plus courte, puis l'identifiant. Même une économie nulle peut satisfaire un seuil nul. Les tarifs `partial/unavailable/stale` restent consultables mais ne participent pas à une économie certaine.

Si aucun tarif complet ne satisfait le seuil, proposer le moins cher dans la limite de détour, avec un avertissement explicite **hors critères**. Si le prix de référence est incomplet, montrer le plus rapide comme repère et signaler que l'économie n'est pas vérifiable. Aucun score opaque ni valeur du temps imposée. Le choix est sélectionné automatiquement au chargement et lors d'un changement de critères ; l'utilisateur peut ensuite sélectionner une autre variante sans modifier le conseil.

## Données réellement disponibles

- Résultat compact du job : temps/distance, `shapeHash`, `geometryKey`, profils et variantes qui ont produit le représentant (`producedBy`).
- Géométries séparées persistées ; réponses `/route` brutes en cache : manœuvres, noms, indices de début/fin sur la polyline. Elles ne sont pas copiées dans chaque polling.
- `/trace_attributes` : forme, noms des voies, indices et longueurs d'arêtes, booléen péage. La classe complète des routes, les accès et les intersections OSM ne sont **pas** demandés/conservés par ce filtre.
- Le fixture historique tarifaire avait retiré les noms non nécessaires aux péages. Le fixture GPS complémentaire conserve les manœuvres et les noms de voies ordinaires réellement archivés, avec les observations IGN datées/hashées nécessaires au rejeu des tests. Il ne s'agit pas de points codés dans l'algorithme.

## Génération

`GpsGuidance`, indépendant de Jobs et des tarifs, sert `GET /api/search/:jobId/routes/:routeId/gps`, derrière l'authentification métier existante, en local et sur Netlify.

1. Relire le résultat, les géométries, la trace et une réponse `/route` dont le hash de forme correspond **exactement** au représentant. Aucun appel `/route`, `/status` ou `/trace_attributes` supplémentaire. Sans preuve conservée, renvoyer `unavailable` plutôt que recalculer ou inventer.
2. Comparer les polylines par distance aux segments avec index spatial. Une proximité de 200 m définit un corridor partagé. Fusionner les courtes traversées communes (<2 km), puis retenir les divergences d'au moins 3 km.
3. Répartir les repères sur **toute** la longueur de chaque divergence : un repère par tranche d'environ 28 km, avec un minimum de un et un maximum global de trois. Chaque tranche vise sa partie centrale afin d'éviter que tous les repères se concentrent au début du corridor. La limite de trois correspond au cas mobile le plus contraignant des URL Google Maps. Au-delà de trois groupes de divergence nécessaires, refuser un guide simplifié potentiellement trompeur.
4. Les candidats viennent des portions internes de manœuvres nommées (rue/route/avenue/axe départemental), à distance des intersections. Exclure voies A/E/N, indicateurs highway/toll, rampes/sorties/fusions et giratoires. Exiger une arête de trace nommée correspondante avec `toll:false`, puis au moins **2 km** de séparation du corridor rapide. Classer d'abord par proximité de la position cible dans la tranche, puis par séparation du corridor rapide et enfin par position sur le trajet ; essayer au plus deux candidats distincts par repère.
5. Le reverse-geocoding IGN Géoplateforme est un **enrichissement de libellé**, plus une condition de validité du corridor. Si une rue/adresse avec commune et code postal est trouvée à ≤80 m du candidat et de l'itinéraire, toujours à ≥2 km du rapide, elle est affichée. Sinon, la coordonnée directement prouvée par la manœuvre Valhalla et la trace non péage reste utilisable comme repère. Une panne IGN ne supprime donc plus un guide dont la preuve routière est suffisante.
6. Mettre en cache la réponse par version d'algorithme, graphe, hashes des deux formes et coordonnées d'extrémités, au plus jusqu'à expiration du job. Le reverse conserve son propre cache. Le budget de démarrage des tentatives IGN reste borné à 10 s, avec timeout de 4 s par requête. Aucun changement de cadence Valhalla.

Les repères sont des **suggestions de corridor**, pas des lieux de stationnement ni une navigation virage par virage. La route auto Valhalla et les traces conservées fournissent la preuve du corridor ; une adresse IGN éventuelle sert seulement de libellé humain. Les données conservées ne prouvent pas un accès public sûr à un bâtiment ni le comportement du moteur de routage tiers. Le texte le rappelle : vérifier les étapes, le tracé et les péages dans le GPS. Le tarif affiché est celui de la géométrie Valhalla, jamais celui d'un recalcul Google/Waze.

## Exemple réel, données conservées au 31/10/2026

Critères : +45 minutes maximum, économie minimale 0 €. Résultat **G021**, 329,04625 minutes (5 h 29), **465,378 km**, **31,40 €**. Référence G004 : 298,4188 minutes et 40,70 €. Détour **30,62745 minutes**, économie **9,30 €**. Seule la dénomination des durées est arrondie dans l'interface.

La divergence initiale s'étend approximativement du km 0,25 au km 83,87 avant reconnexion au corridor rapide. Avec `divergence-corridor-v2`, les données archivées produisent trois repères répartis sur toute cette divergence, sans nouvelle campagne Valhalla :

| Repère de corridor | Position sur G021 | Séparation du corridor rapide |
|---|---:|---:|
| D22 — 46.034651, 5.179773 | km 9,33 | ~7,99 km |
| D975 — 46.303629, 5.149473 | km 41,61 | ~4,28 km |
| D975 — 46.547690, 5.028375 | km 70,78 | ~8,48 km |

Ces trois coordonnées proviennent de portions ordinaires non péage confirmées par les manœuvres et la trace archivées. Elles remplacent l'ancienne sélection de deux adresses situées plus tôt dans la divergence. Elles contraignent mieux le corridor, mais **ne prouvent toujours pas** que Google Maps reconstruira exactement la polyline Valhalla : le contrôle réel du reroutage tiers reste une validation manuelle distincte.

## Partage et limites des GPS externes

Le bouton copie départ, étapes ordonnées avec adresses ou coordonnées, arrivée et avertissement de recalcul. En cas d'échec de presse-papiers, le texte reste dépliable et sélectionnable.

Google Maps : URL officielle `https://www.google.com/maps/dir/?api=1`, mode voiture, origine/destination et `waypoints` ordonnés, **sans clé ni API payante**. Limite de trois étapes pour rester dans celle annoncée pour les navigateurs mobiles. Certains produits/appareils peuvent ignorer des étapes : vérifier les étapes affichées avant navigation. Source consultée : https://developers.google.com/maps/documentation/urls/guide . Le bouton ne transmet pas la polyline Valhalla et un contrôle réel du reroutage Google reste nécessaire avant de considérer la reproduction comme satisfaisante.

Waze : le format officiel permet une destination et `navigate=yes`, mais ne documente pas notre trajet multi-étapes. Aucun bouton multi-étapes inventé ; conserver les instructions à copier/saisir dans l'ordre selon les possibilités de Waze. Source : https://developers.google.com/waze/deeplinks .

## Validation Netlify après mise à jour

1. Vérifier le SHA déployé (le push peut lancer le build automatique) ; aucune commande de déploiement manuel n'est nécessaire à cette préparation. Le site reste Public, l'API protégée et l'origine canonique inchangée.
2. En InPrivate, case « Rester connecté » décochée : vérifier dans DevTools le cookie `__Host-route-v3`, HttpOnly/Secure/SameSite Strict, Max-Age 28800, sans token dans les stockages JavaScript. Se déconnecter : cookie supprimé.
3. Se reconnecter avec la case cochée : Max-Age 7776000 (90 jours), puis fermer/rouvrir une fenêtre normale du même appareil ; la session doit être retrouvée. InPrivate peut supprimer ses cookies à la fermeture malgré la durée demandée. Les tests à horloge injectée vérifient les frontières de 8 h/90 jours et la rotation du secret ; ne pas avancer l'horloge du système en production.
4. Restaurer un job terminé encore valide : attendre le conseil et les repères sans relancer de comparaison. Si les données de routage ont expiré, aucune validation GPS complète ne peut être promise à partir de ce job. Ne pas purger Blobs. Pour Crans → Le Pin compatible et +45/0 €, vérifier G021, 31,40 €, 9,30 € et +31 min ; si le graphe ou les résultats ont changé, analyser la différence.
5. Vérifier sélection G021 sur carte/point/carte de résultat, ordre mobile conseil → GPS → graphique/carte → variantes. Pour les données archivées compatibles, vérifier trois repères répartis vers les km 9,3 / 41,6 / 70,8 de la divergence. Ouvrir Google Maps et inspecter les étapes ; comparer visuellement le corridor, pas uniquement les extrémités. Un écart de corridor peut changer le prix.
6. Passer le détour à 0 : le conseil devient le plus rapide si son tarif est qualifié. Mettre une économie impossible : message hors critères et proposition explicitement marquée. Les prix partiels ne deviennent jamais des économies certaines.
7. Vérifier le cas preuve routière manquante : aucun lien trompeur ne doit être proposé. Vérifier séparément une panne IGN : si les manœuvres et la trace suffisent, les coordonnées doivent rester disponibles avec un libellé de repli. Vérifier Déconnexion après la session persistante. Ne pas modifier le secret sur le site actif uniquement pour tester sa rotation ; cette propriété est testée localement.
