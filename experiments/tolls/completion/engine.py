"""Small operator-neutral pricing contracts, not a national tariff calculator.

An official amount and a route/station match have independent confidence levels.
Both must be acceptable. A missing, stale, ambiguous or unsupported quote keeps
the whole total unknown; its known subtotal remains usable only as a subtotal.
"""
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Protocol


class Confidence(str, Enum):
    CONFIRMED = 'confirmé'
    RELIABLE = 'suffisamment fiable'
    AMBIGUOUS = 'ambigu'
    UNKNOWN = 'inconnu'


ACCEPTED = {Confidence.CONFIRMED, Confidence.RELIABLE}


@dataclass(frozen=True)
class Vehicle:
    toll_class: int = 1
    profile: str = 'standard'  # No Crit'air 0 / subscription discount assumed.


@dataclass(frozen=True)
class Traversal:
    operator: str  # Concession/tariff identity, NOT maintenance contractor.
    system: str  # closed, open, free_flow
    entry: str
    exit: str
    confidence: Confidence
    evidence: tuple[str, ...] = ()
    passages: tuple[str, ...] = ()  # Ordered directional gantries, when relevant.


@dataclass(frozen=True)
class Quote:
    traversal: Traversal
    cents: int | None
    tariff_confidence: Confidence
    source: dict = field(default_factory=dict)
    reason: str = ''

    @property
    def accepted(self):
        return (self.traversal.confidence in ACCEPTED
                and self.tariff_confidence in ACCEPTED
                and type(self.cents) is int and self.cents >= 0)


class TariffProvider(Protocol):
    operator: str

    def quote(self, traversal: Traversal, vehicle: Vehicle, on: date) -> Quote: ...


class DatedMatrixProvider:
    """Exact directed cells; no reversing, interpolation or €/km fallback.

    verified_through is an audit cutoff, not a promised tariff expiration date.
    A later date requires a fresh source audit even if the URL is unchanged.
    """
    def __init__(self, operator, cells, effective_from, verified_through):
        self.operator = operator
        self.cells = {}
        for record in cells:
            key = (record['entry'], record['exit'])
            if key in self.cells and self.cells[key]['cents'] != record['cents']:
                raise ValueError('Conflicting exact tariff cells')
            self.cells[key] = record
        self.effective_from = date.fromisoformat(effective_from)
        self.verified_through = date.fromisoformat(verified_through)

    def quote(self, traversal, vehicle, on):
        record = self.cells.get((traversal.entry, traversal.exit))
        if (traversal.operator != self.operator or traversal.system not in {'closed', 'open'}
                or vehicle != Vehicle() or not self.effective_from <= on <= self.verified_through
                or record is None or record.get('vehicle_class') != vehicle.toll_class
                or record.get('effective') != self.effective_from.isoformat()):
            return Quote(traversal, None, Confidence.UNKNOWN, reason='No applicable exact dated class/profile cell')
        return Quote(traversal, record['cents'], Confidence.CONFIRMED, record)


class UnverifiedFreeFlowProvider:
    """Intentional refusal: gantry detection does not supply current tariffs.

    ALIAE 2024 public documentation explains Transit / Est / Ouest groups. It
    must not be silently promoted to a 2026 catalogue or a flat fee per gantry.
    A future provider needs a dated catalogue AND audited grouping rules.
    """
    operator = 'ALIAE'

    def quote(self, traversal, vehicle, on):
        return Quote(traversal, None, Confidence.UNKNOWN,
                     {'reference': 'aliae-linked.pdf', 'reference_effective': '2024-02-01',
                      'requested_date': on.isoformat(), 'applied': False},
                     'Official public link supplies 2024 tariffs; no verified 2026 catalogue obtained')


def aggregate(quotes, *, coverage_complete):
    quotes = list(quotes)
    known = sum(q.cents for q in quotes if q.accepted)
    complete = coverage_complete and all(q.accepted for q in quotes)
    return {'known_cents': known, 'total_cents': known if complete else None,
            'status': 'complete' if complete else 'partial'}
