import { useState } from "react";
import { LiveMap } from "./LiveMap";
import { pareto, type Job, type DynamicRoute } from "./provider";
import { complete, euros, monetaryView, priceLabel } from "./pricing";
import { TollDetails } from "./TollDetails";
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
export function Results({
  job,
  extra,
  minimumSaving,
  selection,
  onSelect,
  labels,
}: {
  job: Job;
  extra: number;
  minimumSaving: number;
  selection: string;
  onSelect: (id: string) => void;
  labels: string[];
}) {
  const [choice, setChoice] = useState<"auto" | "cost" | "exposure">("auto");
  const routes = job.result?.routes ?? [];
  const v = monetaryView(routes, extra, minimumSaving);
  const cost = choice !== "exposure" && v.priceViewAvailable;
  const points = cost ? v.costPareto : pareto(v.displayed);
  const selected =
    v.displayed.find((r) => r.id === selection) ?? points[0] ?? v.displayed[0];
  const fastest = v.fastest?.durationSeconds ?? 0;
  const least = [...pareto(v.withinTime)].sort(
    (a, b) =>
      a.tollExposure!.tollKm - b.tollExposure!.tollKm ||
      a.durationSeconds - b.durationSeconds,
  )[0];
  const xMax = Math.max(
    1,
    ...points.map((r) => (r.durationSeconds - fastest) / 60),
  );
  const y = (r: DynamicRoute) =>
    cost ? r.pricing!.totalCents! / 100 : r.tollExposure!.tollKm;
  const yMax = Math.max(1, ...points.map(y));
  const count = (status: string) =>
    routes.filter((r) => r.pricing?.status === status).length;
  const renderCard = (r: DynamicRoute) => {
    const saving = v.saving(r),
      efficiency = v.efficiency(r);
    return (
      <article
        key={r.id}
        data-route-id={r.id}
        className={`v3-route ${selected?.id === r.id ? "selected" : ""}`}
        onClick={() => onSelect(r.id)}
      >
        <button
          className="v3-route-select"
          onClick={() => onSelect(r.id)}
          aria-pressed={selected?.id === r.id}
        >
          <span className="v3-route-title">
            {r.id} {r.id === v.fastest?.id ? "· Le plus rapide" : ""}{" "}
            {r.id === v.cheapest?.id
              ? "· Économie maximale respectant le détour"
              : !v.reference && r.id === least?.id
                ? "· Le moins exposé parmi les compromis"
                : ""}
          </span>
          <strong className="v3-price">{priceLabel(r)}</strong>
          <strong>
            {minutes(r.durationSeconds)} · {r.distanceKm.toFixed(1)} km
          </strong>
          <span>
            +{minutes(r.durationSeconds - fastest)} ·{" "}
            {r.tollExposure
              ? `${r.tollExposure.tollKm.toFixed(1)} km marqués à péage`
              : "Exposition en cours d’analyse"}
          </span>
          {saving !== null && (
            <span>
              {saving < 0
                ? `Surcoût : ${euros(-saving)}`
                : `Économie : ${euros(saving)}`}
              {efficiency !== null && efficiency > 0
                ? ` · ${efficiency.toFixed(2).replace(".", ",")} €/min supplémentaire`
                : ""}
            </span>
          )}
          {r.pricing?.status === "partial" && (
            <span>
              {euros(r.pricing.knownSubtotalCents)} identifiés + portions non
              tarifées. Total inconnu.
            </span>
          )}
          {complete(r) && r.pricing?.evidenceBasis === "road_data_zero" && (
            <small>Sans péage détecté dans les données auditées.</small>
          )}
        </button>
        <TollDetails route={r} />
      </article>
    );
  };
  return (
    <section aria-label="Résultats">
      <div className="v3-results-heading">
        <h2>
          {cost ? "Temps / coût du péage" : "Temps / exposition au péage"}
        </h2>
        <p>
          {job.status !== "completed"
            ? "Résultats provisoires — analyses et tarifs peuvent évoluer."
            : "Parmi les itinéraires explorés."}{" "}
          L’exposition n’est PAS le prix du péage.
        </p>
        <p>Trajet calculé : {labels.join(" → ")}</p>
        <p>
          {count("complete_verified")} tarifs complets · {count("partial")}{" "}
          incomplets ·{" "}
          {
            routes.filter(
              (r) => !r.pricing || r.pricing.status === "unavailable",
            ).length
          }{" "}
          non disponibles · {count("stale")} à vérifier
        </p>
        {v.reference ? (
          <p>
            Référence monétaire : {v.reference.id}, le trajet le plus rapide,{" "}
            {euros(v.reference.pricing!.totalCents!)}. Les économies utilisent
            uniquement des totaux complets.
          </p>
        ) : (
          <p>
            La route la plus rapide n’a pas de tarif complet : la comparaison
            monétaire complète et les économies ne sont pas disponibles.
          </p>
        )}
        <div className="v3-view-toggle" aria-label="Vue du graphique">
          <button
            aria-pressed={cost}
            disabled={!v.priceViewAvailable}
            onClick={() => setChoice("cost")}
          >
            Temps / coût du péage
          </button>
          <button aria-pressed={!cost} onClick={() => setChoice("exposure")}>
            Temps / exposition au péage
          </button>
        </div>
      </div>
      <div className="v3-results">
        <div>
          <div className="v3-chart">
            <h3>
              {cost
                ? "Votre temps, vos euros"
                : "Votre temps, votre exposition"}
            </h3>
            <p>
              Horizontal : temps supplémentaire (min) · Vertical :{" "}
              {cost ? "prix complet (€)" : "exposition (km)"}
            </p>
            {cost && (
              <p>
                Seuls les tarifs complets participent à ce graphique et à cette
                frontière. Les autres trajets restent consultables ci-dessous.
              </p>
            )}
            <svg
              viewBox="0 0 540 270"
              role="group"
              aria-label={
                cost
                  ? "Graphique temps et coût"
                  : "Graphique temps et exposition"
              }
            >
              <path d="M45 15V230H520" fill="none" stroke="#789385" />
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <text x={3} y={230 - t * 195}>
                    {(t * yMax).toFixed(1)}
                  </text>
                  <text x={45 + t * 450} y={253}>
                    {(t * xMax).toFixed(1)}
                  </text>
                </g>
              ))}
              {points.map((r) => (
                <circle
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sélectionner ${r.id}`}
                  aria-pressed={selected?.id === r.id}
                  cx={45 + ((r.durationSeconds - fastest) / 60 / xMax) * 450}
                  cy={230 - (y(r) / yMax) * 195}
                  r={selected?.id === r.id ? 9 : 6}
                  fill={selected?.id === r.id ? "#e0ac54" : "#286b54"}
                  onClick={() => onSelect(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(r.id);
                    }
                  }}
                >
                  <title>
                    {r.id} : +{minutes(r.durationSeconds - fastest)},{" "}
                    {cost
                      ? euros(r.pricing!.totalCents!)
                      : `${y(r).toFixed(1)} km exposés`}
                  </title>
                </circle>
              ))}
            </svg>
            {!points.length && (
              <p>Aucun compromis disponible pour ces critères.</p>
            )}
            {cost && selected && !complete(selected) && (
              <p>
                Le trajet sélectionné n’a pas de tarif complet : il est visible
                sur la carte, sans point monétaire.
              </p>
            )}
          </div>
          <div className="v3-routes" aria-label="Trajets à tarif complet">
            {v.priced.map(renderCard)}
          </div>
          {v.withinTime.some(complete) && !v.priced.length && (
            <p>Aucun tarif complet ne respecte l’économie minimale choisie.</p>
          )}
          {routes.some((r) => !complete(r)) && (
            <section
              className="v3-unpriced"
              aria-label="Trajets sans tarif complet"
            >
              <h3>Trajets sans tarif complet</h3>
              <p>
                Ils restent visibles selon votre plafond de détour. Le seuil
                d’économie ne peut pas être évalué et aucun sous-total n’est
                comparé à un prix complet.
              </p>
              <div className="v3-routes">{v.unpriced.map(renderCard)}</div>
              {!v.unpriced.length && (
                <p>
                  Aucun de ces trajets ne respecte actuellement le plafond de
                  détour.
                </p>
              )}
            </section>
          )}
          {!v.displayed.length && (
            <p>Aucun itinéraire ne respecte ces critères.</p>
          )}
        </div>
        <div className="v3-map">
          {selected && (
            <LiveMap
              routeId={selected.id}
              geometryUrl={selected.geometryUrl}
              origin={labels[0]}
              destination={labels[1]}
            />
          )}
        </div>
      </div>
    </section>
  );
}
