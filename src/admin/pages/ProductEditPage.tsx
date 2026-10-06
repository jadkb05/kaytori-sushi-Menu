import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminLink } from "../components/AdminLink";
import { Field, PriceInput, Section, fieldError } from "../components/formControls";
import { ErrorState, LoadingState, PageHeader, StatusBadge, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { navigate } from "../hooks/useAdminPath";
import { setFlash } from "../lib/flash";
import type { PhotoSelection } from "../lib/productEditor";
import { PHOTO_ACCEPT, uploadProductPhoto, validatePhotoFile } from "../lib/productPhoto";
import {
  buildSaveRequest,
  categorySlots,
  deleteCatalogProduct,
  hasCatalogErrors,
  isCatalogDirty,
  isEmptySaveRequest,
  loadCatalogEdit,
  saveCatalogProduct,
  validateCatalogForm,
  type CatalogEditData,
  type CatalogErrors,
  type CatalogForm,
  type EditVariant,
} from "../lib/productSave";
import { ADMIN_ROUTES } from "../lib/routes";

/**
 * Position dans la catégorie (1 = premier). Catégorie à ordre automatique : « Position automatique ».
 * Si la catégorie change, la position est choisie dans la nouvelle catégorie (1…N+1).
 */
export function PositionField({
  data,
  form,
  error,
  onChange,
}: {
  data: CatalogEditData;
  form: CatalogForm;
  error?: string;
  onChange: (value: string) => void;
}) {
  const slots = categorySlots(data.rows, form.categoryId, data.product.id);
  if (!slots || slots.automatic) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-stone-700">Position automatique</p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Cette catégorie utilise un ordre automatique.
        </p>
      </div>
    );
  }
  const moving = form.categoryId !== data.product.category_id;
  const hidden = slots.hidden > 0 ? ` Les produits masqués comptent (${slots.hidden}).` : "";
  return (
    <Field
      label={moving ? "Position dans la nouvelle catégorie" : "Position dans la catégorie"}
      htmlFor="p-position"
      error={error}
      hint={`1 = premier produit affiché, 2 = deuxième, 3 = troisième… (${slots.max} positions).${hidden}`}
    >
      <input
        id="p-position"
        type="number"
        inputMode="numeric"
        min={1}
        max={slots.max}
        step={1}
        value={form.position}
        onChange={(e) => onChange(e.target.value)}
        className={fieldError(`${inputClass} tabular-nums`, error)}
      />
    </Field>
  );
}

/**
 * Photo : aperçu actuel, « Changer la photo » (aperçu local immédiat, rien n'est téléversé),
 * « Annuler la sélection ». Le téléversement a lieu uniquement à l'enregistrement.
 */
export function ProductPhotoField({
  currentUrl,
  selection,
  error,
  disabled,
  onSelect,
  onClear,
}: {
  currentUrl: string | null;
  selection: PhotoSelection | null;
  error: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onClear: () => void;
}) {
  const shown = selection?.previewUrl ?? currentUrl;
  return (
    <div>
      <div className="relative">
        {shown ? (
          <img src={shown} alt="" className="aspect-square w-full rounded-lg bg-[#0f1815] object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-stone-100" />
        )}
        {selection ? (
          <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
            Nouvelle photo — non enregistrée
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label
          className={`inline-flex cursor-pointer items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Changer la photo
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              onSelect(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {selection ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
          >
            Annuler la sélection
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-stone-500">
          {selection ? `${selection.file.name} · envoyée à l'enregistrement.` : "JPEG, PNG ou WebP · 5 Mo maximum · format carré conseillé."}
        </p>
      )}
    </div>
  );
}

let newVariantSeq = 0;

/** Une variante : libellé, prix, position (1 = première), statut ; retrait (confirmé si déjà enregistrée). */
function VariantCard({
  v,
  index,
  total,
  errors,
  onChange,
  onRemove,
}: {
  v: EditVariant;
  index: number;
  total: number;
  errors: CatalogErrors["variants"][string];
  onChange: (patch: Partial<EditVariant>) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const base = v.existingId ? `v-${v.existingId}` : `v-new-${v.key}`;
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-stone-500">
          Variante {index + 1}
          {v.existingId ? null : <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">nouvelle</span>}
        </p>
        <div className="flex items-center gap-3">
          <StatusBadge active={v.isActive} />
          {confirming ? null : (
            <button
              type="button"
              onClick={() => (v.existingId ? setConfirming(true) : onRemove())}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>
      {confirming ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          Retirer cette variante ? Elle sera supprimée à l'enregistrement.
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700">
              Annuler
            </button>
            <button type="button" onClick={onRemove} className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white">
              Retirer la variante
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Libellé" htmlFor={`${base}-label`} error={errors.label}>
          <input id={`${base}-label`} value={v.label} onChange={(e) => onChange({ label: e.target.value })} className={fieldError(inputClass, errors.label)} />
        </Field>
        <Field label="Prix" htmlFor={`${base}-price`} error={errors.price}>
          <PriceInput id={`${base}-price`} value={v.price} onChange={(val) => onChange({ price: val })} error={errors.price} />
        </Field>
        <Field label="Position" htmlFor={`${base}-position`} error={errors.position} hint={`1 à ${total}`}>
          <input
            id={`${base}-position`}
            type="number"
            inputMode="numeric"
            min={1}
            max={total}
            step={1}
            value={v.position}
            onChange={(e) => onChange({ position: e.target.value })}
            className={fieldError(`${inputClass} tabular-nums`, errors.position)}
          />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2.5 text-sm text-stone-700">
        <input type="checkbox" checked={v.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} className="h-4 w-4 accent-kaytori-green" />
        Variante active
      </label>
    </div>
  );
}

/** « Supprimer le produit » : confirmation explicite en deux temps (jamais au premier clic). */
function DeleteProductSection({ name, onDelete }: { name: string; onDelete: () => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setPending(true);
    setError(null);
    const message = await onDelete();
    setPending(false);
    if (message) setError(message);
  };
  return (
    <section className="rounded-xl border border-red-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700">Supprimer le produit</h2>
      <p className="mt-1 text-sm text-stone-600">Retire définitivement « {name} » du menu.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Supprimer le produit
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 id="delete-title" className="text-lg font-semibold text-stone-900">
              Supprimer ce produit ?
            </h3>
            <p className="mt-2 text-sm text-stone-600">Cette action supprimera définitivement le produit et ses variantes.</p>
            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type Notice = { success?: string; error?: string };

function ProductEditForm({
  data,
  client,
  onSaved,
  onDeleted,
}: {
  data: CatalogEditData;
  client: SupabaseClient;
  onSaved: (notice: Notice) => void;
  onDeleted: (name: string) => void;
}) {
  /** originalData = data.form · currentData = form · selectedNewImage = photo. */
  const [form, setForm] = useState<CatalogForm>(data.form);
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<CatalogErrors>({ variants: {} });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = isCatalogDirty(data.form, form, photo);
  const category = data.categories.find((c) => c.id === form.categoryId);
  const hasVariants = form.variants.length > 0;

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  const set = <K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const changeCategory = (categoryId: string) =>
    setForm((f) => {
      if (categoryId === data.product.category_id) return { ...f, categoryId, position: String(data.currentPosition) };
      const slots = categorySlots(data.rows, categoryId, data.product.id);
      return { ...f, categoryId, position: String(slots?.max ?? 1) }; // par défaut : en dernier
    });
  const setVariant = (key: string, patch: Partial<EditVariant>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));
  const addVariant = () =>
    setForm((f) => ({
      ...f,
      variants: [
        ...f.variants,
        { key: `n:${++newVariantSeq}`, existingId: null, label: "", price: "", position: String(f.variants.length + 1), isActive: true },
      ],
    }));
  const removeVariant = (key: string) =>
    setForm((f) => {
      const removed = f.variants.find((v) => v.key === key);
      const removedPos = Number(removed?.position ?? NaN);
      // Les variantes suivantes remontent d'une position.
      return {
        ...f,
        variants: f.variants
          .filter((v) => v.key !== key)
          .map((v) => (Number.isFinite(removedPos) && Number(v.position) > removedPos ? { ...v, position: String(Number(v.position) - 1) } : v)),
      };
    });
  const selectPhoto = (file: File | null) => {
    if (!file) return;
    const invalid = validatePhotoFile(file);
    setPhotoError(invalid);
    if (!invalid) setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const found = validateCatalogForm(form, data);
    setErrors(found);
    if (hasCatalogErrors(found)) {
      setSaveError("Corrigez les champs indiqués avant d'enregistrer.");
      return;
    }
    if (isEmptySaveRequest(buildSaveRequest(data, form)) && !photo) {
      setSaveError("Aucune modification à enregistrer.");
      return;
    }
    setPending(true);
    const result = await saveCatalogProduct(client, data, form, photo?.file ?? null, uploadProductPhoto);
    setPending(false);
    if (!result.ok) {
      if (result.uploadedPath) console.warn(`[admin] Photo téléversée mais non enregistrée : ${result.uploadedPath}`);
      setSaveError(result.error);
      return;
    }
    onSaved({ success: `« ${result.name} » a été enregistré${photo ? " avec la nouvelle photo" : ""}.` });
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5">
        {saveError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <Section title="Produit">
              <div className="space-y-4">
                <Field label="Nom" htmlFor="p-name" error={errors.name}>
                  <input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldError(inputClass, errors.name)} />
                </Field>
                <Field label="Description" htmlFor="p-description" hint="Facultative.">
                  <textarea id="p-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Catégorie" htmlFor="p-category" error={errors.categoryId}>
                    <select id="p-category" value={form.categoryId} onChange={(e) => changeCategory(e.target.value)} className={fieldError(inputClass, errors.categoryId)}>
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.is_active ? "" : " (masquée)"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {hasVariants ? (
                    <div>
                      <p className="mb-1 text-sm font-medium text-stone-700">Prix</p>
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Produit à variantes → gérer les prix au niveau des variantes.
                      </p>
                    </div>
                  ) : (
                    <Field label="Prix" htmlFor="p-price" error={errors.price}>
                      <PriceInput id="p-price" value={form.price} onChange={(v) => set("price", v)} error={errors.price} />
                    </Field>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <PositionField data={data} form={form} error={errors.position} onChange={(v) => set("position", v)} />
                  <div>
                    <p className="mb-1 text-sm font-medium text-stone-700">Statut</p>
                    <label className="flex items-center gap-2.5 rounded-lg border border-stone-300 px-3 py-2 text-sm">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-kaytori-green" />
                      Actif (visible sur le menu)
                    </label>
                    {form.isActive && category && !category.is_active ? (
                      <p className="mt-1 text-xs text-amber-700">La catégorie est masquée : le produit restera invisible.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Section>

            <Section title={`Variantes (${form.variants.length})`}>
              {form.variants.length === 0 ? (
                <p className="mb-3 text-sm text-stone-500">Aucune variante. Ajoutez-en si le prix dépend du choix du client (ex. Poulet, Bœuf).</p>
              ) : null}
              <div className="space-y-3">
                {form.variants.map((v, i) => (
                  <VariantCard
                    key={v.key}
                    v={v}
                    index={i}
                    total={form.variants.length}
                    errors={errors.variants[v.key] ?? {}}
                    onChange={(patch) => setVariant(v.key, patch)}
                    onRemove={() => removeVariant(v.key)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addVariant}
                className="mt-3 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                + Ajouter une variante
              </button>
            </Section>
          </div>

          <aside className="space-y-5">
            <Section title="Photo">
              <ProductPhotoField
                currentUrl={data.product.image_url}
                selection={photo}
                error={photoError}
                disabled={pending}
                onSelect={selectPhoto}
                onClear={() => {
                  setPhoto(null);
                  setPhotoError(null);
                }}
              />
            </Section>
            <Section title="Référence interne">
              <p className="break-all font-mono text-sm text-stone-700">{data.product.id}</p>
              <p className="mt-1 text-xs text-stone-500">Non modifiable (utilisée par le panier et les commandes).</p>
            </Section>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate(ADMIN_ROUTES.products)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-lg bg-kaytori-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-kaytori-greenDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <div className="mt-8">
        <DeleteProductSection
          name={data.product.name}
          onDelete={async () => {
            const res = await deleteCatalogProduct(client, data.product.id);
            if (!res.ok) return res.error;
            onDeleted(data.product.name);
            return null;
          }}
        />
      </div>
    </>
  );
}

/** /admin/products/:id — édition complète d'un produit existant. */
export function ProductEditPage({ productId, client }: { productId: string; client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [notice, setNotice] = useState<Notice | null>(null);
  const edit = useMemo(() => (data.rows ? loadCatalogEdit(data.rows, productId) : null), [data.rows, productId]);

  const onSaved = (n: Notice) => {
    setNotice(n);
    // Rechargement depuis Supabase : le formulaire repart des valeurs enregistrées.
    data.reload();
  };
  const onDeleted = (name: string) => {
    setFlash(`Produit « ${name} » supprimé.`);
    data.reload();
    navigate(ADMIN_ROUTES.products);
  };

  return (
    <>
      <AdminLink href={ADMIN_ROUTES.products} className="mb-3 inline-block text-sm font-medium text-kaytori-green hover:underline">
        ← Produits
      </AdminLink>
      <PageHeader title={edit ? edit.product.name : "Modifier le produit"} description="Modifier un produit existant." />
      {notice?.success ? (
        <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice.success}
        </p>
      ) : null}
      {notice?.error ? (
        <p className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice.error}
        </p>
      ) : null}
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" && !edit ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">Produit introuvable : {productId}</p>
      ) : null}
      {edit ? (
        <ProductEditForm
          key={JSON.stringify([edit.form, edit.product.image_url, edit.product.sort_order])}
          data={edit}
          client={client}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  );
}
