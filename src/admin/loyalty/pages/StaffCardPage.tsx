/**
 * Fiche client de l'administration de la fidélité (/admin/fidelite/clients/:cardId).
 * Permet d'attribuer des points à partir d'un montant de ticket, d'échanger une récompense
 * du catalogue, d'ajuster manuellement le solde (avec motif obligatoire), de réémettre le lien
 * d'accès, de modifier les coordonnées ou de suspendre/réactiver la carte, et de consulter
 * ou corriger l'historique complet des opérations.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { qrOrigin } from "../../../loyalty/lib/qr";
import { AdminLink } from "../../components/AdminLink";
import {
  AlertIcon,
  ArrowLeftIcon,
  CoinsIcon,
  GiftIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  UndoIcon,
} from "../../components/icons";
import { CardHero } from "../components/CardHero";
import {
  AdjustPointsSheet,
  CreditTicketSheet,
  EditCustomerSheet,
  RecentCreditSheet,
  RedeemRewardSheet,
  ReissueSheet,
  RevertSheet,
  StatusSheet,
  type CustomerChanges,
} from "../components/CardSheets";
import { ClubPanel } from "../components/club";
import { HistoryList } from "../components/HistoryList";
import {
  AdviceBox,
  BusyLabel,
  greenButton,
  outlineButton,
  panel,
  primaryButton,
  quietButton,
  ring,
  stampButton,
} from "../components/staffUi";
import { createCardOperations } from "../lib/cardOperations";
import { createIdempotentAction } from "../lib/idempotentAction";
import { formatCentimes, formatEarningRule, pointsLabel, pointsValueLabel } from "../lib/points";
import {
  fetchCard,
  fetchHistory,
  listRewards,
  setCardStatus,
  type CardStatus,
  type HistoryEvent,
  type OperationResult,
  type StaffCard,
  type StaffReward,
} from "../lib/staffApi";
import { staffAdvice, type StaffAdvice } from "../lib/staffErrors";
import { formatDate, formatDateTime } from "../lib/staffFormat";
import { STAFF_ROUTES } from "../routes";
import { useStaff } from "../StaffContext";

type Pending = "ticket" | "redeem" | "adjust" | "revert" | "reissue" | "update" | "status" | null;

type SheetState =
  | { kind: "ticket" }
  | { kind: "recent"; seconds: number; amountCentimes: number; orderRef: string | null }
  | { kind: "redeem" }
  | { kind: "adjust"; direction: "credit" | "debit" }
  | { kind: "revert"; event: HistoryEvent }
  | { kind: "reissue"; link: string | null }
  | { kind: "edit" }
  | { kind: "status" }
  | null;

export type Banner = {
  tone: "success" | "reward" | "info";
  title: string;
  message: string;
  undo?: {
    eventId: string;
    kind: "points_credited" | "points_adjusted" | "reward_redeemed" | "stamp_added";
    label: string;
  };
} | null;

type Load = { status: "loading" } | { status: "ready" } | { status: "error"; advice: StaffAdvice };
type History = { items: HistoryEvent[]; next: number | null; status: "loading" | "ready" | "more" | "error" };

const HISTORY_PAGE = 30;

function placeholderEvent(
  eventId: string,
  kind: "points_credited" | "points_adjusted" | "reward_redeemed" | "stamp_added",
): HistoryEvent {
  return {
    eventId,
    seq: 0,
    kind,
    createdAt: new Date().toISOString(),
    actorRole: "manager",
    actorEmail: null,
    reason: null,
    revertsEventId: null,
    relatedEventId: null,
    revertedByEventId: null,
    pointsDelta: 0,
    pointsBalanceAfter: null,
    ticketAmountCentimes: null,
    orderRef: null,
    rewardId: null,
    rewardName: null,
    redemptionCode: null,
    stampsTotalAfter: null,
    rewardsRedeemedAfter: null,
    details: {},
  };
}

export function StaffCardPage({ cardId }: { cardId: string }) {
  const { rpc, role, program, reloadProgram, refreshCards } = useStaff();
  const ops = useMemo(() => createCardOperations(rpc, cardId), [rpc, cardId]);
  const statusAction = useMemo(() => createIdempotentAction<OperationResult>(), []);
  const [card, setCard] = useState<StaffCard | null>(null);
  const [rewards, setRewards] = useState<StaffReward[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [history, setHistory] = useState<History>({ items: [], next: null, status: "loading" });
  const [pending, setPending] = useState<Pending>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetAdvice, setSheetAdvice] = useState<StaffAdvice | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const reloadHistory = useCallback(() => {
    setHistory((h) => ({ ...h, status: "loading" }));
    fetchHistory(rpc, cardId, { limit: HISTORY_PAGE })
      .then((p) => setHistory({ items: p.items, next: p.nextBeforeSeq, status: "ready" }))
      .catch(() => setHistory((h) => ({ ...h, status: "error" })));
  }, [rpc, cardId]);

  const reloadRewards = useCallback(() => {
    void listRewards(rpc)
      .then(setRewards)
      .catch(() => setRewards([]));
  }, [rpc]);

  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    fetchCard(rpc, { cardId })
      .then((c) => {
        setCard(c);
        setLoad({ status: "ready" });
      })
      .catch((e) => setLoad({ status: "error", advice: staffAdvice(e) }));
    reloadHistory();
    reloadRewards();
  }, [rpc, cardId, reloadHistory, reloadRewards]);
  useEffect(reload, [reload]);

  const moreHistory = () => {
    if (history.next === null) return;
    setHistory((h) => ({ ...h, status: "more" }));
    fetchHistory(rpc, cardId, { beforeSeq: history.next, limit: HISTORY_PAGE })
      .then((p) => setHistory((h) => ({ items: [...h.items, ...p.items], next: p.nextBeforeSeq, status: "ready" })))
      .catch(() => setHistory((h) => ({ ...h, status: "error" })));
  };

  const apply = (result: OperationResult) => {
    setCard(result.card);
    reloadHistory();
    refreshCards();
  };

  const fail = (e: unknown) => {
    const advice = staffAdvice(e);
    setSheetAdvice(advice);
    if (advice.action === "reload") {
      void fetchCard(rpc, { cardId }).then(setCard, () => {});
      reloadHistory();
    }
    if (advice.title === "Programme fermé") reloadProgram();
  };

  const closeSheet = () => {
    if (pending) return;
    setSheet(null);
    setSheetAdvice(null);
  };

  const open = (s: NonNullable<SheetState>) => {
    setSheetAdvice(null);
    setSheet(s);
  };

  /* ------------------------------------------------------------------ opérations */

  const creditTicket = async (amountCentimes: number, orderRef: string | null, confirmRecent = false) => {
    setPending("ticket");
    setSheetAdvice(null);
    setBanner(null);
    try {
      const r = await ops.creditTicket({ ticketCentimes: amountCentimes, orderRef, confirmRecent });
      if (r.status === "confirm_recent") {
        setCard(r.card);
        setSheet({ kind: "recent", seconds: r.secondsSinceLastCredit, amountCentimes, orderRef });
        return;
      }
      setSheet(null);
      apply(r);
      setBanner(
        r.replayed
          ? {
              tone: "info",
              title: "Ticket déjà crédité",
              message: "La réponse précédente s'était perdue : ces points n'ont pas été ajoutés deux fois.",
            }
          : {
              tone: "success",
              title: `+${pointsLabel(r.pointsAdded)} attribués`,
              message: `Ticket de ${formatCentimes(r.ticketCentimes)}${orderRef ? ` (réf. ${orderRef})` : ""}. Nouveau solde : ${pointsLabel(r.card.pointsBalance)} (${pointsValueLabel(r.card.pointsBalance, r.card.pointValueCentimes)}).`,
              undo: r.eventId
                ? { eventId: r.eventId, kind: "points_credited", label: "Annuler cette attribution" }
                : undefined,
            },
      );
    } catch (e) {
      fail(e);
    } finally {
      setPending(null);
    }
  };

  const runSheet = async <T,>(kind: NonNullable<Pending>, work: () => Promise<T>, after: (r: T) => void) => {
    setPending(kind);
    setSheetAdvice(null);
    try {
      after(await work());
    } catch (e) {
      fail(e);
    } finally {
      setPending(null);
    }
  };

  const redeem = (rewardId: string, _reason: string | null) =>
    runSheet(
      "redeem",
      () => ops.redeem(rewardId),
      (r) => {
        apply(r);
        reloadRewards();
        setSheet(null);
        const rewardName = r.rewardName ?? "Récompense";
        const cost = r.pointsCost ?? 0;
        setBanner({
          tone: "reward",
          title: r.replayed ? "Échange déjà enregistré" : `Récompense échangée : ${rewardName}`,
          message: r.replayed
            ? "La réponse précédente s'était perdue : aucun point supplémentaire n'a été débité."
            : `${cost > 0 ? `−${pointsLabel(cost)}. ` : ""}${r.redemptionCode ? `Code de remise : ${r.redemptionCode}. ` : ""}Nouveau solde : ${pointsLabel(r.card.pointsBalance)}.`,
          undo:
            r.eventId && !r.replayed
              ? { eventId: r.eventId, kind: "reward_redeemed", label: "Annuler cet échange" }
              : undefined,
        });
      },
    );

  const adjustPoints = (delta: number, reason: string) =>
    runSheet(
      "adjust",
      () => ops.adjustPoints({ delta, reason }),
      (r) => {
        apply(r);
        setSheet(null);
        setBanner({
          tone: "success",
          title: r.replayed
            ? "Ajustement déjà enregistré"
            : delta > 0
              ? `+${pointsLabel(delta)} ajoutés`
              : `−${pointsLabel(Math.abs(delta))} retirés`,
          message: `Motif : ${reason}. Nouveau solde : ${pointsLabel(r.card.pointsBalance)} (${pointsValueLabel(r.card.pointsBalance, r.card.pointValueCentimes)}).`,
          undo:
            r.eventId && !r.replayed
              ? { eventId: r.eventId, kind: "points_adjusted", label: "Annuler cet ajustement" }
              : undefined,
        });
      },
    );

  const revert = (event: HistoryEvent, reason: string) =>
    runSheet(
      "revert",
      () => ops.revert(event.eventId, reason),
      (r) => {
        apply(r);
        reloadRewards();
        setSheet(null);
        setBanner({
          tone: "info",
          title: "Correction enregistrée",
          message: `L'opération d'origine reste visible dans l'historique avec sa correction. Solde actuel : ${pointsLabel(r.card.pointsBalance)}.`,
        });
      },
    );

  const reissue = (reason: string | null) =>
    runSheet(
      "reissue",
      () => ops.reissue(reason, qrOrigin()),
      (r) => {
        apply(r);
        setSheet({ kind: "reissue", link: r.link });
      },
    );

  const update = (changes: CustomerChanges, reason: string) =>
    runSheet(
      "update",
      () => ops.update(changes, reason),
      (r) => {
        apply(r);
        setSheet(null);
        setBanner(
          r.status === "unchanged"
            ? { tone: "info", title: "Aucune modification", message: "Les informations étaient déjà à jour." }
            : {
                tone: "success",
                title: "Coordonnées mises à jour",
                message: "L'ancienne et la nouvelle valeur sont tracées dans l'historique.",
              },
        );
      },
    );

  const changeStatus = (status: CardStatus, reason: string) =>
    runSheet(
      "status",
      () => statusAction.run((requestId) => setCardStatus(rpc, { cardId, status, reason, requestId })),
      (r) => {
        apply(r);
        setSheet(null);
        setBanner({
          tone: "info",
          title: status === "suspended" ? "Carte suspendue" : "Carte réactivée",
          message: "Le changement de statut et son motif sont enregistrés dans l'historique.",
        });
      },
    );

  const openUndo = (undo: NonNullable<NonNullable<Banner>["undo"]>) => {
    const event = history.items.find((e) => e.eventId === undo.eventId) ?? placeholderEvent(undo.eventId, undo.kind);
    open({ kind: "revert", event });
  };

  /* ------------------------------------------------------------------ rendu */

  if (load.status === "loading" && !card) return <CardSkeleton />;
  if (load.status === "error" && !card) {
    return (
      <div className="space-y-4">
        <BackLink />
        <AdviceBox advice={load.advice} onRetry={load.advice.action === "none" ? undefined : reload} />
      </div>
    );
  }
  if (!card) return null;

  const suspended = card.status === "suspended";
  const closed = program?.isActive === false;
  const creditBlocked = suspended || closed;
  const busy = pending !== null;
  const activeRewards = rewards.filter((r) => r.isActive && !r.archivedAt);
  const eligibleRewardsCount = activeRewards.filter((r) => card.pointsBalance >= r.pointsCost).length;

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        {/* ------------------------------------------------ colonne principale : fiche & actions */}
        <div className="space-y-4">
          <CardHero card={card} />

          <section aria-label="Actions principales" className={`${panel} space-y-3 p-4 sm:p-5`}>
            <h2 className="text-[0.95rem] font-semibold text-admin-ink">Opérations sur le compte</h2>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => open({ kind: "ticket" })}
                disabled={busy || creditBlocked}
                className={stampButton}
              >
                <CoinsIcon className="h-5 w-5" />
                Attribuer des points (ticket)
              </button>

              <button
                type="button"
                onClick={() => open({ kind: "redeem" })}
                disabled={busy || suspended}
                className={greenButton}
              >
                <GiftIcon className="h-5 w-5" />
                Échanger une récompense
                {eligibleRewardsCount > 0 ? (
                  <span className="rounded-full bg-admin-accent px-2 py-0.5 text-[0.74rem] font-bold text-white">
                    {eligibleRewardsCount}
                  </span>
                ) : null}
              </button>
            </div>

            {creditBlocked ? (
              <p
                className="flex items-start gap-2 rounded-xl border border-admin-warn/30 bg-admin-warnSoft px-3.5 py-2.5 text-[0.84rem] text-admin-warn"
                role="status"
              >
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {suspended
                    ? "Carte suspendue : aucune attribution de points ni échange de récompense. Seul un responsable peut la réactiver."
                    : "Programme fermé : aucune attribution de points sur ticket. Les points déjà acquis restent échangeables."}
                </span>
              </p>
            ) : null}

            {banner ? (
              <ResultBanner
                banner={banner}
                disabled={busy}
                onUndo={openUndo}
                onDismiss={() => setBanner(null)}
              />
            ) : null}
          </section>
        </div>

        {/* ------------------------------------------------ colonne latérale : ajustement & détails */}
        <div className="space-y-4">
          <ClubPanel title="Ajustement manuel du solde" icon={<CoinsIcon className="h-4 w-4" />}>
            <p className="text-[0.84rem] text-admin-muted">
              Pour un geste commercial ou une régularisation sans ticket, ajoutez ou retirez des points avec un motif
              obligatoire tracé dans l&apos;historique.
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy || suspended}
                onClick={() => open({ kind: "adjust", direction: "credit" })}
                className={primaryButton}
              >
                <PlusIcon className="h-4 w-4" />
                Ajouter des points
              </button>
              <button
                type="button"
                disabled={busy || suspended || card.pointsBalance <= 0}
                onClick={() => open({ kind: "adjust", direction: "debit" })}
                className={outlineButton}
              >
                Retirer des points
              </button>
            </div>
            {program ? (
              <p className="mt-3 border-t border-admin-line pt-2.5 text-[0.78rem] text-admin-muted">
                Barème ticket actuel :{" "}
                <strong className="text-admin-ink">
                  {formatEarningRule({
                    earningPoints: program.earningPoints,
                    earningDirhams: program.earningDirhams,
                    roundingRule: program.roundingRule,
                  })}
                </strong>{" "}
                · 1 point = {formatCentimes(card.pointValueCentimes)}.
              </p>
            ) : null}
          </ClubPanel>

          <ClubPanel title="Informations de la carte">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[0.85rem]">
              <Detail term="Inscription" value={formatDate(card.createdAt)} />
              <Detail
                term="Dernière activité"
                value={card.lastActivityAt ? formatDateTime(card.lastActivityAt) : "aucune"}
              />
              <Detail term="Points gagnés" value={pointsLabel(card.pointsEarnedTotal)} />
              <Detail term="Points utilisés" value={pointsLabel(card.pointsSpentTotal)} />
              <Detail
                wide
                term="Lien personnel en service"
                value={`version n° ${card.tokenVersion}, émis le ${formatDate(card.tokenIssuedAt)}`}
              />
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-admin-line pt-3">
              <button
                type="button"
                onClick={() => open({ kind: "reissue", link: null })}
                disabled={busy}
                className={quietButton}
              >
                <LinkIcon className="h-4 w-4" />
                Nouveau lien WhatsApp
              </button>
              <button
                type="button"
                onClick={() => open({ kind: "edit" })}
                disabled={busy}
                className={quietButton}
              >
                <PencilIcon className="h-4 w-4" />
                Modifier le client
              </button>
              {role === "owner" ? (
                <button
                  type="button"
                  onClick={() => open({ kind: "status" })}
                  disabled={busy}
                  className={`${quietButton} ${suspended ? "text-admin-accent" : "text-admin-danger hover:text-admin-danger"}`}
                >
                  <AlertIcon className="h-4 w-4" />
                  {suspended ? "Réactiver la carte" : "Suspendre la carte"}
                </button>
              ) : null}
            </div>
          </ClubPanel>
        </div>
      </div>

      {/* ------------------------------------------------ historique complet */}
      <section aria-labelledby="fiche-historique" className={`${panel} p-4 sm:p-5`}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="fiche-historique" className="text-[1rem] font-semibold text-admin-ink">
            Historique des opérations
          </h2>
          <span className="text-[0.78rem] text-admin-muted">Journal en ajout seul · traçabilité complète</span>
        </div>

        {history.status === "error" && history.items.length === 0 ? (
          <AdviceBox
            advice={{
              title: "Historique non chargé",
              message: "Vérifiez la connexion puis réessayez.",
              action: "retry",
            }}
            onRetry={reloadHistory}
          />
        ) : history.status === "loading" && history.items.length === 0 ? (
          <div className="h-24 rounded-xl bg-admin-canvas motion-safe:animate-pulse" aria-hidden />
        ) : (
          <HistoryList
            items={history.items}
            disabled={busy}
            onRevert={(event) => open({ kind: "revert", event })}
          />
        )}

        {history.next !== null ? (
          <button
            type="button"
            onClick={moreHistory}
            disabled={history.status === "more"}
            className={`${outlineButton} mt-4 w-full`}
          >
            <BusyLabel
              busy={history.status === "more"}
              idle="Afficher les opérations plus anciennes"
              pending="Chargement…"
            />
          </button>
        ) : null}
      </section>

      {/* Modales d'action */}
      {sheet?.kind === "ticket" ? (
        <CreditTicketSheet
          card={card}
          program={program}
          busy={pending === "ticket"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(amountCentimes, orderRef) => void creditTicket(amountCentimes, orderRef, false)}
        />
      ) : null}
      {sheet?.kind === "recent" ? (
        <RecentCreditSheet
          seconds={sheet.seconds}
          busy={pending === "ticket"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={() => void creditTicket(sheet.amountCentimes, sheet.orderRef, true)}
        />
      ) : null}
      {sheet?.kind === "redeem" ? (
        <RedeemRewardSheet
          card={card}
          rewards={rewards}
          busy={pending === "redeem"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(rewardId, reason) => void redeem(rewardId, reason)}
        />
      ) : null}
      {sheet?.kind === "adjust" ? (
        <AdjustPointsSheet
          card={card}
          direction={sheet.direction}
          busy={pending === "adjust"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(delta, reason) => void adjustPoints(delta, reason)}
        />
      ) : null}
      {sheet?.kind === "revert" ? (
        <RevertSheet
          event={sheet.event}
          busy={pending === "revert"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(reason) => void revert(sheet.event, reason)}
        />
      ) : null}
      {sheet?.kind === "reissue" ? (
        <ReissueSheet
          card={card}
          link={sheet.link}
          busy={pending === "reissue"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(reason) => void reissue(reason)}
        />
      ) : null}
      {sheet?.kind === "edit" ? (
        <EditCustomerSheet
          card={card}
          busy={pending === "update"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(c, r) => void update(c, r)}
        />
      ) : null}
      {sheet?.kind === "status" ? (
        <StatusSheet
          card={card}
          busy={pending === "status"}
          advice={sheetAdvice}
          onClose={closeSheet}
          onConfirm={(s, r) => void changeStatus(s, r)}
        />
      ) : null}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      role="status"
      aria-label="Ouverture de la fiche"
    >
      <div className="h-64 rounded-xl border border-admin-line bg-white motion-safe:animate-pulse" />
      <div className="h-48 rounded-xl border border-admin-line bg-white motion-safe:animate-pulse" />
    </div>
  );
}

function BackLink() {
  return (
    <AdminLink
      href={STAFF_ROUTES.clients}
      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2 text-[0.88rem] font-semibold text-admin-accent hover:bg-admin-accentSoft ${ring}`}
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Retour aux clients
    </AdminLink>
  );
}

function Detail({ term, value, wide = false }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[0.76rem] text-admin-muted">{term}</dt>
      <dd className="mt-0.5 font-medium text-admin-ink">{value}</dd>
    </div>
  );
}

export function ResultBanner({
  banner,
  disabled,
  onUndo,
  onDismiss,
}: {
  banner: NonNullable<Banner>;
  disabled: boolean;
  onUndo: (undo: NonNullable<NonNullable<Banner>["undo"]>) => void;
  onDismiss: () => void;
}) {
  const tone =
    banner.tone === "reward"
      ? "border-admin-gold/40 bg-admin-goldSoft text-admin-ink"
      : banner.tone === "success"
        ? "border-admin-success/30 bg-admin-successSoft text-admin-ink"
        : "border-admin-lineStrong bg-admin-canvas text-admin-ink";
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 motion-safe:animate-admin-pop ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-semibold">{banner.title}</p>
          <p className="mt-0.5 text-[0.85rem] leading-snug text-admin-muted">{banner.message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`${quietButton} -mr-2 -mt-1 shrink-0 px-2 text-[0.8rem]`}
        >
          Fermer
        </button>
      </div>
      {banner.undo ? (
        <button
          type="button"
          onClick={() => onUndo(banner.undo!)}
          disabled={disabled}
          className={`${outlineButton} mt-2.5`}
        >
          <UndoIcon className="h-3.5 w-3.5" />
          {banner.undo.label}
        </button>
      ) : null}
    </div>
  );
}
