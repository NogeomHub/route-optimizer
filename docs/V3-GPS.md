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
3. Une zone reçoit un repère ; une divergence de plus de 40 km reçoit deux repères ordonnés dans ses parties internes. C'est une heuristique explicite, pas une preuve de minimalité mathématique ni une validation du reroutage d'un autre fournisseur. Au-delà de trois repères nécessaires : refus de proposer un guide simplifié trompeur.
4. Les candidats viennent des portions internes de manœuvres nommées (rue/route/avenue/axe départemental), à distance des intersections. Exclure voies A/E/N, indicateurs highway/toll, rampes/sorties/fusions et giratoires. Exiger une arête de trace nommée correspondante avec `toll:false`, puis au moins **2 km** de séparation du corridor rapide. Classer par séparation, départager par position sur le trajet ; essayer au plus deux candidats distincts par repère. Il ne s'agit pas d'un échantillonnage régulier de la polyline.
5. Reverse-geocoding IGN Géoplateforme, index adresse, trois résultats maximum par requête. Accepter uniquement rue/adresse avec commune et code postal, à ≤80 m du candidat et de l'itinéraire, toujours à ≥2 km du rapide. Une commune seule, une adresse éloignée ou une panne IGN ne suffit pas. Tous les repères doivent être qualifiés ; aucun guide partiellement validé n'est présenté comme complet.
6. Mettre en cache la réponse par version d'algorithme, graphe, hashes des deux formes et coordonnées d'extrémités, au plus jusqu'à expiration du job. Le reverse a son propre cache 24 h ; les échecs transitoires 1 minute. Au plus six requêtes IGN, timeout de 4 s chacune et budget de démarrage des tentatives de 10 s ; un dernier appel peut finir après ce budget. Aucun changement de cadence Valhalla.

Les repères sont des **suggestions de corridor**, pas des lieux de stationnement ni une navigation virage par virage. La route auto Valhalla et les adresses proches fournissent des indices d'accessibilité ; les données conservées ne prouvent pas un accès public sûr au bâtiment, la chaussée ou son sens. Le texte le rappelle : vérifier les étapes, le tracé et les péages dans le GPS. Le tarif affiché est celui de la géométrie Valhalla, jamais celui d'un recalcul Google/Waze.

## Exemple réel, données conservées au 31/10/2026

Critères : +45 minutes maximum, économie minimale 0 €. Résultat **G021**, 329,04625 minutes (5 h 29), **465,378 km**, **31,40 €**. Référence G004 : 298,4188 minutes et 40,70 €. Détour **30,62745 minutes**, économie **9,30 €**. Seule la dénomination des durées est arrondie dans l'interface.

La divergence initiale s'étend approximativement du km 0,25 au km 83,87 avant reconnexion au corridor rapide. Deux repères ont été confirmés par reverse IGN réel, sans nouvelle campagne Valhalla :

| Repère à saisir | Position sur G021 | Pourquoi il est utile |
|---|---:|---|
| 289 Grande Rue, 01240 Lent (46.118740, 5.194797) | km 19,04 | À 9 m du candidat sur D22, environ 6,87 km du rapide : contraint la partie sud du corridor alternatif. |
| 15 Route de Châlon, 01560 Saint-Julien-sur-Reyssouze (46.402239, 5.109148) | km 53,17 | À 27 m du candidat sur D975, environ 14,82 km du rapide : contraint sa partie nord, au lieu d'une reconnexion trop précoce. |

Le premier candidat Avenue des Dombes n'a pas donné d'adresse assez proche et a été rejeté. Aucune étape n'a été choisie pour faire artificiellement retrouver G021. Les distances au rapide sont des mesures de proximité projetées approximatives ; elles ne sont pas des détours routiers.

## Partage et limites des GPS externes

Le bouton copie départ, étapes ordonnées avec adresses/coordonnées, arrivée et avertissement de recalcul. En cas d'échec de presse-papiers, le texte reste dépliable et sélectionnable.

Google Maps : URL officielle `https://www.google.com/maps/dir/?api=1`, mode voiture, origine/destination et `waypoints` ordonnés, **sans clé ni API payante**. Limite de trois étapes pour rester dans celle annoncée pour les navigateurs mobiles. Certains produits/appareils peuvent ignorer des étapes : vérifier les étapes affichées avant navigation. Source consultée : https://developers.google.com/maps/documentation/urls/guide . Aucun test de reroutage Google réel n'a été effectué ; le bouton ne transmet pas la polyline Valhalla.

Waze : le format officiel permet une destination et `navigate=yes`, mais ne documente pas notre trajet multi-étapes. Aucun bouton multi-étapes inventé ; conserver les instructions à copier/saisir dans l'ordre selon les possibilités de Waze. Source : https://developers.google.com/waze/deeplinks .

## Validation Netlify après mise à jour

1. Vérifier le SHA déployé (le push peut lancer le build automatique) ; aucune commande de déploiement manuel n'est nécessaire à cette préparation. Le site reste Public, l'API protégée et l'origine canonique inchangée.
2. En InPrivate, case « Rester connecté » décochée : vérifier dans DevTools le cookie `__Host-route-v3`, HttpOnly/Secure/SameSite Strict, Max-Age 28800, sans token dans les stockages JavaScript. Se déconnecter : cookie supprimé.
3. Se reconnecter avec la case cochée : Max-Age 7776000 (90 jours), puis fermer/rouvrir une fenêtre normale du même appareil ; la session doit être retrouvée. InPrivate peut supprimer ses cookies à la fermeture malgré la durée demandée. Les tests à horloge injectée vérifient les frontières de 8 h/90 jours et la rotation du secret ; ne pas avancer l'horloge du système en production.
4. Restaurer un job terminé encore valide : attendre le conseil et les repères sans relancer de comparaison. Si les données de routage ont expiré, aucune validation GPS complète ne peut être promise à partir de ce job. Ne pas purger Blobs. Pour Crans → Le Pin compatible et +45/0 €, vérifier G021, 31,40 €, 9,30 € et +31 min ; si le graphe ou les résultats ont changé, analyser la différence.
5. Vérifier sélection G021 sur carte/point/carte de résultat, ordre mobile conseil → GPS → graphique/carte → variantes. Copier et vérifier l'ordre des étapes. Ouvrir Google Maps et inspecter les étapes ; comparer visuellement le corridor, pas uniquement les extrémités. Un écart de corridor peut changer le prix.
6. Passer le détour à 0 : le conseil devient le plus rapide si son tarif est qualifié. Mettre une économie impossible : message hors critères et proposition explicitement marquée. Les prix partiels ne deviennent jamais des économies certaines.
7. Vérifier le cas étapes non disponibles (preuve manquante/IGN indisponible) : aucun bouton de copie/lien trompeur, carte et résultats restent utilisables. Vérifier Déconnexion après la session persistante. Ne pas modifier le secret sur le site actif uniquement pour tester sa rotation ; cette propriété est testée localement.
