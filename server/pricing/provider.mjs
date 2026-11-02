import { readFileSync } from "node:fs";
import { hash } from "../src/util.mjs";
import { matchTransactions } from "./matching.mjs";
import { loadGeneratedAprr, loadAprrBooths, matchGenericAprrTransactions, normalizeStation } from "./generic-aprr.mjs";
const read = (name, root) =>
  JSON.parse(readFileSync(new URL("./data/" + name, root), "utf8"));
const defaultModels = (root) => {
  const matching = read("aliae-matching-2026.json", root);
  return read("models.json", root).map((model) =>
    model.free_flow?.operator === matching.operator
      ? { ...model, free_flow: { ...model.free_flow, ...matching } }
      : model,
  );
};
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
    resourceRoot = new URL("./", import.meta.url),
    models = null,
    catalogs = null,
    aprrMatrix = undefined,
    aprrBooths = undefined,
  } = {}) {
    super();
    models ??= defaultModels(resourceRoot);
    catalogs ??= [
      read("aprr-2026.json", resourceRoot),
      read("cofiroute-2026.json", resourceRoot),
      read("aliae-2026.json", resourceRoot),
    ];
    this.models = models;
    this.catalogs = catalogs.map(validateCatalog);
    this.aprrMatrix = aprrMatrix === undefined ? loadGeneratedAprr(resourceRoot) : aprrMatrix;
    this.aprrBooths = aprrBooths === undefined ? loadAprrBooths(resourceRoot) : aprrBooths;
    this.revision = hash({
      models,
      catalogs,
      aprrMatrixSha256: this.aprrMatrix?.sourceSha256 ?? null,
      aprrBooths: this.aprrBooths ?? null,
      engine: readFileSync(new URL("provider.mjs", resourceRoot), "utf8"),
      matcher: readFileSync(new URL("./matching.mjs", resourceRoot), "utf8"),
    });
  }
  temporalState(c, on) {
    if (on < c.effective_from)
      return { status: "unavailable", reason: "TARIFF_NOT_YET_EFFECTIVE" };
    if (c.replaced_from && on >= c.replaced_from)
      return { status: "stale", reason: "SOURCE_OFFICIALLY_REPLACED" };
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
    if (t.tariffSource === "generated_aprr_matrix" && t.operator === "APRR" && this.aprrMatrix && vehicleClass === 1 && ["standard", "vtfe"].includes(profile) && ["closed", "open"].includes(t.system)) {
      const entry=normalizeStation(t.entry), exit=normalizeStation(t.exit), key=`${entry}\u0000${exit}`, cell=this.aprrMatrix.matrix[key];
      if (cell) {
        const meta={catalogId:"APRR-2026-generated-at-build",ruleId:key,source:{url:this.aprrMatrix.sourceUrl,sha256:this.aprrMatrix.sourceSha256,locator:`physical PDF page ${cell.page}, Classe 1, ${entry} → ${exit}`},effectiveFrom:this.aprrMatrix.effectiveFrom,effectiveUntil:null,sourceVerifiedAt:"2026-11-02",verificationDue:on >= "2027-01-28",validityReviewFrom:"2027-02-01",replacedFrom:null,vehicleClass:1,profile:"standard"};
        if(on < this.aprrMatrix.effectiveFrom) return {...base,...meta,reason:"TARIFF_NOT_YET_EFFECTIVE"};
        if(on >= "2027-02-01") return {...base,...meta,status:"stale",reason:"VALIDITY_REVIEW_REQUIRED"};
        return {...base,...meta,cents:cell.cents,status:"verified",reason:null};
      }
    }
    const tariffProfile = t.operator === "ALIAE" ? profile : "standard";
    const applicable = [], old = [], future = [];
    for (const c of this.catalogs) {
      if (c.operator !== t.operator) continue;
      for (const r of c.rules) {
        if (
          r.system !== t.system || r.entry !== t.entry || r.exit !== t.exit ||
          JSON.stringify(r.passages ?? []) !== JSON.stringify(t.passages ?? []) ||
          r.vehicle_class !== vehicleClass || r.profile !== tariffProfile ||
          !["confirmed", "official_cell_verified"].includes(r.confidence)
        ) continue;
        if (Object.entries(r.conditions ?? {}).some(([k, v]) => context[k] !== v)) continue;
        const state = this.temporalState(c, on);
        (state.status === "verified" ? applicable : state.status === "stale" ? old : future).push({ c, r, state });
      }
    }
    const source = ({ c, r }) => ({
      catalogId: c.id, ruleId: r.id, source: r.source,
      effectiveFrom: c.effective_from, effectiveUntil: c.effective_until ?? null,
      sourceVerifiedAt: c.source_verified_at ?? null,
      verificationDue: Boolean(c.verification_due_from && on >= c.verification_due_from),
      validityReviewFrom: c.validity_review_from ?? null, replacedFrom: c.replaced_from ?? null,
      vehicleClass: r.vehicle_class, profile: r.profile,
    });
    if (!applicable.length)
      return old.length ? { ...base, ...source(old[0]), status: "stale", reason: old[0].state.reason }
        : { ...base, reason: future.length ? "TARIFF_NOT_YET_EFFECTIVE" : base.reason };
    if (applicable.length !== 1) return { ...base, reason: "CATALOG_CONFLICT" };
    return { ...base, ...source(applicable[0]), cents: applicable[0].r.cents, status: "verified", reason: null };
  }
  async priceRoute(input) {
    const on = input.on;
    if (!isDate(on)) return unavailable(on, "INVALID_TARIFF_DATE");
    if (input.vehicleClass !== 1)
      return { ...unavailable(on, "UNSUPPORTED_VEHICLE"), vehicleClass: input.vehicleClass };
    let matches;
    try {
      matches = this.models.map((m) => matchTransactions(input, m)).filter(Boolean);
      if (!matches.length && this.aprrMatrix && this.aprrBooths) {
        const generic = matchGenericAprrTransactions(input, this.aprrMatrix, this.aprrBooths);
        if (generic) matches = [generic];
      }
    } catch (error) {
      console.error("[pricing] Invalid route/trace:", error.message);
      return unavailable(on, "INVALID_ANALYSIS");
    }
    if (matches.length !== 1)
      return unavailable(on, matches.length ? "MATCHING_CONFLICT" : "OUTSIDE_REVIEWED_COVERAGE");
    const m = matches[0], components = m.transactions.map((t) => this.quote(t, input));
    const knownSubtotalCents = components.filter((c) => c.status === "verified").reduce((n, c) => n + c.cents, 0);
    const complete = m.coverageComplete && components.every((c) => c.status === "verified");
    const status = complete ? "complete_verified" : components.some((c) => c.status === "verified") ? "partial" : components.some((c) => c.status === "stale") ? "stale" : "unavailable";
    return {
      status, totalCents: status === "complete_verified" ? knownSubtotalCents : null,
      knownSubtotalCents, currency: "EUR", vehicleClass: input.vehicleClass, on, components,
      coverageComplete: m.coverageComplete, matchingVerifiedAt: m.matchingVerifiedAt,
      verificationDue: m.verificationDue || components.some((c) => c.verificationDue),
      scope: m.scope, evidenceBasis: m.evidenceBasis,
      reasons: [...m.unknown, ...components.filter((c) => c.status !== "verified").map((c) => c.reason)],
      revision: this.revision,
    };
  }
}
