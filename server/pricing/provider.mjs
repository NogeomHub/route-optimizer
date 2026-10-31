import { readFileSync } from "node:fs";
import { hash } from "../src/util.mjs";
import { matchTransactions } from "./matching.mjs";
const read = (name) =>
  JSON.parse(readFileSync(new URL("./data/" + name, import.meta.url), "utf8"));
export const dateInParis = (ms) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
export const unavailable = (on, reason = "OUTSIDE_REVIEWED_COVERAGE") => ({
  status: "unavailable",
  totalCents: null,
  knownSubtotalCents: 0,
  currency: "EUR",
  vehicleClass: 1,
  on,
  components: [],
  coverageComplete: false,
  reasons: [reason],
});
export class TollPricingProvider {
  async priceRoute() {
    throw new Error("Implement priceRoute");
  }
}
const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function validateCatalog(c) {
  if (
    !isDate(c.effective_from) ||
    !c.tariff_series ||
    ![
      "effective_until",
      "source_verified_at",
      "verification_due_from",
      "validity_review_from",
      "replaced_from",
    ].every((key) => c[key] == null || isDate(c[key])) ||
    (!c.effective_until && !c.validity_review_from) ||
    (c.effective_until && c.effective_until < c.effective_from) ||
    (c.validity_review_from &&
      (c.validity_review_from <= c.effective_from ||
        !c.validity_review_basis)) ||
    (c.replaced_from && c.replaced_from < c.effective_from) ||
    (c.verification_due_from &&
      (!c.source_verified_at || c.verification_due_from < c.source_verified_at))
  )
    throw Error("Invalid catalogue dates");
  const seen = new Set();
  for (const r of c.rules) {
    if (
      !Number.isSafeInteger(r.cents) ||
      r.cents < 0 ||
      !["closed", "open", "free_flow"].includes(r.system) ||
      !r.source?.locator ||
      !/^https:\/\//.test(r.source.url) ||
      !/^[a-f0-9]{64}$/.test(r.source.sha256)
    )
      throw Error("Invalid factual tariff rule");
    const key = JSON.stringify([
      r.system,
      r.entry,
      r.exit,
      r.passages ?? [],
      r.vehicle_class,
      r.profile,
      r.conditions ?? {},
    ]);
    if (seen.has(key)) throw Error("Duplicate directed tariff selector");
    seen.add(key);
  }
  return c;
}
export class AuditedTollPricingProvider extends TollPricingProvider {
  constructor({
    models = read("models.json"),
    catalogs = [read("aprr-2026.json"), read("cofiroute-2026.json")],
  } = {}) {
    super();
    this.models = models;
    this.catalogs = catalogs.map(validateCatalog);
    this.revision = hash({
      models,
      catalogs,
      engine: readFileSync(new URL(import.meta.url), "utf8"),
      matcher: readFileSync(new URL("./matching.mjs", import.meta.url), "utf8"),
    });
  }
  temporalState(c, on) {
    if (on < c.effective_from)
      return { status: "unavailable", reason: "TARIFF_NOT_YET_EFFECTIVE" };
    if (c.replaced_from && on >= c.replaced_from)
      return { status: "stale", reason: "SOURCE_OFFICIALLY_REPLACED" };
    // A known newer edition supersedes this series even if its cells are not
    // imported/verified yet. Never fall back to an older, cheaper matching cell.
    if (
      this.catalogs.some(
        (next) =>
          next.operator === c.operator &&
          next.tariff_series === c.tariff_series &&
          next.effective_from > c.effective_from &&
          next.effective_from <= on,
      )
    )
      return { status: "stale", reason: "CATALOG_SUPERSEDED" };
    if (c.effective_until && on > c.effective_until)
      return { status: "stale", reason: "OFFICIAL_VALIDITY_ENDED" };
    if (c.validity_review_from && on >= c.validity_review_from)
      return { status: "stale", reason: "VALIDITY_REVIEW_REQUIRED" };
    if (!c.source_verified_at)
      return { status: "stale", reason: "SOURCE_NOT_VERIFIED" };
    return { status: "verified", reason: null };
  }
  quote(t, { on, vehicleClass = 1, profile = "standard", context = {} }) {
    const base = {
      operator: t.operator,
      system: t.system,
      entry: t.entry,
      exit: t.exit,
      cents: null,
      status: "unavailable",
      mappingConfidence: t.mappingConfidence,
      evidence: t.evidence,
      reason: t.reason ?? "NO_VERIFIED_RULE",
    };
    if (!isDate(on)) return { ...base, reason: "INVALID_TARIFF_DATE" };
    if (t.mappingConfidence !== "reviewed")
      return { ...base, reason: "AMBIGUOUS_MATCH" };
    const applicable = [],
      old = [],
      future = [];
    for (const c of this.catalogs) {
      if (c.operator !== t.operator) continue;
      for (const r of c.rules) {
        if (
          r.system !== t.system ||
          r.entry !== t.entry ||
          r.exit !== t.exit ||
          JSON.stringify(r.passages ?? []) !==
            JSON.stringify(t.passages ?? []) ||
          r.vehicle_class !== vehicleClass ||
          r.profile !== profile ||
          !["confirmed", "official_cell_verified"].includes(r.confidence)
        )
          continue;
        if (
          Object.entries(r.conditions ?? {}).some(([k, v]) => context[k] !== v)
        )
          continue;
        const state = this.temporalState(c, on);
        (state.status === "verified"
          ? applicable
          : state.status === "stale"
            ? old
            : future
        ).push({ c, r, state });
      }
    }
    const source = ({ c, r }) => ({
      catalogId: c.id,
      ruleId: r.id,
      source: r.source,
      effectiveFrom: c.effective_from,
      effectiveUntil: c.effective_until ?? null,
      sourceVerifiedAt: c.source_verified_at ?? null,
      verificationDue: Boolean(
        c.verification_due_from && on >= c.verification_due_from,
      ),
      validityReviewFrom: c.validity_review_from ?? null,
      replacedFrom: c.replaced_from ?? null,
      vehicleClass: r.vehicle_class,
      profile: r.profile,
    });
    if (!applicable.length)
      return old.length
        ? {
            ...base,
            ...source(old[0]),
            status: "stale",
            reason: old[0].state.reason,
          }
        : {
            ...base,
            reason: future.length ? "TARIFF_NOT_YET_EFFECTIVE" : base.reason,
          };
    if (applicable.length !== 1) return { ...base, reason: "CATALOG_CONFLICT" };
    return {
      ...base,
      ...source(applicable[0]),
      cents: applicable[0].r.cents,
      status: "verified",
      reason: null,
    };
  }
  async priceRoute(input) {
    const on = input.on;
    if (!isDate(on)) return unavailable(on, "INVALID_TARIFF_DATE");
    if (input.vehicleClass !== 1)
      return {
        ...unavailable(on, "UNSUPPORTED_VEHICLE"),
        vehicleClass: input.vehicleClass,
      };
    let matches;
    try {
      matches = this.models
        .map((m) => matchTransactions(input, m))
        .filter(Boolean);
    } catch (error) {
      console.error("[pricing] Invalid route/trace:", error.message);
      return unavailable(on, "INVALID_ANALYSIS");
    }
    if (matches.length !== 1)
      return unavailable(
        on,
        matches.length ? "MATCHING_CONFLICT" : "OUTSIDE_REVIEWED_COVERAGE",
      );
    const m = matches[0],
      components = m.transactions.map((t) => this.quote(t, input));
    const knownSubtotalCents = components
      .filter((c) => c.status === "verified")
      .reduce((n, c) => n + c.cents, 0);
    const complete =
      m.coverageComplete && components.every((c) => c.status === "verified");
    const status = complete
      ? "complete_verified"
      : components.some((c) => c.status === "verified")
        ? "partial"
        : components.some((c) => c.status === "stale")
          ? "stale"
          : "unavailable";
    return {
      status,
      totalCents: status === "complete_verified" ? knownSubtotalCents : null,
      knownSubtotalCents,
      currency: "EUR",
      vehicleClass: input.vehicleClass,
      on,
      components,
      coverageComplete: m.coverageComplete,
      matchingVerifiedAt: m.matchingVerifiedAt,
      verificationDue:
        m.verificationDue || components.some((c) => c.verificationDue),
      scope: m.scope,
      evidenceBasis: m.evidenceBasis,
      reasons: [
        ...m.unknown,
        ...components
          .filter((c) => c.status !== "verified")
          .map((c) => c.reason),
      ],
      revision: this.revision,
    };
  }
}
