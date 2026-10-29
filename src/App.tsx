import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronRight,
  Clock3,
  Euro,
  FlaskConical,
  Leaf,
  MapPin,
  Route,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { DemoRoutingProvider } from "./routing/DemoRoutingProvider";
import {
  paretoFrontier,
  eligibleRoutes,
  recommendRoute,
  routeMetrics,
} from "./domain/optimization";
import type { Preferences, RouteCandidate } from "./domain/types";
import { RouteMap } from "./components/RouteMap";
const provider = new DemoRoutingProvider();
const money = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
const duration = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
export default function App() {
  const [origin, setOrigin] = useState("Paris");
  const [destination, setDestination] = useState("Lyon");
  const [maxExtra, setMaxExtra] = useState(45);
  const [minimum, setMinimum] = useState("");
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    maxExtraMinutes: 45,
    minSavingCents: 0,
  });
  const [journey, setJourney] = useState({
    origin: "Paris",
    destination: "Lyon",
  });
  const [selected, setSelected] = useState("balanced");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const frontier = paretoFrontier(routes);
  const fastest = frontier[0];
  const eligible = fastest
    ? eligibleRoutes(frontier, fastest, preferences)
    : [];
  const recommended = fastest ? recommendRoute(eligible, fastest) : undefined;
  const active =
    frontier.find((r) => r.id === selected) ?? recommended ?? fastest;
  const visible = frontier.filter(
    (r) => r.id === fastest?.id || eligible.some((e) => e.id === r.id),
  );
  async function optimize(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const request = {
        origin: origin.trim(),
        destination: destination.trim(),
      };
      const result = await provider.getCandidates(request);
      const prefs = {
        maxExtraMinutes: maxExtra,
        minSavingCents: minimum ? Math.round(Number(minimum) * 100) : 0,
      };
      const f = paretoFrontier(result);
      if (!f.length) throw new Error("Aucun candidat disponible. Réessayez.");
      const rec = recommendRoute(eligibleRoutes(f, f[0], prefs), f[0]);
      setRoutes(result);
      setPreferences(prefs);
      setJourney(request);
      setSelected(rec?.id ?? f[0].id);
      setHasSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="./">
          <span className="brand-icon">
            <Route size={24} />
          </span>
          route<span className="brand-light">optimizer</span>
          <span className="beta">BÊTA</span>
        </a>
        <span className="header-note">Moins de péages. Plus de liberté.</span>
        <span className="demo-pill">
          <span /> Mode démonstration
        </span>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span /> LE TRAJET QUI VOUS RESSEMBLE
          </div>
          <h1>
            Le bon équilibre,
            <br />
            <span>tout au long de la route.</span>
          </h1>
          <p>
            Quelques minutes de plus peuvent faire la différence.
            <br className="desktop-break" /> Trouvez le meilleur compromis entre
            temps de trajet et péages.
          </p>
        </section>
        <section className="planner" aria-label="Préférences du trajet">
          <form onSubmit={optimize}>
            <div className="locations">
              <label>
                <span>Départ</span>
                <div className="input-wrap">
                  <span className="origin-dot" />
                  <input
                    required
                    maxLength={100}
                    aria-label="Départ"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="Ville de départ"
                  />
                </div>
              </label>
              <button
                type="button"
                className="swap"
                aria-label="Inverser le départ et la destination"
                onClick={() => {
                  setOrigin(destination);
                  setDestination(origin);
                }}
              >
                <ArrowUpDown size={18} />
              </button>
              <label>
                <span>Destination</span>
                <div className="input-wrap">
                  <MapPin size={18} />
                  <input
                    required
                    maxLength={100}
                    aria-label="Destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ville d’arrivée"
                  />
                </div>
              </label>
            </div>
            <div className="preferences">
              <div className="slider-field">
                <label htmlFor="extra">
                  <span>
                    <Clock3 size={15} /> Temps supplémentaire maximum accepté
                  </span>
                  <strong>+{maxExtra} min</strong>
                </label>
                <input
                  id="extra"
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={maxExtra}
                  onChange={(e) => setMaxExtra(Number(e.target.value))}
                  style={{ accentColor: "#286b54" }}
                />
                <div className="range-labels">
                  <span>0 min</span>
                  <span>90 min</span>
                </div>
              </div>
              <label className="minimum">
                <span>
                  Économie minimale souhaitée <small>facultatif</small>
                </span>
                <div className="input-wrap">
                  <input
                    aria-label="Économie minimale souhaitée en euros"
                    type="number"
                    min="0"
                    max="10000"
                    step="0.01"
                    placeholder="Aucun minimum"
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                  />
                  <span>€</span>
                </div>
              </label>
              <button className="optimize" disabled={loading}>
                <Sparkles size={18} />
                {loading ? "Comparaison…" : "Optimiser mon trajet"}
                <ArrowRight size={18} />
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
          <div className="demo-notice">
            <FlaskConical size={16} />
            <span>
              <strong>Un aperçu, pas un calcul d’itinéraire.</strong> Les
              trajets sont simulés et identiques pour toutes les villes saisies.
            </span>
          </div>
        </section>
        {!hasSearched ? (
          <section className="welcome">
            <div className="welcome-icon">
              <Route size={30} />
            </div>
            <h2>Et si le trajet le plus rapide n’était pas le meilleur ?</h2>
            <p>
              Lancez la démonstration pour explorer cinq compromis temps /
              péages,
              <br />
              et choisir les minutes qui valent vraiment le détour.
            </p>
            <div className="welcome-steps">
              <span>
                <Check size={16} /> Sans inscription
              </span>
              <span>
                <Check size={16} /> Sans clé API
              </span>
              <span>
                <Check size={16} /> Vous gardez le choix
              </span>
            </div>
          </section>
        ) : (
          <section className="results" aria-label="Résultats de démonstration">
            <div className="results-heading">
              <div>
                <div className="eyebrow">VOTRE COMPARATIF SIMULÉ</div>
                <h2>
                  {journey.origin} <ArrowRight size={22} />{" "}
                  {journey.destination}
                </h2>
                <p>
                  {eligible.length} solution{eligible.length !== 1 ? "s" : ""}{" "}
                  dans vos critères · Référence : le trajet le plus rapide
                </p>
              </div>
              <span className="frontier-label">
                <SlidersHorizontal size={15} /> Compromis non dominés
              </span>
            </div>
            {!recommended && (
              <div className="empty" role="status">
                Aucun compromis ne respecte vos critères. Augmentez le temps
                accepté ou diminuez l’économie minimale. Le trajet rapide reste
                affiché comme référence.
              </div>
            )}
            {recommended && recommended.id !== fastest.id && (
              <div className="insight">
                <span className="insight-icon">
                  <TrendingDown size={23} />
                </span>
                <p>
                  En acceptant{" "}
                  <strong>
                    {routeMetrics(recommended, fastest).extraMinutes} minutes
                    supplémentaires
                  </strong>
                  , vous économisez{" "}
                  <strong>
                    {money(routeMetrics(recommended, fastest).savingCents)}
                  </strong>
                  .
                  <small>
                    Notre suggestion pour vos préférences · péages uniquement
                  </small>
                </p>
                <Leaf size={25} className="insight-leaf" />
              </div>
            )}
            <div className="results-grid">
              <div className="route-list">
                {visible.map((route) => {
                  const m = routeMetrics(route, fastest);
                  const isRecommended = route.id === recommended?.id;
                  const isFast = route.id === fastest.id;
                  const title = isFast
                    ? "Le plus rapide"
                    : isRecommended
                      ? "Recommandé"
                      : route.tollCents === 0
                        ? "Sans péage"
                        : route.tollCents <= 860
                          ? "Économique"
                          : "Petit détour";
                  return (
                    <button
                      key={route.id}
                      className={`route-card ${selected === route.id ? "selected" : ""}`}
                      onClick={() => setSelected(route.id)}
                      aria-pressed={selected === route.id}
                    >
                      <div className="card-top">
                        <span
                          className={`route-title ${isRecommended ? "recommended" : ""}`}
                        >
                          {isRecommended ? (
                            <Sparkles size={15} />
                          ) : isFast ? (
                            <Clock3 size={15} />
                          ) : (
                            <Route size={15} />
                          )}{" "}
                          {title}
                        </span>
                        <span className="radio">
                          {selected === route.id && <span />}
                        </span>
                      </div>
                      <div className="card-numbers">
                        <strong>{duration(route.durationMinutes)}</strong>
                        <span className="toll">
                          <strong>{money(route.tollCents)}</strong> de péages
                        </span>
                        <span className="distance">{route.distanceKm} km</span>
                      </div>
                      <div className="card-bottom">
                        <span>
                          {isFast
                            ? "Votre point de comparaison"
                            : `+${m.extraMinutes} min · ${money(m.savingCents)} économisés`}
                        </span>
                        {m.eurosPerMinute !== null && (
                          <small>
                            {money(Math.round(m.eurosPerMinute * 100))}/min
                            ajoutée
                          </small>
                        )}
                      </div>
                      {selected === route.id && (
                        <p className="route-description">{route.description}</p>
                      )}
                    </button>
                  );
                })}
                <p className="list-note">
                  La distance est informative. Les économies portent uniquement
                  sur les péages, hors carburant et énergie.
                </p>
              </div>
              <aside className="visual-panel">
                <div className="panel-heading">
                  <h3>Le trajet en un regard</h3>
                  <span>ILLUSTRATION</span>
                </div>
                <RouteMap
                  routeId={active.id}
                  origin={journey.origin}
                  destination={journey.destination}
                />
                <div className="map-footer">
                  <span className="line-key" />
                  {active.roadSummary}
                  <p>
                    Tracé fictif, sans valeur géographique. Aucune navigation
                    disponible.
                  </p>
                </div>
                <div className="chart">
                  <h3>Chaque minute a sa valeur</h3>
                  <p>Les compromis temps / péages</p>
                  <svg
                    viewBox="0 0 420 180"
                    role="img"
                    aria-label="Frontière de Pareto : les péages diminuent lorsque la durée augmente"
                  >
                    <path d="M40 10V145H400" stroke="#dce3df" fill="none" />
                    {[0, 15, 30].map((v) => (
                      <g key={v}>
                        <text
                          x="3"
                          y={140 - v * 3.5}
                          fontSize="10"
                          fill="#728278"
                        >
                          {v} €
                        </text>
                        <path
                          d={`M38 ${135 - v * 3.5} H400`}
                          stroke="#e9ede9"
                        />
                      </g>
                    ))}
                    <polyline
                      points={frontier
                        .map(
                          (r) =>
                            `${45 + ((r.durationMinutes - fastest.durationMinutes) * 350) / 90},${135 - (r.tollCents / 100) * 3.5}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#b5c9bc"
                      strokeWidth="2"
                    />
                    {frontier.map((r) => (
                      <g key={r.id}>
                        <circle
                          cx={
                            45 +
                            ((r.durationMinutes - fastest.durationMinutes) *
                              350) /
                              90
                          }
                          cy={135 - (r.tollCents / 100) * 3.5}
                          r={r.id === selected ? 7 : 4}
                          fill={r.id === selected ? "#286b54" : "#aabdb0"}
                        />
                      </g>
                    ))}
                    <text x="40" y="170" fontSize="10" fill="#728278">
                      +0 min
                    </text>
                    <text x="355" y="170" fontSize="10" fill="#728278">
                      +90 min
                    </text>
                  </svg>
                  <span className="chart-note">
                    Tous les compromis simulés, y compris hors critères.
                  </span>
                </div>
              </aside>
            </div>
          </section>
        )}
        <section className="explainer">
          <span className="explainer-icon">
            <Euro size={21} />
          </span>
          <div>
            <h3>Le meilleur trajet, c’est aussi une question de choix.</h3>
            <p>
              Nous écartons les trajets à la fois plus lents et plus chers. Vous
              comparez uniquement les compromis utiles.
            </p>
          </div>
          <span className="pareto-tag">
            La frontière de Pareto <ChevronRight size={14} />
          </span>
        </section>
      </main>
      <footer>
        <span>
          routeoptimizer <span>·</span> Pensé pour rouler autrement.
        </span>
        <span>Prototype V1 · Données simulées · Aucun guidage routier</span>
      </footer>
    </>
  );
}
