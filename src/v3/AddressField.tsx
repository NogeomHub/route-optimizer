import { useEffect, useState } from "react";
import { provider, type Place } from "./provider";
export function AddressField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { text: string; place?: Place };
  onChange: (v: { text: string; place?: Place }) => void;
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(-1);
  const id = label === "Départ" ? "origin" : "destination";
  useEffect(() => {
    setSuggestions([]);
    setMessage("");
    setActive(-1);
    if (value.place || value.text.trim().length < 3) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setMessage("Recherche d’adresses…");
      provider
        .geocode(value.text, abort.signal)
        .then((items) => {
          if (abort.signal.aborted) return;
          setSuggestions(items);
          setMessage(
            items.length
              ? "Choisissez explicitement une adresse ci-dessous."
              : "Adresse introuvable. Précisez la commune ou le code postal.",
          );
        })
        .catch((e) => {
          if (!abort.signal.aborted) setMessage(e.message);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [value.text, value.place]);
  const choose = (place: Place) => {
    onChange({ text: place.label, place });
    setSuggestions([]);
    setMessage("");
  };
  return (
    <div className="v3-address">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value.text}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={id + "-list"}
        aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
        onChange={(e) => onChange({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && active >= 0 && suggestions[active]) {
            e.preventDefault();
            choose(suggestions[active]);
          }
          if (e.key === "Escape") setSuggestions([]);
        }}
      />
      {value.place && <small>Adresse confirmée</small>}
      <small role="status">{message}</small>
      <ul id={id + "-list"} role="listbox">
        {suggestions.map((p, i) => (
          <li
            role="option"
            aria-selected={i === active}
            id={id + "-" + i}
            key={p.label + p.lat + p.lon}
          >
            <button type="button" onClick={() => choose(p)}>
              {p.label}
              <small>
                {p.postcode} · {p.city} · {p.type} · IGN
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
