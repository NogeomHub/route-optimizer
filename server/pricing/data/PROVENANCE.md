# Audited factual subset

Extracted from experiment/fr-toll-engine-2026, commit 2a7e66f0cc3703df2454baf462a83e1d285b57f6. Only 16 APRR class-1 cells, one Cofiroute class-1 cell and the two reviewed directional geographic models are activated. No full matrix, PDF, source-fetcher or experimental runtime is shipped. Each cell retains official URL, SHA-256, locator, date and class. Coverage and amounts are unchanged.

Geographic point/way facts © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright ; https://www.openstreetmap.org/fixthemap . The full audited topology and source observations remain in the experimental commit. Data-verified zero tolls are limited to this reviewed corridor and require a valid strict trace; they are not operator payment receipts. Matching `verified_at` records its audit, not an automatic expiry. A79 remains unresolved.

## Temporal policy (catalogue schema 2)

Dates are evaluated in Europe/Paris, with an explicit `on` date supplied by the job's injectable clock. Class 1 standard without discounts only.

- `effective_from`: official tariff start, inclusive (both active sources: 2026-02-01).
- `effective_until`: official end, inclusive, if known; null for the currently audited sources. No official 2026 end or actual 2027 successor was identified by the existing audit.
- `source_verified_at`: last source verification, 2026-10-30. It is provenance, never an expiry. A missing verification cannot qualify a tariff.
- `verification_due_from`: advisory source freshness threshold; 2027-01-28 (90 days after this verification). Sets internal `verificationDue` without disabling a valid tariff. Matching has the same advisory distinction.
- `tariff_series`: identifies editions of the same operator/class/profile coverage. A known newer catalogue in that series supersedes the older catalogue from its own effective date, even if its rules are not yet imported/verified. No fallback to an older matching cell. A future successor has no effect before its effective date. `replaced_from`, if supplied, also records a known official replacement without requiring its cells.
- `validity_review_from` and `validity_review_basis`: explicit, conservative applicability horizon when an official end is unknown. For these February 2026 editions, re-examination is required from **2027-02-01**, based on their annual February effective schedule. This is a local safeguard, not an official end date, not a fabricated 2027 tariff and not a civil-year cutoff. The date must be reviewed against the next official source before extending it. Catalogues must have a finite official end or a documented applicability review horizon; neither is inferred from machine year or verification age.

Before the effective date: unavailable (not yet effective). After an official end, known replacement, or the applicability review horizon: stale, no usable total. A missing cell stays unavailable; a partially covered journey stays partial when some qualified components remain. Only complete_verified totals participate in monetary comparisons. Zero-toll observations use the qualified geographic/trace audit rather than an inapplicable tariff edition.

A catalogue/model/code revision invalidates only the separate pricing projection cache. Retained routes, trace analyses and their independent TTLs are unchanged; rolling the date from 2026-10-30 to 2026-10-31 must reproject prices without another Valhalla campaign.
