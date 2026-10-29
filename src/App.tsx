import { useEffect, useState } from "react";
import {
  ArrowRight,
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
import {
  ARCHIVED_JOURNEY,
  archivedProvider,
} from "./routing/ArchivedRoutingProvider";
import {
  eligibleRoutes,
  paretoFrontier,
  recommendRoute,
  routeMetrics,
} from "./domain/optimization";
import type { RouteCandidate } from "./domain/types";
import { decimal, duration, isCompletePrice, money } from "./pricing/pricing";
import { RouteMap } from "./components/RouteMap";
import { CostChart } from "./components/CostChart";
import { PricingDetails } from "./components/PricingDetails";

export default function App() {
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [error, setError] = useState("");
  const [maxExtra, setMaxExtra] = useState(45);
  const [minimum, setMinimum] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    archivedProvider
      .getCandidates(ARCHIVED_JOURNEY)
      .then((data) => {
        if (current) setRoutes(data);
      })
      .catch(() => {
        if (current)
          setError(
            "Impossible de lire les données archivées. Rechargez la page.",
          );
      });
    return () => {
      current = false;
    };
  }, []);
  const frontier = paretoFrontier(routes);
  const fastest = frontier[0];
  const preferences = {
    maxExtraMinutes: maxExtra,
    minSavingCents: Math.max(0, Math.round(Number(minimum || "0") * 100)),
  };
  const eligible = fastest
    ? eligibleRoutes(frontier, fastest, preferences)
    : [];
  const recommended = fastest ? recommendRoute(eligible, fastest) : undefined;
  const partial = routes.filter((r) => !isCompletePrice(r));
  const partialInTime = fastest
    ? partial.filter(
        (r) => r.durationMinutes - fastest.durationMinutes <= maxExtra,
      )
    : [];
  const frontierIds = new Set(frontier.map((r) => r.id));
  const dominatedInCriteria = fastest
    ? eligibleRoutes(
        routes.filter((r) => !frontierIds.has(r.id)),
        fastest,
        preferences,
      )
    : [];
  const selectable = [...eligible, ...partialInTime, ...dominatedInCriteria];
  const active = selectable.find((r) => r.id === selected) ?? recommended;
  const cheapest = eligible.length
    ? eligible.reduce((a, b) => (a.tollCents < b.tollCents ? a : b))
    : undefined;
  return (
    <>
      <header className="header">
        <a className="brand" href="./">
          <span className="brand-icon">
            <Route size={24} />
          </span>
          route<span className="brand-light">optimizer</span>
          <span className="beta">V2 LAB</span>
        </a>
        <span className="header-note">Moins de péages. Plus de liberté.</span>
        <span className="demo-pill real-pill">
          <span /> Trajet réel · pré-calculé
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
            Comparez de vrais compromis entre temps de trajet et péages.
            <br className="desktop-break" /> Une expérimentation sur Crans → Le
            Pin, sans calcul en direct.
          </p>
        </section>
        <section className="planner" aria-label="Préférences du trajet">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelected(recommended?.id ?? null);
            }}
          >
            <div className="locations">
              <label>
                <span>Départ</span>
                <div className="input-wrap">
                  <span className="origin-dot" />
                  <input
                    readOnly
                    aria-label="Départ"
                    value={ARCHIVED_JOURNEY.origin}
                  />
                </div>
              </label>
              <span className="journey-direction" aria-hidden="true">
                <ArrowRight size={18} />
              </span>
              <label>
                <span>Destination</span>
                <div className="input-wrap">
                  <MapPin size={18} />
                  <input
                    readOnly
                    aria-label="Destination"
                    value={ARCHIVED_JOURNEY.destination}
                  />
                </div>
              </label>
            </div>
            <p className="fixed-journey">
              Seul ce trajet et ce sens sont disponibles. Les villes ne peuvent
              pas être modifiées.
            </p>
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
                  max="180"
                  step="1"
                  value={maxExtra}
                  onChange={(e) => {
                    setMaxExtra(Number(e.target.value));
                    setSelected(null);
                  }}
                />
                <div className="range-labels">
                  <span>0 min</span>
                  <span>180 min</span>
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
                    onChange={(e) => {
                      setMinimum(e.target.value);
                      setSelected(null);
                    }}
                  />
                  <span>€</span>
                </div>
              </label>
              <button className="optimize" disabled={!fastest}>
                <Sparkles size={18} /> Comparer les itinéraires{" "}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
          <div className="demo-notice">
            <FlaskConical size={16} />
            <span>
              <strong>Expérimentation sur données réelles archivées.</strong>{" "}
              Valhalla, 29 octobre 2026 · tarifs APRR classe 1 audités au 1er
              février 2026. Prototype, sans navigation nationale ni trafic
              actualisé.
            </span>
          </div>
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!fastest && !error && (
          <p role="status">Chargement des résultats archivés…</p>
        )}
        {fastest && (
          <section className="results" aria-label="Résultats réels archivés">
            <div className="results-heading">
              <div>
                <div className="eyebrow">VOTRE COMPARATIF RÉEL · CLASSE 1</div>
                <h2>
                  Crans <ArrowRight size={22} /> Le Pin
                </h2>
                <p>
                  {eligible.length} compromis dans vos critères ·{" "}
                  {routes.filter(isCompletePrice).length} totaux complets ·{" "}
                  {partial.length} incomplets
                </p>
                <p>
                  Référence {fastest.id} : {duration(fastest.durationMinutes)},{" "}
                  {money(fastest.tollCents)} · filtres appliqués immédiatement
                </p>
              </div>
              <span className="frontier-label">
                <SlidersHorizontal size={15} /> Pareto temps / euros
              </span>
            </div>
            {!eligible.length && (
              <div className="empty" role="status">
                Aucun compromis à coût complet ne respecte vos critères.
                Augmentez le temps accepté ou diminuez l’économie minimale.
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
                    {decimal(routeMetrics(recommended, fastest).extraMinutes)}{" "}
                    minutes supplémentaires
                  </strong>
                  , vous économisez{" "}
                  <strong>
                    {money(routeMetrics(recommended, fastest).savingCents)}
                  </strong>
                  .
                  <small>
                    Suggestion {recommended.id} · péages uniquement ·{" "}
                    <a href="#recommendation">Comment est-elle choisie ?</a>
                  </small>
                </p>
                <Leaf size={25} className="insight-leaf" />
              </div>
            )}
            <div className="results-grid">
              <div className="route-list">
                {eligible.map((route) => {
                  const m = routeMetrics(route, fastest);
                  const isRecommended = route.id === recommended?.id;
                  const isFast = route.id === fastest.id;
                  const title = isFast
                    ? "Le plus rapide"
                    : isRecommended
                      ? "Recommandé"
                      : route.tollCents === 0
                        ? "Sans péage détecté"
                        : route.id === cheapest?.id
                          ? "Économique dans vos critères"
                          : "Compromis";
                  return (
                    <button
                      key={route.id}
                      className={`route-card ${active?.id === route.id ? "selected" : ""}`}
                      data-route-id={route.id}
                      aria-pressed={active?.id === route.id}
                      onClick={() => setSelected(route.id)}
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
                          {title} <span className="route-id">{route.id}</span>
                        </span>
                        <span className="radio">
                          {active?.id === route.id && <span />}
                        </span>
                      </div>
                      <div className="card-numbers">
                        <strong>{duration(route.durationMinutes)}</strong>
                        <span className="toll">
                          <strong>{money(route.tollCents)}</strong> de péages
                        </span>
                        <span className="distance">
                          {decimal(route.distanceKm)} km
                        </span>
                      </div>
                      <div className="card-bottom">
                        <span>
                          {isFast
                            ? "Votre point de comparaison"
                            : `+${decimal(m.extraMinutes)} min · ${money(m.savingCents)} économisés`}
                        </span>
                        {m.eurosPerMinute !== null && (
                          <small>
                            {money(Math.round(m.eurosPerMinute * 100))}/min
                            ajoutée
                          </small>
                        )}
                      </div>
                      <p className="route-description">{route.roadSummary}</p>
                      {route.id === cheapest?.id && (
                        <small className="economy-tag">
                          Le moins cher dans vos critères
                          {route.tollCents === 0
                            ? " · aucun péage détecté"
                            : ""}
                        </small>
                      )}
                    </button>
                  );
                })}
                <p className="list-note">
                  Frontière calculée sur les totaux complets uniquement ; les
                  tarifs inconnus peuvent modifier le classement global. Coûts
                  TTC standard, hors carburant, énergie et remises. Durées
                  arrondies à la minute ; filtres calculés sur les durées
                  précises.
                </p>
                {maxExtra < 163 && (
                  <p className="list-note">
                    L’option sans péage détecté nécessite environ +162,3 min ;
                    elle apparaît si votre plafond le permet.
                  </p>
                )}
                <details className="dominated-section">
                  <summary>
                    Autres itinéraires à tarif complet · hors frontière Pareto
                  </summary>
                  <p>
                    Trajets dominés par un compromis plus rapide et moins cher.
                    Vos filtres de temps et d’économie s’appliquent.
                  </p>
                  {!dominatedInCriteria.length && (
                    <p>Aucun autre trajet complet dans vos critères.</p>
                  )}
                  {dominatedInCriteria.map((route) => (
                    <button
                      key={route.id}
                      className={`route-card dominated-card ${active?.id === route.id ? "selected" : ""}`}
                      data-route-id={route.id}
                      aria-pressed={active?.id === route.id}
                      onClick={() => setSelected(route.id)}
                    >
                      <div className="card-top">
                        <strong>{route.id} · Tarif complet</strong>
                      </div>
                      <div className="card-numbers">
                        <strong>{duration(route.durationMinutes)}</strong>
                        <span className="toll">
                          {money(route.tollCents)} de péages
                        </span>
                        <span className="distance">
                          {decimal(route.distanceKm)} km
                        </span>
                      </div>
                      <p>
                        +{decimal(routeMetrics(route, fastest).extraMinutes)}{" "}
                        min · {money(routeMetrics(route, fastest).savingCents)}{" "}
                        économisés
                      </p>
                      <p className="route-description">{route.roadSummary}</p>
                    </button>
                  ))}
                </details>
                <details className="partial-section incomplete-section">
                  <summary>
                    {partial.length} tarifs incomplets · hors comparaison
                    monétaire
                  </summary>
                  <p>
                    Consultation géographique seulement. Ce volet respecte le
                    plafond de temps ; le seuil d’économie ne peut pas être
                    évalué.
                  </p>
                  {!partialInTime.length && (
                    <p>Aucun tarif incomplet dans votre plafond de temps.</p>
                  )}
                  {partialInTime.map((route) => (
                    <button
                      key={route.id}
                      className={`route-card partial-card ${active?.id === route.id ? "selected" : ""}`}
                      data-route-id={route.id}
                      aria-pressed={active?.id === route.id}
                      onClick={() => setSelected(route.id)}
                    >
                      <div className="card-top">
                        <strong>{route.id} · Tarif incomplet</strong>
                        <Route size={15} />
                      </div>
                      <div className="card-numbers">
                        <strong>{duration(route.durationMinutes)}</strong>
                        <span className="distance">
                          {decimal(route.distanceKm)} km
                        </span>
                      </div>
                      <p>
                        +
                        {decimal(
                          route.durationMinutes - fastest.durationMinutes,
                        )}{" "}
                        min · {money(route.pricing!.knownSubtotalCents)} connus
                        APRR, sous-total uniquement
                      </p>
                      <p className="route-description">{route.roadSummary}</p>
                      <small>
                        Part inconnue non chiffrée · aucune économie calculée
                      </small>
                    </button>
                  ))}
                </details>
              </div>
              <aside className="visual-panel">
                <div className="panel-heading">
                  <h3>Le trajet en un regard</h3>
                  <span>TRACÉ RÉEL</span>
                </div>
                {active ? (
                  <>
                    <RouteMap routeId={active.id} />
                    <div className="map-footer">
                      <span className="line-key" />
                      {active.id} · {active.roadSummary}
                      <p>
                        Géométrie Valhalla archivée, sans guidage. Tracé unique
                        : le marquage péage OSM ne suffit pas à distinguer les
                        transactions.
                      </p>
                    </div>
                    <PricingDetails route={active} />
                  </>
                ) : (
                  <p className="no-selection">
                    Aucun itinéraire sélectionné dans vos critères.
                  </p>
                )}
                <CostChart
                  routes={eligible}
                  fastest={fastest}
                  selected={active?.id}
                  selectedIsComplete={active ? isCompletePrice(active) : false}
                  maxExtra={maxExtra}
                  onSelect={setSelected}
                />
              </aside>
            </div>
          </section>
        )}
        <section className="explainer" id="recommendation">
          <span className="explainer-icon">
            <Euro size={21} />
          </span>
          <div>
            <h3>Une suggestion explicable, un choix qui vous appartient.</h3>
            <p>
              Parmi les compromis admissibles : économie − 0,20 € par minute de
              détour + une prime de 2 × l’économie par minute, plafonnée à 2
              €/min. Cette heuristique de départ peut recommander le plus
              rapide. Les tarifs incomplets sont exclus.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>routeoptimizer · Prototype V2 intermédiaire</span>
        <span>
          Crans → Le Pin uniquement · archives 2026 · aucun calcul en direct
        </span>
      </footer>
    </>
  );
}
