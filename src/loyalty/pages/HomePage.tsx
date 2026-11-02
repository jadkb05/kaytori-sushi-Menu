/**
 * /fidelite — Présentation éditoriale du programme de fidélité par points Kaytôri Club
 * et formulaire d'inscription en deux étapes.
 */
import { useCallback, useEffect, useState } from "react";
import {
  formatCentimes,
  formatEarningRule,
  formatPoints,
  pointsLabel,
  pointsValueLabel,
} from "../../admin/loyalty/lib/points";
import { BrandLogo } from "../../components/BrandLogo";
import { SignupSection } from "../components/SignupSection";
import {
  LoyaltyLayout,
  Notice,
  PrivacyNote,
  RecoveryHelp,
  primaryButton,
  secondaryButton,
} from "../components/ui";
import { fetchProgram, type LoyaltyProgram } from "../lib/api";
import { asLoyaltyError, type ErrorAdvice } from "../lib/errors";
import { navigate, onInternalLink } from "../lib/navigation";
import type { RegistrationSuccess } from "../lib/registration";
import { readPending, readSavedToken, type PendingRegistration } from "../lib/storage";
import { LOYALTY_ROUTES } from "../routes";
import { rememberCreatedCard } from "./createdCard";

export type ProgramState =
  | { status: "loading" }
  | { status: "ready"; program: LoyaltyProgram }
  | { status: "error"; advice: ErrorAdvice };

const RECOVERY_ANCHOR = "#retrouver-ma-carte";
const SHOWCASE_POINTS = [50, 100, 250, 500] as const;

function programAdvice(e: unknown): ErrorAdvice {
  const err = asLoyaltyError(e);
  if (err.kind === "network" || err.kind === "timeout") {
    return {
      title: "Pas de connexion",
      message: "Le programme de fidélité n'a pas pu être chargé. Vérifiez votre connexion et réessayez.",
      action: "retry",
    };
  }
  return {
    title: "Service momentanément indisponible",
    message: "Le programme de fidélité n'est pas accessible pour le moment. Réessayez plus tard.",
    action: "retry",
  };
}

export function HomePage() {
  const [program, setProgram] = useState<ProgramState>({ status: "loading" });
  const [savedToken] = useState(() => readSavedToken());
  const [pending] = useState(() => readPending());

  const load = useCallback(() => {
    setProgram({ status: "loading" });
    fetchProgram()
      .then((p) => setProgram({ status: "ready", program: p }))
      .catch((e: unknown) => setProgram({ status: "error", advice: programAdvice(e) }));
  }, []);

  useEffect(load, [load]);

  const onCreated = (result: RegistrationSuccess) => {
    rememberCreatedCard(result);
    navigate(LOYALTY_ROUTES.card);
  };

  return (
    <HomeView
      program={program}
      hasSavedCard={savedToken !== null}
      pending={pending}
      onRetry={load}
      onCreated={onCreated}
      onClosed={load}
    />
  );
}

type ViewProps = {
  program: ProgramState;
  hasSavedCard: boolean;
  pending: PendingRegistration | null;
  onRetry: () => void;
  onCreated: (result: RegistrationSuccess) => void;
  onClosed: () => void;
};

/** Rendu de la page selon l'état (séparé pour les tests). */
export function HomeView({ program, hasSavedCard, pending, onRetry, onCreated, onClosed }: ViewProps) {
  const readyProgram = program.status === "ready" ? program.program : null;
  const pointValueCentimes = readyProgram?.pointValueCentimes ?? 20;
  const earningRuleText = readyProgram
    ? formatEarningRule({
        earningPoints: readyProgram.earningPoints,
        earningDirhams: readyProgram.earningDirhams,
        roundingRule: readyProgram.roundingRule,
      })
    : "Cumulez des points à chaque commande au restaurant";

  return (
    <LoyaltyLayout>
      <div className="space-y-8">
        {/* Hero éditorial Kaytôri Club */}
        <section
          aria-labelledby="fidelite-titre"
          className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#07261b] via-[#003024] to-[#04170f] px-5 pb-6 pt-6 text-kaytori-cream shadow-[0_28px_56px_-28px_rgba(0,48,36,0.7)] ring-1 ring-kaytori-gold/30 sm:px-7 sm:py-8"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-seigaiha opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_75%)]"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-2.5 rounded-[1.35rem] border border-kaytori-gold/25" aria-hidden />

          <div className="relative flex items-center gap-3">
            <BrandLogo size={42} className="ring-1 ring-kaytori-gold/45" />
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-kaytori-gold">
                Programme Privilège
              </p>
              <p className="font-display text-[1.1rem] font-semibold text-white">Kaytôri Club</p>
            </div>
          </div>

          <h1
            id="fidelite-titre"
            className="relative mt-5 text-balance font-display text-[1.95rem] font-semibold leading-[1.1] tracking-tight text-white sm:text-[2.35rem]"
          >
            Vos commandes deviennent des points et des créations offertes
          </h1>

          <p className="relative mt-3 text-[1rem] leading-relaxed text-kaytori-cream/85">
            Sans application à télécharger : votre carte digitale s&apos;ouvre directement sur ce téléphone. Présentez
            votre QR code au comptoir pour cumuler vos points et les échanger contre nos spécialités.
          </p>

          {/* Valeur de référence & paliers d'équivalence */}
          <div className="relative mt-5 rounded-2xl border border-kaytori-gold/30 bg-black/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <span className="text-[0.76rem] font-semibold uppercase tracking-[0.18em] text-kaytori-goldLight">
                Valeur transparente
              </span>
              <span className="rounded-full bg-gold-shine px-3 py-0.5 text-[0.8rem] font-bold text-kaytori-black">
                1 point = {formatCentimes(pointValueCentimes)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SHOWCASE_POINTS.map((pts) => (
                <div
                  key={pts}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center"
                >
                  <p className="font-display text-[1.15rem] font-semibold tabular-nums text-kaytori-gold">
                    {formatPoints(pts)} pts
                  </p>
                  <p className="text-[0.78rem] font-medium text-kaytori-cream/85">
                    = {pointsValueLabel(pts, pointValueCentimes)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {hasSavedCard ? (
          <Notice tone="success" title="Votre carte Kaytôri Club est sur ce téléphone">
            <a href={LOYALTY_ROUTES.card} onClick={onInternalLink(LOYALTY_ROUTES.card)} className={`${primaryButton} mt-1`}>
              Ouvrir ma carte et consulter mes points
            </a>
          </Notice>
        ) : null}

        {/* Fonctionnement en 3 étapes */}
        <section aria-labelledby="fidelite-principe" className="rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-6">
          <h2 id="fidelite-principe" className="font-display text-[1.4rem] font-semibold text-kaytori-black">
            Comment fonctionne le Kaytôri Club
          </h2>
          <ol className="mt-4 space-y-4">
            {[
              [
                "Créez votre carte en quelques secondes",
                "Votre nom et votre numéro de mobile suffisent. Votre carte digitale s'enregistre immédiatement sur votre téléphone.",
              ],
              [
                "Cumulez des points à chaque commande",
                `Présentez votre QR code au comptoir lors du règlement (${earningRuleText}).`,
              ],
              [
                "Échangez vos points contre des récompenses",
                "Choisissez votre récompense dans le catalogue et présentez votre code d'échange au restaurant.",
              ],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-kaytori-gold/70 bg-[#fbf6e8] font-display text-[1.05rem] font-semibold text-[#003024]"
                >
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <p className="font-semibold text-kaytori-black">{title}</p>
                  <p className="mt-0.5 text-[0.93rem] leading-relaxed text-kaytori-black/75">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Aperçu des récompenses du programme */}
        {readyProgram && readyProgram.rewards.length > 0 ? (
          <section aria-labelledby="fidelite-apercu-recompenses" className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <h2 id="fidelite-apercu-recompenses" className="font-display text-[1.35rem] font-semibold text-kaytori-black">
                Récompenses à découvrir
              </h2>
              <span className="text-[0.8rem] text-kaytori-muted">1 pt = {formatCentimes(pointValueCentimes)}</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {readyProgram.rewards.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col justify-between rounded-2xl border border-kaytori-black/[0.08] bg-white p-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-[1.05rem] font-semibold text-kaytori-black">{r.name}</h3>
                      <span className="shrink-0 rounded-full bg-[#fbf6e8] px-2.5 py-0.5 text-[0.78rem] font-bold text-[#003024] ring-1 ring-kaytori-gold/40">
                        {pointsLabel(r.pointsCost)}
                      </span>
                    </div>
                    {r.description ? (
                      <p className="mt-1.5 text-[0.86rem] leading-relaxed text-kaytori-black/75">{r.description}</p>
                    ) : null}
                  </div>
                  <p className="mt-2.5 text-[0.76rem] font-medium text-kaytori-muted">
                    Contre-valeur : {pointsValueLabel(r.pointsCost, pointValueCentimes)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Formulaire d'inscription */}
        <div id="creer-ma-carte" className="scroll-mt-20 rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-6">
          {program.status === "loading" ? (
            <div role="status" aria-label="Chargement" className="space-y-4 motion-safe:animate-pulse">
              <div className="h-8 w-48 rounded-lg bg-kaytori-black/[0.07]" />
              <div className="h-[52px] rounded-xl bg-kaytori-black/[0.06]" />
              <div className="h-[52px] rounded-xl bg-kaytori-black/[0.06]" />
              <div className="h-12 rounded-full bg-kaytori-black/[0.08]" />
            </div>
          ) : program.status === "error" ? (
            <Notice
              tone="warning"
              title={program.advice.title}
              role="alert"
              actions={
                <button type="button" onClick={onRetry} className={primaryButton}>
                  Réessayer
                </button>
              }
            >
              {program.advice.message}
            </Notice>
          ) : !program.program.isActive ? (
            <Notice
              title="Le programme ouvre bientôt"
              role="status"
              actions={
                <a href="/menu" className={secondaryButton}>
                  Voir le menu
                </a>
              }
            >
              Les inscriptions au Kaytôri Club ne sont pas encore ouvertes. Vous pourrez créer votre carte ici dès
              l&apos;ouverture du programme.
            </Notice>
          ) : (
            <SignupSection
              resume={pending}
              hasSavedCard={hasSavedCard}
              onCreated={onCreated}
              onClosed={onClosed}
              recoveryHref={RECOVERY_ANCHOR}
            />
          )}
        </div>

        <div id={RECOVERY_ANCHOR.slice(1)} className="scroll-mt-20">
          <RecoveryHelp />
        </div>
        <PrivacyNote />
      </div>
    </LoyaltyLayout>
  );
}
