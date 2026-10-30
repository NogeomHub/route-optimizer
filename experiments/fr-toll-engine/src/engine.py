"""Exact, directed, dated factual tariffs. No distance-to-price conversion.

Pricing is independent of the geometry matcher and of the annual source importer.
A subtotal never becomes a price unless coverage and every transaction are accepted.
"""
from datetime import date
import re

ACCEPTED = {'confirmed', 'reviewed', 'suffisamment fiable'}


def validate_catalog(catalog):
    date.fromisoformat(catalog['effective_from'])
    if date.fromisoformat(catalog['verified_through'])<date.fromisoformat(catalog['effective_from']):raise ValueError('Invalid catalogue validity interval')
    seen = {}
    for rule in catalog['rules']:
        if type(rule['cents']) is not int or rule['cents'] < 0:
            raise ValueError('Prices must be nonnegative integer cents')
        if rule.get('vehicle_class') not in range(1,6):raise ValueError('Unsupported vehicle class')
        if rule['system'] not in {'closed', 'open', 'free_flow'}:
            raise ValueError('Unknown tariff system')
        if not rule.get('source') or not re.fullmatch('[a-f0-9]{64}',rule['source'].get('sha256', '')):
            raise ValueError('Source hash and locator required')
        if not rule['source'].get('locator'):
            raise ValueError('Missing source locator')
        key = (rule['system'], rule.get('entry'), rule.get('exit'), tuple(rule.get('passages', [])), rule['vehicle_class'], rule['profile'])
        if key in seen:
            raise ValueError('Duplicate/conflicting rule selector')
        seen[key] = rule['cents']
    return catalog


def quote(transaction, catalogs, on, vehicle_class=1, profile='standard', context=None):
    on = date.fromisoformat(on)
    matches = []
    stale = False
    for catalog in catalogs:
        if catalog['operator'] != transaction['operator']:
            continue
        for rule in catalog['rules']:
            if (rule['system'], rule.get('entry'), rule.get('exit'), rule.get('passages', []), rule['vehicle_class'], rule['profile']) != (transaction['system'], transaction.get('entry'), transaction.get('exit'), transaction.get('passages', []), vehicle_class, profile):
                continue
            if rule.get('confidence') not in {'official_cell_verified','confirmed'}:
                continue
            if rule.get('conditions') and any((context or {}).get(k) != v for k,v in rule['conditions'].items()):
                continue
            start, end = date.fromisoformat(catalog['effective_from']), date.fromisoformat(catalog['verified_through'])
            if not start <= on <= end:
                stale = True
                continue
            matches.append((catalog, rule))
    result = {'transaction': transaction, 'cents': None, 'status': 'unavailable', 'reason': 'No applicable exact dated rule'}
    if transaction.get('mapping_confidence') not in ACCEPTED:
        return dict(result, reason='Unverified or ambiguous route-to-transaction match')
    if not matches:
        return dict(result, status='stale' if stale else 'unavailable')
    if len(matches) != 1:
        return dict(result, reason='Overlapping catalog versions require explicit activation')
    catalog, rule = matches[0]
    return dict(result, cents=rule['cents'], status='verified', reason='', catalog=catalog['id'], rule=rule['id'], source=rule['source'])


def aggregate(quotes, *, coverage_complete, evidence=()):
    # Include ONLY accepted, current amounts in the subtotal (stale != usable).
    known = sum(q['cents'] for q in quotes if q['status'] == 'verified')
    complete = coverage_complete and all(q['status'] == 'verified' for q in quotes)
    status = 'complete_verified' if complete else 'partial' if any(q['status'] == 'verified' for q in quotes) else 'stale' if any(q['status'] == 'stale' for q in quotes) else 'unavailable'
    return {'status': status, 'known_cents': known, 'total_cents': known if complete else None, 'coverage_complete': coverage_complete, 'coverage_evidence': list(evidence), 'components': quotes}


def monetary_analysis(rows):
    complete = [r for r in rows if r['status'] == 'complete_verified' and r['total_cents'] is not None]
    fastest = min(rows, key=lambda r: r['duration_seconds'])
    reference = fastest if fastest in complete else None
    frontier = [r['id'] for r in sorted(complete, key=lambda r: (r['duration_seconds'], r['id'])) if not any(
        b['duration_seconds'] <= r['duration_seconds'] and b['total_cents'] <= r['total_cents'] and (b['duration_seconds'] < r['duration_seconds'] or b['total_cents'] < r['total_cents']) for b in complete)]
    for r in rows:
        r['extra_minutes'] = (r['duration_seconds'] - fastest['duration_seconds']) / 60
        valid = r in complete and reference is not None
        r['saving_cents'] = reference['total_cents'] - r['total_cents'] if valid else None
        r['euros_saved_per_extra_minute'] = r['saving_cents'] / 100 / r['extra_minutes'] if valid and r['extra_minutes'] > 0 else None
        r['pareto'] = r['id'] in frontier
    return {'reference_id': fastest['id'], 'reference_cents': reference['total_cents'] if reference else None, 'frontier_complete_subset': frontier, 'warning': 'Incomplete and stale quotes excluded; not a global frontier over unknown prices.'}
