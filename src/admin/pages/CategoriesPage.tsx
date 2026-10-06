import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState, type FormEvent } from "react";
import { Field } from "../components/formControls";
import { ErrorState, LoadingState, PageHeader, StatusBadge, inputClass } from "../components/ui";
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

type Notice = { success?: string; error?: string };

const smallButton =
  "rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40";
const greenButton =
  "rounded-lg bg-kaytori-green px-4 py-2 text-sm font-semibold text-white hover:bg-kaytori-greenDark disabled:cursor-not-allowed disabled:opacity-60";

function NewCategoryForm({
  total,
  validate,
  onCreate,
  busy,
}: {
  total: number;
  validate: (name: string) => string | null;
  onCreate: (input: { name: string; isActive: boolean; position: number }) => Promise<boolean>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});
  const max = total + 1;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Nouvelle catégorie</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Nom" htmlFor="c-new-name" error={errors.name}>
          <input
            id="c-new-name"
            className={inputClass}
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Position" htmlFor="c-new-position" error={errors.position} hint={`1 à ${max} (vide = en dernier)`}>
          <input
            id="c-new-position"
            className={inputClass}
            inputMode="numeric"
            placeholder={String(max)}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Visible sur le menu (une catégorie vide n'apparaît pas tant qu'elle n'a pas de produit visible)
      </label>
      <button type="submit" disabled={busy} className={`mt-4 ${greenButton}`}>
        Créer la catégorie
      </button>
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
}: {
  category: AdminCategory;
  total: number;
  validate: (name: string) => string | null;
  onSave: (changes: { name?: string; position?: number }) => Promise<boolean>;
  onCancel: () => void;
  busy: boolean;
}) {
  const current = category.position;
  const [name, setName] = useState(category.name);
  const [position, setPosition] = useState(String(current));
  const [errors, setErrors] = useState<{ name?: string; position?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="grid gap-3 bg-stone-50 px-4 py-4 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
      <Field label="Nom" htmlFor={`c-${category.id}-name`} error={errors.name} hint={`Identifiant inchangé : ${category.id}`}>
        <input
          id={`c-${category.id}-name`}
          className={inputClass}
          value={name}
          maxLength={CATEGORY_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Position" htmlFor={`c-${category.id}-position`} error={errors.position} hint={`1 à ${total}`}>
        <input
          id={`c-${category.id}-position`}
          className={inputClass}
          inputMode="numeric"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
      </Field>
      <div className="flex gap-2 sm:pt-6">
        <button type="submit" disabled={busy} className={greenButton}>
          Enregistrer
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
          Annuler
        </button>
      </div>
    </form>
  );
}

function DeleteCategoryDialog({
  category,
  onConfirm,
  onClose,
  busy,
  error,
}: {
  category: AdminCategory;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-category-title" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h3 id="delete-category-title" className="text-lg font-semibold text-stone-900">
          Supprimer « {category.name} » ?
        </h3>
        <p className="mt-2 text-sm text-stone-600">Cette catégorie est vide. Elle sera supprimée définitivement.</p>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            Annuler
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
            {busy ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Catégories dans l'ordre du menu : création, renommage, masquer / afficher, ordre, suppression. */
export function CategoriesPage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const rows = data.rows;
  const categories = useMemo(() => (rows ? buildCategoryList(rows) : []), [rows]);
  const [notice, setNotice] = useState<Notice>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Exécute une action, affiche le résultat, puis recharge les données. */
  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string): Promise<boolean> => {
    setBusy(true);
    setNotice({});
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setNotice({ error: res.error });
      return false;
    }
    setNotice({ success });
    setEditing(null);
    data.reload();
    return true;
  };

  const move = (c: AdminCategory, position: number) =>
    run(() => updateCategory(client, c.id, { position }), `« ${c.name} » déplacée en position ${position}.`);
  const toggle = (c: AdminCategory) =>
    run(
      () => updateCategory(client, c.id, { isActive: !c.isActive }),
      c.isActive
        ? `« ${c.name} » masquée : ses produits ne sont plus visibles sur le menu.`
        : `« ${c.name} » de nouveau visible sur le menu.`,
    );
  const askDelete = (c: AdminCategory) => {
    setNotice({});
    if (c.productCount > 0) return setNotice({ error: deleteBlockedMessage(c.productCount) });
    setDeleteError(null);
    setDeleting(c);
  };
  const confirmDelete = async () => {
    if (!rows || !deleting) return;
    setBusy(true);
    const res = await deleteCategory(client, rows, deleting.id);
    setBusy(false);
    if (!res.ok) return setDeleteError(res.error);
    setNotice({ success: `Catégorie « ${deleting.name} » supprimée.` });
    setDeleting(null);
    data.reload();
  };

  return (
    <>
      <PageHeader title="Catégories" description="Ordre d'affichage du menu public. Les catégories masquées restent comptées dans les positions." />
      {notice.success ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice.success}
        </p>
      ) : null}
      {notice.error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice.error}
        </p>
      ) : null}
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" && rows ? (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase tracking-wide text-stone-500">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-3">Ordre</th>
                  <th scope="col" className="px-3 py-2.5">Nom</th>
                  <th scope="col" className="px-3 py-2.5">Produits</th>
                  <th scope="col" className="px-3 py-2.5">Affichage</th>
                  <th scope="col" className="px-3 py-2.5">Statut</th>
                  <th scope="col" className="py-2.5 pl-3 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {categories.map((c) => (
                <tbody key={c.id} className="border-t border-stone-100 first:border-t-0">
                  <tr>
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 tabular-nums text-stone-500">{c.position}</span>
                        <button type="button" className={smallButton} disabled={busy || c.position === 1} onClick={() => move(c, c.position - 1)} aria-label={`Monter ${c.name}`}>
                          ↑
                        </button>
                        <button type="button" className={smallButton} disabled={busy || c.position === categories.length} onClick={() => move(c, c.position + 1)} aria-label={`Descendre ${c.name}`}>
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-stone-900">{c.name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-stone-600">
                      {c.visibleProductCount === c.productCount ? c.productCount : `${c.visibleProductCount} visibles / ${c.productCount}`}
                    </td>
                    <td className="px-3 py-2.5 text-stone-600">{DISPLAY_MODE_LABELS[c.displayMode]}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge active={c.isActive} />
                    </td>
                    <td className="py-2.5 pl-3 pr-4">
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <button type="button" className={smallButton} disabled={busy} onClick={() => setEditing(editing === c.id ? null : c.id)}>
                          Modifier
                        </button>
                        <button type="button" className={smallButton} disabled={busy} onClick={() => toggle(c)}>
                          {c.isActive ? "Masquer" : "Afficher"}
                        </button>
                        <button type="button" className={`${smallButton} text-red-700`} disabled={busy} onClick={() => askDelete(c)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === c.id ? (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <EditCategoryPanel
                          category={c}
                          total={categories.length}
                          validate={(name) => categoryNameError(name, rows, c.id)}
                          busy={busy}
                          onCancel={() => setEditing(null)}
                          onSave={(changes) => run(() => updateCategory(client, c.id, changes), `Catégorie « ${(changes.name ?? c.name).trim()} » enregistrée.`)}
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
            validate={(name) => categoryNameError(name, rows)}
            onCreate={(input) => run(() => createCategory(client, rows, input), `Catégorie « ${input.name.trim()} » créée.`)}
          />
        </div>
      ) : null}
      {deleting ? (
        <DeleteCategoryDialog category={deleting} busy={busy} error={deleteError} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
      ) : null}
    </>
  );
}
