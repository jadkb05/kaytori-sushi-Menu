/**
 * Historique d'une carte (loyalty_card_history), du plus récent au plus ancien.
 * Journal en ajout seul : une opération corrigée reste affichée, marquée « Corrigée »,
 * et la correction renvoie vers elle.
 */
import { UndoIcon } from "../../components/icons";
import { formatPoints } from "../lib/points";
import type { HistoryEvent } from "../lib/staffApi";
import { EVENT_LABELS, eventActor, eventDelta, eventDetail, formatDateTime, isRevertible } from "../lib/staffFormat";
import { Pill, quietButton, ring } from "./staffUi";

const DOT: Record<HistoryEvent["kind"], string> = {
  card_created: "bg-admin-success",
  points_credited: "bg-admin-accent",
  points_adjusted: "bg-admin-gold",
  points_reverted: "bg-admin-danger",
  reward_redeemed: "bg-admin-success",
  reward_redemption_reverted: "bg-admin-danger",
  reward_created: "bg-admin-soft",
  reward_updated: "bg-admin-soft",
  stamp_added: "bg-admin-soft",
  stamp_reverted: "bg-admin-danger",
  reward_unlocked: "bg-admin-soft",
  reward_withdrawn: "bg-admin-danger",
  access_reissued: "bg-admin-soft",
  customer_updated: "bg-admin-soft",
  card_status_changed: "bg-admin-warn",
  settings_updated: "bg-admin-soft",
  qr_pin_updated: "bg-admin-soft",
};

const anchor = (id: string) => `operation-${id}`;

export function HistoryList({
  items,
  onRevert,
  disabled,
  now,
}: {
  items: HistoryEvent[];
  onRevert: (event: HistoryEvent) => void;
  disabled: boolean;
  now?: Date;
}) {
  const byId = new Map(items.map((e) => [e.eventId, e]));
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-admin-lineStrong bg-admin-canvas/50 px-4 py-6 text-center text-[0.9rem] text-admin-muted">
        Aucune opération enregistrée.
      </p>
    );
  }
  return (
    <ol className="relative space-y-0 before:absolute before:bottom-3 before:left-[0.38rem] before:top-3 before:w-px before:bg-admin-lineStrong">
      {items.map((e) => {
        const corrected = e.revertedByEventId !== null;
        const original = e.revertsEventId ? byId.get(e.revertsEventId) : undefined;
        const delta = eventDelta(e);
        const detail = eventDetail(e);
        const isPositivePoints = e.pointsDelta > 0;
        const isNegativePoints = e.pointsDelta < 0;
        return (
          <li key={e.eventId} id={anchor(e.eventId)} className="relative scroll-mt-24 pb-4 pl-6 last:pb-0">
            <span
              className={`absolute left-0 top-[0.42rem] h-[0.75rem] w-[0.75rem] rounded-full ring-2 ring-white ${DOT[e.kind]}`}
              aria-hidden
            />
            <div className="flex flex-col items-start gap-x-3 gap-y-1.5 rounded-xl border border-admin-line bg-admin-canvas/35 p-3 min-[480px]:flex-row min-[480px]:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-[0.92rem] font-semibold leading-snug ${corrected ? "line-through text-admin-soft" : "text-admin-ink"}`}>
                    {EVENT_LABELS[e.kind]}
                  </p>
                  {delta ? (
                    <Pill tone={isPositivePoints ? "positive" : isNegativePoints ? "warning" : "neutral"}>
                      {delta}
                    </Pill>
                  ) : null}
                  {corrected ? <Pill tone="muted">Corrigée</Pill> : null}
                </div>

                <p className="mt-1 text-[0.8rem] text-admin-muted">
                  <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, now)}</time>, par {eventActor(e)}
                  {e.pointsBalanceAfter !== null && e.pointsDelta !== 0
                    ? ` · Solde après : ${formatPoints(e.pointsBalanceAfter)} pt${e.pointsBalanceAfter > 1 ? "s" : ""}`
                    : ""}
                </p>

                {detail ? <p className="mt-1 text-[0.85rem] font-medium text-admin-ink">{detail}</p> : null}
                {e.reason ? <p className="mt-1 text-[0.84rem] text-admin-muted">Motif : {e.reason}</p> : null}

                {e.revertsEventId ? (
                  <p className="mt-1 text-[0.8rem]">
                    <a
                      href={`#${anchor(e.revertsEventId)}`}
                      className={`rounded font-medium text-admin-accent underline underline-offset-2 ${ring}`}
                    >
                      Corrige :{" "}
                      {original
                        ? `${EVENT_LABELS[original.kind].toLowerCase()} ${formatDateTime(original.createdAt, now)}`
                        : "une opération plus ancienne"}
                    </a>
                  </p>
                ) : null}

                {corrected ? (
                  <p className="mt-1 text-[0.8rem]">
                    <a
                      href={`#${anchor(e.revertedByEventId!)}`}
                      className={`rounded font-medium text-admin-accent underline underline-offset-2 ${ring}`}
                    >
                      Voir la correction
                    </a>
                  </p>
                ) : null}
              </div>

              {isRevertible(e) ? (
                <button
                  type="button"
                  onClick={() => onRevert(e)}
                  disabled={disabled}
                  className={`${quietButton} shrink-0 border border-admin-lineStrong bg-white text-admin-ink hover:bg-admin-canvas`}
                >
                  <UndoIcon className="h-3.5 w-3.5" />
                  Corriger
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
