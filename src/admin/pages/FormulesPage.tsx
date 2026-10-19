import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { AdminLink } from "../components/AdminLink";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon } from "../components/icons";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Toast,
  buttonClass,
  cardClass,
  orderButton,
  touchButton,
  type ToastNotice,
} from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { deleteFormule, formuleCategoryReady, setFormuleActive } from "../lib/formuleAdmin";
import { takeFlash } from "../lib/flash";
import { buildProductList, type AdminProduct } from "../lib/menuAdmin";
import { moveTarget, runProductMove, type MoveDirection } from "../lib/productOrder";
import { ADMIN_ROUTES, formuleEditPath } from "../lib/routes";

/**
 * Liste des formules (catégorie dédiée). Distincte de la liste Produits :
 * pas de recadrage, statut propre au carrousel.
 */
export function FormulesPage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [moving, setMoving] = useState<AdminProduct | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const flash = takeFlash();
    if (flash) setToast({ tone: "success", message: flash });
  }, []);

  const formules = useMemo(() => {
    if (data.status !== "ready") return [];
    return buildProductList(data.rows).filter((p) => p.categoryId === FORMULES_CATEGORY_ID);
  }, [data]);

  const ready = data.status === "ready" && formuleCategoryReady(data.rows);

  const move = async (p: AdminProduct, direction: MoveDirection) => {
    if (moving || data.status !== "ready") return;
    setMoving(p);
    setToast({ tone: "pending", message: `Déplacement de « ${p.name} »…` });
    const notice = await runProductMove(client, p, direction, data.refresh);
    setMoving(null);
    setToast(notice.error ? { tone: "error", message: notice.error } : notice.success ? { tone: "success", message: notice.success } : null);
  };

  const toggle = async (p: AdminProduct) => {
    if (pendingId || data.status !== "ready") return;
    setPendingId(p.id);
    const next = !p.isActive;
    const res = await setFormuleActive(client, p.id, next);
    const refreshed = await data.refresh();
    setPendingId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({
      tone: refreshed ? "success" : "error",
      message: refreshed
        ? next
          ? `« ${p.name} » est de nouveau visible dans le carrousel.`
          : `« ${p.name} » est désactivée : elle n'apparaît plus sur le site.`
        : "Statut enregistré, mais la liste n'a pas pu être rechargée. Actualisez la page.",
    });
  };

  const confirmDelete = async () => {
    if (!deleting || data.status !== "ready") return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await deleteFormule(client, deleting.id);
    if (!res.ok) {
      setDeleteBusy(false);
      setDeleteError(res.error);
      return;
    }
    await data.refresh();
    setDeleteBusy(false);
    setDeleting(null);
    setToast({ tone: "success", message: `« ${deleting.name} » a été supprimée. Les commandes déjà envoyées ne sont pas modifiées.` });
  };

  return (
    <>
      <PageHeader
        title="Formules & Promos"
        description="Affiches du carrousel. Le nom et le prix servent au panier et à WhatsApp ; ils ne s'affichent pas sous la photo."
        actions={
          ready ? (
            <AdminLink href={ADMIN_ROUTES.formuleNew} className={buttonClass("primary")}>
              <PlusIcon className="h-4 w-4" />
              Ajouter une formule
            </AdminLink>
          ) : null
        }
      />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={() => data.reload()} /> : null}
      {data.status === "ready" && !ready ? (
        <p className={`${cardClass} p-5 text-sm leading-relaxed text-admin-soft`}>
          La catégorie n'est pas encore dans Supabase. Le script{" "}
          <span className="font-medium text-admin-ink">supabase/production/07_formules_promos.sql</span> doit être appliqué
          une fois, avec autorisation, avant de pouvoir ajouter ou modifier des formules ici. Le site public continue
          d'afficher les affiches déjà intégrées.
        </p>
      ) : null}
      {ready ? (
        <ul className="space-y-3">
          {formules.map((p) => (
            <li
              key={p.id}
              className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${p.isActive ? "" : "opacity-70"}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    className={`${orderButton} ${touchButton}`}
                    disabled={Boolean(moving) || moveTarget(p, "up") === null}
                    onClick={() => void move(p, "up")}
                    aria-label={`Monter ${p.name}`}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-semibold tabular-nums text-admin-ink">
                    {p.position}
                    <span className="font-normal text-admin-muted">/{p.categoryTotal}</span>
                  </span>
                  <button
                    type="button"
                    className={`${orderButton} ${touchButton}`}
                    disabled={Boolean(moving) || moveTarget(p, "down") === null}
                    onClick={() => void move(p, "down")}
                    aria-label={`Descendre ${p.name}`}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-[#0f1815] object-contain ring-1 ring-black/5" />
                ) : (
                  <span className="grid h-20 w-16 shrink-0 place-items-center rounded-lg bg-admin-subtle text-xs text-admin-muted">Sans photo</span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-admin-ink">{p.name}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-admin-soft">{p.price} DH</p>
                  <div className="mt-1.5">
                    <StatusBadge active={p.isActive} activeLabel="Active" inactiveLabel="Désactivée" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <AdminLink href={formuleEditPath(p.id)} className={buttonClass("secondary", "sm")}>
                  <PencilIcon className="h-3.5 w-3.5" />
                  Modifier
                </AdminLink>
                <button type="button" className={buttonClass("secondary", "sm")} disabled={pendingId === p.id} onClick={() => void toggle(p)}>
                  {p.isActive ? "Désactiver" : "Activer"}
                </button>
                <button
                  type="button"
                  className={buttonClass("dangerOutline", "sm")}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(p);
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
          {formules.length === 0 ? (
            <li className={`${cardClass} p-5 text-sm text-admin-soft`}>Aucune formule pour le moment.</li>
          ) : null}
        </ul>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Supprimer « ${deleting.name} » ?`}
          description="La formule disparaît du carrousel et de l'administration. Les commandes déjà envoyées sur WhatsApp ne sont pas effacées. L'image n'est retirée du stockage que si vous le faites séparément ; une image partagée n'est pas supprimée."
          confirmLabel="Supprimer définitivement"
          pendingLabel="Suppression…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        />
      ) : null}
      <Toast notice={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
