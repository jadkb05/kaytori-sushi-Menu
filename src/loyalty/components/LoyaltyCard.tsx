/**
 * Carte de membre digitale Kaytôri Club :
 *   - Écrin supérieur en vert impérial (#04170f → #003024), motif seigaiha subtil, filet doré,
 *     nom du membre, solde de points en Playfair Display, contre-valeur en dirhams (1 pt = 0,20 DH)
 *     et jauge de progression vers la prochaine récompense.
 *   - Talon inférieur ivoire détachable avec le QR code haute lisibilité et le code public à 12 caractères.
 * Aucune mention de tampons ni de branche à 10 fleurs.
 */
import { formatPoints, pointsLabel } from "../../admin/loyalty/lib/points";
import { BrandLogo } from "../../components/BrandLogo";
import type { PublicCard } from "../lib/api";
import { describePointsProgress } from "../lib/progress";
import { formatPublicCode } from "../lib/qr";
import { CardQr } from "./CardQr";

type Props = {
  card: PublicCard;
  /** Points gagnés depuis la dernière ouverture sur cet appareil. */
  freshPoints?: number;
  qrOrigin?: string;
};

export function LoyaltyCard({ card, freshPoints = 0, qrOrigin }: Props) {
  const view = describePointsProgress(card);
  const suspended = card.status === "suspended";

  return (
    <article
      aria-label={`Carte de fidélité Kaytôri Club de ${card.fullName}`}
      className="overflow-hidden rounded-[1.75rem] bg-[#04170f] text-kaytori-cream shadow-[0_28px_56px_-28px_rgba(0,48,36,0.72)] ring-1 ring-kaytori-gold/30"
    >
      {/* Partie supérieure : identité, solde de points, valeur en DH et progression */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#07261b] via-[#003024] to-[#04170f] px-5 pb-6 pt-5 sm:px-7 sm:pt-6">
        <div
          className="pointer-events-none absolute inset-0 bg-seigaiha opacity-55 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_75%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-2.5 rounded-[1.35rem] border border-kaytori-gold/25" aria-hidden />

        {/* En-tête de la carte */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={36} className="ring-1 ring-kaytori-gold/45" />
            <div>
              <p className="font-display text-[1rem] font-semibold leading-none text-kaytori-cream">Kaytôri Sushi</p>
              <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-kaytori-gold">
                Kaytôri Club
              </p>
            </div>
          </div>

          <span className="rounded-full border border-kaytori-gold/35 bg-black/25 px-3 py-1 text-[0.74rem] font-medium text-kaytori-goldLight">
            {view.unitRuleLabel}
          </span>
        </div>

        {/* Nom du titulaire */}
        <div className="relative mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-kaytori-gold/80">Membre</p>
            <h2 className="mt-0.5 break-words font-display text-[1.5rem] font-semibold leading-tight text-white sm:text-[1.75rem]">
              {card.fullName}
            </h2>
          </div>
          {freshPoints > 0 ? (
            <span
              className="rounded-full bg-gold-shine px-3 py-1 text-[0.76rem] font-bold text-kaytori-black shadow-gold motion-safe:animate-admin-pop"
              aria-live="polite"
            >
              +{pointsLabel(freshPoints)}
            </span>
          ) : null}
        </div>

        {/* Bloc central : Solde de points & Équivalence Dirhams */}
        <div
          className="relative mt-5 rounded-2xl border border-kaytori-gold/30 bg-black/25 px-4 py-4 backdrop-blur-[2px] sm:px-5"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-kaytori-goldLight/80">
                Solde disponible
              </p>
              <p className="mt-1 leading-none">
                <span className="sr-only">{view.countLabel}</span>
                <span
                  aria-hidden
                  className="font-display text-[2.65rem] font-semibold tabular-nums lining-nums text-kaytori-gold sm:text-[3.1rem]"
                >
                  {view.formattedBalance}
                </span>
                <span aria-hidden className="ml-2 text-[1rem] font-medium text-kaytori-goldLight/90">
                  point{card.pointsBalance > 1 ? "s" : ""}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-kaytori-gold/35 bg-kaytori-gold/15 px-3.5 py-2 text-right">
              <p className="text-[0.68rem] uppercase tracking-wider text-kaytori-goldLight/85">Contre-valeur</p>
              <p className="font-display text-[1.25rem] font-semibold tabular-nums lining-nums text-white sm:text-[1.4rem]">
                {view.valueLabel}
              </p>
            </div>
          </div>

          {/* Progression vers la prochaine récompense */}
          {view.nextReward ? (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-2 text-[0.78rem]">
                <span className=" truncate font-medium text-kaytori-cream/90">
                  Prochain palier : <strong className="text-kaytori-goldLight">{view.nextReward.reward.name}</strong>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-kaytori-gold">
                  {formatPoints(card.pointsBalance)} / {formatPoints(view.nextReward.reward.pointsCost)} pts
                </span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={view.nextReward.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progression vers ${view.nextReward.reward.name}`}
              >
                <div
                  className="h-full rounded-full bg-gold-shine transition-[width] duration-300"
                  style={{ width: `${view.nextReward.progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-[0.86rem] leading-snug text-kaytori-cream/85">{view.hint}</p>
        </div>

        {/* Rappel de la règle de cumul */}
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-kaytori-goldLight/80">
          <span>Cumul : {view.earningRuleLabel}</span>
          {view.eligibleRewards.length > 0 ? (
            <span className="rounded-full bg-gold-shine px-2.5 py-0.5 text-[0.72rem] font-bold text-kaytori-black">
              {view.eligibleRewards.length} récompense{view.eligibleRewards.length > 1 ? "s" : ""} disponible
              {view.eligibleRewards.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>

      {/* Ligne de détachement entre la carte et le talon QR */}
      <div className="relative h-0" aria-hidden>
        <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-kaytori-page" />
        <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-kaytori-page" />
        <div className="mx-5 border-t-2 border-dashed border-kaytori-gold/35" />
      </div>

      {/* Talon QR ivoire haute lisibilité */}
      <div className="flex flex-col items-center gap-4 bg-kaytori-ivory px-5 py-5 text-kaytori-black min-[400px]:flex-row min-[400px]:items-center sm:px-7">
        <CardQr
          publicCode={card.publicCode}
          origin={qrOrigin}
          className={`h-[176px] w-[176px] shrink-0 ${suspended ? "opacity-40" : ""}`}
        />
        <div className="min-w-0 text-center min-[400px]:text-left">
          <p className="font-display text-[1.15rem] font-semibold text-kaytori-black">Passage au comptoir</p>
          <p className="mt-1 text-[0.9rem] leading-snug text-kaytori-muted">
            {suspended
              ? "Cette carte est suspendue : adressez-vous au personnel du restaurant."
              : "Présentez ce QR code au manager lors du règlement pour créditer vos points."}
          </p>
          <p className="mt-3 text-[0.74rem] font-medium uppercase tracking-wider text-kaytori-muted">
            Code de la carte
          </p>
          <p className="mt-0.5 font-mono text-[1.02rem] font-bold tabular-nums tracking-[0.08em] text-kaytori-black">
            {formatPublicCode(card.publicCode)}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Squelette de chargement aux mêmes dimensions que la carte. */
export function LoyaltyCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[1.75rem] bg-[#04170f]/95 ring-1 ring-kaytori-gold/25"
      role="status"
      aria-label="Chargement de votre carte"
    >
      <div className="space-y-4 px-5 pb-6 pt-5 motion-safe:animate-pulse">
        <div className="h-9 w-44 rounded-full bg-white/10" />
        <div className="h-7 w-52 rounded-lg bg-white/10" />
        <div className="h-32 w-full rounded-2xl bg-white/[0.06]" />
        <div className="h-5 w-48 rounded-lg bg-white/10" />
      </div>
      <div className="h-[216px] bg-kaytori-ivory/95" />
    </div>
  );
}
