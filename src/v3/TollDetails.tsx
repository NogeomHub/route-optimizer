import type { DynamicRoute } from "./provider";
import { complete, euros, priceLabel } from "./pricing";
const date = (value: string) => value.split("-").reverse().join("/");
export function TollDetails({ route }: { route: DynamicRoute }) {
  const p = route.pricing;
  if (!p) return null;
  return (
    <details className="v3-toll-details">
      <summary>Détail du péage</summary>
      <p>
        {priceLabel(route)} · Classe {p.vehicleClass} standard, sans remise.
      </p>
      {p.components.map((c, i) => (
        <div key={i} className="v3-toll-component">
          <strong>
            {c.operator} · {c.entry} → {c.exit}
          </strong>
          <p>
            {c.status === "verified" && c.cents !== null
              ? euros(c.cents)
              : c.status === "stale"
                ? "Tarif à vérifier — montant non appliqué"
                : c.operator === "ALIAE"
                  ? "Section A79 non tarifée : aucune grille 2026 vérifiée"
                  : "Montant non disponible"}
          </p>
          {c.effectiveFrom && (
            <p>
              Classe {c.vehicleClass} · applicable depuis le{" "}
              {date(c.effectiveFrom)}
              {c.verifiedThrough
                ? ` · vérifié jusqu’au ${date(c.verifiedThrough)}`
                : ""}
            </p>
          )}
          {c.source && (
            <>
              <a href={c.source.url} target="_blank" rel="noreferrer">
                Source officielle {c.operator}
              </a>
              <small>{c.source.locator}</small>
            </>
          )}
        </div>
      ))}
      {p.status === "partial" && (
        <p>
          <strong>{euros(p.knownSubtotalCents)} identifiés seulement.</strong>{" "}
          Le coût total reste inconnu ; aucune économie calculée.
        </p>
      )}
      {p.reasons?.includes("COVERAGE_INCOMPLETE") && (
        <p>Certaines portions n’ont pas de tarif suffisamment vérifié.</p>
      )}
      {p.status === "unavailable" && (
        <p>
          Le parcours ou son analyse ne relève pas de notre couverture tarifaire
          vérifiée.
        </p>
      )}
      {p.status === "stale" && (
        <p>
          La date de cette recherche dépasse la période vérifiée. Le tarif doit
          être contrôlé avant utilisation.
        </p>
      )}
      {complete(route) && p.evidenceBasis === "road_data_zero" && (
        <p>
          Gratuité fondée sur les données routières auditées et l’absence de
          passage payant détecté, sans confirmation de facturation par un
          opérateur.
        </p>
      )}
    </details>
  );
}
