import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { archivedProvider } from "../routing/ArchivedRoutingProvider";
/** A single real polyline: edge.toll changes do not reliably identify toll transactions.
 * Do not color invented paid/free sections. Geometry is loaded lazily from the snapshot.
 */
export function RouteMap({ routeId }: { routeId: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.FeatureGroup | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [rendered, setRendered] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const instance = L.map(element.current!, {
      scrollWheelZoom: false,
    }).setView([47.5, 4], 6);
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => setTileError(true))
      .addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current!);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    let current = true;
    setStatus("loading");
    setRendered(null);
    layer.current?.remove();
    layer.current = null;
    archivedProvider
      .getGeometry(routeId, abort.signal)
      .then((points) => {
        if (!current || !map.current) return;
        const latlngs = points.map(([lon, lat]) => L.latLng(lat, lon));
        const line = L.polyline(latlngs, {
          color: "#286b54",
          weight: 5,
          opacity: 0.95,
        });
        const endpoints = [
          L.circleMarker(latlngs[0], {
            radius: 6,
            color: "#286b54",
            fillColor: "#fff",
            fillOpacity: 1,
          }).bindTooltip("Crans — départ"),
          L.circleMarker(latlngs.at(-1)!, {
            radius: 6,
            color: "#fff",
            fillColor: "#286b54",
            fillOpacity: 1,
          }).bindTooltip("Le Pin — arrivée"),
        ];
        layer.current = L.featureGroup([line, ...endpoints]).addTo(map.current);
        map.current.fitBounds(line.getBounds(), {
          padding: [28, 28],
          animate: false,
        });
        setRendered(routeId);
        setStatus("ready");
      })
      .catch((error) => {
        if (current && error.name !== "AbortError") setStatus("error");
      });
    return () => {
      current = false;
      abort.abort();
    };
  }, [routeId, retry]);
  return (
    <div className="real-map-wrap">
      <div
        ref={element}
        className="real-map"
        aria-label={`Carte OpenStreetMap — ${routeId}`}
        data-rendered-route={rendered ?? ""}
      />
      {status === "loading" && (
        <div className="map-message" role="status">
          Chargement du tracé {routeId}…
        </div>
      )}
      {status === "error" && (
        <div className="map-message error" role="alert">
          Tracé indisponible.{" "}
          <button onClick={() => setRetry((x) => x + 1)}>Réessayer</button>
        </div>
      )}
      {tileError && (
        <p className="tile-warning" role="status">
          Fond OSM indisponible ou partiel. Le tracé archivé reste consultable.
        </p>
      )}
      <span className="map-route-label">Tracé réel · {routeId}</span>
    </div>
  );
}
