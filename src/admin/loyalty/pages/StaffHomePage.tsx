/**
 * Tableau de bord de l'administration de la fidélité (/admin/fidelite).
 * Affiche les indicateurs réels du programme de points (loyalty_stats + cartes),
 * les dernières opérations enregistrées, les derniers clients inscrits et l'état de la configuration.
 * Aucun bouton « Scanner une carte » : le scan QR se fait via l'appareil photo du manager sur /fidelite/scan/:code.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminLink } from "../../components/AdminLink";
import { ChartIcon, CoinsIcon, GiftIcon, SearchIcon, UsersIcon } from "../../components/icons";
import { navigate } from "../../hooks/useAdminPath";
import { CardRow, CardRowSkeleton } from "../components/CardRow";
import { ClubPanel, ColumnChart, EmptyState, KpiCard, PageHeader } from "../components/club";
import { AdviceBox, Pill, fieldClass, panel, primaryButton, ring } from "../components/staffUi";
import { BALANCE_BRACKETS, MAX_CARDS, RECENT_DAYS, summarizeCards } from "../lib/cardStats";
import { formatCentimes, formatEarningRule, formatPoints, pointsValueLabel } from "../lib/points";
import { fetchStaffStats, type StaffProgram, type StaffStats } from "../lib/staffApi";
import { staffAdvice } from "../lib/staffErrors";
import { EVENT_LABELS, formatDateTime } from "../lib/staffFormat";
import { STAFF_ROUTES, staffCardPath } from "../routes";
import { useStaff } from "../StaffContext";

const count = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/\s/g, " ");
const weekLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Casablanca" });
const weekShort = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Africa/Casablanca" });

export function ProgramNotice({ program }: { program: StaffProgram | null }) {
  if (!program) return null;
  const lines: string[] = [];
  if (!program.isActive) {
    lines.push("Programme fermé : aucune inscription ni attribution de points. Les points déjà acquis restent utilisables.");
  }
  if (program.earningPoints === null || program.earningDirhams === null) {
    lines.push("Le taux d'attribution des points par dirham dépensé n'est pas encore configuré.");
  }
  if (program.activeRewardsCount === 0 && program.rewardLabel === null) {
    lines.push("Aucune récompense active n'est encore configurée au catalogue.");
  }
  if (lines.length === 0) return null;
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-[0.88rem] leading-snug ${
        program.isActive
          ? "border-admin-warn/30 bg-admin-warnSoft text-admin-warn"
          : "border-admin-danger/30 bg-admin-dangerSoft text-admin-danger"
      }`}
      role="status"
    >
      {lines.map((l) => (
        <p key={l} className="font-medium [&+&]:mt-1">
          {l}
        </p>
      ))}
    </div>
  );
}

export function StaffHomePage() {
  const { rpc, program, reloadProgram, setSearch, cards, refreshCards } = useStaff();
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState<StaffStats | null>(null);

  const loadStats = useCallback(() => {
    void fetchStaffStats(rpc)
      .then(setStats)
      .catch(() => setStats(null));
  }, [rpc]);

  useEffect(() => {
    refreshCards();
    reloadProgram();
    loadStats();
  }, [refreshCards, reloadProgram, loadStats]);

  const data = cards.status === "ready" ? cards.data : null;
  const summary = useMemo(() => (data ? summarizeCards(data.items, Date.now()) : null), [data]);
  const pointValueCentimes = stats?.pointValueCentimes ?? program?.pointValueCentimes ?? 20;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch({ query: query.trim(), page: null });
    navigate(STAFF_ROUTES.clients);
  };

  const totalClients = stats?.totalCards ?? summary?.total ?? null;
  const suspendedClients = stats?.suspendedCards ?? summary?.suspended ?? 0;
  const pointsCirculation = stats?.pointsInCirculation ?? summary?.totalPointsBalance ?? null;
  const pointsEarned = stats?.pointsEarnedTotal ?? null;
  const pointsSpent = stats?.pointsSpentTotal ?? null;
  const rewardsRedeemed = stats?.rewardsRedeemedTotal ?? summary?.totalRewardsRedeemed ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        accent="Kaytôri Club"
        subtitle="Vue d'ensemble opérationnelle du programme de fidélité par points."
      />

      {/* Recherche rapide d'un client */}
      <form onSubmit={submit} role="search" className="max-w-2xl">
        <label htmlFor="staff-home-search" className="sr-only">
          Rechercher un client par nom ou numéro de téléphone
        </label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-soft" />
            <input
              id="staff-home-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un client par nom ou téléphone…"
              className={`${fieldClass} pl-10`}
            />
          </div>
          <button type="submit" className={primaryButton}>
            Chercher
          </button>
        </div>
      </form>

      <ProgramNotice program={program} />

      {/* ------------------------------------------------ indicateurs principaux */}
      {cards.status === "error" ? <AdviceBox advice={staffAdvice(cards.error)} onRetry={refreshCards} /> : null}
      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {totalClients !== null ? (
          <>
            <KpiCard
              icon={<UsersIcon className="h-5 w-5" />}
              label="Clients inscrits"
              value={count(totalClients)}
              note={
                suspendedClients > 0
                  ? `dont ${count(suspendedClients)} carte${suspendedClients > 1 ? "s" : ""} suspendue${suspendedClients > 1 ? "s" : ""}`
                  : summary
                    ? `${count(summary.recentVisitors)} actif${summary.recentVisitors > 1 ? "s" : ""} ces ${RECENT_DAYS} jours`
                    : "toutes les cartes sont actives"
              }
            />
            <KpiCard
              icon={<CoinsIcon className="h-5 w-5" />}
              label="Points en circulation"
              value={pointsCirculation !== null ? formatPoints(pointsCirculation) : null}
              note={
                pointsCirculation !== null
                  ? `Contre-valeur : ${pointsValueLabel(pointsCirculation, pointValueCentimes)}`
                  : undefined
              }
            />
            <KpiCard
              icon={<ChartIcon className="h-5 w-5" />}
              label="Points attribués au total"
              value={pointsEarned !== null ? formatPoints(pointsEarned) : pointsCirculation !== null ? formatPoints(pointsCirculation) : null}
              note={
                pointsSpent !== null
                  ? `dont ${formatPoints(pointsSpent)} point${pointsSpent > 1 ? "s" : ""} utilisé${pointsSpent > 1 ? "s" : ""}`
                  : "cumul historique des points crédités"
              }
            />
            <KpiCard
              icon={<GiftIcon className="h-5 w-5" />}
              label="Récompenses échangées"
              value={rewardsRedeemed !== null ? count(rewardsRedeemed) : null}
              note={
                program
                  ? `${program.activeRewardsCount} récompense${program.activeRewardsCount > 1 ? "s" : ""} active${program.activeRewardsCount > 1 ? "s" : ""} au catalogue`
                  : undefined
              }
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${panel} h-28 motion-safe:animate-pulse`} aria-hidden />
          ))
        )}
      </section>
      {data && !data.complete ? (
        <p className="text-[0.8rem] text-admin-muted">
          Liste locale limitée aux {count(MAX_CARDS)} cartes les plus récentes.
        </p>
      ) : null}

      {/* ------------------------------------------------ graphiques d'activité et répartition des soldes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ClubPanel title="Activité des membres (8 semaines)" icon={<ChartIcon className="h-4 w-4" />}>
          {summary ? (
            summary.lastVisitByWeek.some((w) => w.count > 0) ? (
              <>
                <ColumnChart
                  caption="Nombre de cartes actives par semaine de leur dernière opération, sur 8 semaines"
                  unit={(n) => `${n} carte${n > 1 ? "s" : ""}`}
                  data={summary.lastVisitByWeek.map((w) => ({
                    label: `Semaine du ${weekLabel.format(w.start)}`,
                    short: weekShort.format(w.start),
                    value: w.count,
                  }))}
                />
                <p className="mt-2.5 text-[0.78rem] text-admin-muted">
                  Chaque carte active est comptée dans la semaine de sa dernière activité.
                </p>
              </>
            ) : (
              <EmptyState title="Aucune activité sur les 8 dernières semaines" />
            )
          ) : (
            <div className="h-40 rounded-xl bg-admin-canvas motion-safe:animate-pulse" aria-hidden />
          )}
        </ClubPanel>

        <ClubPanel title="Répartition des soldes de points" icon={<CoinsIcon className="h-4 w-4" />}>
          {summary ? (
            summary.active > 0 ? (
              <>
                <ColumnChart
                  caption="Nombre de cartes actives par tranche de solde de points"
                  unit={(n) => `${n} carte${n > 1 ? "s" : ""}`}
                  data={BALANCE_BRACKETS.map((b, i) => ({
                    label: b.label,
                    short: b.short,
                    value: summary.balanceBrackets[i] ?? 0,
                  }))}
                />
                <p className="mt-2.5 text-[0.78rem] text-admin-muted">
                  Répartition des {count(summary.active)} carte{summary.active > 1 ? "s" : ""} active{summary.active > 1 ? "s" : ""} selon leur solde disponible.
                </p>
              </>
            ) : (
              <EmptyState title="Aucune carte active" />
            )
          ) : (
            <div className="h-40 rounded-xl bg-admin-canvas motion-safe:animate-pulse" aria-hidden />
          )}
        </ClubPanel>
      </div>

      {/* ------------------------------------------------ opérations récentes, derniers inscrits et configuration */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {stats && stats.recentOperations.length > 0 ? (
            <ClubPanel title="Dernières opérations enregistrées" icon={<CoinsIcon className="h-4 w-4" />}>
              <ul className="divide-y divide-admin-line text-[0.86rem]">
                {stats.recentOperations.slice(0, 6).map((op) => (
                  <li key={op.eventId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminLink
                          href={staffCardPath(op.cardId)}
                          className={`font-semibold text-admin-ink hover:text-admin-accent ${ring}`}
                        >
                          {op.fullName}
                        </AdminLink>
                        <span className="text-admin-muted">· {EVENT_LABELS[op.kind]}</span>
                      </div>
                      <p className="mt-0.5 text-[0.78rem] text-admin-muted">
                        {formatDateTime(op.createdAt)}
                        {op.ticketAmountCentimes !== null ? ` · Ticket ${formatCentimes(op.ticketAmountCentimes)}` : ""}
                        {op.orderRef ? ` · Réf. ${op.orderRef}` : ""}
                        {op.rewardName ? ` · ${op.rewardName}` : ""}
                      </p>
                    </div>
                    {op.pointsDelta !== 0 ? (
                      <Pill tone={op.pointsDelta > 0 ? "positive" : "warning"}>
                        {op.pointsDelta > 0 ? "+" : "−"}
                        {formatPoints(Math.abs(op.pointsDelta))} pts
                      </Pill>
                    ) : (
                      <Pill tone="neutral">Compte</Pill>
                    )}
                  </li>
                ))}
              </ul>
            </ClubPanel>
          ) : null}

          <ClubPanel
            title="Derniers clients inscrits"
            icon={<UsersIcon className="h-4 w-4" />}
            action={
              <AdminLink
                href={STAFF_ROUTES.clients}
                className={`rounded-lg px-2 py-1 text-[0.82rem] font-semibold text-admin-accent hover:bg-admin-accentSoft ${ring}`}
              >
                Tous les clients
              </AdminLink>
            }
          >
            {cards.status === "loading" || cards.status === "idle" ? <CardRowSkeleton /> : null}
            {data && data.items.length === 0 ? (
              <EmptyState title="Aucun client inscrit pour l'instant">
                Les clients peuvent s&apos;inscrire en ligne sur /fidelite ou au comptoir depuis la section Clients.
              </EmptyState>
            ) : null}
            {data && data.items.length > 0 ? (
              <ul className="space-y-2">
                {data.items.slice(0, 5).map((item) => (
                  <CardRow key={item.cardId} item={item} pointValueCentimes={pointValueCentimes} />
                ))}
              </ul>
            ) : null}
          </ClubPanel>
        </div>

        <div className="space-y-4">
          <ClubPanel title="Configuration du programme" icon={<GiftIcon className="h-4 w-4" />}>
            {program ? (
              <dl className="divide-y divide-admin-line text-[0.86rem]">
                <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <dt className="text-admin-muted">État du programme</dt>
                  <dd>
                    <Pill tone={program.isActive ? "positive" : "warning"}>
                      {program.isActive ? "Ouvert" : "Fermé"}
                    </Pill>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-admin-muted">Valeur d&apos;un point</dt>
                  <dd className="font-semibold text-admin-ink">
                    1 point = {formatCentimes(program.pointValueCentimes)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-admin-muted">Attribution sur ticket</dt>
                  <dd className="text-right font-semibold text-admin-ink">
                    {formatEarningRule({
                      earningPoints: program.earningPoints,
                      earningDirhams: program.earningDirhams,
                      roundingRule: program.roundingRule,
                    })}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-admin-muted">Catalogue récompenses</dt>
                  <dd className="font-semibold text-admin-ink">
                    {program.activeRewardsCount} active{program.activeRewardsCount > 1 ? "s" : ""} (sur{" "}
                    {program.rewardsCount})
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                  <dt className="text-admin-muted">Code secret scan QR</dt>
                  <dd>
                    <Pill tone={program.qrPinConfigured ? "positive" : "warning"}>
                      {program.qrPinConfigured ? "Configuré" : "À définir"}
                    </Pill>
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="h-32 rounded-xl bg-admin-canvas motion-safe:animate-pulse" aria-hidden />
            )}
          </ClubPanel>

          <nav aria-label="Raccourcis d'administration" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
            {[
              {
                href: STAFF_ROUTES.clients,
                label: "Gérer les clients",
                desc: "Rechercher un membre, attribuer des points ou inscrire au comptoir",
                icon: UsersIcon,
              },
              {
                href: STAFF_ROUTES.rewards,
                label: "Gérer les récompenses",
                desc: "Créer, modifier ou activer les récompenses en points",
                icon: GiftIcon,
              },
              {
                href: STAFF_ROUTES.points,
                label: "Paramètres & Points",
                desc: "Valeur du point, barème d'attribution et code secret QR",
                icon: CoinsIcon,
              },
            ].map(({ href, label, desc, icon: Icon }) => (
              <AdminLink
                key={href}
                href={href}
                className={`${panel} flex items-start gap-3 p-3.5 transition-colors hover:border-admin-accent/40 hover:bg-admin-canvas/40 ${ring}`}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-admin-accentSoft text-admin-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9rem] font-semibold text-admin-ink">{label}</span>
                  <span className="mt-0.5 block text-[0.78rem] leading-snug text-admin-muted">{desc}</span>
                </span>
              </AdminLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
