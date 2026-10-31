import { useEffect, useState, type ReactNode } from "react";
/** Only selected by the Netlify build. Secrets are entered at runtime, never bundled or persisted by JS. */
export function HostedAccess({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const expired = () => {
      setAuthenticated(false);
      setError("Reconnectez-vous pour poursuivre.");
    };
    window.addEventListener("v3-auth-required", expired);
    fetch("/api/session", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error();
        setAuthenticated((await r.json()).authenticated === true);
      })
      .catch(() => setError("Service temporairement indisponible."))
      .finally(() => setChecking(false));
    return () => window.removeEventListener("v3-auth-required", expired);
  }, []);
  if (checking) return <p role="status">Vérification de l’accès personnel…</p>;
  if (authenticated)
    return (
      <>
        <div className="v3-header">
          <span>Accès personnel</span>
          <button
            onClick={async () => {
              try {
                const r = await fetch("/api/session", { method: "DELETE" });
                if (!r.ok) throw Error();
                setAuthenticated(false);
              } catch {
                setAuthenticated(false);
                setError("Déconnexion non confirmée. Réessayez.");
              }
            }}
          >
            Se déconnecter
          </button>
        </div>
        {children}
      </>
    );
  return (
    <main className="v3-shell">
      <section className="v3-panel">
        <h1>Route Optimizer · accès personnel</h1>
        <p>Saisissez votre clé d’accès pour utiliser V3.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              setToken("");
              if (!r.ok) {
                setError(
                  r.status === 401
                    ? "Clé d’accès incorrecte."
                    : "Service temporairement indisponible.",
                );
                return;
              }
              setAuthenticated(true);
            } catch {
              setToken("");
              setError("Service temporairement indisponible.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Clé d’accès
            <input
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              maxLength={256}
            />
          </label>
          <button className="v3-primary" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
