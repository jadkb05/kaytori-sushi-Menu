/**
 * /fidelite/scan/:code — Parcours rapide Manager depuis le QR code d'un client.
 *
 * 1. Le manager scanne le QR code du client avec l'appareil photo de son téléphone.
 * 2. La page demande le code secret du manager (vérifié uniquement côté serveur via loyalty_qr_unlock,
 *    avec limitation des tentatives et temporisation serveur).
 * 3. Une fois déverrouillée, la session temporaire est strictement limitée à CETTE carte et à
 *    l'attribution de points sur ticket (aucun accès à l'administration complète ni aux autres cartes).
 * 4. Le manager saisit le montant du ticket (obligatoire) et le n° de commande (optionnel),
 *    voit l'aperçu immédiat des points, valide de manière idempotente, puis obtient la confirmation.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  computeTicketPoints,
  formatCentimes,
  formatEarningRule,
  formatPoints,
  parseTicketInput,
  pointsLabel,
  pointsValueLabel,
} from "../../admin/loyalty/lib/points";
import { BrandLogo } from "../../components/BrandLogo";
import { CheckIcon, EyeIcon, EyeOffIcon, SparkleIcon } from "../../admin/components/icons";
import { Spinner } from "../components/ui";
import {
  closeQrSession,
  creditQrPoints,
  fetchQrCardStatus,
  unlockQrCard,
  type QrCardStatus,
  type QrCreditResult,
  type QrEarningConfig,
  type QrUnlockedCard,
} from "../lib/api";
import { LoyaltyError, asLoyaltyError } from "../lib/errors";
import { onInternalLink } from "../lib/navigation";
import { cleanPublicCodeInput, formatPublicCode, isPublicCode } from "../lib/qr";
import { LOYALTY_ROUTES } from "../routes";

export const cleanPublicCode = cleanPublicCodeInput;

const MIN_PIN = 4;
const MAX_PIN = 12;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const keyBase =
  "grid h-14 select-none place-items-center rounded-2xl bg-white/[0.07] font-sans text-kaytori-cream ring-1 ring-kaytori-gold/20 transition-colors hover:bg-white/[0.12] active:bg-kaytori-gold/25 disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold";
const keyClass = `${keyBase} text-[1.45rem] font-medium tabular-nums`;

export type ScanFlowState =
  | { step: "invalid_code" }
  | { step: "status_blocked"; reason: "not_found" | "program_closed" | "unconfigured_earning" | "unconfigured_pin" | "card_suspended"; publicCode: string }
  | { step: "pin"; publicCode: string; program?: QrEarningConfig; notice?: string | null; initialLockSeconds?: number }
  | { step: "form"; publicCode: string; sessionToken: string; expiresAt: string; card: QrUnlockedCard; program: QrEarningConfig }
  | { step: "done"; publicCode: string; result: QrCreditResult }
  | { step: "closed"; publicCode: string };

export function ScanPage({
  publicCode,
  hasSavedCard,
  initialState,
}: {
  publicCode: string;
  hasSavedCard: boolean;
  initialState?: ScanFlowState;
}) {
  const cleanCode = cleanPublicCodeInput(publicCode);
  const validFormat = isPublicCode(cleanCode);

  const [flow, setFlow] = useState<ScanFlowState>(() => {
    if (initialState) return initialState;
    if (!validFormat) return { step: "invalid_code" };
    return { step: "pin", publicCode: cleanCode };
  });
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (initialState || !validFormat) return;
    let cancelled = false;
    setStatusError(null);
    void fetchQrCardStatus(cleanCode)
      .then((res: QrCardStatus) => {
        if (cancelled) return;
        switch (res.status) {
          case "invalid_code":
            setFlow({ step: "invalid_code" });
            break;
          case "not_found":
          case "program_closed":
          case "unconfigured_earning":
          case "unconfigured_pin":
          case "card_suspended":
            setFlow({ step: "status_blocked", reason: res.status, publicCode: res.publicCode });
            break;
          case "locked":
            setFlow({ step: "pin", publicCode: res.publicCode, initialLockSeconds: res.retryAfterSeconds });
            break;
          case "ready":
            setFlow((prev) =>
              prev.step === "pin"
                ? {
                    step: "pin",
                    publicCode: res.publicCode,
                    program: {
                      pointValueCentimes: res.pointValueCentimes,
                      earningPoints: res.earningPoints,
                      earningDirhams: res.earningDirhams,
                      roundingRule: res.roundingRule,
                      minTicketCentimes: res.minTicketCentimes,
                      maxPointsPerOrder: res.maxPointsPerOrder,
                      maxPointsPerDay: res.maxPointsPerDay,
                    },
                  }
                : prev,
            );
            break;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const le = asLoyaltyError(err);
        setStatusError(
          le.kind === "network" || le.kind === "timeout"
            ? "Connexion interrompue. Vérifiez votre réseau avant de valider le code."
            : null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [cleanCode, validFormat, initialState]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-club-night bg-club-page px-4 py-6 font-sans text-kaytori-cream">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-64 bg-seigaiha opacity-50 [mask-image:linear-gradient(to_top,black,transparent)]" aria-hidden />

      <div className="relative w-full max-w-[24rem]">
        {flow.step === "invalid_code" ? (
          <BlockedCard
            title="QR code non reconnu"
            message="Ce code ne correspond pas au format d'une carte membre Kaytôri Club."
            hasSavedCard={hasSavedCard}
          />
        ) : flow.step === "status_blocked" ? (
          <StatusBlockedView reason={flow.reason} publicCode={flow.publicCode} hasSavedCard={hasSavedCard} />
        ) : flow.step === "pin" ? (
          <QrPinStep
            publicCode={flow.publicCode}
            notice={flow.notice ?? statusError}
            initialLockSeconds={flow.initialLockSeconds ?? 0}
            hasSavedCard={hasSavedCard}
            onUnlocked={(unlocked) =>
              setFlow({
                step: "form",
                publicCode: flow.publicCode,
                sessionToken: unlocked.sessionToken,
                expiresAt: unlocked.expiresAt,
                card: unlocked.card,
                program: unlocked.program,
              })
            }
            onBlocked={(reason) => setFlow({ step: "status_blocked", reason, publicCode: flow.publicCode })}
          />
        ) : flow.step === "form" ? (
          <QrTicketFormStep
            publicCode={flow.publicCode}
            sessionToken={flow.sessionToken}
            card={flow.card}
            program={flow.program}
            onSessionExpired={() =>
              setFlow({
                step: "pin",
                publicCode: flow.publicCode,
                program: flow.program,
                notice: "Session expirée. Ressaisissez votre code secret.",
              })
            }
            onSuccess={(result) => {
              void closeQrSession(flow.sessionToken).catch(() => {});
              setFlow({ step: "done", publicCode: flow.publicCode, result });
            }}
            onCancel={() => {
              void closeQrSession(flow.sessionToken).catch(() => {});
              setFlow({ step: "closed", publicCode: flow.publicCode });
            }}
          />
        ) : flow.step === "done" ? (
          <QrSuccessStep
            result={flow.result}
            onFinish={() => setFlow({ step: "closed", publicCode: flow.publicCode })}
          />
        ) : (
          <QrClosedStep
            publicCode={flow.publicCode}
            hasSavedCard={hasSavedCard}
            onReopen={() => setFlow({ step: "pin", publicCode: flow.publicCode })}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Étape 1 : Code secret Manager */

export function QrPinStep({
  publicCode,
  notice,
  initialLockSeconds,
  hasSavedCard,
  onUnlocked,
  onBlocked,
}: {
  publicCode: string;
  notice?: string | null;
  initialLockSeconds: number;
  hasSavedCard: boolean;
  onUnlocked: (res: Extract<Awaited<ReturnType<typeof unlockQrCard>>, { status: "unlocked" }>) => void;
  onBlocked: (reason: "not_found" | "program_closed" | "unconfigured_earning" | "unconfigured_pin" | "card_suspended") => void;
}) {
  const [pin, setPin] = useState("");
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockSeconds, setLockSeconds] = useState(initialLockSeconds);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialLockSeconds > 0) setLockSeconds(initialLockSeconds);
  }, [initialLockSeconds]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const id = window.setInterval(() => {
      setLockSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockSeconds]);

  const locked = lockSeconds > 0;
  const canSubmit = pin.length >= MIN_PIN && !checking && !locked;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setChecking(true);
    setError(null);
    try {
      const res = await unlockQrCard({ publicCode, pin });
      setChecking(false);
      setPin("");
      if (res.status === "unlocked") {
        onUnlocked(res);
        return;
      }
      if (res.status === "locked") {
        setLockSeconds(Math.max(1, res.retryAfterSeconds));
        setError("Trop de tentatives. Veuillez patienter.");
        return;
      }
      setError(
        res.attemptsRemaining > 0
          ? `Code secret incorrect (${res.attemptsRemaining} essai${res.attemptsRemaining > 1 ? "s" : ""} restant${res.attemptsRemaining > 1 ? "s" : ""}).`
          : "Code secret incorrect.",
      );
      inputRef.current?.focus();
    } catch (err) {
      setChecking(false);
      setPin("");
      const le = asLoyaltyError(err);
      if (le.code === "KL005") return onBlocked("not_found");
      if (le.code === "KL004") return onBlocked("program_closed");
      if (le.code === "KL006") return onBlocked("card_suspended");
      if (le.code === "KL016") return onBlocked("unconfigured_pin");
      setError(
        le.kind === "network" || le.kind === "timeout"
          ? "Connexion interrompue. Vérifiez votre réseau et réessayez."
          : "Impossible de vérifier le code pour le moment.",
      );
    }
  };

  const press = (digit: string) => {
    if (locked || checking) return;
    setError(null);
    setPin((p) => (p.length < MAX_PIN ? p + digit : p));
  };

  return (
    <section
      aria-labelledby="qr-pin-title"
      className="relative overflow-hidden rounded-[1.75rem] border border-club-line bg-club-panel bg-club-sheen px-5 pb-6 pt-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.85)]"
    >
      <div className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-kaytori-gold/20" aria-hidden />

      <div className="relative flex flex-col items-center text-center">
        <BrandLogo size={56} className="ring-2 ring-kaytori-gold/45" />
        <p className="mt-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-kaytori-gold">Kaytôri Club</p>
        <h1 id="qr-pin-title" className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight text-white">
          Validation Manager
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-kaytori-gold/25 bg-black/25 px-3 py-1 text-[0.78rem] font-medium tabular-nums tracking-[0.1em] text-kaytori-goldLight">
          <span>Carte</span>
          <span>{formatPublicCode(publicCode)}</span>
        </div>
      </div>

      <form onSubmit={submit} className="relative mt-4" noValidate>
        {notice ? (
          <p role="status" className="mb-3 rounded-xl bg-kaytori-gold/15 px-3 py-2 text-center text-[0.84rem] text-kaytori-goldLight">
            {notice}
          </p>
        ) : null}

        <label htmlFor="qr-manager-pin" className="block text-center text-[0.9rem] font-medium text-kaytori-cream/90">
          Code secret du manager
        </label>

        <div className="relative mt-2">
          <input
            ref={inputRef}
            id="qr-manager-pin"
            type={visible ? "text" : "password"}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={MAX_PIN}
            value={pin}
            disabled={locked || checking}
            onChange={(e) => {
              setError(null);
              setPin(e.target.value.replace(/\D/g, "").slice(0, MAX_PIN));
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="qr-pin-help"
            className="block h-13 w-full rounded-2xl border border-kaytori-gold/35 bg-black/25 px-12 text-center font-display text-[1.5rem] tracking-[0.38em] text-white placeholder:text-kaytori-cream/25 focus:border-kaytori-gold focus:outline-none focus:ring-2 focus:ring-kaytori-gold/40 disabled:opacity-50"
            placeholder="••••"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le code" : "Afficher le code"}
            aria-pressed={visible}
            className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-kaytori-goldLight hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold"
          >
            {visible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>

        <p
          id="qr-pin-help"
          aria-live="polite"
          className={`mt-2 min-h-[1.35rem] text-center text-[0.84rem] ${error || locked ? "text-[#ffb4a8]" : "text-kaytori-cream/65"}`}
        >
          {locked
            ? `Accès temporairement verrouillé. Réessayez dans ${lockSeconds} s.`
            : (error ?? "Saisissez votre code secret pour créditer cette carte.")}
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-2" role="group" aria-label="Clavier numérique">
          {KEYS.map((k) => (
            <button key={k} type="button" className={keyClass} disabled={locked || checking} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button
            type="button"
            className={`${keyBase} text-[0.88rem] font-semibold`}
            disabled={locked || checking || pin === ""}
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Effacer le dernier chiffre"
          >
            Effacer
          </button>
          <button type="button" className={keyClass} disabled={locked || checking} onClick={() => press("0")}>
            0
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="grid h-14 place-items-center rounded-2xl bg-gold-shine text-[0.95rem] font-semibold text-kaytori-black transition-[filter] hover:brightness-105 disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {checking ? <Spinner className="h-5 w-5" /> : "Valider"}
          </button>
        </div>
      </form>

      <div className="relative mt-5 border-t border-white/10 pt-3.5 text-center text-[0.78rem] text-kaytori-cream/60">
        <span>Ce code ne donne accès à aucune donnée personnelle sans validation.</span>
        <div className="mt-1.5 flex items-center justify-center gap-3">
          {hasSavedCard ? (
            <a
              href={LOYALTY_ROUTES.card}
              onClick={onInternalLink(LOYALTY_ROUTES.card)}
              className="font-medium text-kaytori-goldLight underline underline-offset-4"
            >
              Voir ma carte client
            </a>
          ) : (
            <a
              href={LOYALTY_ROUTES.home}
              onClick={onInternalLink(LOYALTY_ROUTES.home)}
              className="font-medium text-kaytori-goldLight underline underline-offset-4"
            >
              Espace client Kaytôri Club
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Étape 2 : Formulaire rapide Ticket */

export function QrTicketFormStep({
  publicCode,
  sessionToken,
  card,
  program,
  onSessionExpired,
  onSuccess,
  onCancel,
}: {
  publicCode: string;
  sessionToken: string;
  card: QrUnlockedCard;
  program: QrEarningConfig;
  onSessionExpired: () => void;
  onSuccess: (result: QrCreditResult) => void;
  onCancel: () => void;
}) {
  const [ticketRaw, setTicketRaw] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingKeyRef = useRef<{ signature: string; requestId: string } | null>(null);

  const parsedTicket = parseTicketInput(ticketRaw);
  const validCentimes = "centimes" in parsedTicket ? parsedTicket.centimes : null;
  const preview = validCentimes !== null ? computeTicketPoints(validCentimes, program) : null;
  const canSubmit = !submitting && preview?.status === "ok" && preview.points > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if ("error" in parsedTicket) {
      setError(parsedTicket.error);
      return;
    }
    if (!preview || preview.status !== "ok") {
      if (preview?.status === "below_min") {
        setError(`Le montant minimum pour gagner des points est de ${formatCentimes(preview.minTicketCentimes)}.`);
      } else {
        setError("Ce montant ne donne droit à aucun point selon la règle actuelle.");
      }
      return;
    }

    const cleanOrder = orderRef.trim() || null;
    const signature = `${parsedTicket.centimes}:${cleanOrder ?? ""}`;
    if (!pendingKeyRef.current || pendingKeyRef.current.signature !== signature) {
      pendingKeyRef.current = { signature, requestId: crypto.randomUUID() };
    }
    const requestId = pendingKeyRef.current.requestId;

    setSubmitting(true);
    setError(null);
    try {
      const res = await creditQrPoints({
        sessionToken,
        publicCode,
        ticketCentimes: parsedTicket.centimes,
        orderRef: cleanOrder,
        requestId,
      });
      pendingKeyRef.current = null;
      setSubmitting(false);
      onSuccess(res);
    } catch (err) {
      setSubmitting(false);
      const le: LoyaltyError = asLoyaltyError(err);
      if (le.code === "KL015") {
        pendingKeyRef.current = null;
        onSessionExpired();
        return;
      }
      if (le.kind !== "network" && le.kind !== "timeout") {
        pendingKeyRef.current = null;
      }
      if (le.code === "KL014") {
        setError(le.message || "Plafond de points ou montant minimum non respecté.");
      } else if (le.code === "KL006") {
        setError("Cette carte est suspendue.");
      } else if (le.kind === "network" || le.kind === "timeout") {
        setError("Connexion interrompue. Appuyez à nouveau sur Valider : aucun doublon ne sera créé.");
      } else {
        setError("L'attribution n'a pas pu aboutir. Vérifiez la saisie et réessayez.");
      }
    }
  };

  return (
    <section
      aria-labelledby="qr-form-title"
      className="relative overflow-hidden rounded-[1.75rem] border border-club-line bg-club-panel bg-club-sheen px-5 pb-6 pt-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.85)]"
    >
      <div className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-kaytori-gold/20" aria-hidden />

      <div className="relative flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-kaytori-gold">Attribution rapide</p>
          <h1 id="qr-form-title" className="mt-0.5 font-display text-[1.35rem] font-semibold text-white">
            {card.fullName}
          </h1>
          <p className="mt-0.5 text-[0.78rem] tabular-nums text-kaytori-cream/65">
            Carte {formatPublicCode(card.publicCode)} · Active
          </p>
        </div>
        <div className="rounded-2xl border border-kaytori-gold/30 bg-black/25 px-3.5 py-2 text-right">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-kaytori-cream/65">Solde actuel</p>
          <p className="font-display text-[1.15rem] font-semibold tabular-nums text-kaytori-goldLight">
            {formatPoints(card.pointsBalance)} pts
          </p>
          <p className="text-[0.75rem] tabular-nums text-kaytori-cream/70">
            {pointsValueLabel(card.pointsBalance, card.pointValueCentimes)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative mt-5 space-y-4" noValidate>
        <div>
          <label htmlFor="qr-ticket-amount" className="block text-[0.9rem] font-medium text-white">
            Montant total du ticket (DH) <span className="text-kaytori-gold">*</span>
          </label>
          <div className="relative mt-1.5">
            <input
              id="qr-ticket-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              disabled={submitting}
              value={ticketRaw}
              onChange={(e) => {
                setError(null);
                setTicketRaw(e.target.value);
              }}
              placeholder="Ex. 185 ou 185,50"
              className="block h-13 w-full rounded-2xl border border-kaytori-gold/35 bg-black/25 pl-4 pr-14 text-[1.15rem] font-semibold tabular-nums text-white placeholder:font-normal placeholder:text-kaytori-cream/30 focus:border-kaytori-gold focus:outline-none focus:ring-2 focus:ring-kaytori-gold/40"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[0.9rem] font-semibold text-kaytori-goldLight">
              DH
            </span>
          </div>
          <p className="mt-1 text-[0.76rem] text-kaytori-cream/60">
            Règle active : {formatEarningRule(program)}
            {program.minTicketCentimes > 0 ? ` · Minimum ${formatCentimes(program.minTicketCentimes)}` : ""}
          </p>
        </div>

        <div>
          <label htmlFor="qr-order-ref" className="block text-[0.86rem] font-medium text-kaytori-cream/85">
            Numéro de commande <span className="text-kaytori-cream/50">(optionnel)</span>
          </label>
          <input
            id="qr-order-ref"
            type="text"
            autoComplete="off"
            maxLength={60}
            disabled={submitting}
            value={orderRef}
            onChange={(e) => {
              setError(null);
              setOrderRef(e.target.value);
            }}
            placeholder="Ex. Ticket #402"
            className="mt-1.5 block h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3.5 text-[0.95rem] text-white placeholder:text-kaytori-cream/30 focus:border-kaytori-gold focus:outline-none focus:ring-2 focus:ring-kaytori-gold/40"
          />
        </div>

        {/* Aperçu immédiat des points */}
        <div
          aria-live="polite"
          className="rounded-2xl border border-kaytori-gold/30 bg-black/30 px-4 py-3.5"
        >
          {preview?.status === "ok" ? (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[0.74rem] font-medium uppercase tracking-[0.14em] text-kaytori-gold">
                  Points à créditer
                </p>
                <p className="mt-0.5 text-[0.82rem] text-kaytori-cream/75">
                  Nouveau solde : {pointsLabel(card.pointsBalance + preview.points)} (
                  {pointsValueLabel(card.pointsBalance + preview.points, program.pointValueCentimes)})
                </p>
                {preview.cappedByOrder ? (
                  <p className="mt-0.5 text-[0.75rem] text-kaytori-goldLight">
                    Plafonné à {formatPoints(program.maxPointsPerOrder!)} pts par commande
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-display text-[1.55rem] font-semibold tabular-nums text-kaytori-goldLight">
                  +{formatPoints(preview.points)}
                </p>
                <p className="text-[0.76rem] tabular-nums text-kaytori-cream/75">
                  +{pointsValueLabel(preview.points, program.pointValueCentimes)}
                </p>
              </div>
            </div>
          ) : preview?.status === "below_min" ? (
            <p className="text-[0.86rem] text-[#ffb4a8]">
              Montant inférieur au minimum requis ({formatCentimes(preview.minTicketCentimes)}).
            </p>
          ) : (
            <p className="text-[0.85rem] text-kaytori-cream/65">
              Saisissez le montant du ticket pour calculer automatiquement les points.
            </p>
          )}
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-[#ffb4a8]/40 bg-[#4c1d18]/70 px-3.5 py-2.5 text-[0.86rem] text-[#ffd7d0]">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gold-shine px-5 py-3 text-[0.98rem] font-semibold text-kaytori-black transition-[filter] hover:brightness-105 disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {submitting ? (
              <>
                <Spinner className="h-5 w-5" />
                <span>Attribution en cours…</span>
              </>
            ) : preview?.status === "ok" ? (
              <>
                <SparkleIcon className="h-5 w-5" />
                <span>Créditer +{ pointsLabel(preview.points) }</span>
              </>
            ) : (
              <span>Valider l'attribution</span>
            )}
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[0.88rem] font-medium text-kaytori-cream/80 hover:bg-white/10"
          >
            Annuler et fermer la session
          </button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ Étape 3 : Confirmation */

export function QrSuccessStep({ result, onFinish }: { result: QrCreditResult; onFinish: () => void }) {
  return (
    <section
      aria-labelledby="qr-done-title"
      className="relative overflow-hidden rounded-[1.75rem] border border-club-line bg-club-panel bg-club-sheen px-5 pb-6 pt-7 text-center shadow-[0_28px_56px_-28px_rgba(0,0,0,0.85)] motion-safe:animate-fade-in"
    >
      <div className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-kaytori-gold/25" aria-hidden />

      <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-kaytori-gold/50 bg-kaytori-gold/15 text-kaytori-goldLight">
        <CheckIcon className="h-8 w-8" />
      </div>

      <p className="relative mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-kaytori-gold">
        Opération confirmée
      </p>
      <h1 id="qr-done-title" className="relative mt-1 font-display text-[1.75rem] font-semibold text-white">
        +{pointsLabel(result.pointsAdded)}
      </h1>
      <p className="relative mt-0.5 text-[0.9rem] text-kaytori-goldLight">
        Valeur ajoutée : {pointsValueLabel(result.pointsAdded, result.pointValueCentimes)}
      </p>

      {result.replayed ? (
        <p className="relative mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-[0.76rem] text-kaytori-cream/80">
          Requête déjà enregistrée — aucun doublon créé
        </p>
      ) : null}

      <dl className="relative mt-5 space-y-2.5 rounded-2xl border border-white/12 bg-black/25 p-4 text-left text-[0.9rem]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-kaytori-cream/65">Client</dt>
          <dd className="font-semibold text-white">{result.card.fullName}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-kaytori-cream/65">Montant du ticket</dt>
          <dd className="font-semibold tabular-nums text-white">{formatCentimes(result.ticketCentimes)}</dd>
        </div>
        {result.orderRef ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-kaytori-cream/65">N° de commande</dt>
            <dd className="font-medium text-white">{result.orderRef}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
          <dt className="text-kaytori-cream/80">Nouveau solde</dt>
          <dd className="text-right">
            <span className="font-display text-[1.15rem] font-semibold tabular-nums text-kaytori-goldLight">
              {pointsLabel(result.newBalance)}
            </span>
            <span className="block text-[0.78rem] tabular-nums text-kaytori-cream/70">
              Équivalent à {pointsValueLabel(result.newBalance, result.pointValueCentimes)}
            </span>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onFinish}
        className="relative mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gold-shine px-5 py-3 text-[0.98rem] font-semibold text-kaytori-black transition-[filter] hover:brightness-105"
      >
        Terminer
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ États fermés / bloqués */

function QrClosedStep({
  publicCode,
  hasSavedCard,
  onReopen,
}: {
  publicCode: string;
  hasSavedCard: boolean;
  onReopen: () => void;
}) {
  return (
    <section
      aria-labelledby="qr-closed-title"
      className="relative overflow-hidden rounded-[1.75rem] border border-club-line bg-club-panel bg-club-sheen px-5 pb-6 pt-7 text-center shadow-[0_28px_56px_-28px_rgba(0,0,0,0.85)]"
    >
      <BrandLogo size={54} className="mx-auto ring-2 ring-kaytori-gold/45" />
      <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-kaytori-gold">Kaytôri Club</p>
      <h1 id="qr-closed-title" className="mt-1.5 font-display text-[1.45rem] font-semibold text-white">
        Session terminée
      </h1>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-kaytori-cream/75">
        La session rapide pour la carte <span className="font-semibold tabular-nums text-white">{formatPublicCode(publicCode)}</span> est
        verrouillée. Vous pouvez fermer cet onglet ou scanner une nouvelle carte.
      </p>
      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onReopen}
          className="min-h-[48px] w-full rounded-2xl border border-kaytori-gold/35 bg-white/5 px-4 py-2.5 text-[0.92rem] font-semibold text-kaytori-goldLight hover:bg-white/10"
        >
          Déverrouiller à nouveau cette carte
        </button>
        {hasSavedCard ? (
          <a
            href={LOYALTY_ROUTES.card}
            onClick={onInternalLink(LOYALTY_ROUTES.card)}
            className="text-[0.84rem] text-kaytori-cream/70 underline underline-offset-4"
          >
            Voir ma carte personnelle
          </a>
        ) : null}
      </div>
    </section>
  );
}

function StatusBlockedView({
  reason,
  publicCode,
  hasSavedCard,
}: {
  reason: "not_found" | "program_closed" | "unconfigured_earning" | "unconfigured_pin" | "card_suspended";
  publicCode: string;
  hasSavedCard: boolean;
}) {
  const copy: Record<typeof reason, { title: string; message: string }> = {
    not_found: {
      title: "Carte introuvable",
      message: "Aucune carte Kaytôri Club ne correspond à ce QR code.",
    },
    card_suspended: {
      title: "Carte suspendue",
      message: "Cette carte est actuellement suspendue. Aucun point ne peut y être crédité.",
    },
    program_closed: {
      title: "Programme fermé",
      message: "Le programme de fidélité Kaytôri Club n'est pas ouvert pour le moment.",
    },
    unconfigured_earning: {
      title: "Taux de points à configurer",
      message: "Le responsable doit d'abord définir le taux d'attribution des points dans les paramètres du programme.",
    },
    unconfigured_pin: {
      title: "Code secret QR non configuré",
      message: "Le responsable doit d'abord définir le code secret QR dans les paramètres du programme.",
    },
  };
  return (
    <BlockedCard
      title={copy[reason].title}
      message={copy[reason].message}
      publicCode={publicCode}
      hasSavedCard={hasSavedCard}
    />
  );
}

function BlockedCard({
  title,
  message,
  publicCode,
  hasSavedCard,
}: {
  title: string;
  message: string;
  publicCode?: string;
  hasSavedCard: boolean;
}) {
  return (
    <section
      aria-labelledby="qr-blocked-title"
      className="relative overflow-hidden rounded-[1.75rem] border border-club-line bg-club-panel bg-club-sheen px-5 pb-6 pt-7 text-center shadow-[0_28px_56px_-28px_rgba(0,0,0,0.85)]"
    >
      <BrandLogo size={54} className="mx-auto ring-2 ring-kaytori-gold/45" />
      <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-kaytori-gold">Kaytôri Club</p>
      <h1 id="qr-blocked-title" className="mt-1.5 font-display text-[1.45rem] font-semibold text-white">
        {title}
      </h1>
      {publicCode ? (
        <p className="mt-2 text-[0.84rem] font-medium tabular-nums tracking-[0.08em] text-kaytori-goldLight">
          {formatPublicCode(publicCode)}
        </p>
      ) : null}
      <p className="mt-2.5 text-[0.92rem] leading-relaxed text-kaytori-cream/80">{message}</p>
      <div className="mt-5 flex flex-col gap-2.5">
        {hasSavedCard ? (
          <a
            href={LOYALTY_ROUTES.card}
            onClick={onInternalLink(LOYALTY_ROUTES.card)}
            className="flex min-h-[48px] items-center justify-center rounded-2xl bg-gold-shine px-4 py-2.5 text-[0.92rem] font-semibold text-kaytori-black"
          >
            Voir ma carte
          </a>
        ) : (
          <a
            href={LOYALTY_ROUTES.home}
            onClick={onInternalLink(LOYALTY_ROUTES.home)}
            className="flex min-h-[48px] items-center justify-center rounded-2xl bg-gold-shine px-4 py-2.5 text-[0.92rem] font-semibold text-kaytori-black"
          >
            Découvrir Kaytôri Club
          </a>
        )}
      </div>
    </section>
  );
}
