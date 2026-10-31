import { useEffect, useState } from "react";
import { request } from "./provider";
export type GpsStep = {
  label: string;
  lat: number;
  lon: number;
  city: string;
  postcode: string;
  roads: string[];
  separationKm: number;
  routeKm: number;
  zone: number;
  offsetMeters: number;
};
export type Guide = {
  status: "suggested" | "unavailable" | "reference";
  routeId?: string;
  steps: GpsStep[];
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
  reason?: string;
  warning?: string;
};
export function gpsText(guide: Guide, labels: string[]) {
  if (guide.status !== "suggested" || !guide.steps.length) return null;
  return [
    "Départ : " + labels[0],
    ...guide.steps.map(
      (s, i) =>
        `Étape ${i + 1} : ${s.label} (${s.lat.toFixed(6)}, ${s.lon.toFixed(6)})`,
    ),
    "Destination : " + labels[1],
    "À vérifier dans votre GPS : itinéraire et péages recalculés entre les étapes.",
  ].join("\n");
}
export function googleMapsUrl(guide: Guide) {
  if (
    guide.status !== "suggested" ||
    !guide.steps.length ||
    guide.steps.length > 3 ||
    !guide.origin ||
    !guide.destination
  )
    return null;
  const pos = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;
  const params = new URLSearchParams({
    api: "1",
    origin: pos(guide.origin),
    destination: pos(guide.destination),
    travelmode: "driving",
    waypoints: guide.steps.map(pos).join("|"),
  });
  return "https://www.google.com/maps/dir/?" + params;
}
export function GpsSteps({
  jobId,
  routeId,
  labels,
}: {
  jobId: string;
  routeId: string;
  labels: string[];
}) {
  const [state, setState] = useState<{ key: string; guide?: Guide }>({
      key: "",
    }),
    [copied, setCopied] = useState("");
  const key = jobId + "/" + routeId;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setCopied("");
    request<Guide>(
      `/api/search/${jobId}/routes/${routeId}/gps`,
      undefined,
      abort.signal,
    )
      .then((guide) => {
        if (active) setState({ key, guide });
      })
      .catch(() => {
        if (active)
          setState({ key, guide: { status: "unavailable", steps: [] } });
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [key, jobId, routeId]);
  const guide = state.key === key ? state.guide : undefined,
    text = guide ? gpsText(guide, labels) : null,
    url = guide ? googleMapsUrl(guide) : null;
  return (
    <section className="v3-gps" aria-label="Étapes GPS">
      <h3>Pour reproduire ce trajet dans votre GPS</h3>
      {!guide ? (
        <p role="status">Recherche de repères utiles…</p>
      ) : !text ? (
        <p>
          {guide.status === "reference"
            ? "Ce trajet est le plus rapide observé. Aucune étape intermédiaire distinctive à proposer ; vérifiez le tracé choisi par votre GPS."
            : "Étapes fiables non disponibles pour ce trajet. Les données conservées ou les adresses vérifiées ne suffisent pas : aucune étape approximative n’est proposée."}
        </p>
      ) : (
        <>
          <p>Départ : {labels[0]}</p>
          <ol>
            {guide.steps.map((s, i) => (
              <li key={i}>
                <strong>{s.label}</strong>
                <small>
                  {s.roads.join(" / ")} · repère à {s.separationKm.toFixed(1)}{" "}
                  km du corridor rapide
                </small>
              </li>
            ))}
          </ol>
          <p>Destination : {labels[1]}</p>
          <p>
            {guide.warning ??
              "Le GPS recalcule entre les étapes. Vérifiez le tracé et les péages."}
          </p>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied("Étapes copiées.");
              } catch {
                setCopied(
                  "Copie impossible : sélectionnez le texte des étapes ci-dessous.",
                );
              }
            }}
          >
            Copier les étapes GPS
          </button>
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              Ouvrir dans Google Maps
            </a>
          )}
          <small>
            Vérifiez les étapes dans Google Maps : leur prise en compte dépend
            de l’appareil et le trajet est recalculé.
          </small>
          <details>
            <summary>Texte à saisir dans Waze ou Google Maps</summary>
            <pre>{text}</pre>
          </details>
          <p role="status">{copied}</p>
        </>
      )}
    </section>
  );
}
