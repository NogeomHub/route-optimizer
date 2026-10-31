import { useEffect, useState } from "react";
import { AddressField } from "./AddressField";
import { Results } from "./Results";
import { monetaryView } from "./pricing";
import { provider, friendly, type Job, type Place } from "./provider";
import "./v3.css";
type Field = { text: string; place?: Place };
const running = (status?: string) =>
  ["queued", "running", "cancel_requested"].includes(status ?? "");
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
  const [minimumSaving, setMinimumSaving] = useState(0);
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
  const monetary = monetaryView(routes, extra, minimumSaving);
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
      : job?.progress.stage === "tarification"
        ? "Calcul des péages vérifiés…"
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
                type="number"
                min="0"
                step="0.50"
                disabled={!monetary.reference}
                value={minimumSaving / 100}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setMinimumSaving(
                    Number.isFinite(value)
                      ? Math.max(0, Math.round(value * 100))
                      : 0,
                  );
                }}
                aria-label="Économie minimale"
              />
              <small>
                {monetary.reference
                  ? "En euros, uniquement pour les tarifs complets comparables."
                  : "Disponible si le trajet le plus rapide a un tarif complet."}
              </small>
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
        {job && routes.length > 0 && (
          <Results
            job={job}
            extra={extra}
            minimumSaving={minimumSaving}
            selection={selection}
            onSelect={setSelection}
            labels={snapshot}
          />
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
