import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminLink } from "../components/AdminLink";
import { Field, PriceInput, Section, fieldError } from "../components/formControls";
import { ErrorState, LoadingState, PageHeader, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { navigate } from "../hooks/useAdminPath";
import type { MenuRows } from "../../data/menuRows";
import {
  categoryInsertInfo,
  createProduct,
  emptyNewProductForm,
  hasNewProductErrors,
  validateNewProduct,
  type NewProductErrors,
  type NewProductForm,
  type NewVariantForm,
} from "../lib/productCreate";
import type { PhotoSelection } from "../lib/productEditor";
import { uploadProductPhoto, validatePhotoFile } from "../lib/productPhoto";
import { ADMIN_ROUTES, productEditPath } from "../lib/routes";
import { ProductPhotoField } from "./ProductEditPage";

let variantKeySeq = 0;
const newVariantKey = () => `v${++variantKeySeq}`;

/** Formulaire de création (photo obligatoire, variantes optionnelles, position 1…N+1). */
export function ProductCreateForm({
  rows,
  client,
  onCreated,
}: {
  rows: MenuRows;
  client: SupabaseClient;
  onCreated: (created: { productId: string; name: string }) => void;
}) {
  const categories = useMemo(() => [...rows.categories].sort((a, b) => a.sort_order - b.sort_order), [rows]);
  const [form, setForm] = useState<NewProductForm>(() => emptyNewProductForm(categories, rows));
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [errors, setErrors] = useState<NewProductErrors>({ variants: {} });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const info = categoryInsertInfo(rows, form.categoryId);
  const hasVariants = form.variants.length > 0;

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  const set = <K extends keyof NewProductForm>(key: K, value: NewProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setVariant = (key: string, patch: Partial<NewVariantForm>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));
  const addVariant = () =>
    setForm((f) => ({
      ...f,
      variants: [...f.variants, { key: newVariantKey(), label: "", price: "", sortOrder: String(f.variants.length), isActive: true }],
    }));
  const removeVariant = (key: string) => setForm((f) => ({ ...f, variants: f.variants.filter((v) => v.key !== key) }));
  const changeCategory = (categoryId: string) => {
    const next = categoryInsertInfo(rows, categoryId);
    // Nouvelle catégorie : position par défaut = en dernier (N+1).
    setForm((f) => ({ ...f, categoryId, position: String((next?.count ?? 0) + 1) }));
  };
  const selectPhoto = (file: File | null) => {
    if (!file) return;
    const invalid = validatePhotoFile(file);
    setErrors((e) => ({ ...e, photo: invalid ?? undefined }));
    if (!invalid) setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const found = validateNewProduct(form, rows, photo?.file ?? null);
    setErrors(found);
    if (hasNewProductErrors(found) || !photo) {
      setSaveError("Corrigez les champs indiqués avant de créer le produit.");
      return;
    }
    setPending(true);
    const result = await createProduct(client, form, rows, photo.file, uploadProductPhoto);
    setPending(false);
    if (!result.ok) {
      if (result.uploadedPath) console.warn(`[admin] Photo téléversée mais produit non créé : ${result.uploadedPath}`);
      setSaveError(`Produit non créé. ${result.error}`);
      return;
    }
    onCreated({ productId: result.productId, name: result.name });
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
              <Field label="Nom" htmlFor="n-name" error={errors.name}>
                <input id="n-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldError(inputClass, errors.name)} />
              </Field>
              <Field label="Description" htmlFor="n-description" hint="Facultative.">
                <textarea id="n-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Catégorie" htmlFor="n-category" error={errors.categoryId}>
                  <select id="n-category" value={form.categoryId} onChange={(e) => changeCategory(e.target.value)} className={fieldError(inputClass, errors.categoryId)}>
                    {categories.map((c) => (
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
                  <Field label="Prix" htmlFor="n-price" error={errors.price}>
                    <PriceInput id="n-price" value={form.price} onChange={(v) => set("price", v)} error={errors.price} />
                  </Field>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {info?.automatic ? (
                  <div>
                    <p className="mb-1 text-sm font-medium text-stone-700">Position automatique</p>
                    <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                      Cette catégorie utilise un ordre automatique.
                    </p>
                  </div>
                ) : (
                  <Field
                    label="Position dans la catégorie"
                    htmlFor="n-position"
                    error={errors.position}
                    hint={`1 = premier produit affiché, 2 = deuxième, 3 = troisième… ${(info?.count ?? 0) + 1} = en dernier.`}
                  >
                    <input
                      id="n-position"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={(info?.count ?? 0) + 1}
                      step={1}
                      value={form.position}
                      onChange={(e) => set("position", e.target.value)}
                      className={fieldError(`${inputClass} tabular-nums`, errors.position)}
                    />
                  </Field>
                )}
                <div>
                  <p className="mb-1 text-sm font-medium text-stone-700">Statut</p>
                  <label className="flex items-center gap-2.5 rounded-lg border border-stone-300 px-3 py-2 text-sm">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-kaytori-green" />
                    Actif (visible sur le menu)
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section title={`Variantes (${form.variants.length})`}>
            {form.variants.length === 0 ? (
              <p className="mb-3 text-sm text-stone-500">Facultatif : ajoutez des variantes (ex. Poulet, Bœuf) si le prix dépend du choix du client.</p>
            ) : null}
            <div className="space-y-3">
              {form.variants.map((v, i) => {
                const ve = errors.variants[v.key] ?? {};
                return (
                  <div key={v.key} className="rounded-lg border border-stone-200 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-stone-500">Variante {i + 1}</p>
                      <button type="button" onClick={() => removeVariant(v.key)} className="text-xs font-semibold text-red-700 hover:underline">
                        Supprimer
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <Field label="Libellé" htmlFor={`nv-${v.key}-label`} error={ve.label}>
                        <input id={`nv-${v.key}-label`} value={v.label} onChange={(e) => setVariant(v.key, { label: e.target.value })} className={fieldError(inputClass, ve.label)} />
                      </Field>
                      <Field label="Prix" htmlFor={`nv-${v.key}-price`} error={ve.price}>
                        <PriceInput id={`nv-${v.key}-price`} value={v.price} onChange={(val) => setVariant(v.key, { price: val })} error={ve.price} />
                      </Field>
                      <Field label="Ordre" htmlFor={`nv-${v.key}-sort`} error={ve.sortOrder}>
                        <input
                          id={`nv-${v.key}-sort`}
                          inputMode="numeric"
                          value={v.sortOrder}
                          onChange={(e) => setVariant(v.key, { sortOrder: e.target.value })}
                          className={fieldError(`${inputClass} tabular-nums`, ve.sortOrder)}
                        />
                      </Field>
                    </div>
                    <label className="mt-3 flex items-center gap-2.5 text-sm text-stone-700">
                      <input type="checkbox" checked={v.isActive} onChange={(e) => setVariant(v.key, { isActive: e.target.checked })} className="h-4 w-4 accent-kaytori-green" />
                      Variante active
                    </label>
                  </div>
                );
              })}
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
          <Section title="Photo (obligatoire)">
            <ProductPhotoField
              currentUrl={null}
              selection={photo}
              error={errors.photo ?? null}
              disabled={pending}
              onSelect={selectPhoto}
              onClear={() => setPhoto(null)}
            />
          </Section>
        </aside>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
        {!photo ? <p className="text-sm text-stone-500 sm:mr-auto">Ajoutez une photo pour pouvoir créer le produit.</p> : null}
        <button
          type="button"
          onClick={() => navigate(ADMIN_ROUTES.products)}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={pending || !photo}
          className="rounded-lg bg-kaytori-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-kaytori-greenDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Création…" : "Créer le produit"}
        </button>
      </div>
    </form>
  );
}

/** /admin/products/new — création d'un produit. */
export function ProductCreatePage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [created, setCreated] = useState<{ productId: string; name: string } | null>(null);

  const onCreated = (c: { productId: string; name: string }) => {
    setCreated(c);
    data.reload(); // listes et tableau de bord à jour
  };

  return (
    <>
      <AdminLink href={ADMIN_ROUTES.products} className="mb-3 inline-block text-sm font-medium text-kaytori-green hover:underline">
        ← Produits
      </AdminLink>
      <PageHeader title="Nouveau produit" description="La photo est obligatoire." />
      {created ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" role="status">
          <p className="text-sm font-medium text-emerald-900">« {created.name} » a été créé.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminLink href={productEditPath(created.productId)} className="rounded-lg bg-kaytori-green px-4 py-2 text-sm font-semibold text-white">
              Voir / modifier le produit
            </AdminLink>
            <button type="button" onClick={() => setCreated(null)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700">
              Créer un autre produit
            </button>
          </div>
        </div>
      ) : (
        <>
          {data.status === "loading" ? <LoadingState /> : null}
          {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
          {data.status === "ready" ? <ProductCreateForm rows={data.rows} client={client} onCreated={onCreated} /> : null}
        </>
      )}
    </>
  );
}
