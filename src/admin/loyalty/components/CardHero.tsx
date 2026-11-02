/**
 * En-tête de la fiche client (administration de la fidélité) :
 * vue sobre, claire et opérationnelle sur fond blanc.
 * Affiche l'identité du client, le numéro masqué par défaut (avec bouton Afficher/Masquer),
 * le code public de la carte, le solde de points actuel, sa contre-valeur en dirhams,
 * ainsi que le cumul des points gagnés, utilisés et des récompenses échangées.
 */
import { useState } from "react";
import { formatPublicCode } from "../../../loyalty/lib/qr";
import { AlertIcon, EyeIcon, EyeOffIcon } from "../../components/icons";
import { formatPoints, pointsLabel, pointsValueLabel } from "../lib/points";
import type { StaffCard } from "../lib/staffApi";
import { formatDateTime, maskPhone, staffPointsSummary } from "../lib/staffFormat";
import { Avatar, StatusBadge } from "./club";
import { panel, ring } from "./staffUi";

export function CardHero({ card }: { card: StaffCard }) {
  const [showPhone, setShowPhone] = useState(false);
  const summary = staffPointsSummary(card);
  const suspended = card.status === "suspended";

  return (
    <section aria-labelledby="fiche-nom" className={`${panel} overflow-hidden p-5 sm:p-6`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar name={card.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 id="fiche-nom" className="break-words text-[1.35rem] font-semibold leading-tight text-admin-ink sm:text-[1.55rem]">
                {card.fullName}
              </h1>
              {suspended ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-dangerSoft px-2.5 py-0.5 text-[0.78rem] font-semibold text-admin-danger ring-1 ring-admin-danger/25">
                  <AlertIcon className="h-3.5 w-3.5" />
                  Carte suspendue
                </span>
              ) : (
                <StatusBadge status="active" />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.88rem] text-admin-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="sr-only">Téléphone : </span>
                <span className="font-medium tabular-nums text-admin-ink">{showPhone ? card.phone : maskPhone(card.phone)}</span>
                <button
                  type="button"
                  onClick={() => setShowPhone((v) => !v)}
                  aria-pressed={showPhone}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 py-0.5 text-[0.78rem] font-semibold text-admin-accent hover:bg-admin-accentSoft ${ring}`}
                >
                  {showPhone ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                  {showPhone ? "Masquer" : "Afficher"}
                  <span className="sr-only"> le numéro</span>
                </button>
              </span>
              <span>
                <span className="text-admin-soft">Code : </span>
                <span className="font-mono text-[0.84rem] font-medium tracking-wider text-admin-ink">
                  {formatPublicCode(card.publicCode)}
                </span>
              </span>
              {card.lastActivityAt ? (
                <span>Dernière activité : {formatDateTime(card.lastActivityAt)}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Solde de points principal */}
        <div
          className="rounded-xl border border-admin-accent/20 bg-admin-accentSoft/60 px-4 py-3 text-left sm:min-w-[13.5rem] sm:text-right"
          aria-live="polite"
        >
          <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-admin-accent">Solde disponible</p>
          <p className="mt-0.5 text-[1.75rem] font-bold leading-tight tabular-nums text-admin-ink">
            {formatPoints(card.pointsBalance)}{" "}
            <span className="text-[0.95rem] font-semibold text-admin-muted">
              point{card.pointsBalance === 1 || card.pointsBalance === 0 ? "" : "s"}
            </span>
          </p>
          <p className="mt-0.5 text-[0.86rem] font-semibold text-admin-accent">
            Valeur : {pointsValueLabel(card.pointsBalance, card.pointValueCentimes)}
          </p>
        </div>
      </div>

      {/* Statistiques résumées de la carte */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-admin-line pt-4 sm:grid-cols-4">
        <div>
          <p className="text-[0.76rem] text-admin-muted">Points cumulés</p>
          <p className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-admin-ink">
            {pointsLabel(card.pointsEarnedTotal)}
          </p>
        </div>
        <div>
          <p className="text-[0.76rem] text-admin-muted">Points utilisés</p>
          <p className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-admin-ink">
            {pointsLabel(card.pointsSpentTotal)}
          </p>
        </div>
        <div>
          <p className="text-[0.76rem] text-admin-muted">Récompenses échangées</p>
          <p className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-admin-ink">
            {card.rewardsRedeemed} récompense{card.rewardsRedeemed > 1 ? "s" : ""}
          </p>
        </div>
        <div>
          <p className="text-[0.76rem] text-admin-muted">Équivalence</p>
          <p className="mt-0.5 text-[0.85rem] text-admin-muted">{summary.hint}</p>
        </div>
      </div>
    </section>
  );
}
