"""Generate experimental tables only; no frontend export."""
import csv
import hashlib
from .run import ROOT, TARGETS, read


def euros(cents):
    return 'incomplet' if cents is None else f'{cents/100:.2f}'.replace('.', ',')+' €'


def main():
    data = read(ROOT/'results/pricing.json')
    rows = sorted(data['routes'], key=lambda r: r['minutes'])
    lines = ['# Résultats reproductibles — audit complémentaire', '',
             '**22 complets, 6 partiels ; seul R26 est nouvellement complet.**', '',
             'Sous-totaux connus ≠ totaux. Classe 1 standard, sans remise ; audit du 29 octobre 2026.', '',
             '## Les sept anciens incomplets', '',
             '|ID|Durée min|APRR connu|ALIAE 2026|Total fiable|',
             '|---|---:|---:|---|---:|']
    for r in rows:
        if r['id'] in TARGETS:
            lines.append(f"|{r['id']}|{r['minutes']:.2f}|{euros(r['known_aprr_cents'])}|{'inconnu' if r['a79'] else 'non emprunté'}|{euros(r['total_cents'])}|")
    lines += ['', '## Comparaison complète des 28 variantes', '',
              '|ID|Durée min|Distance km|Connu|Total|Statut|Pareto des totaux complets|',
              '|---|---:|---:|---:|---:|---|---|']
    for r in rows:
        lines.append(f"|{r['id']}|{r['minutes']:.2f}|{r['km']:.3f}|{euros(r['known_cents'])}|{euros(r['total_cents'])}|{r['status']}|{'oui' if r['pareto_complete_subset'] else 'non' if r['total_cents'] is not None else 'exclu'}|")
    lines += ['', '## Pareto temps/euros du sous-ensemble complet', '',
              '|ID|Durée min|Péages|+min / R18|Économie / R18|€/min supplémentaire|',
              '|---|---:|---:|---:|---:|---:|']
    for r in rows:
        if r['pareto_complete_subset']:
            ratio = '—' if r['euros_saved_per_extra_minute'] is None else f"{r['euros_saved_per_extra_minute']:.3f}"
            lines.append(f"|{r['id']}|{r['minutes']:.2f}|{euros(r['total_cents'])}|{r['extra_minutes']:.2f}|{euros(r['saving_cents'])}|{ratio}|")
    lines += ['', '## Sections tarifaires et confiance — 28 itinéraires', '',
              'La confiance de correspondance et la confiance tarifaire doivent toutes deux être acceptables. '
              'Aucun montant ALIAE n’est appliqué. Pages = PDF APRR 2026.', '',
              '|ID|Concession|Transaction|Montant appliqué|Correspondance|Tarif|Page source|',
              '|---|---|---|---:|---|---|---|']
    for r in rows:
        if not r['sections']:
            lines.append(f"|{r['id']}|—|Aucun péage détecté dans le POC initial|0,00 € conditionnel|suffisamment fiable|absence détectée, pas reçu terrain|POC initial|")
        for s in r['sections']:
            t = s['traversal']
            transaction = t['entry']+' → '+t['exit']
            if t['operator'] == 'ALIAE':
                transaction = r['a79']['entry']+' → '+ ('Dompierre Ouest (27)' if len(r['a79']['gantries']) == 2 else 'Toulon / N7 (30)')
            lines.append(f"|{r['id']}|{t['operator']}|{transaction}|{euros(s['cents']) if s['accepted'] else 'inconnu / exclu'}|{t['confidence']}|{s['tariff_confidence']}|{s['source'].get('pdf_page', 'ALIAE : document 2024 rejeté')}|")
    lines += ['', '## Passages A79 réels', '',
              'Coordonnées = longitude, latitude. Les groupes 2024 servent à comprendre le système ; '
              'aucun tarif 2024 ni prolongation à 2026 n’est appliqué.', '']
    for r in rows:
        a = r['a79']
        if not a: continue
        lines += [f"### {r['id']}", '',
                  f"- Entrée : {a['entry']}, {a['entry_coordinate']} ; sortie {a['exit_coordinate']}.",
                  f"- Instruction archivée : {a['exit_instruction']['instruction']}",
                  f"- Longueur A79 réellement renvoyée par les arêtes : {a['a79_km_from_edges']:.3f} km (jamais utilisée pour calculer un prix).",
                  f"- Groupes identifiables dans le schéma 2024 : {', '.join(a['reference_2024_groups_not_priced'])} ; prix 2026 inconnu."]
        for p in a['gantries']:
            lines.append(f"- {p['name']} : nœud OSM {p['node_id']}, {p['coordinate']}, voie orientée {p['way_id']}, écart {p['distance_m']:.3f} m.")
        lines += ['']
    lines += ['## Recommandation sur les tarifs complets uniquement', '',
              '|Plafond de détour|Recommandé|', '|---|---|']
    for key, value in data['recommendation'].items():
        lines.append(f"|+{key.removeprefix('max_extra_')} min|{value}|")
    lines += ['', 'R27 reste recommandé avec le plafond V2 par défaut de +45 min. '
              'Tous les six tarifs encore incomplets ont un détour >45 min. '
              'Au-delà de ce plafond, une conclusion globale nécessite leurs tarifs ALIAE.', '',
              'Géométries © OpenStreetMap contributors, ODbL. Montants : cellules factuelles APRR officielles 2026. '
              'Voir REPORT.md pour les limites, les droits et les critères de confiance.', '']
    (ROOT/'RESULTS.md').write_text('\n'.join(lines))
    with (ROOT/'results/comparison.csv').open('w', newline='') as f:
        keys = ['id', 'minutes', 'km', 'previous_total_cents', 'known_cents', 'known_aprr_cents', 'total_cents',
                'status', 'extra_minutes', 'saving_cents', 'euros_saved_per_extra_minute', 'pareto_complete_subset']
        w = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore', lineterminator='\n')
        w.writeheader(); w.writerows(rows)
    paths = [ROOT/'RESULTS.md', ROOT/'results/pricing.json', ROOT/'results/comparison.csv']
    (ROOT/'results/SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(ROOT)}\n' for p in paths))


if __name__ == '__main__':
    main()
