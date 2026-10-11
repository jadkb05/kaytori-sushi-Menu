/**
 * Composants d'interface de l'admin — système visuel « Kaytôri » : fond ivoire (admin-canvas),
 * cartes blanches à bordure chaude (admin-line), encre vert-noir (admin-ink), un seul accent :
 * le vert de la marque. Animations courtes, uniquement si l'utilisateur ne demande pas à les réduire.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AdminLink } from "./AdminLink";
import { AlertIcon, ArrowLeftIcon, CheckIcon, CloseIcon } from "./icons";

/* ------------------------------------------------------------------ boutons et champs */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-green/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerOutline";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-kaytori-green text-white shadow-admin-xs hover:bg-kaytori-greenDark",
  secondary: "border border-admin-line bg-white text-admin-ink shadow-admin-xs hover:border-admin-lineStrong hover:bg-admin-subtle",
  ghost: "text-admin-soft hover:bg-admin-canvas hover:text-admin-ink",
  danger: "bg-red-700 text-white shadow-admin-xs hover:bg-red-800",
  dangerOutline: "border border-red-200 bg-white text-red-700 shadow-admin-xs hover:border-red-300 hover:bg-red-50",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
};

/** Classes d'un bouton (ou d'un lien présenté comme un bouton). */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${focusRing} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export const inputClass =
  "w-full rounded-lg border border-admin-line bg-white px-3 py-2 text-sm text-admin-ink shadow-admin-xs transition-[border-color,box-shadow] duration-150 placeholder:text-admin-muted hover:border-admin-lineStrong focus:border-kaytori-green focus:outline-none focus:ring-[3px] focus:ring-kaytori-green/15 disabled:bg-admin-subtle disabled:text-admin-muted";

/** Boutons d'ordre ↑ / ↓ (Produits, Catégories) : carrés, icône ; cible tactile de 40 px sous lg. */
export const orderButton = `grid h-7 w-7 place-items-center rounded-md border border-admin-line bg-white text-admin-soft shadow-admin-xs transition-colors hover:border-admin-lineStrong hover:bg-admin-subtle hover:text-admin-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${focusRing}`;
export const touchButton = "max-lg:min-h-[40px] max-lg:min-w-[40px] max-lg:rounded-lg";

export const primaryButtonClass = `${buttonClass("primary")} w-full h-11`;

/** Petit indicateur de chargement (hérite de la couleur du texte). */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80 ${className}`} aria-hidden />;
}

/* ------------------------------------------------------------------ structure de page */

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Lien de retour affiché au-dessus du titre. */
  back?: { href: string; label: string };
  /** Contenu discret à droite du titre (badge, date…). */
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6 lg:mb-8">
      {back ? (
        <AdminLink
          href={back.href}
          className={`group mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-admin-soft transition-colors hover:text-kaytori-green ${focusRing}`}
        >
          <ArrowLeftIcon className="h-4 w-4 transition-transform duration-150 motion-safe:group-hover:-translate-x-0.5" />
          {back.label}
        </AdminLink>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="break-words text-[1.625rem] font-semibold leading-tight tracking-[-0.015em] text-admin-ink lg:text-[1.875rem]">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-admin-soft">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Carte blanche de base. */
export const cardClass = "rounded-xl border border-admin-line bg-white shadow-admin-xs";

/* ------------------------------------------------------------------ statuts et chiffres */

export function StatusBadge({ active, activeLabel = "Actif", inactiveLabel = "Masqué" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        active ? "bg-emerald-50 text-emerald-800 ring-emerald-600/15" : "bg-stone-100 text-stone-600 ring-stone-500/15"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-stone-400"}`} aria-hidden />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/**
 * Indicateur : libellé, valeur, contexte. `ratio` (0…1) dessine une jauge : remplissage vert marque
 * sur une piste du même vert, plus claire ; `tone="muted"` pour une part qui n'est pas un objectif.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  ratio,
  tone = "brand",
}: {
  label: string;
  value: number;
  hint?: string;
  icon?: ReactNode;
  ratio?: number;
  tone?: "brand" | "muted";
}) {
  const pct = ratio === undefined ? null : Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div className={`${cardClass} flex min-w-0 flex-col p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium leading-snug text-admin-soft sm:text-sm">{label}</p>
        {icon ? (
          <span className={`hidden h-8 w-8 shrink-0 place-items-center rounded-lg sm:grid ${tone === "brand" ? "bg-admin-tint text-kaytori-green" : "bg-admin-canvas text-admin-soft"}`}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-admin-ink sm:mt-3 sm:text-[2rem]">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-snug text-admin-muted sm:text-[13px]">{hint}</p> : null}
      {/* Jauges alignées en bas, quelle que soit la longueur du contexte. */}
      <div className="flex-1" aria-hidden />
      {pct !== null ? (
        <div
          className={`mt-4 h-1.5 overflow-hidden rounded-full ${tone === "brand" ? "bg-admin-tintStrong/70" : "bg-admin-canvas"}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${label} : ${pct} %`}
        >
          <div className={`h-full rounded-full ${tone === "brand" ? "bg-kaytori-green" : "bg-stone-400"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ états de page */

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className={`${cardClass} p-5`} role="status">
      <div className="flex items-center gap-3 text-sm text-admin-soft">
        <Spinner className="h-4 w-4 text-kaytori-green" />
        {label}
      </div>
      <div className="mt-5 space-y-3 motion-safe:animate-pulse" aria-hidden>
        <div className="h-3 w-2/3 rounded-full bg-admin-canvas" />
        <div className="h-3 w-full rounded-full bg-admin-canvas" />
        <div className="h-3 w-5/6 rounded-full bg-admin-canvas" />
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50/70 p-5 text-sm text-red-900" role="alert">
      <AlertIcon className="mt-0.5 h-5 w-5 text-red-600" />
      <div className="min-w-0">
        <p className="font-semibold">Impossible de charger les données.</p>
        <p className="mt-1 break-words text-red-800">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={`${buttonClass("secondary", "sm")} mt-3`}>
            Réessayer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Message dans le flux de la page (formulaire, bloc d'information). */
export function Notice({ tone, children, className = "" }: { tone: "success" | "error" | "info" | "warning"; children: ReactNode; className?: string }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
    error: "border-red-200 bg-red-50/80 text-red-900",
    info: "border-admin-line bg-admin-subtle text-admin-soft",
    warning: "border-amber-200 bg-amber-50/80 text-amber-900",
  }[tone];
  const icon =
    tone === "success" ? <CheckIcon className="mt-0.5 h-4 w-4 text-emerald-600" /> : tone === "info" ? null : <AlertIcon className={`mt-0.5 h-4 w-4 ${tone === "error" ? "text-red-600" : "text-amber-600"}`} />;
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm motion-safe:animate-admin-in ${styles} ${className}`} role={tone === "error" ? "alert" : "status"}>
      {icon}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Écran centré (connexion, accès refusé, configuration manquante). */
export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-admin-canvas px-4 py-10 font-sans text-admin-ink">
      <div className="w-full max-w-sm rounded-2xl border border-admin-line bg-white p-7 shadow-admin-md motion-safe:animate-admin-pop sm:p-8">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ retours d'action */

export type ToastNotice = { tone: "success" | "error" | "pending"; message: string } | null;

/**
 * Retour d'action flottant (toujours visible, même après défilement) : en bas de l'écran,
 * au-dessus de la barre de navigation mobile ; en bas à droite sur ordinateur ; au-dessus de la barre
 * d'actions d'un formulaire si elle est affichée (--admin-action-bar-h, publiée par FormActionBar).
 * Succès : disparaît seul après 5 s. Erreur : reste jusqu'à fermeture. En cours : avec indicateur.
 */
export function Toast({ notice, onDismiss }: { notice: ToastNotice; onDismiss: () => void }) {
  /** Rendu dans <body> (portail) une fois monté : jamais décalé par un parent animé ; rien côté serveur. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const id = window.setTimeout(() => dismissRef.current(), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (!mounted) return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom)+var(--admin-action-bar-h,0px))] z-40 flex justify-center px-4 font-sans lg:bottom-[calc(1rem+var(--admin-action-bar-h,0.5rem))] lg:left-auto lg:right-6 lg:justify-end lg:px-0"
    >
      {notice ? (
        <div
          key={notice.message}
          role={notice.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white py-3 pl-3.5 pr-2 text-sm text-admin-ink shadow-admin-lg motion-safe:animate-admin-pop ${
            notice.tone === "error" ? "border-red-200" : "border-admin-line"
          }`}
        >
          <span
            className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full ${
              notice.tone === "success" ? "bg-emerald-100 text-emerald-700" : notice.tone === "error" ? "bg-red-100 text-red-700" : "text-kaytori-green"
            }`}
          >
            {notice.tone === "success" ? <CheckIcon className="h-3.5 w-3.5" /> : notice.tone === "error" ? <AlertIcon className="h-3.5 w-3.5" /> : <Spinner className="h-4 w-4" />}
          </span>
          <p className="min-w-0 flex-1 break-words pt-px leading-snug">{notice.message}</p>
          {notice.tone === "pending" ? null : (
            <button type="button" onClick={onDismiss} aria-label="Fermer le message" className={`-my-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-admin-muted hover:bg-admin-canvas hover:text-admin-ink ${focusRing}`}>
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ confirmation */

/**
 * Confirmation d'une action destructrice : focus sur « Annuler » à l'ouverture, Échap / clic à
 * l'extérieur = Annuler (sauf pendant l'action), focus gardé dans la fenêtre puis rendu au déclencheur.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-admin-ink/40 p-4 font-sans motion-safe:animate-admin-fade sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-admin-lg motion-safe:animate-admin-pop"
      >
        <div className="flex gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
            <AlertIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="confirm-title" className="break-words text-lg font-semibold text-admin-ink">
              {title}
            </h3>
            <div id="confirm-description" className="mt-1.5 text-sm leading-relaxed text-admin-soft">
              {description}
            </div>
          </div>
        </div>
        {error ? (
          <Notice tone="error" className="mt-4">
            {error}
          </Notice>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-autofocus onClick={onClose} disabled={busy} className={buttonClass("secondary")}>
            Annuler
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={buttonClass("danger")}>
            {busy ? <Spinner /> : null}
            {busy ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ interrupteur */

/** Case à cocher native présentée en interrupteur (role="switch"), libellé cliquable. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  bordered = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Dans un cadre de la hauteur d'un champ (alignement avec les champs voisins). */
  bordered?: boolean;
}) {
  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 text-sm text-admin-ink ${
        bordered ? "min-h-[2.625rem] rounded-lg border border-admin-line bg-white px-3 py-2.5 shadow-admin-xs transition-colors hover:border-admin-lineStrong" : ""
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-stone-300 transition-colors duration-150 peer-checked:bg-kaytori-green peer-focus-visible:ring-2 peer-focus-visible:ring-kaytori-green/35 peer-focus-visible:ring-offset-2"
      >
        <span className={`ml-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${checked ? "translate-x-4" : ""}`} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-5">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-snug text-admin-muted">{description}</span> : null}
      </span>
    </label>
  );
}
