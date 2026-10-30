import { useEffect, useState } from "react";
import { AddressField } from "./AddressField";
import { LiveMap } from "./LiveMap";
import { provider, pareto, friendly, type Job, type Place } from "./provider";
import "./v3.css";
type Field = { text: string; place?: Place };
const running = (status?: string) =>
  ["queued", "running", "cancel_requested"].includes(status ?? "");
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
export default function V3App() {
  const [origin, setOrigin] = useState<Field>({ text: "" });
  const [destination, setDestination] = useState<Field>({ text: "" });
  const [id, setId] = useState(() => localStorage.getItem("v3-job") ?? "");
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [reused, setReused] = useState(false);
  const [selection, setSelection] = useState("");
  const [extra, setExtra] = useState(45);
  const [snapshot, setSnapshot] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("v3-labels") ?? '["Départ","Arrivée"]',
      ) as string[];
    } catch {
      return ["Départ", "Arrivée"];
    }
  });
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await provider.poll(id);
        if (disposed) return;
        setJob(next);
        setError("");
        if (running(next.status)) timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!disposed) {
          setError((e as Error).message);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id]);
  const routes = job?.result?.routes ?? [];
  const fastest = Math.min(...routes.map((r) => r.durationSeconds));
  const eligible = routes.filter(
    (r) => r.durationSeconds - fastest <= extra * 60,
  );
  const frontier = pareto(eligible);
  const least = [...frontier].sort(
    (a, b) =>
      a.tollExposure!.tollKm - b.tollExposure!.tollKm ||
      a.durationSeconds - b.durationSeconds,
  )[0];
  const selected =
    eligible.find((r) => r.id === selection) ?? frontier[0] ?? eligible[0];
  async function launch() {
    if (!origin.place || !destination.place) {
      setError(
        "Choisissez une suggestion IGN pour le départ et la destination. Plusieurs lieux peuvent porter le même nom.",
      );
      return;
    }
    setLaunching(true);
    setError("");
    try {
      const result = await provider.search(origin.place, destination.place);
      const labels = [origin.place.label, destination.place.label];
      setSnapshot(labels);
      localStorage.setItem("v3-labels", JSON.stringify(labels));
      setJob(undefined);
      setSelection("");
      setReused(result.reused && result.status === "completed");
      localStorage.setItem("v3-job", result.jobId);
      setId(result.jobId);
      // A cache hit may return the very same job ID, so refresh explicitly too.
      setJob(await provider.poll(result.jobId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(false);
    }
  }
  async function action(name: "cancel" | "resume") {
    try {
      await provider[name](id);
      setJob(await provider.poll(id));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const active = running(job?.status);
  const stage =
    job?.progress.stage === "analyse"
      ? "Analyse des sections à péage…"
      : job?.progress.stage === "optimisation"
        ? "Classement des itinéraires…"
        : "Recherche des itinéraires…";
  return (
    <div className="v3-shell">
      <header className="v3-header">
        <a href="/">Route Optimizer</a>
        <span>V3 · personnel · local</span>
      </header>
      <main>
        <section className="v3-intro">
          <p className="v3-eyebrow">PRENEZ LE TEMPS DE CHOISIR</p>
          <h1>
            Votre trajet.
            <br />
            Vos compromis.
          </h1>
          <p>
            Comparez des itinéraires réels selon leur durée et leur exposition
            aux routes marquées à péage.
          </p>
        </section>
        <section className="v3-panel" aria-label="Rechercher un trajet">
          <div className="v3-fields">
            <AddressField label="Départ" value={origin} onChange={setOrigin} />
            <button
              className="v3-swap"
              aria-label="Inverser départ et destination"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
            >
              ⇄
            </button>
            <AddressField
              label="Destination"
              value={destination}
              onChange={setDestination}
            />
          </div>
          <div className="v3-controls">
            <label>
              Détour maximal : <strong>{extra} min</strong>
              <input
                aria-label="Détour maximal"
                type="range"
                min="0"
                max="180"
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
            </label>
            <label>
              Économie minimale
              <input
                disabled
                value="Indisponible sans tarif fiable"
                aria-label="Économie minimale"
                readOnly
              />
            </label>
            <button
              className="v3-primary"
              disabled={launching || active}
              onClick={launch}
            >
              {launching ? "Lancement…" : "Comparer les itinéraires"}
            </button>
          </div>
          <small>
            Les lieux restent modifiables pendant le calcul. Les résultats
            portent sur{" "}
            {id ? snapshot.join(" → ") : "le trajet confirmé au lancement"}.
          </small>
        </section>
        {error && (
          <p role="alert" className="v3-notice">
            {error}
          </p>
        )}
        {job && (
          <section className="v3-panel" aria-label="Progression">
            <div role="status" aria-live="polite">
              <h2>
                {active
                  ? stage
                  : job.status === "completed"
                    ? "Comparaison terminée"
                    : job.status === "cancelled"
                      ? "Recherche annulée"
                      : "Résultat incomplet"}
              </h2>
              <p>
                {job.progress.profilesExecuted} / {job.progress.profileCeiling}{" "}
                profils analysés · {job.progress.uniqueGeometries} itinéraires
                différents trouvés · {job.progress.analyzed} analyses de péage
              </p>
            </div>
            {active && (
              <>
                <progress
                  max={40}
                  value={job.progress.profilesExecuted}
                  aria-label="Profils analysés"
                />
                <p>
                  Plafond de recherche, sans estimation de durée restante.
                  L’arrêt peut intervenir avant 40 profils.
                </p>
                <button
                  disabled={job.status === "cancel_requested"}
                  onClick={() => action("cancel")}
                >
                  {job.status === "cancel_requested"
                    ? "Annulation en cours…"
                    : "Annuler"}
                </button>
                <button onClick={() => action("resume")}>
                  Reprendre un calcul interrompu
                </button>
              </>
            )}
            {job.status === "failed" && (
              <p role="alert">{friendly(job.error?.code)}</p>
            )}
            {reused && <p>Résultat récupéré depuis le cache</p>}
            {job.result?.stopReason === "experimental_no_toll_after_9" && (
              <p>
                Arrêt expérimental après neuf sondes identiques et analyses sans
                exposition détectée. Ce n’est pas une garantie d’optimum global.
              </p>
            )}
          </section>
        )}
        {routes.length > 0 && (
          <section aria-label="Résultats">
            <div className="v3-results-heading">
              <h2>Compromis temps / exposition au péage</h2>
              <p>
                {job?.status !== "completed"
                  ? "Résultats provisoires — analyses et classement peuvent évoluer."
                  : "Parmi les itinéraires explorés."}{" "}
                L’exposition n’est PAS le prix du péage.
              </p>
              <p>Trajet calculé : {snapshot.join(" → ")}</p>
            </div>
            <div className="v3-results">
              <div>
                <div className="v3-chart">
                  <h3>Votre temps, votre exposition</h3>
                  <p>
                    Horizontal : temps supplémentaire (min) · Vertical :
                    exposition (km)
                  </p>
                  <svg
                    viewBox="0 0 540 270"
                    role="group"
                    aria-label="Graphique temps et exposition"
                  >
                    <path d="M45 15V230H520" fill="none" stroke="#789385" />
                    {[0, 0.5, 1].map((t) => (
                      <g key={t}>
                        <text x={3} y={230 - t * 195}>
                          {Math.round(
                            t *
                              Math.max(
                                1,
                                ...frontier.map((r) => r.tollExposure!.tollKm),
                              ),
                          )}
                        </text>
                        <text x={45 + t * 450} y={253}>
                          {(
                            t *
                            Math.max(
                              1,
                              ...frontier.map(
                                (r) => (r.durationSeconds - fastest) / 60,
                              ),
                            )
                          ).toFixed(1)}
                        </text>
                      </g>
                    ))}
                    {frontier.map((r) => (
                      <circle
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Sélectionner ${r.id}`}
                        aria-pressed={selected?.id === r.id}
                        cx={
                          45 +
                          ((r.durationSeconds - fastest) /
                            60 /
                            Math.max(
                              1,
                              ...frontier.map(
                                (r) => (r.durationSeconds - fastest) / 60,
                              ),
                            )) *
                            450
                        }
                        cy={
                          230 -
                          (r.tollExposure!.tollKm /
                            Math.max(
                              1,
                              ...frontier.map((r) => r.tollExposure!.tollKm),
                            )) *
                            195
                        }
                        r={selected?.id === r.id ? 9 : 6}
                        fill={selected?.id === r.id ? "#e0ac54" : "#286b54"}
                        onClick={() => setSelection(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelection(r.id);
                          }
                        }}
                      >
                        <title>
                          {r.id} : +{minutes(r.durationSeconds - fastest)},{" "}
                          {r.tollExposure!.tollKm.toFixed(1)} km exposés
                        </title>
                      </circle>
                    ))}
                  </svg>
                </div>
                <div className="v3-routes">
                  {eligible.map((r) => (
                    <button
                      key={r.id}
                      className={`v3-route ${selected?.id === r.id ? "selected" : ""}`}
                      aria-pressed={selected?.id === r.id}
                      onClick={() => setSelection(r.id)}
                    >
                      <span className="v3-route-title">
                        {r.id}{" "}
                        {r.durationSeconds === fastest
                          ? "· Le plus rapide"
                          : ""}{" "}
                        {r.id === least?.id
                          ? "· Le moins exposé parmi les compromis"
                          : ""}
                      </span>
                      <strong>
                        {minutes(r.durationSeconds)} · {r.distanceKm.toFixed(1)}{" "}
                        km
                      </strong>
                      <span>
                        +{minutes(r.durationSeconds - fastest)} ·{" "}
                        {r.tollExposure
                          ? `${r.tollExposure.tollKm.toFixed(1)} km marqués à péage`
                          : "Exposition en cours d’analyse"}
                      </span>
                      <span>
                        Tarif non disponible{" "}
                        {frontier.some((p) => p.id === r.id)
                          ? "· Compromis temps / exposition"
                          : ""}
                      </span>
                    </button>
                  ))}
                </div>
                {eligible.length === 0 && (
                  <p>Aucun itinéraire ne respecte ce plafond.</p>
                )}
              </div>
              <div className="v3-map">
                {selected && (
                  <LiveMap
                    routeId={selected.id}
                    geometryUrl={selected.geometryUrl}
                    origin={snapshot[0]}
                    destination={snapshot[1]}
                  />
                )}
              </div>
            </div>
          </section>
        )}
        <footer>
          Usage local personnel uniquement · Géocodage IGN Géoplateforme ·
          Données ©{" "}
          <a href="https://www.openstreetmap.org/copyright">
            OpenStreetMap contributors
          </a>
          ,{" "}
          <a href="https://opendatacommons.org/licenses/odbl/index.html">
            ODbL
          </a>{" "}
          ·{" "}
          <a href="https://www.openstreetmap.org/fixthemap">
            Signaler une erreur cartographique
          </a>
          . Aucune conversion des kilomètres en euros. Aucun trafic actualisé ni
          guidage garanti.
        </footer>
      </main>
    </div>
  );
}
