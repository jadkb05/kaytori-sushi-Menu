import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminLink } from "../components/AdminLink";
import { AddVariantButton, Field, FormActionBar, PriceInput, Section, StaticField, VariantFrame, fieldError } from "../components/formControls";
import { CheckIcon, PencilIcon, PlusIcon } from "../components/icons";
import { ErrorState, LoadingState, PageHeader, Spinner, Switch, buttonClass, cardClass, inputClass } from "../components/ui";
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
    if (pending) return; // pas de second envoi (touche Entrée) pendant la création
    setSaveError(null);
    const found = validateNewProduct(form, rows, photo?.file ?? null);
    setErrors(found);
    if (hasNewProductErrors(found) || !photo) {
      setSaveError(!photo ? "Ajoutez une photo avant de créer le produit." : "Corrigez les champs indiqués avant de créer le produit.");
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Section title="Produit">
            <div className="space-y-5">
              <Field label="Nom" htmlFor="n-name" error={errors.name}>
                <input id="n-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldError(inputClass, errors.name)} />
              </Field>
              <Field label="Description" htmlFor="n-description" hint="Facultative.">
                <textarea id="n-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputClass} resize-y`} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
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
                  <StaticField label="Prix" tone="warning">
                    Produit à variantes → gérer les prix au niveau des variantes.
                  </StaticField>
                ) : (
                  <Field label="Prix" htmlFor="n-price" error={errors.price}>
                    <PriceInput id="n-price" value={form.price} onChange={(v) => set("price", v)} error={errors.price} />
                  </Field>
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {info?.automatic ? (
                  <StaticField label="Position automatique">Cette catégorie utilise un ordre automatique.</StaticField>
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
                <div className="min-w-0">
                  <p className="mb-1.5 text-[13px] font-medium text-admin-ink">Statut</p>
                  <Switch bordered checked={form.isActive} onChange={(v) => set("isActive", v)} label="Actif (visible sur le menu)" />
                </div>
              </div>
            </div>
          </Section>

          <Section title={`Variantes (${form.variants.length})`}>
            {form.variants.length === 0 ? (
              <p className="text-sm text-admin-soft">Facultatif : ajoutez des variantes (ex. Poulet, Bœuf) si le prix dépend du choix du client.</p>
            ) : null}
            <div className="space-y-3">
              {form.variants.map((v, i) => {
                const ve = errors.variants[v.key] ?? {};
                return (
                  <VariantFrame key={v.key} index={i} isNew={false} onRemove={() => removeVariant(v.key)}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="col-span-2 sm:col-span-1">
                        <Field label="Libellé" htmlFor={`nv-${v.key}-label`} error={ve.label}>
                          <input id={`nv-${v.key}-label`} value={v.label} onChange={(e) => setVariant(v.key, { label: e.target.value })} className={fieldError(inputClass, ve.label)} />
                        </Field>
                      </div>
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
                    <div className="mt-4">
                      <Switch checked={v.isActive} onChange={(isActive) => setVariant(v.key, { isActive })} label="Variante active" />
                    </div>
                  </VariantFrame>
                );
              })}
            </div>
            <AddVariantButton onClick={addVariant} />
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

      <FormActionBar
        error={saveError}
        status={pending ? "Création en cours…" : !photo ? "Ajoutez une photo pour pouvoir créer le produit." : "Prêt à être créé."}
      >
        <button type="button" onClick={() => navigate(ADMIN_ROUTES.products)} className={buttonClass("secondary")}>
          Annuler
        </button>
        <button type="submit" disabled={pending || !photo} className={`${buttonClass("primary")} sm:min-w-[10rem]`}>
          {pending ? <Spinner /> : null}
          {pending ? "Création…" : "Créer le produit"}
        </button>
      </FormActionBar>
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
      <PageHeader back={{ href: ADMIN_ROUTES.products, label: "Produits" }} title="Nouveau produit" description="La photo est obligatoire." />
      {created ? (
        <div className={`${cardClass} mx-auto max-w-xl p-6 text-center motion-safe:animate-admin-pop sm:p-8`} role="status">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-8 ring-emerald-50/50">
            <CheckIcon className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-admin-ink">Produit créé avec succès</p>
          <p className="mt-1 text-sm text-admin-soft">« {created.name} » a été ajouté au menu.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <AdminLink href={productEditPath(created.productId)} className={buttonClass("primary")}>
              <PencilIcon className="h-4 w-4" />
              Voir / modifier le produit
            </AdminLink>
            <button type="button" onClick={() => setCreated(null)} className={buttonClass("secondary")}>
              <PlusIcon className="h-4 w-4" />
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
