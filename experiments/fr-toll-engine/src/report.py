"""Generate factual tables; explanations and scope live in REPORT.md."""
import csv,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def money(v):return '—'if v is None else f'{v/100:.2f} €'.replace('.',',')
def number(v,n=2):return '—'if v is None else f'{v:.{n}f}'.replace('.',',')
r=json.loads((ROOT/'results/pricing.json').read_text());h=json.loads((ROOT/'inputs/history-correspondence.json').read_text());old={x['current']:x['historical']for x in h['matches']};previous={x['id']:x for x in json.loads((ROOT.parents[1]/'data/audited-pricing.json').read_text())}
md='# Résultats calculés — 28 routes V3 réelles\n\nPrix TTC standard classe 1, sources vérifiées le 30 octobre 2026. Aucun tarif ALIAE 2024 appliqué, aucun prix au kilomètre. « Connu » est un sous-total si le total est absent.\n\n'
md+='| V3 | Corridor ancien proche¹ | Durée min | Total | Connu | État | Pareto complet |\n|---|---|---:|---:|---:|---|---|\n'
rows=sorted(r['routes'],key=lambda x:x['duration_seconds'])
for x in rows:md+=f"|{x['id']}|{old.get(x['id'],'nouveau')}|{number(x['duration_seconds']/60)}|{money(x['total_cents'])}|{money(x['known_cents'])}|{x['status']}|{'oui'if x['pareto']else'non'}|\n"
md+='\n¹ Correspondance diagnostique de corridor, jamais utilisée pour attribuer les tarifs. 0 géométrie strictement identique ; 27 corridors proches, R25 non retrouvée, G011 nouvelle.\n\nLes zéros G001/G002/G003 reposent sur trace stricte sans edge.toll, aucun passage recensé et corridor géographique audité ; pas sur un tarif opérateur interrogé ou un reçu. Ne pas étendre cette règle hors de ce périmètre.\n\n## Pareto temps/euros\n\nSeulement les 22 prix complets, dont les trois zéros routiers conditionnels. Pas un optimum global incluant les six tarifs inconnus. Référence G004.\n\n| V3 | Durée min | Prix | Détour min | Économie | €/minute supplémentaire |\n|---|---:|---:|---:|---:|---:|\n'
for x in rows:
 if x['pareto']:md+=f"|{x['id']}|{number(x['duration_seconds']/60)}|{money(x['total_cents'])}|{number(x['extra_minutes'])}|{money(x['saving_cents'])}|{number(x['euros_saved_per_extra_minute'],3)}|\n"
md+='\n## Décomposition traçable\n'
for x in rows:
 md+=f"\n### {x['id']} — {x['status']}\n\n"
 if not x['components']:md+='Aucune transaction détectée dans le périmètre audité ; réserves de gratuité ci-dessus.\n'
 for q in x['components']:
  t=q['transaction'];md+=f"- {t['operator']} / {t['system']} : {t['entry']} → {t['exit']} : {money(q['cents'])}, {q['status']}. "
  if q.get('source'):md+=f"[Source officielle]({q['source']['url']}), {q['source']['locator']}, SHA-256 `{q['source']['sha256']}`.\n"
  else:md+=q['reason']+'. Aucun total inventé.\n'
 md+=f"\nTotal : {money(x['total_cents'])} ; sous-total connu : {money(x['known_cents'])}. "
 if x['matching']['unknown']:md+='Couverture restante : '+' ; '.join(x['matching']['unknown'])+'. '
 md+='\n'
md+='\n## Échantillons des autres campagnes\n\nTrois variantes par corridor, archives réelles du commit 6171f70 ; aucun nouveau routage pour ces essais.\n\n| Corridor | ID | Durée min | km | Prix complet | État |\n|---|---|---:|---:|---:|---|\n'
other=json.loads((ROOT/'results/other-corridors.json').read_text())
for x in other['routes']:md+=f"|{x['corridor']}|{x['id']}|{number(x['minutes'])}|{number(x['distance_km'])}|{money(x['total_cents'])}|{x['status']}|\n"
md+='\nParis–Rennes G005 : CHARTRES-THIVARS → VITRE (LA GRAVELLE), 25,20 €, TXT Cofiroute et PDF officiel 2026 p36 recoupés ; sens des voies OSM contrôlé. G004 garde une entrée virtuelle PARIS/La Folie Bessin à résoudre, G008 parcourt A13/SAPN à flux libre. Lyon–Bordeaux : A89/ASF, autres interconnexions selon variante ; hors modèle géographique audité, aucun prix de trajet affirmé malgré disponibilité d’un fichier ASF.\n'
(ROOT/'RESULTS.md').write_text('\n'.join(line.rstrip() for line in md.splitlines())+'\n')
with (ROOT/'results/comparison.csv').open('w',newline='')as f:
 cols=['id','historical_corridor','duration_minutes','status','total_cents','known_cents','extra_minutes','saving_cents','euros_saved_per_extra_minute','pareto'];w=csv.DictWriter(f,fieldnames=cols,lineterminator="\n");w.writeheader()
 for x in rows:w.writerow({'id':x['id'],'historical_corridor':old.get(x['id']), 'duration_minutes':x['duration_seconds']/60,**{k:x[k]for k in cols if k in x}})
