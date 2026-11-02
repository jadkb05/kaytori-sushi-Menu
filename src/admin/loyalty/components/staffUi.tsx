/**
 * Briques d'interface de l'administration de la fidélité (/admin/fidelite…) :
 * style sobre, clair, neutre et opérationnel, aligné avec l'administration générale (/admin).
 * Cibles tactiles d'au moins 44 px, contraste élevé, hiérarchie directe.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertIcon, CloseIcon } from "../../components/icons";
import { Spinner } from "../../components/ui";
import type { StaffAdvice } from "../lib/staffErrors";

export const ring =
  "outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const base = `inline-flex select-none items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${ring}`;

/** Action principale opérationnelle (vert Kaytôri foncé, texte blanc). */
export const primaryButton = `${base} min-h-[44px] rounded-xl bg-admin-accent px-4 py-2.5 text-[0.92rem] font-semibold text-white shadow-admin-xs hover:bg-admin-accentHover`;

/** Alias conservés pour compatibilité avec les composants de fiche et de formulaires. */
export const goldButton = primaryButton;
export const stampButton = `${base} min-h-[48px] w-full rounded-xl bg-admin-accent px-5 py-3 text-[0.98rem] font-semibold text-white shadow-admin-xs hover:bg-admin-accentHover`;
export const greenButton = `${base} min-h-[46px] w-full rounded-xl border border-admin-accent/25 bg-admin-accentSoft px-4 py-2.5 text-[0.95rem] font-semibold text-admin-accent hover:bg-admin-accent/15`;

export const outlineButton = `${base} min-h-[44px] rounded-xl border border-admin-lineStrong bg-white px-4 py-2 text-[0.9rem] font-medium text-admin-ink shadow-admin-xs hover:bg-admin-canvas`;
export const quietButton = `${base} min-h-[40px] rounded-lg px-3 py-1.5 text-[0.88rem] font-medium text-admin-muted hover:bg-admin-canvas hover:text-admin-ink`;
export const dangerButton = `${base} min-h-[44px] rounded-xl border border-admin-danger/30 bg-admin-dangerSoft px-4 py-2 text-[0.9rem] font-semibold text-admin-danger hover:bg-admin-danger/15`;

export const fieldClass =
  "block w-full rounded-xl border border-admin-lineStrong bg-white px-3.5 py-2.5 text-[0.95rem] text-admin-ink shadow-admin-xs placeholder:text-admin-soft focus:border-admin-accent focus:outline-none focus:ring-[3px] focus:ring-admin-accent/15 aria-[invalid=true]:border-admin-danger";

/** Panneau sobre : carte blanche, bordure fine, ombre discrète. */
export const panel = "rounded-xl border border-admin-line bg-white shadow-admin-sm";

export function BusyLabel({ busy, idle, pending }: { busy: boolean; idle: ReactNode; pending: string }) {
  return busy ? (
    <>
      <Spinner className="h-4 w-4" />
      {pending}
    </>
  ) : (
    <>{idle}</>
  );
}

/** Alerte d'erreur explicite avec action de reprise éventuelle. */
export function AdviceBox({
  advice,
  onRetry,
  retryLabel = "Réessayer",
  busy = false,
}: {
  advice: StaffAdvice;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-admin-danger/30 bg-admin-dangerSoft px-4 py-3.5 text-admin-ink"
    >
      <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-admin-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.92rem] font-semibold text-admin-danger">{advice.title}</p>
        <p className="mt-0.5 text-[0.88rem] leading-snug text-admin-muted">{advice.message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} disabled={busy} className={`${outlineButton} mt-3`}>
            <BusyLabel busy={busy} idle={retryLabel} pending="Envoi…" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Fenêtre modale / tiroir de confirmation : sobre, fond blanc, focus piégé, fermeture par Échap.
 */
export function Sheet({
  title,
  children,
  footer,
  busy,
  onClose,
  tone = "default",
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  busy: boolean;
  onClose: () => void;
  tone?: "default" | "warning";
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first =
      ref.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']",
        ) ?? [],
      );
      if (items.length === 0) return;
      const firstItem = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 font-sans backdrop-blur-[1px] motion-safe:animate-admin-fade sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-b-0 bg-white pb-[env(safe-area-inset-bottom)] text-admin-ink shadow-admin-lg motion-safe:animate-admin-pop sm:rounded-2xl sm:border-b ${
          tone === "warning" ? "border-admin-warn/50" : "border-admin-line"
        }`}
      >
        <div className="flex items-start gap-3 border-b border-admin-line px-5 pb-3.5 pt-4">
          <h2 id={`${id}-title`} className="min-w-0 flex-1 text-[1.1rem] font-semibold leading-snug text-admin-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className={`-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-muted hover:bg-admin-canvas hover:text-admin-ink ${ring}`}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-[0.93rem] leading-relaxed text-admin-ink">{children}</div>
        <div className="flex flex-col-reverse gap-2.5 border-t border-admin-line bg-admin-canvas/60 px-5 py-3.5 sm:flex-row sm:justify-end">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Pastille de statut lisible sur fond clair. */
export function Pill({
  tone,
  children,
}: {
  tone: "gold" | "warning" | "muted" | "positive" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    gold: "bg-admin-goldSoft text-admin-warn ring-1 ring-admin-gold/30",
    warning: "bg-admin-dangerSoft text-admin-danger ring-1 ring-admin-danger/25",
    muted: "bg-admin-canvas text-admin-muted ring-1 ring-admin-lineStrong",
    positive: "bg-admin-successSoft text-admin-success ring-1 ring-admin-success/25",
    neutral: "bg-admin-accentSoft text-admin-accent ring-1 ring-admin-accent/20",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.76rem] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
