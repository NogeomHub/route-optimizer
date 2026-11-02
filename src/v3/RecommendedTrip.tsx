import type { DynamicRoute } from "./provider";
import { effectiveDurationSeconds, etaLabel } from "./provider";
import { priceLabel, euros } from "./pricing";
import { recommendation } from "./recommendation";
import { GpsSteps } from "./GpsSteps";
import { RouteTollInfo } from "../components/RouteTollInfo";
export const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
};
export function RecommendedTrip({
  choice,
  extra,
  minimum,
  jobId,
  labels,
  onSelect,
}: {
  choice: NonNullable<ReturnType<typeof recommendation>>;
  extra: number;
  minimum: number;
  jobId: string;
  labels: string[];
  onSelect: (id: string) => void;
}) {
  const r: DynamicRoute = choice.route,
    saving = choice.view.saving(r),
    seconds = effectiveDurationSeconds(r),
    fastestSeconds = choice.view.fastest
      ? effectiveDurationSeconds(choice.view.fastest)
      : 0,
    etaDegraded = r.eta?.status !== "ok";
  return (
    <section
      className="v3-panel v3-recommended"
      aria-label="Trajet conseillé"
      data-recommended-route={r.id}
      data-eta-degraded={etaDegraded ? "true" : "false"}
    >
      <p className="v3-eyebrow">
        {choice.meets
          ? "SELON VOS CRITÈRES"
          : "OPTION À EXAMINER · CRITÈRES NON GARANTIS"}
      </p>
      <h2>Trajet conseillé</h2>
      {etaDegraded && (
        <p className="tile-warning" role="status">
          <strong>Temps de trajet en mode dégradé.</strong> TomTom n’a pas
          validé la durée de cet itinéraire. Le temps affiché provient de
          Valhalla et est moins fiable ; considérez cette recommandation comme
          provisoire.
        </p>
      )}
      <p className="v3-recommended-price">
        {duration(seconds)} · {priceLabel(r)}
      </p>
      <p>
        +{Math.round((seconds - fastestSeconds) / 60)} min ·{" "}
        {saving !== null
          ? `économie ${euros(saving)}`
          : "économie non vérifiable"}{" "}
        · {r.distanceKm.toFixed(1)} km
      </p>
      <p>
        <strong>{etaLabel(r)}</strong>
        {r.eta?.status === "ok" && r.eta.trafficDelayMinutes !== undefined
          ? ` · trafic actuel +${Math.round(r.eta.trafficDelayMinutes)} min`
          : ""}
      </p>
      <p>
        <RouteTollInfo route={r} />
      </p>
      <p>
        {choice.meets
          ? `C’est le meilleur compromis trouvé parmi les tarifs complets qui respectent votre limite de +${extra} min et votre économie minimale de ${euros(minimum)}. Le score favorise l’économie de péage, pénalise le temps supplémentaire et valorise les euros économisés par minute perdue. Les trajets sans tarif complet ne sont pas comparables en euros.`
          : choice.reason === "SAVING_UNMET"
            ? `Aucun itinéraire au tarif complet ne satisfait vos critères. Voici le moins cher dans la limite de +${extra} min, mais il n’atteint pas votre économie minimale de ${euros(minimum)}.`
            : "Comparaison monétaire impossible : le tarif de référence est incomplet. Le trajet le plus rapide est proposé comme repère, sans garantie sur le critère d’économie."}
      </p>
      <button onClick={() => onSelect(r.id)}>
        Afficher {r.id} sur la carte
      </button>
      <GpsSteps jobId={jobId} routeId={r.id} labels={labels} />
    </section>
  );
}
