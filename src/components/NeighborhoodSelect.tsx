import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterNeighborhoods, type Neighborhood } from "../cart/checkout";

const inputClass =
  "block w-full rounded-xl border bg-white px-3.5 py-3 font-sans text-[16px] leading-snug text-kaytori-black placeholder:text-kaytori-muted/70 transition-colors focus:border-kaytori-green focus:outline-none focus:ring-2 focus:ring-kaytori-green/20";

type Props = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  describedBy?: string;
  invalid?: boolean;
};

/**
 * Liste déroulante searchable des quartiers (sans dépendance). Sur mobile Safari : champ 16 px,
 * liste max-height scrollable, sélection au tap / clavier.
 */
export function NeighborhoodSelect({ id, value, onChange, describedBy, invalid }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  const options = useMemo(() => filterNeighborhoods(open ? query : ""), [open, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const select = (n: Neighborhood) => {
    onChange(n);
    setQuery(n);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (open && options[highlight]) {
        e.preventDefault();
        select(options[highlight]);
      }
      return;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[highlight] ? `${listId}-opt-${highlight}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Rechercher un quartier…"
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Toute saisie libre invalide la sélection tant qu'une option n'est pas choisie.
          if (e.target.value !== value) onChange("");
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`${inputClass} ${invalid ? "border-red-600/70" : "border-kaytori-green/20"}`}
      />
      {value ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Effacer le quartier"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(true);
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-kaytori-muted hover:bg-kaytori-green/[0.06] hover:text-kaytori-green"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-[min(40vh,280px)] w-full overflow-y-auto overscroll-y-contain rounded-xl border border-kaytori-green/20 bg-white py-1 shadow-lift"
        >
          {options.length === 0 ? (
            <li className="px-3.5 py-3 font-sans text-[0.84rem] text-kaytori-muted">Aucun quartier trouvé</li>
          ) : (
            options.map((n, i) => {
              const active = i === highlight;
              const selected = n === value;
              return (
                <li
                  key={n}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(n);
                  }}
                  className={`cursor-pointer px-3.5 py-2.5 font-sans text-[0.88rem] leading-snug ${
                    active ? "bg-kaytori-green/[0.08] text-kaytori-black" : "text-kaytori-black"
                  } ${selected ? "font-semibold" : "font-medium"}`}
                >
                  {n}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
