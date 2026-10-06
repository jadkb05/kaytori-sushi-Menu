/** Petits composants d'interface de l'admin (sobres, sans effets). */
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function StatusBadge({ active, activeLabel = "Actif", inactiveLabel = "Masqué" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-stone-400"}`} aria-hidden />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-stone-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-kaytori-green" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
      <p className="font-medium">Impossible de charger les données.</p>
      <p className="mt-1 text-red-700">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium text-red-800 hover:bg-red-100">
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

/** Écran centré (connexion, accès refusé, configuration manquante). */
export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">{children}</div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-kaytori-green focus:outline-none focus:ring-2 focus:ring-kaytori-green/20";

export const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg bg-kaytori-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-kaytori-greenDark disabled:cursor-not-allowed disabled:opacity-60";
