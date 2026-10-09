/**
 * Recherche du menu : loupe dans le header → panneau sous le header (champ + suggestions).
 * On ne navigue jamais à la frappe : seulement au choix d'une suggestion (clic, toucher, Entrée).
 * Aucun ajout rapide : la suggestion mène au plat dans le menu, qui garde ses choix habituels.
 * Fermeture : bouton, Échap, clic hors du panneau — la page reste où elle était.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { YumloMenuItem } from "../data/yumloMenu";
import { searchMenu, type SearchMatch } from "../menu/menuSearch";

type Props = {
  menu: { categories: readonly string[]; items: readonly YumloMenuItem[] };
  /** Hauteur du header fixe : le panneau s'ouvre juste dessous. */
  headerHeight: () => number;
  /** Choix d'une suggestion ; `matches` = toutes les suggestions de la requête (navigation entre plats). */
  onSelect: (match: SearchMatch, matches: SearchMatch[], query: string) => void;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function MenuSearch({ menu, headerHeight, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [top, setTop] = useState(56);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef(true);
  const listId = useId();
  const matches = useMemo(() => searchMenu(menu, query), [menu, query]);

  useEffect(() => setActive(0), [query]);

  // Ouverture : panneau sous le header, page figée (sa position ne change pas), focus dans le champ.
  useLayoutEffect(() => {
    if (!open) return;
    setTop(headerHeight());
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus({ preventScroll: true });
    // Recherche précédente gardée mais sélectionnée : taper la remplace.
    inputRef.current?.select();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, headerHeight]);

  // Fermeture sans choix : le focus revient à la loupe.
  useEffect(() => {
    if (open || !restoreFocus.current) return;
    buttonRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Suggestion active toujours visible dans la liste.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = (focusButton = true) => {
    restoreFocus.current = focusButton;
    setOpen(false);
  };
  const choose = (match: SearchMatch) => {
    close(false);
    onSelect(match, matches, query);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" && matches.length > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp" && matches.length > 0) {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    }
  };

  const trimmed = query.trim();
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          restoreFocus.current = true;
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Rechercher un plat ou une catégorie"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-kaytori-gold/40 text-kaytori-goldLight transition-colors hover:border-kaytori-gold/70 active:bg-white/10 sm:h-10 sm:w-10"
      >
        <SearchIcon className="h-[1.15rem] w-[1.15rem]" />
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-50" style={{ top }} role="presentation">
              <div className="absolute inset-0 bg-kaytori-black/45 backdrop-blur-[1px]" onClick={() => close()} aria-hidden />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Rechercher dans le menu"
                className="relative mx-auto flex max-h-full w-full max-w-5xl flex-col bg-[#fafaf7] shadow-[0_12px_30px_-12px_rgba(10,15,13,0.45)] sm:max-h-[min(70vh,560px)] sm:rounded-b-2xl"
              >
                <div className="flex items-center gap-2 border-b border-kaytori-black/[0.07] px-3 py-2.5 sm:px-6">
                  <SearchIcon className="h-5 w-5 shrink-0 text-kaytori-green/70" />
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Wok, saumon, california…"
                    enterKeyHint="go"
                    autoComplete="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={matches.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={matches[active] ? optionId(active) : undefined}
                    aria-label="Plat ou catégorie"
                    className="min-h-[44px] min-w-0 flex-1 bg-transparent font-sans text-[1rem] text-kaytori-black outline-none placeholder:text-kaytori-muted/70 [&::-webkit-search-cancel-button]:hidden"
                  />
                  <button
                    type="button"
                    onClick={() => close()}
                    className="min-h-[44px] shrink-0 rounded-full px-3 font-sans text-[0.8rem] font-semibold text-kaytori-green hover:bg-kaytori-green/[0.06]"
                  >
                    Fermer
                  </button>
                </div>

                {trimmed && matches.length === 0 ? (
                  <p className="px-4 py-6 text-center font-sans text-[0.86rem] text-kaytori-muted sm:px-6" role="status">
                    Aucun plat ni catégorie pour « {trimmed} ».
                  </p>
                ) : null}
                {!trimmed ? (
                  <p className="px-4 py-4 font-sans text-[0.8rem] text-kaytori-muted sm:px-6">
                    Tapez un plat ou une catégorie, puis choisissez une suggestion.
                  </p>
                ) : null}
                <ul ref={listRef} id={listId} role="listbox" aria-label="Suggestions" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                  {matches.map((m, i) => (
                    <li
                      key={m.kind === "category" ? `c:${m.category}` : `p:${m.item.id}`}
                      id={optionId(i)}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(m)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 sm:px-6 ${
                        i === active ? "bg-kaytori-green/[0.07]" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-[0.95rem] font-semibold text-kaytori-black">
                          {m.kind === "category" ? m.category : m.displayName}
                        </span>
                        <span className="block truncate font-sans text-[0.72rem] text-kaytori-muted">
                          {m.kind === "category" ? `Catégorie · ${m.count} plat${m.count > 1 ? "s" : ""}` : m.item.category}
                        </span>
                      </span>
                      <span className="shrink-0 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-kaytori-green/80" aria-hidden>
                        {m.kind === "category" ? "Voir la section" : "Voir le plat"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
