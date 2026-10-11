/** Champs de formulaire partagés par l'édition et la création de produit. */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { AlertIcon, TrashIcon } from "./icons";
import { StatusBadge, cardClass, inputClass } from "./ui";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-admin-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-red-700" role="alert">
          <AlertIcon className="mt-px h-3.5 w-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-snug text-admin-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Libellé + encadré d'information à la place d'un champ (position automatique, prix par variantes…). */
export function StaticField({ label, tone = "neutral", children }: { label: string; tone?: "neutral" | "warning"; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-medium text-admin-ink">{label}</p>
      <p
        className={`rounded-lg border px-3 py-2 text-sm leading-snug ${
          tone === "warning" ? "border-amber-200 bg-amber-50/80 text-amber-900" : "border-admin-line bg-admin-subtle text-admin-soft"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

export const fieldError = (base: string, error?: string) =>
  `${base} ${error ? "border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-500/15" : ""}`;

export function PriceInput({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldError(`${inputClass} pr-11 tabular-nums`, error)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] font-medium text-admin-muted">DH</span>
    </div>
  );
}

/** Carte de formulaire : titre en bandeau, contenu en dessous. */
export function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardClass}${className ? ` ${className}` : ""}`}>
      <h2 className="border-b border-admin-line px-4 py-3.5 text-[0.9375rem] font-semibold text-admin-ink sm:px-5">{title}</h2>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Cadre d'une variante (édition et création) : numéro, « nouvelle », statut, retrait. */
export function VariantFrame({
  index,
  isNew,
  active,
  onRemove,
  children,
}: {
  index: number;
  isNew: boolean;
  /** Statut affiché en badge (édition) ; absent en création. */
  active?: boolean;
  /** null : bouton de retrait masqué (confirmation en cours). */
  onRemove: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-admin-line bg-admin-subtle/50 p-3.5 motion-safe:animate-admin-in sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-admin-ink">
          Variante {index + 1}
          {isNew ? <span className="rounded-full bg-admin-tint px-2 py-0.5 text-[11px] font-medium text-kaytori-green">nouvelle</span> : null}
        </p>
        <div className="flex items-center gap-2">
          {active === undefined ? null : (
            <span className="max-sm:hidden">
              <StatusBadge active={active} />
            </span>
          )}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Supprimer
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Bouton « + Ajouter une variante ». */
export function AddVariantButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-admin-lineStrong text-sm font-semibold text-admin-soft transition-colors hover:border-kaytori-green/50 hover:bg-admin-tint/50 hover:text-kaytori-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-green/35"
    >
      + Ajouter une variante
    </button>
  );
}

/**
 * Barre d'actions du formulaire, collante en bas de l'écran (au-dessus des onglets mobiles) :
 * « Enregistrer » reste accessible sur un long formulaire ; état et message d'erreur à côté du bouton.
 * Sa hauteur (+ 8 px d'écart) est publiée dans --admin-action-bar-h : le Toast s'affiche au-dessus, sans la recouvrir.
 */
export function FormActionBar({ status, error, children }: { status: ReactNode; error?: string | null; children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--admin-action-bar-h", `${bar.offsetHeight + 8}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--admin-action-bar-h");
    };
  }, []);
  return (
    <div ref={barRef} className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
      <div className="rounded-xl border border-admin-line bg-white/95 p-3 shadow-admin-md backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:px-4">
        {error ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 text-red-600" />
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="px-1 text-[13px] leading-snug text-admin-muted sm:mr-auto sm:px-0">{status}</div>
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
        </div>
      </div>
    </div>
  );
}
