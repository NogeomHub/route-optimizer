import { tollMetricsLabel, type TollMetricFields } from "../domain/tollMetrics";

export function RouteTollInfo({
  route,
}: {
  route: TollMetricFields & { eta?: { status: string } };
}) {
  const tomtom = route.eta?.status === "ok";
  return (
    <span className="route-toll-info">
      <span>{tollMetricsLabel(route, tomtom)}</span>
      {route.tollDurationSource === "valhalla_trace" && (
        <small style={{ display: "block" }}>
          {tomtom
            ? "Durée payante et pourcentage calculés sur le temps Valhalla ; l’ETA totale TomTom est distincte."
            : "Durée payante et pourcentage calculés par Valhalla, avec les temps de transition."}
        </small>
      )}
    </span>
  );
}
