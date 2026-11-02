/**
 * Briques de page de l'administration de la fidélité : en-tête sobre, cartes d'indicateurs (KPI),
 * panneaux opérationnels, états vides, avatars d'initiales, badges de statut et graphique en barres.
 */
import { useId, useState, type ReactNode } from "react";
import type { CardStatus } from "../lib/staffApi";
import { Pill, panel } from "./staffUi";

export function PageHeader({
  icon,
  title,
  accent,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  accent?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-admin-line pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 place-items-center rounded-xl border border-admin-line bg-white text-admin-accent shadow-admin-xs sm:grid">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[1.45rem] font-semibold leading-tight tracking-tight text-admin-ink sm:text-[1.65rem]">
            {title}
            {accent ? <span className="text-admin-accent"> {accent}</span> : null}
          </h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-[0.9rem] leading-relaxed text-admin-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Carte d'indicateur opérationnel (KPI). `value` null = donnée non disponible. */
export function KpiCard({
  icon,
  label,
  value,
  note,
  badge,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode | null;
  note?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className={`${panel} flex min-w-0 flex-col justify-between p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.82rem] font-medium text-admin-muted">{label}</p>
        {icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-admin-accentSoft text-admin-accent" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      {value === null ? (
        <p className="mt-2 text-[1.05rem] font-semibold text-admin-soft">Non disponible</p>
      ) : (
        <p className="mt-2 break-words text-[1.55rem] font-bold leading-none tabular-nums lining-nums text-admin-ink sm:text-[1.7rem]">
          {value}
        </p>
      )}
      {note ? <p className="mt-2 text-[0.78rem] leading-snug text-admin-muted">{note}</p> : null}
      {badge ? <div className="mt-2">{badge}</div> : null}
    </div>
  );
}

export function ClubPanel({
  title,
  icon,
  action,
  children,
  className = "",
  labelledBy,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const id = useId();
  const headingId = labelledBy ?? `${id}-h`;
  return (
    <section aria-labelledby={headingId} className={`${panel} min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 id={headingId} className="flex min-w-0 items-center gap-2 text-[1rem] font-semibold text-admin-ink">
          {icon ? <span className="shrink-0 text-admin-accent">{icon}</span> : null}
          <span className="min-w-0">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-admin-lineStrong bg-admin-canvas/50 px-5 py-7 text-center">
      {icon ? (
        <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white text-admin-accent shadow-admin-xs ring-1 ring-admin-line">
          {icon}
        </span>
      ) : null}
      <p className="text-[0.98rem] font-semibold text-admin-ink">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-[0.86rem] leading-relaxed text-admin-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Initiales sur pastille sobre. */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-admin-accentSoft font-semibold text-admin-accent ring-1 ring-admin-accent/15 ${
        size === "lg" ? "h-12 w-12 text-[1rem] sm:h-14 sm:w-14 sm:text-[1.15rem]" : "h-9 w-9 text-[0.82rem]"
      }`}
    >
      {initials}
    </span>
  );
}

export function StatusBadge({ status }: { status: CardStatus }) {
  return status === "active" ? <Pill tone="positive">Active</Pill> : <Pill tone="warning">Suspendue</Pill>;
}

/**
 * Graphique en colonnes sobre (avec tableau équivalent pour lecteurs d'écran).
 */
export function ColumnChart({
  data,
  caption,
  unit,
}: {
  data: { label: string; short: string; value: number }[];
  caption: string;
  unit: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const H = 136;
  const shown = active === null ? null : data[active];
  return (
    <figure className="min-w-0">
      <div className="relative">
        <p aria-live="polite" className="pointer-events-none absolute right-0 top-0 min-h-[1.25rem] text-right text-[0.8rem] font-medium text-admin-muted">
          {shown ? `${shown.label} : ${unit(shown.value)}` : ""}
        </p>
        <div className="flex gap-2 pt-6">
          <div
            className="flex shrink-0 flex-col justify-between text-right text-[0.72rem] tabular-nums text-admin-soft"
            style={{ height: H }}
            aria-hidden
          >
            {[...ticks].reverse().map((t) => (
              <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                {t}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1" style={{ height: H }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-admin-line"
                style={{ bottom: `${(t / top) * 100}%` }}
                aria-hidden
              />
            ))}
            <div className="absolute inset-0 flex items-end justify-around gap-1">
              {data.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  tabIndex={0}
                  aria-label={`${d.label} : ${unit(d.value)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/40"
                >
                  <span
                    className={`block w-full max-w-[24px] rounded-t-[4px] transition-colors ${
                      active === i ? "bg-admin-accentHover" : "bg-admin-accent"
                    }`}
                    style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="ml-8 mt-1.5 flex justify-around gap-1 text-[0.7rem] text-admin-muted" aria-hidden>
          {data.map((d) => (
            <span key={d.label} className="min-w-0 flex-1 truncate text-center">
              {d.short}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>{unit(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Graduations rondes : 0, 1, 2… / 0, 5, 10… selon le maximum. */
export function niceTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
