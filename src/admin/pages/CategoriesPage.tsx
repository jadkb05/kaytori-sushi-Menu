import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState, type FormEvent } from "react";
import { Field } from "../components/formControls";
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
  Spinner,
  StatusBadge,
  Switch,
  Toast,
  buttonClass,
  cardClass,
  inputClass,
  orderButton,
  touchButton,
  type ToastNotice,
} from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import {
  CATEGORY_NAME_MAX,
  categoryNameError,
  createCategory,
  deleteBlockedMessage,
  deleteCategory,
  parseCategoryPosition,
  updateCategory,
} from "../lib/categoryAdmin";
import { DISPLAY_MODE_LABELS, buildCategoryList, type AdminCategory } from "../lib/menuAdmin";

/** Action en cours : indicateur sur le bouton cliqué ; toutes les actions restent bloquées jusqu'à la fin. */
type Pending = { id: string; kind: "up" | "down" | "toggle" | "save" | "create" } | null;

/**
 * Modifier / Masquer / Supprimer sur téléphone, à droite des flèches : largeur partagée à parts égales
 * (≤ 6 rem chacun), même hauteur tactile, texte réduit — une seule ligne dès 320 px (icônes dès 420 px).
 */
const actionTouchButton = "max-lg:h-10 max-lg:min-w-0 max-lg:max-w-[6rem] max-lg:flex-1 max-lg:gap-1 max-lg:px-1 max-lg:text-xs";
const actionIcon = "h-3.5 w-3.5 max-[419px]:hidden";

function NewCategoryForm({
  total,
  validate,
  onCreate,
  busy,
  pending,
}: {
  total: number;
  validate: (name: string) => string | null;
  onCreate: (input: { name: string; isActive: boolean; position: number }) => Promise<boolean>;
  busy: boolean;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});
  const max = total + 1;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const nameError = validate(name) ?? undefined;
    const pos = parseCategoryPosition(position === "" ? String(max) : position, max);
    const next = { name: nameError, position: typeof pos === "string" ? pos : undefined };
    setErrors(next);
    if (next.name || next.position) return;
    if (await onCreate({ name, isActive, position: pos as number })) {
      setName("");
      setPosition("");
      setIsActive(true);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={cardClass}>
      <div className="flex items-center gap-3 border-b border-admin-line px-5 py-3.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-admin-tint text-kaytori-green">
          <PlusIcon className="h-4 w-4" />
        </span>
        <h2 className="text-[0.9375rem] font-semibold text-admin-ink">Nouvelle catégorie</h2>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Nom" htmlFor="c-new-name" error={errors.name}>
            <input id="c-new-name" className={inputClass} value={name} maxLength={CATEGORY_NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Position" htmlFor="c-new-position" error={errors.position} hint={`1 à ${max} (vide = en dernier)`}>
            <input
              id="c-new-position"
              className={`${inputClass} tabular-nums`}
              inputMode="numeric"
              placeholder={String(max)}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </Field>
        </div>
        <Switch
          checked={isActive}
          onChange={setIsActive}
          label="Visible sur le menu"
          description="Une catégorie vide n'apparaît pas tant qu'elle n'a pas de produit visible."
        />
      </div>
      <div className="flex justify-end border-t border-admin-line bg-admin-subtle/60 px-5 py-3.5 max-sm:[&>button]:w-full">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {pending ? <Spinner /> : null}
          {pending ? "Création…" : "Créer la catégorie"}
        </button>
      </div>
    </form>
  );
}

function EditCategoryPanel({
  category,
  total,
  validate,
  onSave,
  onCancel,
  busy,
  pending,
}: {
  category: AdminCategory;
  total: number;
  validate: (name: string) => string | null;
  onSave: (changes: { name?: string; position?: number }) => Promise<boolean>;
  onCancel: () => void;
  busy: boolean;
  pending: boolean;
}) {
  const current = category.position;
  const [name, setName] = useState(category.name);
  const [position, setPosition] = useState(String(current));
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const nameError = validate(name) ?? undefined;
    const pos = parseCategoryPosition(position, total);
    const next = { name: nameError, position: typeof pos === "string" ? pos : undefined };
    setErrors(next);
    if (next.name || next.position) return;
    const changes: { name?: string; position?: number } = {};
    if (name.trim() !== category.name) changes.name = name;
    if (pos !== current) changes.position = pos as number;
    if (Object.keys(changes).length === 0) return onCancel();
    await onSave(changes);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4 border-l-[3px] border-kaytori-green bg-admin-subtle px-4 py-4 motion-safe:animate-admin-in sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start lg:px-5"
    >
      <Field label="Nom" htmlFor={`c-${category.id}-name`} error={errors.name} hint={`Identifiant inchangé : ${category.id}`}>
        <input
          id={`c-${category.id}-name`}
          className={inputClass}
          value={name}
          maxLength={CATEGORY_NAME_MAX}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Position" htmlFor={`c-${category.id}-position`} error={errors.position} hint={`1 à ${total}`}>
        <input
          id={`c-${category.id}-position`}
          className={`${inputClass} tabular-nums`}
          inputMode="numeric"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
      </Field>
      <div className="flex gap-2 sm:pt-[1.625rem]">
        <button type="submit" disabled={busy} className={`${buttonClass("primary")} max-sm:flex-1`}>
          {pending ? <Spinner /> : null}
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${buttonClass("secondary")} max-sm:flex-1`}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/** Catégories dans l'ordre du menu : création, renommage, masquer / afficher, ordre, suppression. */
export function CategoriesPage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const rows = data.rows;
  const categories = useMemo(() => (rows ? buildCategoryList(rows) : []), [rows]);
  const [toast, setToast] = useState<ToastNotice>(null);
  const [pending, setPending] = useState<Pending>(null);
  const busy = pending !== null;
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Relit la base sans repasser par l'écran de chargement (la liste reste affichée) ; rechargement complet en secours. */
  const refreshList = async () => {
    if (!(await data.refresh())) data.reload();
  };

  /** Exécute une action, relit les données, puis affiche le résultat. Actions bloquées pendant ce temps. */
  const run = async (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    next: NonNullable<Pending>,
  ): Promise<boolean> => {
    if (busy) return false;
    setPending(next);
    setToast(null);
    const res = await action();
    if (!res.ok) {
      setPending(null);
      setToast({ tone: "error", message: res.error });
      return false;
    }
    await refreshList();
    setPending(null);
    setToast({ tone: "success", message: success });
    setEditing(null);
    return true;
  };

  const move = (c: AdminCategory, position: number) =>
    run(() => updateCategory(client, c.id, { position }), `« ${c.name} » déplacée en position ${position}.`, {
      id: c.id,
      kind: position < c.position ? "up" : "down",
    });
  const toggle = (c: AdminCategory) =>
    run(
      () => updateCategory(client, c.id, { isActive: !c.isActive }),
      c.isActive ? `« ${c.name} » masquée : ses produits ne sont plus visibles sur le menu.` : `« ${c.name} » de nouveau visible sur le menu.`,
      { id: c.id, kind: "toggle" },
    );
  const askDelete = (c: AdminCategory) => {
    setToast(null);
    if (c.productCount > 0) return setToast({ tone: "error", message: deleteBlockedMessage(c.productCount) });
    setDeleteError(null);
    setDeleting(c);
  };
  const confirmDelete = async () => {
    if (!rows || !deleting || deleteBusy) return;
    setDeleteBusy(true);
    const res = await deleteCategory(client, rows, deleting.id);
    if (!res.ok) {
      setDeleteBusy(false);
      return setDeleteError(res.error);
    }
    await refreshList();
    setDeleteBusy(false);
    setToast({ tone: "success", message: `Catégorie « ${deleting.name} » supprimée.` });
    setDeleting(null);
  };
  const isPending = (c: AdminCategory, kind: NonNullable<Pending>["kind"]) => pending?.id === c.id && pending.kind === kind;

  return (
    <>
      <PageHeader title="Catégories" description="Ordre d'affichage du menu public. Les catégories masquées restent comptées dans les positions." />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" && rows ? (
        <div className="space-y-6">
          {/*
            Téléphone et tablette (< 1024 px) : chaque catégorie en carte (même balisage, en-têtes masqués) — ordre ↑ / position / ↓
            en colonne à gauche ; à droite : nom et statut, produits et affichage, puis les actions sur la ligne de ↓.
          */}
          <div className={`${cardClass} relative overflow-x-auto`}>
            <table className="min-w-full text-left text-sm max-lg:block">
              <thead className="border-b border-admin-line bg-admin-subtle text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-muted max-lg:hidden">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">Ordre</th>
                  <th scope="col" className="px-3 py-3">Nom</th>
                  <th scope="col" className="px-3 py-3">Produits</th>
                  <th scope="col" className="px-3 py-3">Affichage</th>
                  <th scope="col" className="px-3 py-3">Statut</th>
                  <th scope="col" className="py-3 pl-3 pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {categories.map((c) => (
                <tbody key={c.id} className="border-t border-admin-line first:border-t-0 max-lg:block">
                  <tr
                    aria-busy={pending?.id === c.id || undefined}
                    className={`transition-colors max-lg:grid max-lg:grid-cols-[auto_minmax(0,1fr)_auto] max-lg:items-start max-lg:gap-x-3 max-lg:gap-y-1 max-lg:px-3 max-lg:py-3.5 sm:max-lg:px-4 ${
                      pending?.id === c.id || editing === c.id ? "bg-admin-subtle" : "lg:hover:bg-admin-subtle/70"
                    }`}
                  >
                    <td className="py-3 pl-5 pr-3 max-lg:col-start-1 max-lg:row-span-3 max-lg:row-start-1 max-lg:self-stretch max-lg:p-0">
                      {/* Téléphone : ↑ en haut, ↓ en bas de la carte (aligné sur la rangée des actions). */}
                      <div className="flex items-center gap-1.5 max-lg:h-full max-lg:flex-col max-lg:justify-between max-lg:gap-1">
                        <span className="w-6 text-[13px] font-medium tabular-nums text-admin-ink max-lg:order-2 max-lg:w-auto max-lg:text-center max-lg:text-sm max-lg:font-semibold">
                          {c.position}
                        </span>
                        <button type="button" className={`${orderButton} ${touchButton} max-lg:order-1`} disabled={busy || c.position === 1} onClick={() => move(c, c.position - 1)} aria-label={`Monter ${c.name}`}>
                          {isPending(c, "up") ? <Spinner className="h-3.5 w-3.5" /> : <ArrowUpIcon className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />}
                        </button>
                        <button type="button" className={`${orderButton} ${touchButton} max-lg:order-3`} disabled={busy || c.position === categories.length} onClick={() => move(c, c.position + 1)} aria-label={`Descendre ${c.name}`}>
                          {isPending(c, "down") ? <Spinner className="h-3.5 w-3.5" /> : <ArrowDownIcon className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-admin-ink max-lg:col-start-2 max-lg:row-start-1 max-lg:min-w-0 max-lg:break-words max-lg:p-0 max-lg:pt-1 max-lg:text-[0.95rem]">
                      {c.name}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-admin-soft lg:whitespace-nowrap max-lg:col-start-2 max-lg:row-start-2 max-lg:p-0 max-lg:text-xs">
                      {c.visibleProductCount === c.productCount ? c.productCount : `${c.visibleProductCount} visibles / ${c.productCount}`}
                      <span className="lg:hidden"> produit{c.productCount > 1 ? "s" : ""} · {DISPLAY_MODE_LABELS[c.displayMode]}</span>
                    </td>
                    <td className="px-3 py-3 text-admin-soft max-lg:hidden">{DISPLAY_MODE_LABELS[c.displayMode]}</td>
                    <td className="px-3 py-3 max-lg:col-start-3 max-lg:row-start-1 max-lg:justify-self-end max-lg:p-0 max-lg:pt-1">
                      <StatusBadge active={c.isActive} />
                    </td>
                    <td className="py-3 pl-3 pr-5 max-lg:col-span-2 max-lg:col-start-2 max-lg:row-start-3 max-lg:self-end max-lg:p-0 max-lg:pt-2">
                      <div className="flex flex-wrap justify-end gap-1.5 max-lg:flex-nowrap max-lg:justify-start xl:flex-nowrap xl:whitespace-nowrap">
                        <button
                          type="button"
                          aria-expanded={editing === c.id}
                          className={`${buttonClass("secondary", "sm")} ${actionTouchButton} ${editing === c.id ? "border-kaytori-green/40 bg-admin-tint text-kaytori-green" : ""}`}
                          disabled={busy}
                          onClick={() => setEditing(editing === c.id ? null : c.id)}
                        >
                          <PencilIcon className={actionIcon} />
                          <span>Modifier</span>
                        </button>
                        <button type="button" className={`${buttonClass("secondary", "sm")} ${actionTouchButton} lg:w-[6.75rem]`} disabled={busy} onClick={() => toggle(c)}>
                          {isPending(c, "toggle") ? <Spinner className="h-3.5 w-3.5" /> : c.isActive ? <EyeOffIcon className={actionIcon} /> : <EyeIcon className={actionIcon} />}
                          <span>{c.isActive ? "Masquer" : "Afficher"}</span>
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass("secondary", "sm")} ${actionTouchButton} text-red-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800`}
                          disabled={busy}
                          onClick={() => askDelete(c)}
                        >
                          <TrashIcon className={actionIcon} />
                          <span>Supprimer</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === c.id ? (
                    <tr className="max-lg:block">
                      <td colSpan={6} className="p-0 max-lg:block">
                        <EditCategoryPanel
                          category={c}
                          total={categories.length}
                          validate={(name) => categoryNameError(name, rows, c.id)}
                          busy={busy}
                          pending={isPending(c, "save")}
                          onCancel={() => setEditing(null)}
                          onSave={(changes) =>
                            run(() => updateCategory(client, c.id, changes), `Catégorie « ${(changes.name ?? c.name).trim()} » enregistrée.`, { id: c.id, kind: "save" })
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              ))}
            </table>
          </div>
          <NewCategoryForm
            total={categories.length}
            busy={busy}
            pending={pending?.kind === "create"}
            validate={(name) => categoryNameError(name, rows)}
            onCreate={(input) => run(() => createCategory(client, rows, input), `Catégorie « ${input.name.trim()} » créée.`, { id: "", kind: "create" })}
          />
        </div>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Supprimer « ${deleting.name} » ?`}
          description="Cette catégorie est vide. Elle sera supprimée définitivement."
          confirmLabel="Supprimer définitivement"
          pendingLabel="Suppression…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      ) : null}
      <Toast notice={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
