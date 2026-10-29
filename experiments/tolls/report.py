"""Rebuild the experiment report and CSV from verified pricing.json, without network."""
import csv
import hashlib
import json
from pathlib import Path
from pricing import ROOT


def money(cents):
    return 'incomplet' if cents is None else f'{cents/100:.2f} €'.replace('.',',')


def main():
    data=json.loads((ROOT/'results/pricing.json').read_text())
    routes=data['routes']
    rows=sorted(routes,key=lambda r:r['minutes'])
    manifest=json.loads((ROOT/'sources/manifest.json').read_text())
    audit=json.loads((ROOT/'results/official-station-audit.json').read_text())
    sources={r['filename']:r for r in manifest}
    lines=['# POC tarifs réels classe 1 — Crans → Le Pin — 29 octobre 2026','',
      '**Résultat retenu : 21 coûts complets dans le périmètre audité, 7 partiels. Aucun prix estimé au kilomètre.** Les coûts complets restent conditionnés à la classe 1 standard, aux tarifs officiels 2026 et à l’exactitude des données routières ; ils ne constituent pas des reçus de transactions terrain.', '',
      'Travail exclusivement dans `experiment/valhalla-hybrid-poc`, dossier `experiments/tolls/`. Aucune modification de la V1, aucun déploiement, aucune Pull Request.', '',
      '## 1. Sources, dates, formats et droits', '',
      '| Source | Millésime / format | Informations réellement disponibles | Fiabilité et droits |',
      '|---|---|---|---|',
      '| [APRR officiel](https://voyage.aprr.fr/tarifs-de-peage) / TARIFS_APRR.pdf | 1er février 2026 ; PDF texte, 300 pages | Gare entrée, gare sortie, distance tarifaire, prix TTC classes 1 à 5. Noms de gares, sans identifiant numérique universel ni coordonnées dans cette grille. | Source tarifaire primaire ; 21 505 lignes directionnelles extraites. Aucune licence ouverte de republication trouvée. |',
      '| Même publication / TARIFS_AREA.pdf | 1er février 2026 ; PDF texte, 13 pages | Codes numériques entrée/sortie, noms, distance tarifaire, classes 1 à 5. | Officiel, mais aucun tarif AREA utilisé pour ces 28 géométries. |',
      '| Même publication / systèmes ouverts APRR-AREA | 1er février 2026 ; PDF 1 page, table principalement en image | Autoroute, numéro de gare, nom, forfait TTC par classe. Crottet 09443 : 0,80 € ; Myennes 09405 : 4,20 €. | Contre-vérification visuelle ; le calcul automatique utilise les mêmes forfaits présents dans le PDF APRR texte. |',
      '| [MTE / data.gouv.fr](https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede) | Référentiel 01/01/2025, CSV publié juillet 2025 ; métadonnées actualisées août 2025 | Noms de gares, route/PR, côté, type, voies, coordonnées Lambert-93. Le CSV effectivement récupéré ne porte pas une colonne concessionnaire explicite malgré la description générale du jeu. | Officiel, ODC-BY selon métadonnées ; positions parfois incohérentes, donc pas une vérité suffisante seule. |',
      '| OpenStreetMap / Overpass | Snapshots du 29 octobre 2026, JSON | Nœuds barrier=toll_booth, noms, opérateur déclaré, références, coordonnées. Deux requêtes bornées réussies après un premier essai régional en échec HTTP 502. | ODbL, attribution requise ; rapprochement de segment ≤12 m, puis audit manuel et MTE. |',
      '| [ALIAE officiel](https://www.aliae.com/le-peage-en-flux-libre), aide officielle paiement.aliae.com | Pages consultées le 29 octobre 2026, HTML/JS | Concession A79, six portiques de flux libre, exploitation par APRR. | Pas de grille 2026 et de correspondance portiques/trajet suffisamment vérifiées dans les sources consultées ; aucune conclusion sur l’inexistence d’une telle grille ailleurs. |','',
      'Les PDF/HTML APRR sont conservés **localement** dans `sources/local/` (ignorés par Git) : [mentions légales](https://voyage.aprr.fr/mentions-legales) réservant les droits de reproduction, aucun droit de republication massive supposé. URL, date et empreinte de chaque source : [manifest.json](sources/manifest.json). Les captures ouvertes MTE/OSM sont versionnées dans `sources/open/`. Les seules cellules tarifaires citées sont celles nécessaires aux calculs de cette expérience.', '',
      'L’aide ALIAE est une interface JavaScript. Une lecture non authentifiée du service FAQ découvert dans son application a reçu HTTP 401 ; aucune authentification ni extraction de clé n’a été tentée. L’A79 reste donc explicitement non tarifée ici, sans proxy €/km.', '',
      '## 2. Réseaux et correspondances', '',
      '- Réseau tarifé : **APRR**, gares A42, A40, A406, A6, A19, A5 et A77. Les références autoroutières communes A39/A31/A36 n’imposent pas de nouveaux tickets si le parcours reste dans le même système fermé.',
      '- **AREA** : grille examinée, mais aucune portion payante de ces variantes rattachée à AREA. Le groupe APRR et la société AREA ne sont pas confondus.',
      '- **ALIAE, concession A79** : R7, R8, R13, R19, R20, R24. APRR en est l’exploitant selon ALIAE, mais cela ne transforme pas les tarifs A79 en tarifs de la grille APRR utilisée.',
      '- A4/A104/A5b et autres sections gratuites traversées : aucun péage additionnel détecté ; la présence d’un nom d’autoroute ne suffit pas à facturer. Ne pas attribuer un tarif SANEF à une portion A4 gratuite.',
      '- Géométries réutilisées à l’identique depuis les archives Valhalla. Aucun nouveau routage pour adapter artificiellement un trajet à un tarif.',
      '- Chaque passage conserve nœuds OSM, coordonnées, distance au segment, nom canonique et candidats MTE. Les 79 observations de nœuds/itinéraires sont dans [official-station-audit.json](results/official-station-audit.json).','',
      '## 3. Ambiguïtés conservées, sans montant appliqué', '',
      '1. **Val-de-Loing / A77** : un nœud OSM nommé « Val-de-Loing Barrière » est traversé, mais le référentiel 2025 place à proximité des gares « Val De Loing-Souppes » sur échangeur. La grille distingue VAL DE LOING-BARRIERE → FLEURY-EN-BIERE (10,00 €) de VAL DE LOING-SOUPPES → FLEURY-EN-BIERE (4,10 €). Aucune de ces valeurs n’est choisie par simple ressemblance. R8/R13/R19/R20/R24 gardent cette section inconnue.',
      '2. **Val de Saône / R19** : le nœud OSM et la gare de même nom du CSV MTE sont séparés d’environ 6,7 km. La cellule AMBERIEU → VAL DE SAONE existe (7,70 €), mais n’est pas comptée dans le sous-total certain tant que cette discordance n’est pas résolue.',
      '3. **Pouilly-en-Auxois / R26** : discordance d’environ 9,7 km entre point OSM et point MTE de même nom. PONT D AIN → DIJON-CRIMOLOIS est retenu (16,40 €), mais POUILLY-EN-AUXOIS → LES EPRUNES (22,80 €) reste candidat non appliqué ; total réel incomplet.',
      '4. Les changements `edge.toll` ne découpent pas automatiquement des facturations : R5 comporte plusieurs tronçons marqués payants mais une seule gare Crottet traversée, donc un seul forfait de 0,80 €. Les changements de classe de route ne créent pas un ticket supplémentaire.',
      '5. Les écarts MTE/OSM ne prouvent pas lequel est faux. Ils déclenchent un refus de tarification, pas une correction arbitraire du référentiel.', '',
      '## 4. Tableau exhaustif des 28 variantes', '',
      'Total complet uniquement quand toutes les transactions sont rapprochées et tarifées ; sinon la colonne « connu APRR » est un **sous-total**, pas un total de trajet. 0,00 € connu pour R20 ne signifie surtout pas que ce trajet est gratuit. AREA = aucune section identifiée dans ce jeu.', '',
      '|ID|Durée min|Total classe 1|Connu APRR|Statut|Pareto sous-ensemble complet|',
      '|---|---:|---:|---:|---|---|']
    for r in rows:
        lines.append(f"|{r['id']}|{r['minutes']:.1f}|{money(r['total_cents'])}|{money(r['known_aprr_cents'])}|{r['status']}|{'oui' if r['pareto_complete_subset'] else 'non' if r['total_cents'] is not None else 'exclu'}|")
    lines += ['', '## 5. Frontière de Pareto temps / euros', '',
      '**Frontière du sous-ensemble de 21 totaux complets, pas une frontière globale des 28 trajets.** Un trajet incomplet pourrait modifier ce classement ; il n’est ni assimilé à zéro ni arbitrairement déclaré dominé. La référence est R18, le plus rapide observé, 298,605 min et 40,70 €.', '',
      '|ID|Durée min|Péages €|+min vs R18|Économie €|€/min supplémentaire|',
      '|---|---:|---:|---:|---:|---:|']
    for r in rows:
        if r['pareto_complete_subset']:
            efficiency='—' if r['euros_saved_per_extra_minute'] is None else f"{r['euros_saved_per_extra_minute']:.2f}"
            lines.append(f"|{r['id']}|{r['minutes']:.1f}|{money(r['total_cents'])}|{r['extra_minutes']:.1f}|{money(r['saving_cents'])}|{efficiency}|")
    lines += ['',
      'Les montants sont calculés en centimes entiers ; les ratios utilisent les durées non arrondies. Les résultats détaillés conservent aussi les économies négatives des candidats plus chers. Aucun rapport €/min n’est calculé pour un coût incomplet ou un détour nul.', '',
      '## 6. Analyse particulière demandée', '',
      '- **R18 : 40,70 €**, AMBERIEU → LES EPRUNES, une session fermée, même si le trajet emprunte plusieurs autoroutes. Référence la plus rapide.',
      '- **R14 : 34,30 €**, REPLONGES → FLEURY-EN-BIERE. +19,26 min, **6,40 € économisés**, **0,33 €/min**.',
      '- **R27 : 31,40 €**, TOURNUS → LES EPRUNES. +29,64 min, **9,30 € économisés**, **0,31 €/min**.',
      '- **R13 : incomplet**, 0,80 € Crottet + 4,20 € Myennes = **5,00 € connus APRR**. A79/ALIAE et Val-de-Loing → Fleury non résolus. Aucun total, aucune économie ni €/min affirmés.',
      '- **R12 : 17,50 €**, TOURNUS → BIERRE-LES-SEMUR **10,50 €** + ST-DENIS-LES-SENS → LES EPRUNES **7,00 €**. +101,44 min, **23,20 € économisés**, **0,23 €/min**.',
      '- **R15 : 20,30 €**, REPLONGES → BIERRE-LES-SEMUR **13,30 €** + ST-DENIS-LES-SENS → LES EPRUNES **7,00 €**. +87,63 min, **20,40 € économisés**, **0,23 €/min**.', '',
      'Les sorties A6 à Bierre-lès-Semur, sortie 23 vers Montbard/Semur, restent les observations réelles du POC précédent, à environ 31 km d’Avallon, pas une sortie démontrée à Avallon même. R12 et R15 empruntent environ 143 km gratuits avant de reprendre A19/A5.',
      '**Résultat important : R12 et R15, dominés en temps/km payants dans la première expérience, deviennent non dominés en temps/euros parmi les coûts complets.** Inversement R16 a moins de km marqués payants que R18 mais coûte 41,30 €, et R11 coûte 31,50 € contre 31,40 € pour R27 plus rapide. Le substitut « kilomètres payants » peut donc inverser les décisions.', '',
      '## 7. Détail des transactions et preuves', '',
      'Chaque cellule ci-dessous renvoie au PDF APRR officiel du 1er février 2026, numéro de page physique (base 1), colonne Classe 1. L’empreinte du PDF est dans le manifeste ; la ligne source exacte est aussi enregistrée dans pricing.json. Les forfaits ouverts sont recoupés visuellement avec le PDF systèmes ouverts.', '']
    used={}
    for r in rows:
        lines += [f"### {r['id']}",'', 'Passages, dans l’ordre réel :']
        if not r['gate_events']:lines += ['- Aucun péage détecté dans les géométries et référentiels consultés.']
        for e in r['gate_events']:
            lines.append(f"- {e['station']} ({e['osm_name']}), lon/lat {e['coordinate']}, nœuds OSM {e['osm_node_ids']}, écart minimal à la géométrie {e['distance_m']:.2f} m, mode {e['mode']}.")
        for s in r['known_sections']:
            lines.append(f"- **Retenu : {s['entry']} → {s['exit']} : {money(s['cents'])}**, PDF page {s['pdf_page']}, classe 1.")
            used[(s['entry'],s['exit'])]=s
        for s in r['unknown_sections']:
            lines.append('- **Non tarifé :** '+json.dumps(s,ensure_ascii=False))
    (ROOT/'results/used-tariffs.json').write_text(json.dumps(list(used.values()),indent=2,ensure_ascii=False))
    lines += ['', '## 8. Couverture, limites et faisabilité nationale', '',
      '- Les 21 totaux sont des calculs documentés au tarif TTC standard classe 1. Ni reçu de paiement, ni validation terrain exhaustive, ni garantie face à un référentiel routier erroné. Les zéros R1/R2/R3 reposent sur l’absence de péage détecté, pas sur une facturation interrogée chez un opérateur.',
      '- Aucun abonnement/remise, variation future de prix, reclassement du véhicule, majoration de retard ou service annexe pris en compte. La nationalité de la plaque ne change pas ce tarif standard classe 1.',
      '- Le rapprochement utilise un registre de gares audité pour ce corridor. Il ne couvre pas un itinéraire arbitraire, les boucles répétées sur une même gare ou tous les systèmes mixtes. Il faut un graphe orienté, distinguer entrée/sortie et barrières ouvertes, et modéliser les portiques de flux libre avant d’en faire un service national.',
      '- Données manquantes prioritaires : règle/identité officielle Val-de-Loing, confirmation géographique de Val de Saône et Pouilly, grille A79 2026 et règles portiques/sections gratuites.',
      '- Pour la France : catalogues de tarifs versionnés et droits de réutilisation de chaque concession, identifiants stables et positions directionnelles des gares, règles inter-réseaux et flux libre, classes de véhicules, remises et gestion des changements de millésime. Réseaux à couvrir ensuite, sans affirmer qu’ils sont empruntés ici : ASF, ESCOTA, COFIROUTE, SANEF/SAPN, ARCOUR, ATMB, SFTRF, ALIS, ADELAC, CEVM, autres concessions/tunnels.',
      '- Des matrices entrée/sortie officielles peuvent contenir des interconnexions ; la présence d’une autoroute d’un autre groupe ne suffit ni à ajouter ni à supprimer une transaction. Les règles applicables doivent être documentées.',
      '- Licences : données tarifaires accessibles gratuitement ne signifie pas données sous licence ouverte. Pour une intégration produit, clarifier les droits, la redistribution, les mises à jour et la couverture ; ne pas dépendre d’une API interne authentifiée ni d’un calculateur payant.', '',
      '**Conclusion : le calcul gare/parcours → grille officielle est faisable et utile, avec un premier Pareto monétaire concret. Un moteur national suffisamment fiable reste à construire ; la couverture et la qualité des correspondances sont ici les obstacles principaux, pas l’addition des montants. Les 7 cas incomplets restent incomplets.**', '',
      '## 9. Reproduction et contrôles', '',
      'Voir [README.md](README.md). Sources pinées par SHA-256, parseur classe 1 directionnel, calcul en centimes, `null` explicites et refus des correspondances incertaines. Aucun original APRR redistribué publiquement ; snapshots MTE/OSM attribués et conservés. Les résultats CSV/JSON, l’audit indépendant et les cellules employées sont versionnés.', '',
      'Validation : **18 tests tarifs** (unitaires et géométries/PDF réels), **10 tests Valhalla existants**, **6 tests unitaires V1**, **3 tests navigateur V1 en développement**, **3 sur build Pages**, **compilation TypeScript/Vite réussie**. Les tests avec PDF sont ignorés explicitement si l’original n’a pas été restauré ; dans cette session ils ont été exécutés.', '',
      'Données géographiques © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL ; [signaler une erreur](https://www.openstreetmap.org/fixthemap). Gares : Ministère de la Transition écologique, référentiel 2025, ODC-BY. Tarifs : APRR/AREA, publications au 1er février 2026.']
    (ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n')
    with (ROOT/'results/comparison.csv').open('w',newline='') as f:
        writer=csv.writer(f,lineterminator="\n")
        writer.writerow(['id','duration_minutes','total_cents','known_aprr_cents','status','extra_minutes','saving_cents','euros_per_extra_minute','pareto_complete_subset'])
        for r in rows:writer.writerow([r['id'],r['minutes'],r['total_cents'],r['known_aprr_cents'],r['status'],r['extra_minutes'],r['saving_cents'],r['euros_saved_per_extra_minute'],r['pareto_complete_subset']])
    checks=[]
    for f in sorted((ROOT/'results').iterdir()):
        if f.name=='SHA256SUMS':continue
        checks.append(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name)
    (ROOT/'results/SHA256SUMS').write_text('\n'.join(checks)+'\n')
    print('Report, CSV and source-cell index generated.')


if __name__=='__main__':main()
