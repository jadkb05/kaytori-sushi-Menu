/**
 * Ligne client dans une liste (mobile/tablette) et tableau des clients (ordinateur).
 * Affiche le nom, le numéro masqué, le code public, le solde de points et sa valeur en dirhams,
 * le nombre de récompenses échangées, la dernière activité et le statut de la carte.
 */
import { formatPublicCode } from "../../../loyalty/lib/qr";
import { AdminLink } from "../../components/AdminLink";
import { ArrowRightIcon } from "../../components/icons";
import { POINT_VALUE_CENTIMES, pointsLabel, pointsValueLabel } from "../lib/points";
import type { SearchItem } from "../lib/staffApi";
import { formatDateTime } from "../lib/staffFormat";
import { staffCardPath } from "../routes";
import { Avatar, StatusBadge } from "./club";
import { ring } from "./staffUi";

export function CardRow({
  item,
  pointValueCentimes = POINT_VALUE_CENTIMES,
}: {
  item: SearchItem;
  pointValueCentimes?: number;
}) {
  return (
    <li>
      <AdminLink
        href={staffCardPath(item.cardId)}
        className={`group flex min-h-[64px] items-center gap-3 rounded-xl border border-admin-line bg-white px-3.5 py-3 shadow-admin-xs transition-colors hover:border-admin-accent/40 hover:bg-admin-canvas/50 ${ring}`}
      >
        <Avatar name={item.fullName} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[0.95rem] font-semibold leading-snug text-admin-ink">
            {item.fullName}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8rem] text-admin-muted">
            <span className="whitespace-nowrap tabular-nums">{item.phoneMasked}</span>
            <span className="font-mono text-[0.75rem] text-admin-soft">{formatPublicCode(item.publicCode)}</span>
            {item.status === "suspended" ? <StatusBadge status="suspended" /> : null}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[0.98rem] font-bold leading-tight tabular-nums text-admin-ink">
            {pointsLabel(item.pointsBalance)}
          </span>
          <span className="block text-[0.76rem] font-medium text-admin-accent">
            {pointsValueLabel(item.pointsBalance, pointValueCentimes)}
          </span>
        </span>
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-admin-soft transition-transform group-hover:text-admin-accent motion-safe:group-hover:translate-x-0.5 max-[359px]:hidden" />
      </AdminLink>
    </li>
  );
}

/** Tableau des clients (ordinateur). */
export function ClientsTable({
  items,
  pointValueCentimes = POINT_VALUE_CENTIMES,
}: {
  items: readonly SearchItem[];
  pointValueCentimes?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-admin-line bg-white shadow-admin-xs">
      <table className="w-full table-fixed border-collapse text-left text-[0.88rem]">
        <caption className="sr-only">Clients du programme de fidélité</caption>
        <thead className="border-b border-admin-line bg-admin-canvas text-[0.76rem] uppercase tracking-wider text-admin-muted">
          <tr>
            <th scope="col" className="w-[28%] px-4 py-3 font-semibold">
              Client
            </th>
            <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
              Téléphone
            </th>
            <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
              Solde de points
            </th>
            <th scope="col" className="w-[13%] px-3 py-3 font-semibold">
              Récompenses
            </th>
            <th scope="col" className="w-[15%] px-3 py-3 font-semibold">
              Dernière activité
            </th>
            <th scope="col" className="w-[10%] px-3 py-3 font-semibold">
              Statut
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-admin-line">
          {items.map((item) => (
            <tr key={item.cardId} className="relative transition-colors hover:bg-admin-canvas/60">
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={item.fullName} />
                  <div className="min-w-0">
                    <AdminLink
                      href={staffCardPath(item.cardId)}
                      className={`block truncate font-semibold text-admin-ink after:absolute after:inset-0 hover:text-admin-accent ${ring}`}
                    >
                      {item.fullName}
                    </AdminLink>
                    <span className="block truncate font-mono text-[0.74rem] tracking-wider text-admin-soft">
                      {formatPublicCode(item.publicCode)}
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 tabular-nums text-admin-muted">{item.phoneMasked}</td>
              <td className="px-3 py-3">
                <span className="block font-semibold tabular-nums text-admin-ink">
                  {pointsLabel(item.pointsBalance)}
                </span>
                <span className="block text-[0.76rem] font-medium text-admin-accent">
                  {pointsValueLabel(item.pointsBalance, pointValueCentimes)}
                </span>
              </td>
              <td className="px-3 py-3 tabular-nums text-admin-muted">
                {item.rewardsRedeemed > 0 ? (
                  <span className="font-medium text-admin-ink">
                    {item.rewardsRedeemed} échangée{item.rewardsRedeemed > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-admin-soft">aucune</span>
                )}
              </td>
              <td className="px-3 py-3 text-admin-muted">
                {item.lastActivityAt ? (
                  formatDateTime(item.lastActivityAt)
                ) : (
                  <span className="text-admin-soft">aucune</span>
                )}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="h-[64px] rounded-xl border border-admin-line bg-white motion-safe:animate-pulse"
        />
      ))}
    </ul>
  );
}
