import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminLink } from "../components/AdminLink";
import { Field, PriceInput, Section, fieldError } from "../components/formControls";
import { ErrorState, LoadingState, PageHeader, StatusBadge, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { navigate } from "../hooks/useAdminPath";
import {
  buildEditPlan,
  hasErrors,
  isEmptyPayload,
  isFormDirty,
  isPositionEditable,
  loadProductForEdit,
  saveProductEdits,
  validateProductForm,
  type FormErrors,
  type PhotoSelection,
  type ProductEditData,
  type ProductForm,
  type VariantForm,
} from "../lib/productEditor";
import { PHOTO_ACCEPT, saveProductImageUrl, uploadProductPhoto, validatePhotoFile } from "../lib/productPhoto";
import { ADMIN_ROUTES } from "../lib/routes";

/**
 * Position dans la catégorie : champ numérique (1 = premier) pour les catégories à ordre manuel,
 * « Position automatique » (sans champ) pour Plats Thaï / Assortiments.
 */
export function PositionField({
  edit,
  form,
  error,
  onChange,
}: {
  edit: Pick<ProductEditData, "position" | "product">;
  form: ProductForm;
  error?: string;
  onChange: (value: string) => void;
}) {
  if (edit.position.automatic) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-stone-700">Position automatique</p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Cette catégorie utilise un ordre automatique.
        </p>
      </div>
    );
  }
  const editable = isPositionEditable(edit, form);
  return (
    <Field
      label="Position dans la catégorie"
      htmlFor="p-position"
      error={error}
      hint={
        editable
          ? `1 = premier produit affiché, 2 = deuxième, 3 = troisième… (${edit.position.total} produits)`
          : "Enregistrez d'abord le changement de catégorie, puis réglez la position."
      }
    >
      <input
        id="p-position"
        type="number"
        inputMode="numeric"
        min={1}
        max={edit.position.total}
        step={1}
        value={editable ? form.position : String(edit.position.position)}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
        className={fieldError(`${inputClass} tabular-nums disabled:bg-stone-50 disabled:text-stone-500`, error)}
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

type Notice = { success?: string; error?: string };

function ProductEditForm({
  edit,
  client,
  onSaved,
}: {
  edit: ProductEditData;
  client: SupabaseClient;
  onSaved: (notice: Notice) => void;
}) {
  /** originalData = edit.form · currentData = form · selectedNewImage = photo. */
  const [form, setForm] = useState<ProductForm>(edit.form);
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({ variants: {} });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = isFormDirty(edit.form, form, photo);
  const category = edit.categories.find((c) => c.id === form.categoryId);

  // Libère l'aperçu local (object URL) quand la sélection change ou que le formulaire disparaît.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setVariant = (id: string, patch: Partial<VariantForm>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));

  const selectPhoto = (file: File | null) => {
    if (!file) return;
    const invalid = validatePhotoFile(file);
    setPhotoError(invalid);
    if (!invalid) setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const found = validateProductForm(form, edit);
    setErrors(found);
    if (hasErrors(found)) {
      setSaveError("Corrigez les champs indiqués avant d'enregistrer.");
      return;
    }
    const plan = buildEditPlan(edit, form);
    if (isEmptyPayload(plan.payload) && plan.siblingSortOrders.length === 0 && !photo) {
      setSaveError("Aucune modification à enregistrer.");
      return;
    }
    setPending(true);
    const result = await saveProductEdits(client, edit.product.id, plan, photo?.file ?? null, {
      uploadPhoto: uploadProductPhoto,
      saveImageUrl: saveProductImageUrl,
    });
    setPending(false);
    if (!result.ok) {
      // Une partie est déjà enregistrée : on recharge pour afficher l'état réel de la base.
      if (result.fieldsSaved) onSaved({ error: result.error });
      else setSaveError(result.error);
      return;
    }
    onSaved({ success: `« ${result.productName || edit.product.name} » a été enregistré${photo ? " avec la nouvelle photo" : ""}.` });
  };

  return (
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
                <textarea
                  id="p-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Catégorie" htmlFor="p-category" error={errors.categoryId}>
                  <select
                    id="p-category"
                    value={form.categoryId}
                    onChange={(e) => set("categoryId", e.target.value)}
                    className={fieldError(inputClass, errors.categoryId)}
                  >
                    {edit.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.is_active ? "" : " (masquée)"}
                      </option>
                    ))}
                  </select>
                </Field>
                {edit.hasVariants ? (
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
                <PositionField edit={edit} form={form} error={errors.position} onChange={(v) => set("position", v)} />
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

          {edit.hasVariants ? (
            <Section title={`Variantes (${form.variants.length})`}>
              <div className="space-y-3">
                {form.variants.map((v) => {
                  const ve = errors.variants[v.id] ?? {};
                  return (
                    <div key={v.id} className="rounded-lg border border-stone-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-stone-400">ID : {v.id}</p>
                        <StatusBadge active={v.isActive} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <Field label="Libellé" htmlFor={`v-${v.id}-label`} error={ve.label}>
                          <input
                            id={`v-${v.id}-label`}
                            value={v.label}
                            onChange={(e) => setVariant(v.id, { label: e.target.value })}
                            className={fieldError(inputClass, ve.label)}
                          />
                        </Field>
                        <Field label="Prix" htmlFor={`v-${v.id}-price`} error={ve.price}>
                          <PriceInput id={`v-${v.id}-price`} value={v.price} onChange={(val) => setVariant(v.id, { price: val })} error={ve.price} />
                        </Field>
                        <Field label="Ordre" htmlFor={`v-${v.id}-sort`} error={ve.sortOrder}>
                          <input
                            id={`v-${v.id}-sort`}
                            inputMode="numeric"
                            value={v.sortOrder}
                            onChange={(e) => setVariant(v.id, { sortOrder: e.target.value })}
                            className={fieldError(`${inputClass} tabular-nums`, ve.sortOrder)}
                          />
                        </Field>
                      </div>
                      <label className="mt-3 flex items-center gap-2.5 text-sm text-stone-700">
                        <input
                          type="checkbox"
                          checked={v.isActive}
                          onChange={(e) => setVariant(v.id, { isActive: e.target.checked })}
                          className="h-4 w-4 accent-kaytori-green"
                        />
                        Variante active
                      </label>
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Section title="Photo">
            <ProductPhotoField
              currentUrl={edit.product.image_url}
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
          <Section title="Identifiant">
            <p className="break-all font-mono text-sm text-stone-700">{edit.product.id}</p>
            <p className="mt-1 text-xs text-stone-500">Non modifiable (utilisé par le panier et les commandes).</p>
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
  );
}

/** /admin/products/:id — édition d'un produit existant. */
export function ProductEditPage({ productId, client }: { productId: string; client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [notice, setNotice] = useState<Notice | null>(null);
  const edit = useMemo(() => (data.rows ? loadProductForEdit(data.rows, productId) : null), [data.rows, productId]);

  const onSaved = (n: Notice) => {
    setNotice(n);
    // Rechargement depuis Supabase : le formulaire (position et photo comprises) repart des valeurs enregistrées.
    data.reload();
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
          edit={edit}
          client={client}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}
