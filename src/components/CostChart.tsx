import type { CompleteRoute } from "../domain/types";
import { decimal, money } from "../pricing/pricing";
export function CostChart({
  routes,
  fastest,
  selected,
  selectedIsComplete = false,
  maxExtra,
  onSelect,
}: {
  routes: CompleteRoute[];
  fastest: CompleteRoute;
  selected?: string;
  selectedIsComplete?: boolean;
  maxExtra: number;
  onSelect: (id: string) => void;
}) {
  const extent = Math.max(30, Math.ceil(maxExtra / 30) * 30);
  const x = (r: CompleteRoute) =>
    45 + ((r.durationMinutes - fastest.durationMinutes) * 350) / extent;
  const y = (r: CompleteRoute) => 150 - (r.tollCents / 100) * 2.6;
  return (
    <div className="chart">
      <h3>Chaque minute a sa valeur</h3>
      <p>Frontière temps / euros dans vos critères</p>
      <svg
        viewBox="0 0 420 200"
        role="group"
        aria-label="Graphique des compromis temps et coût de péage"
      >
        {[0, 10, 20, 30, 40, 50].map((v) => (
          <g key={v}>
            <text x="0" y={154 - v * 2.6} fontSize="10" fill="#637258">
              {v} €
            </text>
            <path d={`M40 ${150 - v * 2.6} H400`} stroke="#e5eade" />
          </g>
        ))}
        <polyline
          points={routes.map((r) => `${x(r)},${y(r)}`).join(" ")}
          fill="none"
          stroke="#b5c9bc"
          strokeWidth="2"
        />
        {routes.map((r) => (
          <g
            key={r.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected === r.id}
            aria-label={`Afficher ${r.id}, ${money(r.tollCents)}, +${decimal(r.durationMinutes - fastest.durationMinutes)} minutes`}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r.id);
              }
            }}
            className="chart-point"
          >
            <circle cx={x(r)} cy={y(r)} r="13" fill="transparent" />
            <circle
              cx={x(r)}
              cy={y(r)}
              r={selected === r.id ? 7 : 4}
              fill={selected === r.id ? "#286b54" : "#91aa83"}
              stroke="white"
              strokeWidth="1.5"
            />
            <title>
              {r.id} : {money(r.tollCents)}
            </title>
          </g>
        ))}
        <text x="40" y="175" fontSize="10" fill="#728278">
          +0 min
        </text>
        <text x="395" y="175" textAnchor="end" fontSize="10" fill="#728278">
          +{extent} min
        </text>
        <text x="220" y="195" textAnchor="middle" fontSize="10" fill="#728278">
          Temps supplémentaire par rapport à {fastest.id}
        </text>
      </svg>
      <span className="chart-note">
        Points sélectionnables · totaux complets uniquement.{" "}
        {selected &&
          !routes.some((r) => r.id === selected) &&
          `${selected} : ${selectedIsComplete ? "tarif complet, hors frontière Pareto" : "tarif incomplet"}, non représenté.`}
      </span>
    </div>
  );
}
