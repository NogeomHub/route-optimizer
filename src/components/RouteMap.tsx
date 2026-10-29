import { MapPin } from "lucide-react";
export function RouteMap({
  routeId,
  origin,
  destination,
}: {
  routeId: string;
  origin: string;
  destination: string;
}) {
  const shapes: Record<string, string> = {
    fast: "M100 270 C180 260 155 160 260 160 S330 70 450 65",
    light: "M100 270 C190 245 200 195 270 175 S350 95 450 65",
    balanced:
      "M100 270 C165 225 235 255 280 190 S360 160 390 110 S420 90 450 65",
    economy:
      "M100 270 C180 260 230 290 310 230 S370 180 400 120 S435 100 450 65",
    free: "M100 270 C170 300 260 310 330 245 S440 180 430 130 S460 90 450 65",
  };
  return (
    <div className="map-surface">
      <svg
        viewBox="0 0 560 340"
        role="img"
        aria-label="Schéma fictif du trajet sélectionné, sans valeur géographique"
      >
        <defs>
          <pattern
            id="grid"
            width="35"
            height="35"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M35 0H0V35"
              fill="none"
              stroke="#dce3d6"
              strokeWidth=".6"
            />
          </pattern>
        </defs>
        <rect width="560" height="340" fill="#edf0e7" />
        <rect width="560" height="340" fill="url(#grid)" />
        <path
          d="M0 40Q130 90 190 0M390 340Q320 220 560 200"
          stroke="#dae4d0"
          strokeWidth="80"
          fill="none"
        />
        <path
          d="M-20 175 Q130 95 230 130 T580 60"
          stroke="#c1d9df"
          strokeWidth="13"
          fill="none"
        />
        <g stroke="#fff" strokeWidth="5" fill="none">
          <path d="M0 310L560 130M40 0L310 340M240 0L560 300M0 80L560 260" />
        </g>
        {Object.entries(shapes)
          .filter(([id]) => id !== routeId)
          .map(([id, d]) => (
            <path
              key={id}
              d={d}
              fill="none"
              stroke="#a6b4a6"
              strokeWidth="2"
              strokeDasharray="5 7"
            />
          ))}
        <path
          d={shapes[routeId] ?? shapes.balanced}
          fill="none"
          stroke="white"
          strokeWidth="10"
        />
        <path
          d={shapes[routeId] ?? shapes.balanced}
          fill="none"
          stroke="#286b54"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle
          cx="100"
          cy="270"
          r="8"
          fill="white"
          stroke="#286b54"
          strokeWidth="4"
        />
        <circle
          cx="450"
          cy="65"
          r="8"
          fill="#286b54"
          stroke="white"
          strokeWidth="4"
        />
        <text x="112" y="297" fill="#42584b" fontSize="12">
          DÉPART FICTIF
        </text>
        <text x="335" y="45" fill="#42584b" fontSize="12">
          ARRIVÉE FICTIVE
        </text>
      </svg>
      <span className="map-label">
        <MapPin size={13} /> Schéma de démonstration
      </span>
      <div className="map-caption">
        {origin} <span>→</span> {destination}
      </div>
    </div>
  );
}
