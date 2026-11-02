/**
 * Gestion des clients (/admin/fidelite/clients).
 * Recherche instantanée par nom ou numéro de téléphone (loyalty_search), filtres sur la liste,
 * inscription d'un client au comptoir et ouverture directe de la fiche client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, PlusIcon, SearchIcon, UsersIcon } from "../../components/icons";
import { CardRow, CardRowSkeleton, ClientsTable } from "../components/CardRow";
import { CounterSignupSheet } from "../components/CounterSignupSheet";
import { EmptyState, PageHeader } from "../components/club";
import { AdviceBox, BusyLabel, fieldClass, outlineButton, primaryButton, ring } from "../components/staffUi";
import { CLIENT_FILTERS, MAX_CARDS, filterCards, type ClientFilter } from "../lib/cardStats";
import { searchCards, type SearchItem, type SearchPage } from "../lib/staffApi";
import { searchQueryProblem, staffAdvice, type StaffAdvice } from "../lib/staffErrors";
import { useStaff } from "../StaffContext";

export const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

type Status =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; advice: StaffAdvice };

export function StaffSearchPage() {
  const { rpc, search, setSearch, program, cards, refreshCards } = useStaff();
  const [query, setQuery] = useState(search.query);
  const [page, setPage] = useState<SearchPage | null>(search.page);
  const [status, setStatus] = useState<Status>(search.page ? { kind: "ready" } : { kind: "idle" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [signup, setSignup] = useState(false);
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointValueCentimes = program?.pointValueCentimes ?? 20;

  useEffect(() => {
    if (cards.status === "idle") refreshCards();
  }, [cards.status, refreshCards]);

  const run = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      const gen = ++generation.current;
      if (trimmed === "") {
        setPage(null);
        setStatus({ kind: "idle" });
        setSearch({ query: "", page: null });
        return;
      }
      const problem = searchQueryProblem(trimmed);
      if (problem) {
        setStatus({ kind: "invalid", message: problem });
        return;
      }
      setStatus({ kind: "loading" });
      searchCards(rpc, trimmed, { limit: PAGE_SIZE })
        .then((p) => {
          if (gen !== generation.current) return;
          setPage(p);
          setStatus({ kind: "ready" });
          setSearch({ query: trimmed, page: p });
        })
        .catch((e) => {
          if (gen !== generation.current) return;
          setStatus({ kind: "error", advice: staffAdvice(e) });
        });
    },
    [rpc, setSearch],
  );

  const onChange = (value: string) => {
    setQuery(value);
    generation.current += 1;
  };

  const first = useRef(true);
  const restored = useRef(search.page !== null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!restored.current && query.trim() !== "") run(query);
      return;
    }
    const id = window.setTimeout(() => run(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, run]);

  const loadMore = () => {
    if (!page || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    searchCards(rpc, search.query, { limit: PAGE_SIZE, offset: page.offset + page.items.length })
      .then((next) => {
        if (gen !== generation.current) return;
        const merged = { ...next, offset: page.offset, items: [...page.items, ...next.items] };
        setPage(merged);
        setSearch({ query: search.query, page: merged });
      })
      .catch((e) => setStatus({ kind: "error", advice: staffAdvice(e) }))
      .finally(() => setLoadingMore(false));
  };

  const searching = query.trim() !== "";
  const base: SearchItem[] | null = searching
    ? status.kind === "ready" && page
      ? page.items
      : null
    : cards.status === "ready"
      ? cards.data.items
      : null;
  const shown = useMemo(() => (base ? filterCards(base, filter) : null), [base, filter]);
  const counts = useMemo(
    () => (base ? Object.fromEntries(CLIENT_FILTERS.map((f) => [f.id, filterCards(base, f.id).length])) : null),
    [base],
  );

  const listLoading = searching ? status.kind === "loading" : cards.status === "loading" || cards.status === "idle";
  const listError = searching
    ? status.kind === "error"
      ? status.advice
      : null
    : cards.status === "error"
      ? staffAdvice(cards.error)
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<UsersIcon className="h-5 w-5" />}
        title="Clients"
        subtitle="Recherchez un membre par nom ou téléphone, consultez son solde de points ou inscrivez un client au comptoir."
        actions={
          <button type="button" onClick={() => setSignup(true)} className={primaryButton}>
            <PlusIcon className="h-4 w-4" />
            Inscrire un client
          </button>
        }
      />

      <form role="search" onSubmit={(e) => (e.preventDefault(), run(query))} className="max-w-2xl">
        <label htmlFor="staff-search" className="mb-1.5 block text-[0.88rem] font-medium text-admin-ink">
          Nom ou numéro de téléphone
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-soft" />
          <input
            ref={inputRef}
            id="staff-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby="staff-search-status"
            aria-invalid={status.kind === "invalid" ? true : undefined}
            placeholder="ex. Bennani ou 06 12 34"
            className={`${fieldClass} pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden`}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Effacer la recherche"
              className={`absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-admin-muted hover:bg-admin-canvas hover:text-admin-ink ${ring}`}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <p
          id="staff-search-status"
          aria-live="polite"
          className={`mt-1.5 min-h-[1.2rem] text-[0.82rem] ${
            status.kind === "invalid" ? "font-medium text-admin-danger" : "text-admin-muted"
          }`}
        >
          {!searching ? "Saisissez au moins 2 lettres du nom ou 3 chiffres du numéro." : null}
          {status.kind === "invalid" ? status.message : null}
          {searching && status.kind === "loading" ? "Recherche en cours…" : null}
          {searching && status.kind === "ready" && page
            ? `${page.items.length}${page.hasMore ? "+" : ""} client${page.items.length > 1 ? "s" : ""} trouvé${page.items.length > 1 ? "s" : ""}.`
            : null}
        </p>
      </form>

      <div
        role="group"
        aria-label="Filtrer la liste affichée"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {CLIENT_FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
              className={`inline-flex min-h-[38px] shrink-0 items-center gap-2 rounded-xl px-3.5 text-[0.84rem] font-semibold transition-colors ${ring} ${
                active
                  ? "bg-admin-accent text-white shadow-admin-xs"
                  : "border border-admin-lineStrong bg-white text-admin-muted hover:bg-admin-canvas hover:text-admin-ink"
              }`}
            >
              {f.label}
              {counts ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.74rem] ${
                    active ? "bg-white/20 text-white" : "bg-admin-canvas text-admin-muted"
                  }`}
                >
                  {counts[f.id]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {listLoading ? <CardRowSkeleton rows={5} /> : null}
      {listError ? <AdviceBox advice={listError} onRetry={searching ? () => run(query) : refreshCards} /> : null}

      {shown && shown.length === 0 ? (
        searching && filter === "all" ? (
          <EmptyState icon={<SearchIcon className="h-5 w-5" />} title={`Aucun client trouvé pour « ${search.query} »`}>
            Vérifiez l&apos;orthographe, essayez le nom de famille seul ou quelques chiffres du numéro de téléphone.
          </EmptyState>
        ) : base && base.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title="Aucun client inscrit"
            action={
              <button type="button" onClick={() => setSignup(true)} className={primaryButton}>
                Inscrire un client
              </button>
            }
          >
            Les clients créent leur carte en ligne sur /fidelite, ou vous les inscrivez au comptoir.
          </EmptyState>
        ) : (
          <EmptyState title="Aucune carte dans ce filtre">Le filtre porte sur la liste affichée.</EmptyState>
        )
      ) : null}

      {shown && shown.length > 0 ? (
        <>
          <ul className="space-y-2 lg:hidden">
            {shown.map((item) => (
              <CardRow key={item.cardId} item={item} pointValueCentimes={pointValueCentimes} />
            ))}
          </ul>
          <div className="hidden lg:block">
            <ClientsTable items={shown} pointValueCentimes={pointValueCentimes} />
          </div>
        </>
      ) : null}

      {searching && page?.hasMore && status.kind === "ready" ? (
        <div className="rounded-xl border border-admin-line bg-white px-4 py-4 text-center">
          <p className="text-[0.86rem] text-admin-muted">
            D&apos;autres cartes correspondent. Précisez la recherche ou chargez la suite.
          </p>
          <button type="button" onClick={loadMore} disabled={loadingMore} className={`${outlineButton} mt-3`}>
            <BusyLabel busy={loadingMore} idle={`Afficher ${PAGE_SIZE} clients de plus`} pending="Chargement…" />
          </button>
        </div>
      ) : null}
      {!searching && cards.status === "ready" && !cards.data.complete ? (
        <p className="text-[0.8rem] text-admin-muted">
          Liste limitée aux {MAX_CARDS} cartes les plus récentes : utilisez la barre de recherche pour retrouver une
          carte plus ancienne.
        </p>
      ) : null}

      {signup ? (
        <CounterSignupSheet
          onClose={(created) => {
            setSignup(false);
            if (created) refreshCards();
          }}
        />
      ) : null}
    </div>
  );
}
