import type { RouteCandidate } from "../domain/types";
import { isCompletePrice, money } from "../pricing/pricing";
export function PricingDetails({ route }: { route: RouteCandidate }) {
  const price = route.pricing;
  if (!price) return null;
  return (
    <details className="pricing-details">
      <summary>Origine du tarif · {route.id}</summary>
      <p>
        {isCompletePrice(route)
          ? `Total documenté : ${money(route.tollCents)}`
          : "Tarif incomplet"}{" "}
        · TTC standard classe 1 · grille APRR au 1er février 2026, sans remise.
        Données expérimentales auditées, sans validation de facturation sur le
        terrain.
      </p>
      <ul>
        {price.sections.map((s, i) => (
          <li key={i}>
            {s.entry} → {s.exit} : <strong>{money(s.cents)}</strong> ·{" "}
            <a
              href={`https://voyage.aprr.fr/sites/default/files/2026-02/TARIFS_APRR.pdf#page=${s.pdfPage}`}
              target="_blank"
              rel="noreferrer"
            >
              PDF, page {s.pdfPage}
            </a>
          </li>
        ))}
      </ul>
      {!isCompletePrice(route) && (
        <>
          <p>
            <strong>
              {money(price.knownSubtotalCents)} connus APRR — sous-total, jamais
              un total de trajet.
            </strong>
          </p>
          <ul>
            {price.uncertainties.map((u, i) => (
              <li key={i}>
                {u.operator.startsWith("ALIAE")
                  ? "A79 / ALIAE : tarif non résolu."
                  : u.entry?.includes("LOING")
                    ? "A77 : correspondance de la gare Val-de-Loing à confirmer."
                    : `${u.entry ?? "Entrée"} → ${u.exit ?? "sortie"} : correspondance de gare non confirmée.`}
              </li>
            ))}
          </ul>
        </>
      )}
      {isCompletePrice(route) && route.tollCents === 0 && (
        <p>
          Aucun péage détecté dans les archives ; ce statut dépend de
          l’exactitude des données routières.
        </p>
      )}
      <a
        href="https://github.com/NogeomHub/route-optimizer/blob/experiment/valhalla-hybrid-poc/experiments/tolls/REPORT.md"
        target="_blank"
        rel="noreferrer"
      >
        Lire l’audit tarifaire complet
      </a>
    </details>
  );
}
