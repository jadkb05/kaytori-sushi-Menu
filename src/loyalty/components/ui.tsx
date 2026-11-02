/**
 * Éléments d'interface de l'espace client Kaytôri Club (/fidelite, /fidelite/carte).
 * Esthétique éditoriale japonaise contemporaine : vert profond (#003024 / #04170f),
 * filets dorés (#D4AF37), papier ivoire (#f7f2e7), typographies Playfair Display & Outfit.
 */
import type { ReactNode } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { SITE, whatsappHref } from "../../config/site";
import { onInternalLink } from "../lib/navigation";
import { LOYALTY_ROUTES } from "../routes";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-kaytori-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-kaytori-page";

export const primaryButton = `inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-kaytori-green px-6 text-[1rem] font-semibold text-white transition-colors hover:bg-kaytori-greenDark active:bg-kaytori-greenDark disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const secondaryButton = `inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-kaytori-green/30 bg-white px-6 text-[1rem] font-semibold text-kaytori-green transition-colors hover:border-kaytori-green/60 active:bg-kaytori-sage disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const textLink = `rounded font-semibold text-kaytori-green underline decoration-kaytori-green/30 underline-offset-4 hover:decoration-kaytori-green ${focusRing}`;

export function LoyaltyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-kaytori-page font-sans text-kaytori-black">
      <header className="sticky top-0 z-30 bg-[#04170f] text-kaytori-cream shadow-sm">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2.5 px-4">
          <a
            href={LOYALTY_ROUTES.home}
            onClick={onInternalLink(LOYALTY_ROUTES.home)}
            className="flex min-h-[44px] items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold/70"
          >
            <BrandLogo size={34} className="ring-1 ring-kaytori-gold/40" />
            <span className="leading-none">
              <span className="block font-display text-[1.02rem] font-semibold tracking-tight text-kaytori-cream">
                {SITE.nameAccent}
              </span>
              <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-kaytori-gold">
                Club Fidélité
              </span>
            </span>
          </a>
          <a
            href="/menu"
            className="ml-auto inline-flex min-h-[38px] items-center rounded-full border border-kaytori-gold/40 px-4 text-[0.82rem] font-semibold text-kaytori-goldLight transition-colors hover:border-kaytori-gold/70 outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold/70"
          >
            Voir le menu
          </a>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-kaytori-gold/55 to-transparent"
          aria-hidden
        />
      </header>
      <main id="contenu-principal" className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-9">
        {children}
      </main>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string } = {}) {
  return (
    <span
      className={`${className} shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none`}
      aria-hidden
    />
  );
}

/** Message d'état (erreur, information, succès) avec actions. */
export function Notice({
  tone = "info",
  title,
  children,
  actions,
  role,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "alert" | "status";
}) {
  const tones = {
    info: "border-kaytori-green/15 bg-white",
    success: "border-kaytori-green/25 bg-kaytori-sage",
    warning: "border-kaytori-gold/50 bg-[#fbf3dc]",
    error: "border-red-200 bg-red-50",
  } as const;
  return (
    <section role={role} className={`rounded-2xl border px-5 py-4 ${tones[tone]}`}>
      <h2
        className={`font-display text-[1.15rem] font-semibold leading-snug ${
          tone === "error" ? "text-red-900" : "text-kaytori-black"
        }`}
      >
        {title}
      </h2>
      {children ? (
        <div
          className={`mt-1.5 text-[0.95rem] leading-relaxed ${
            tone === "error" ? "text-red-900/90" : "text-kaytori-black/80"
          }`}
        >
          {children}
        </div>
      ) : null}
      {actions ? <div className="mt-4 flex flex-col gap-2.5">{actions}</div> : null}
    </section>
  );
}

const HELP_MESSAGE = "Bonjour, je souhaite retrouver ma carte de fidélité Kaytôri Club. Mon nom : ";

/** Lien WhatsApp vers le restaurant pour retrouver une carte (aucune donnée pré-remplie). */
export function helpHref(): string {
  return whatsappHref(HELP_MESSAGE);
}

/** Retrouver sa carte : explication claire de la procédure sécurisée. */
export function RecoveryHelp({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-labelledby="fidelite-retrouver"
      className="rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-5"
    >
      <Heading id="fidelite-retrouver" className="font-display text-[1.2rem] font-semibold">
        Carte perdue ou nouveau téléphone ?
      </Heading>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-kaytori-black/80">
        Vos points ne sont pas perdus : votre solde et votre historique sont conservés par le restaurant. Pour protéger
        votre compte, votre carte ne s&apos;ouvre pas par simple saisie d&apos;un numéro de téléphone.
      </p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-kaytori-black/80">
        Passez au comptoir ou écrivez-nous sur WhatsApp : après vérification, le personnel vous envoie un nouveau lien
        personnel sur le numéro associé à votre carte. L&apos;ancien lien est alors désactivé.
      </p>
      <a href={helpHref()} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} mt-4`}>
        Écrire au restaurant sur WhatsApp
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    </section>
  );
}

/** Informations sur la confidentialité et la sécurité de la carte. */
export function PrivacyNote() {
  return (
    <details className="group rounded-2xl border border-kaytori-black/[0.08] bg-white px-5 py-4">
      <summary
        className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-lg font-semibold ${focusRing}`}
      >
        <span>Vos données et la sécurité de votre carte</span>
        <span aria-hidden className="text-kaytori-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-[0.92rem] leading-relaxed text-kaytori-black/80">
        <p>
          Nous demandons uniquement votre nom et votre numéro de mobile pour créer votre carte Kaytôri Club, la
          retrouver au comptoir et vous renvoyer un lien personnel en cas de changement d&apos;appareil.
        </p>
        <p>
          Votre carte s&apos;ouvre grâce à un jeton personnel conservé sur votre téléphone. Seule son empreinte
          cryptographique est stockée sur notre serveur. Votre QR code contient uniquement le code public de votre carte,
          sans votre nom ni votre numéro de téléphone.
        </p>
        <p>
          Pour toute question, modification ou suppression de vos données, contactez le restaurant au{" "}
          <a href={`tel:+${SITE.phoneFixeE164}`} className={textLink}>
            {SITE.phoneFixeDisplay}
          </a>{" "}
          ou sur{" "}
          <a href={helpHref()} target="_blank" rel="noopener noreferrer" className={textLink}>
            WhatsApp
          </a>
          .
        </p>
      </div>
    </details>
  );
}
