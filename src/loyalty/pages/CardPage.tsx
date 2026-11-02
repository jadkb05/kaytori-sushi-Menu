/**
 * /fidelite/carte — Espace personnel du membre Kaytôri Club.
 *
 * Affiche :
 *   1. La carte de membre digitale (solde de points, valeur en DH, QR code, code public) ;
 *   2. Le catalogue des récompenses avec possibilité d'échange atomique et code de retrait ;
 *   3. L'historique compréhensible des opérations (points gagnés, récompenses échangées, ajustements) ;
 *   4. La gestion du lien personnel et les informations de récupération.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatCentimes,
  formatEarningRule,
  formatPoints,
  pointsLabel,
  pointsValueLabel,
} from "../../admin/loyalty/lib/points";
import { LoyaltyCard, LoyaltyCardSkeleton } from "../components/LoyaltyCard";
import {
  LoyaltyLayout,
  Notice,
  PrivacyNote,
  RecoveryHelp,
  Spinner,
  primaryButton,
  secondaryButton,
  textLink,
} from "../components/ui";
import {
  clientRedeemReward,
  viewCard,
  type PublicCard,
  type PublicHistoryEvent,
  type PublicReward,
} from "../lib/api";
import { asLoyaltyError, cardAdvice, redemptionAdvice, type ErrorAdvice } from "../lib/errors";
import { onInternalLink } from "../lib/navigation";
import { newlyGainedPoints } from "../lib/progress";
import { forgetCard, readSavedToken, readSeen, saveSeen, saveToken, type SeenProgress } from "../lib/storage";
import { generateRequestId, isAccessToken } from "../lib/token";
import { LOYALTY_ROUTES } from "../routes";
import { takeCreatedCard } from "./createdCard";

export type CardState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "invalidLink" }
  | { status: "error"; advice: ErrorAdvice; fromDevice: boolean }
  | { status: "ready"; card: PublicCard; freshPoints: number; justCreated: boolean };

/**
 * Jeton à utiliser : celui du lien (#…) ou celui gardé sur l'appareil.
 */
export function readAccess(
  hash: string = window.location.hash,
  saved: () => string | null = readSavedToken,
): { token: string | null; fromLink: boolean; invalidLink: boolean } {
  const fragment = hash.replace(/^#/, "");
  if (fragment !== "") {
    return isAccessToken(fragment)
      ? { token: fragment, fromLink: true, invalidLink: false }
      : { token: null, fromLink: true, invalidLink: true };
  }
  return { token: saved(), fromLink: false, invalidLink: false };
}

const REFRESH_AFTER_MS = 15000;

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Casablanca",
});

function formatClientDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return dateFormat.format(new Date(t));
}

export function CardPage() {
  const [access] = useState(() => readAccess());
  const [state, setState] = useState<CardState>(() => {
    if (access.invalidLink) return { status: "invalidLink" };
    if (!access.token) return { status: "none" };
    const created = takeCreatedCard(access.token);
    return created ? { status: "ready", card: created, freshPoints: 0, justCreated: true } : { status: "loading" };
  });
  const [refreshing, setRefreshing] = useState(false);
  const loadedAt = useRef(0);

  const baseline = useRef<SeenProgress | null | undefined>(undefined);
  const lastShown = useRef<SeenProgress | null>(null);

  const show = useCallback((card: PublicCard, justCreated: boolean) => {
    if (baseline.current === undefined) baseline.current = readSeen();
    const previous = lastShown.current;
    if (previous && previous.publicCode === card.publicCode && previous.pointsBalance !== card.pointsBalance) {
      baseline.current = previous;
    }
    const seen: SeenProgress = { publicCode: card.publicCode, pointsBalance: card.pointsBalance };
    lastShown.current = seen;
    const freshPoints = newlyGainedPoints(card, baseline.current);
    saveSeen(seen);
    loadedAt.current = Date.now();
    setState({ status: "ready", card, freshPoints, justCreated });
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!access.token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        show(await viewCard(access.token), false);
      } catch (e) {
        const err = asLoyaltyError(e);
        if (mode === "refresh" && (err.kind === "network" || err.kind === "timeout")) return;
        setState({ status: "error", advice: cardAdvice(err), fromDevice: !access.fromLink });
      } finally {
        setRefreshing(false);
      }
    },
    [access, show],
  );

  useEffect(() => {
    if (access.fromLink) {
      if (access.token) saveToken(access.token);
      window.history.replaceState(null, "", LOYALTY_ROUTES.card);
    }
    if (state.status === "loading") void load("initial");
    else if (state.status === "ready" && state.justCreated) {
      saveSeen({ publicCode: state.card.publicCode, pointsBalance: state.card.pointsBalance });
      loadedAt.current = Date.now();
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        loadedAt.current > 0 &&
        Date.now() - loadedAt.current > REFRESH_AFTER_MS
      ) {
        void load("refresh");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const retry = () => {
    setState({ status: "loading" });
    void load("initial");
  };

  const forget = () => {
    forgetCard();
    setState({ status: "none" });
  };

  const onCardUpdated = useCallback((updated: PublicCard) => {
    saveSeen({ publicCode: updated.publicCode, pointsBalance: updated.pointsBalance });
    lastShown.current = { publicCode: updated.publicCode, pointsBalance: updated.pointsBalance };
    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, card: updated, freshPoints: 0, justCreated: false }
        : { status: "ready", card: updated, freshPoints: 0, justCreated: false },
    );
  }, []);

  return (
    <CardView
      state={state}
      token={access.token}
      refreshing={refreshing}
      onRetry={retry}
      onRefresh={() => void load("refresh")}
      onForget={forget}
      onCardUpdated={onCardUpdated}
    />
  );
}

type ViewProps = {
  state: CardState;
  token: string | null;
  refreshing?: boolean;
  qrOrigin?: string;
  onRetry: () => void;
  onRefresh: () => void;
  onForget: () => void;
  onCardUpdated?: (card: PublicCard) => void;
};

export function CardView({
  state,
  token,
  refreshing = false,
  qrOrigin,
  onRetry,
  onRefresh,
  onForget,
  onCardUpdated,
}: ViewProps) {
  return (
    <LoyaltyLayout>
      <h1 className="sr-only">Mon espace fidélité Kaytôri Club</h1>
      <div className="space-y-6">
        {state.status === "loading" ? <LoyaltyCardSkeleton /> : null}

        {state.status === "none" ? (
          <Notice
            title="Aucune carte sur ce téléphone"
            actions={
              <>
                <a href={LOYALTY_ROUTES.home} onClick={onInternalLink(LOYALTY_ROUTES.home)} className={primaryButton}>
                  Rejoindre le Kaytôri Club
                </a>
                <a href="#retrouver-ma-carte" className={secondaryButton}>
                  J&apos;ai déjà une carte
                </a>
              </>
            }
          >
            Votre carte s&apos;ouvre grâce au lien personnel reçu lors de votre inscription, sur le téléphone où vous
            l&apos;avez enregistrée.
          </Notice>
        ) : null}

        {state.status === "invalidLink" ? (
          <Notice tone="error" title="Lien incomplet" role="alert">
            Ce lien de carte est incomplet ou tronqué. Rouvrez le lien d&apos;origine en entier, ou demandez au
            restaurant de vous en envoyer un nouveau.
          </Notice>
        ) : null}

        {state.status === "error" ? (
          <Notice
            tone={state.advice.action === "retry" || state.advice.action === "wait" ? "warning" : "error"}
            title={state.advice.title}
            role="alert"
            actions={
              state.advice.action === "retry" || state.advice.action === "wait" ? (
                <button type="button" onClick={onRetry} className={primaryButton}>
                  Réessayer
                </button>
              ) : state.fromDevice ? (
                <button type="button" onClick={onForget} className={secondaryButton}>
                  Retirer ce lien de ce téléphone
                </button>
              ) : undefined
            }
          >
            {state.advice.message}
          </Notice>
        ) : null}

        {state.status === "ready" ? (
          <ReadyCard
            state={state}
            token={token}
            refreshing={refreshing}
            qrOrigin={qrOrigin}
            onRefresh={onRefresh}
            onForget={onForget}
            onCardUpdated={onCardUpdated}
          />
        ) : null}

        {state.status !== "ready" && state.status !== "loading" ? (
          <div id="retrouver-ma-carte" className="scroll-mt-20">
            <RecoveryHelp />
          </div>
        ) : null}
      </div>
    </LoyaltyLayout>
  );
}

function ReadyCard({
  state,
  token,
  refreshing,
  qrOrigin,
  onRefresh,
  onForget,
  onCardUpdated,
}: {
  state: Extract<CardState, { status: "ready" }>;
  token: string | null;
  refreshing: boolean;
  qrOrigin?: string;
  onRefresh: () => void;
  onForget: () => void;
  onCardUpdated?: (card: PublicCard) => void;
}) {
  const { card } = state;
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const [confirmForget, setConfirmForget] = useState(false);
  const [confirmReward, setConfirmReward] = useState<PublicReward | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<ErrorAdvice | null>(null);
  const [voucher, setVoucher] = useState<{ rewardName: string; pointsCost: number; code: string } | null>(null);
  const pendingReqRef = useRef<{ rewardId: string; requestId: string } | null>(null);

  const copyLink = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${LOYALTY_ROUTES.card}#${token}`);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  };

  const executeRedeem = async (reward: PublicReward) => {
    if (!token || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemError(null);
    if (!pendingReqRef.current || pendingReqRef.current.rewardId !== reward.id) {
      pendingReqRef.current = { rewardId: reward.id, requestId: generateRequestId() };
    }
    const requestId = pendingReqRef.current.requestId;
    try {
      const res = await clientRedeemReward({ token, rewardId: reward.id, requestId });
      pendingReqRef.current = null;
      setConfirmReward(null);
      setVoucher({
        rewardName: res.redemption.rewardName ?? reward.name,
        pointsCost: res.redemption.pointsCost,
        code: res.redemption.redemptionCode ?? "",
      });
      onCardUpdated?.(res.card);
    } catch (e) {
      setRedeemError(redemptionAdvice(asLoyaltyError(e)));
    } finally {
      setRedeemBusy(false);
    }
  };

  const suspended = card.status === "suspended";

  return (
    <>
      {state.justCreated ? (
        <Notice tone="success" title="Bienvenue au Kaytôri Club" role="status">
          Votre carte est enregistrée sur ce téléphone. Présentez votre QR code au comptoir lors de chacune de vos
          commandes pour cumuler vos points.
        </Notice>
      ) : null}

      {suspended ? (
        <Notice tone="warning" title="Carte suspendue" role="status">
          Votre carte est momentanément suspendue. Adressez-vous au personnel du restaurant pour plus d&apos;informations.
        </Notice>
      ) : !card.programActive ? (
        <Notice tone="warning" title="Programme en pause" role="status">
          L&apos;attribution de nouveaux points est momentanément en pause. Vos points déjà acquis ({pointsLabel(card.pointsBalance)}) restent conservés sur votre carte.
        </Notice>
      ) : null}

      {/* Carte de membre principale */}
      <LoyaltyCard card={card} freshPoints={state.freshPoints} qrOrigin={qrOrigin} />

      {/* Bon d'échange obtenu après validation d'une récompense */}
      {voucher ? (
        <section
          aria-labelledby="fidelite-bon-echange"
          role="status"
          className="overflow-hidden rounded-[1.5rem] border-2 border-kaytori-gold bg-gradient-to-br from-[#07261b] to-[#04170f] p-5 text-kaytori-cream shadow-lg motion-safe:animate-admin-pop"
        >
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-kaytori-gold">
            Bon d&apos;échange validé
          </p>
          <h2 id="fidelite-bon-echange" className="mt-1 font-display text-[1.4rem] font-semibold text-white">
            {voucher.rewardName}
          </h2>
          <p className="mt-1 text-[0.9rem] text-kaytori-cream/85">
            Présentez ce code au personnel du comptoir pour recevoir votre récompense (−{pointsLabel(voucher.pointsCost)}).
          </p>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-kaytori-gold/45 bg-black/35 px-4 py-3">
            <span className="text-[0.78rem] uppercase tracking-wider text-kaytori-goldLight/80">Code comptoir</span>
            <span className="font-mono text-[1.35rem] font-bold tracking-[0.12em] text-kaytori-gold">
              {voucher.code}
            </span>
          </div>
        </section>
      ) : null}

      {/* État explicite lorsque le client a 0 point */}
      {card.pointsBalance === 0 && card.pointsEarnedTotal === 0 ? (
        <section
          aria-labelledby="fidelite-zero-points"
          className="rounded-2xl border border-kaytori-green/15 bg-white px-5 py-5"
        >
          <h2 id="fidelite-zero-points" className="font-display text-[1.2rem] font-semibold text-kaytori-black">
            Cumulez vos premiers points au restaurant
          </h2>
          <p className="mt-1.5 text-[0.93rem] leading-relaxed text-kaytori-black/80">
            Lors de votre prochain passage chez Kaytôri Sushi, présentez votre QR code au manager. Vos points sont
            calculés automatiquement à partir du montant de votre ticket (
            <strong>
              {formatEarningRule({
                earningPoints: card.earningPoints,
                earningDirhams: card.earningDirhams,
                roundingRule: card.roundingRule,
              })}
            </strong>
            , avec <strong>1 point = {formatCentimes(card.pointValueCentimes)}</strong>).
          </p>
        </section>
      ) : null}

      {/* Catalogue des récompenses */}
      <section aria-labelledby="fidelite-catalogue" className="space-y-3.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-kaytori-green">
              Privilèges du Club
            </p>
            <h2 id="fidelite-catalogue" className="font-display text-[1.45rem] font-semibold text-kaytori-black">
              Catalogue des récompenses
            </h2>
          </div>
          <span className="text-[0.82rem] font-medium text-kaytori-muted">
            1 pt = {formatCentimes(card.pointValueCentimes)}
          </span>
        </div>

        {card.rewards.length === 0 ? (
          <div className="rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-6 text-center text-[0.93rem] text-kaytori-muted">
            Le catalogue des récompenses est en cours de mise à jour par le restaurant.
          </div>
        ) : (
          <ul className="space-y-3">
            {card.rewards.map((reward) => {
              const eligible = card.pointsBalance >= reward.pointsCost;
              const missing = Math.max(0, reward.pointsCost - card.pointsBalance);
              const pct = Math.min(100, Math.max(0, Math.floor((card.pointsBalance * 100) / reward.pointsCost)));
              const isConfirming = confirmReward?.id === reward.id;

              return (
                <li
                  key={reward.id}
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    eligible
                      ? "border-kaytori-gold/65 bg-white shadow-[0_12px_28px_-18px_rgba(0,48,36,0.25)]"
                      : "border-kaytori-black/[0.08] bg-white/90"
                  }`}
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-[1.15rem] font-semibold leading-snug text-kaytori-black">
                            {reward.name}
                          </h3>
                          {eligible ? (
                            <span className="rounded-full bg-[#003024] px-2.5 py-0.5 text-[0.72rem] font-semibold text-kaytori-goldLight">
                              Disponible
                            </span>
                          ) : null}
                        </div>
                        {reward.description ? (
                          <p className="mt-1 text-[0.9rem] leading-relaxed text-kaytori-black/75">
                            {reward.description}
                          </p>
                        ) : null}
                        {reward.conditions ? (
                          <p className="mt-1 text-[0.78rem] text-kaytori-muted">{reward.conditions}</p>
                        ) : null}
                      </div>

                      <div className="shrink-0 rounded-xl border border-kaytori-gold/40 bg-[#fbf6e8] px-3 py-2 text-right">
                        <span className="block font-display text-[1.15rem] font-bold tabular-nums leading-none text-[#003024]">
                          {formatPoints(reward.pointsCost)} pts
                        </span>
                        <span className="mt-0.5 block text-[0.74rem] font-semibold text-kaytori-muted">
                          {pointsValueLabel(reward.pointsCost, card.pointValueCentimes)}
                        </span>
                      </div>
                    </div>

                    {eligible ? (
                      <div className="mt-4">
                        {isConfirming ? (
                          <div className="space-y-3 rounded-xl border border-kaytori-gold/50 bg-[#fbf6e8]/80 p-3.5">
                            <p className="text-[0.88rem] font-medium text-kaytori-black">
                              Confirmer l&apos;échange de <strong>{reward.name}</strong> contre{" "}
                              <strong>{pointsLabel(reward.pointsCost)}</strong> ? Votre solde passera à{" "}
                              <strong>{pointsLabel(card.pointsBalance - reward.pointsCost)}</strong> et un code de
                              retrait à présenter au comptoir vous sera délivré.
                            </p>
                            {redeemError ? (
                              <p role="alert" className="text-[0.84rem] font-medium text-red-800">
                                {redeemError.message}
                              </p>
                            ) : null}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                disabled={redeemBusy}
                                onClick={() => void executeRedeem(reward)}
                                className={`${primaryButton} min-h-[44px] sm:flex-1`}
                              >
                                {redeemBusy ? <Spinner /> : null}
                                {redeemBusy
                                  ? "Validation…"
                                  : `Confirmer (−${formatPoints(reward.pointsCost)} pts)`}
                              </button>
                              <button
                                type="button"
                                disabled={redeemBusy}
                                onClick={() => {
                                  setConfirmReward(null);
                                  setRedeemError(null);
                                }}
                                className={`${secondaryButton} min-h-[44px] sm:w-auto`}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={suspended || !token}
                            onClick={() => {
                              setRedeemError(null);
                              setConfirmReward(reward);
                            }}
                            className={`${primaryButton} min-h-[44px]`}
                          >
                            Échanger cette récompense ({pointsLabel(reward.pointsCost)})
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3.5">
                        <div className="flex items-center justify-between text-[0.78rem] text-kaytori-muted">
                          <span>Il vous manque {pointsLabel(missing)}</span>
                          <span className="font-semibold tabular-nums">{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-kaytori-black/[0.07]">
                          <div
                            className="h-full rounded-full bg-[#003024]/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Historique des opérations */}
      <section
        aria-labelledby="fidelite-historique"
        className="rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="fidelite-historique" className="font-display text-[1.25rem] font-semibold text-kaytori-black">
            Historique de vos points
          </h2>
          <span className="text-[0.8rem] text-kaytori-muted">
            Cumulé : {pointsLabel(card.pointsEarnedTotal)}
          </span>
        </div>

        {card.history.length === 0 ? (
          <p className="mt-3 text-[0.92rem] text-kaytori-muted">
            Aucune opération enregistrée sur votre carte pour le moment.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-kaytori-black/[0.07]">
            {card.history.map((item) => (
              <ClientHistoryRow key={item.eventId} item={item} pointValueCentimes={card.pointValueCentimes} />
            ))}
          </ol>
        )}
      </section>

      {/* Actualisation */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          className={secondaryButton}
        >
          {refreshing ? <Spinner /> : null}
          {refreshing ? "Actualisation…" : "Actualiser mon solde"}
        </button>
      </div>

      {/* Garder ma carte */}
      <section
        aria-labelledby="fidelite-garder"
        className="rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-5"
      >
        <h2 id="fidelite-garder" className="font-display text-[1.2rem] font-semibold">
          Conserver l&apos;accès à ma carte
        </h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-kaytori-black/80">
          Votre carte est mémorisée dans ce navigateur. Si vous changez de téléphone ou videz vos données de
          navigation, conservez votre lien personnel en lieu sûr (par exemple dans vos notes). Ne le partagez pas : il
          donne accès à votre carte.
        </p>
        <button type="button" onClick={copyLink} className={`${secondaryButton} mt-4`}>
          Copier le lien personnel de ma carte
        </button>
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-[0.88rem] text-kaytori-muted">
          {copy === "done"
            ? "Lien copié dans le presse-papiers."
            : copy === "failed"
              ? "La copie automatique n'est pas disponible sur ce navigateur."
              : ""}
        </p>
        <div className="mt-2 border-t border-kaytori-black/[0.07] pt-4">
          {confirmForget ? (
            <div className="space-y-3" role="group" aria-labelledby="fidelite-retirer-question">
              <p id="fidelite-retirer-question" className="text-[0.95rem] leading-relaxed">
                Retirer la carte de ce téléphone ? Votre solde de points reste conservé au restaurant, mais il vous
                faudra votre lien personnel pour rouvrir votre carte sur cet appareil.
              </p>
              <button
                type="button"
                onClick={onForget}
                className={`${secondaryButton} border-red-300 text-red-800`}
              >
                Oui, retirer de ce téléphone
              </button>
              <button type="button" onClick={() => setConfirmForget(false)} className={secondaryButton}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmForget(true)} className={`${textLink} min-h-[44px]`}>
              Retirer la carte de ce téléphone
            </button>
          )}
        </div>
      </section>

      {card.termsSummary ? (
        <p className="px-1 text-center text-[0.82rem] leading-relaxed text-kaytori-muted">{card.termsSummary}</p>
      ) : null}

      <PrivacyNote />
    </>
  );
}

function ClientHistoryRow({
  item,
  pointValueCentimes,
}: {
  item: PublicHistoryEvent;
  pointValueCentimes: number;
}) {
  let title = "Opération sur la carte";
  if (item.kind === "points_credited") title = "Points gagnés au restaurant";
  else if (item.kind === "reward_redeemed") title = item.rewardName ? `Récompense : ${item.rewardName}` : "Récompense échangée";
  else if (item.kind === "points_adjusted") title = item.pointsDelta >= 0 ? "Points crédités (ajustement)" : "Points débités (ajustement)";
  else if (item.kind === "points_reverted") title = "Correction de points";
  else if (item.kind === "reward_redemption_reverted") title = "Échange annulé (points recrédités)";
  else if (item.kind === "card_created") title = "Création de votre carte Kaytôri Club";

  const reverted = item.revertedByEventId !== null;
  const details: string[] = [];
  if (item.ticketAmountCentimes !== null) details.push(`Ticket : ${formatCentimes(item.ticketAmountCentimes)}`);
  if (item.orderRef) details.push(`Commande ${item.orderRef}`);
  if (item.redemptionCode) details.push(`Code comptoir : ${item.redemptionCode}`);
  if (item.reason) details.push(item.reason);

  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p
          className={`text-[0.95rem] font-semibold ${
            reverted ? "line-through text-kaytori-muted" : "text-kaytori-black"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[0.8rem] text-kaytori-muted">
          <time dateTime={item.createdAt}>{formatClientDate(item.createdAt)}</time>
          {reverted ? " · Opération corrigée" : ""}
        </p>
        {details.length > 0 ? (
          <p className="mt-1 text-[0.84rem] text-kaytori-black/75">{details.join(" · ")}</p>
        ) : null}
      </div>

      {item.pointsDelta !== 0 ? (
        <div className="shrink-0 text-right">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[0.84rem] font-bold tabular-nums ${
              item.pointsDelta > 0
                ? "bg-kaytori-sage text-[#003024]"
                : "bg-[#fbf3dc] text-[#7a5a0b]"
            }`}
          >
            {item.pointsDelta > 0 ? "+" : "−"}
            {formatPoints(Math.abs(item.pointsDelta))} pts
          </span>
          <span className="mt-0.5 block text-[0.72rem] text-kaytori-muted">
            {pointsValueLabel(Math.abs(item.pointsDelta), pointValueCentimes)}
          </span>
        </div>
      ) : null}
    </li>
  );
}
