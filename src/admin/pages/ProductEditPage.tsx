import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PhotoCropEditor } from "../components/PhotoCropEditor";
import { AddVariantButton, Field, FormActionBar, PriceInput, Section, StaticField, VariantFrame, fieldError } from "../components/formControls";
import { CropIcon, ImageIcon, TrashIcon, UploadIcon } from "../components/icons";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  Spinner,
  StatusBadge,
  Switch,
  Toast,
  buttonClass,
  cardClass,
  inputClass,
  type ToastNotice,
} from "../components/ui";
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
    return <StaticField label="Position automatique">Cette catégorie utilise un ordre automatique.</StaticField>;
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
 * « Recadrer la photo » (si `onCrop`) : éditeur de cadrage de la photo enregistrée ;
 * `cropBlockedReason` le désactive tant que d'autres modifications sont en attente.
 */
export function ProductPhotoField({
  currentUrl,
  selection,
  error,
  disabled,
  onSelect,
  onClear,
  onCrop,
  cropBlockedReason = null,
}: {
  currentUrl: string | null;
  selection: PhotoSelection | null;
  error: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onClear: () => void;
  onCrop?: () => void;
  cropBlockedReason?: string | null;
}) {
  const canCrop = Boolean(onCrop && currentUrl && !selection);
  const shown = selection?.previewUrl ?? currentUrl;
  return (
    <div>
      <div className="relative">
        {shown ? (
          <img src={shown} alt="" className="aspect-square w-full rounded-lg bg-[#0f1815] object-cover ring-1 ring-black/5" />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-admin-lineStrong bg-admin-subtle text-admin-muted">
            <span className="flex flex-col items-center gap-2 text-xs font-medium">
              <ImageIcon className="h-7 w-7" />
              Aucune photo
            </span>
          </div>
        )}
        {selection ? (
          <span className="absolute left-2 top-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-admin-sm ring-1 ring-amber-300">
            Nouvelle photo — non enregistrée
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label
          className={`${buttonClass("secondary", "sm")} cursor-pointer focus-within:ring-2 focus-within:ring-kaytori-green/35 focus-within:ring-offset-2 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <UploadIcon className="h-3.5 w-3.5" />
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
        {canCrop ? (
          <button
            type="button"
            onClick={onCrop}
            disabled={disabled || cropBlockedReason !== null}
            title={cropBlockedReason ?? undefined}
            className={buttonClass("secondary", "sm")}
          >
            <CropIcon className="h-3.5 w-3.5" />
            Recadrer la photo
          </button>
        ) : null}
        {selection ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className={buttonClass("ghost", "sm")}
          >
            Annuler la sélection
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2.5 text-[13px] text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2.5 text-xs leading-relaxed text-admin-muted">
          {canCrop && cropBlockedReason ? <span className="mb-1.5 block rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">{cropBlockedReason}</span> : null}
          {selection ? `${selection.file.name} · envoyée à l'enregistrement.` : "JPEG, PNG ou WebP · 5 Mo maximum · format carré conseillé · redimensionnée (1254 px) et compressée automatiquement."}
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
    <VariantFrame
      index={index}
      isNew={!v.existingId}
      active={v.isActive}
      onRemove={confirming ? null : () => (v.existingId ? setConfirming(true) : onRemove())}
    >
      {confirming ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-3 text-sm text-red-900 motion-safe:animate-admin-in" role="alert">
          Retirer cette variante ? Elle sera supprimée à l'enregistrement.
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={buttonClass("secondary", "sm")}>
              Annuler
            </button>
            <button type="button" onClick={onRemove} className={buttonClass("danger", "sm")}>
              Retirer la variante
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 sm:col-span-1">
          <Field label="Libellé" htmlFor={`${base}-label`} error={errors.label}>
            <input id={`${base}-label`} value={v.label} onChange={(e) => onChange({ label: e.target.value })} className={fieldError(inputClass, errors.label)} />
          </Field>
        </div>
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
      <div className="mt-4">
        <Switch checked={v.isActive} onChange={(isActive) => onChange({ isActive })} label="Variante active" />
      </div>
    </VariantFrame>
  );
}

/** « Supprimer le produit » : confirmation explicite en deux temps (jamais au premier clic). */
function DeleteProductSection({ name, onDelete }: { name: string; onDelete: () => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const message = await onDelete();
    setPending(false);
    if (message) setError(message);
  };
  return (
    <section className={`${cardClass} flex flex-col gap-4 border-red-200/80 p-5 sm:flex-row sm:items-center sm:justify-between`}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold text-red-800">Supprimer le produit</h2>
        <p className="mt-1 text-sm text-admin-soft">Retire définitivement « {name} » du menu, avec ses variantes.</p>
      </div>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("dangerOutline")} shrink-0`}>
        <TrashIcon className="h-4 w-4" />
        Supprimer le produit
      </button>
      {open ? (
        <ConfirmDialog
          title="Supprimer ce produit ?"
          description="Cette action supprimera définitivement le produit et ses variantes."
          confirmLabel="Supprimer définitivement"
          pendingLabel="Suppression…"
          busy={pending}
          error={error}
          onConfirm={confirm}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

type SaveNotice = { success?: string; error?: string };

function ProductEditForm({
  data,
  client,
  onSaved,
  onDeleted,
}: {
  data: CatalogEditData;
  client: SupabaseClient;
  /** Relit les données puis affiche le message ; résolue une fois l'écran à jour. */
  onSaved: (notice: SaveNotice) => Promise<void>;
  onDeleted: (name: string) => void;
}) {
  /** originalData = data.form · currentData = form · selectedNewImage = photo. */
  const [form, setForm] = useState<CatalogForm>(data.form);
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<CatalogErrors>({ variants: {} });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
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

  /**
   * Photo recadrée : enregistrée seule, tout de suite, par le circuit habituel (optimisation,
   * nouveau fichier Storage, admin_save_product avec image_url uniquement — formulaire d'origine).
   */
  const saveCroppedPhoto = async (file: File): Promise<string | null> => {
    const result = await saveCatalogProduct(client, data, data.form, file, uploadProductPhoto);
    if (!result.ok) {
      if (result.uploadedPath) console.warn(`[admin] Photo téléversée mais non enregistrée : ${result.uploadedPath}`);
      return result.error;
    }
    await onSaved({ success: `Photo recadrée de « ${result.name} » enregistrée.` });
    setCropOpen(false);
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return; // pas de second envoi (touche Entrée) pendant l'enregistrement
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
    if (!result.ok) {
      setPending(false);
      if (result.uploadedPath) console.warn(`[admin] Photo téléversée mais non enregistrée : ${result.uploadedPath}`);
      setSaveError(result.error);
      return;
    }
    // « Enregistrement… » reste affiché jusqu'à la relecture des données (aucun second envoi possible entre-temps).
    await onSaved({ success: `« ${result.name} » a été enregistré${photo ? " avec la nouvelle photo" : ""}.` });
    setPending(false);
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5">
        {/*
          Bureau (≥ lg) : formulaire à gauche, Photo + Référence interne à droite (inchangé).
          Téléphone / tablette : les deux colonnes s'effacent (contents) et les cartes deviennent
          des éléments de la grille, réordonnés : Photo, Produit, Variantes, Référence interne.
          Un seul exemplaire de chaque carte (même champ photo, mêmes états).
        */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="max-lg:contents lg:space-y-5">
            <Section title="Produit" className="max-lg:order-2">
              <div className="space-y-5">
                <Field label="Nom" htmlFor="p-name" error={errors.name}>
                  <input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldError(inputClass, errors.name)} />
                </Field>
                <Field label="Description" htmlFor="p-description" hint="Facultative.">
                  <textarea id="p-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputClass} resize-y`} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
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
                    <StaticField label="Prix" tone="warning">
                      Produit à variantes → gérer les prix au niveau des variantes.
                    </StaticField>
                  ) : (
                    <Field label="Prix" htmlFor="p-price" error={errors.price}>
                      <PriceInput id="p-price" value={form.price} onChange={(v) => set("price", v)} error={errors.price} />
                    </Field>
                  )}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <PositionField data={data} form={form} error={errors.position} onChange={(v) => set("position", v)} />
                  <div className="min-w-0">
                    <p className="mb-1.5 text-[13px] font-medium text-admin-ink">Statut</p>
                    <Switch bordered checked={form.isActive} onChange={(v) => set("isActive", v)} label="Actif (visible sur le menu)" />
                    {form.isActive && category && !category.is_active ? (
                      <p className="mt-1.5 text-xs text-amber-800">La catégorie est masquée : le produit restera invisible.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Section>

            <Section title={`Variantes (${form.variants.length})`} className="max-lg:order-3">
              {form.variants.length === 0 ? (
                <p className="text-sm text-admin-soft">Aucune variante. Ajoutez-en si le prix dépend du choix du client (ex. Poulet, Bœuf).</p>
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
              <AddVariantButton onClick={addVariant} />
            </Section>
          </div>

          <aside className="max-lg:contents lg:space-y-5">
            <Section title="Photo" className="max-lg:order-1">
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
                onCrop={() => setCropOpen(true)}
                cropBlockedReason={dirty ? "Enregistrez ou annulez d'abord vos autres modifications pour recadrer la photo." : null}
              />
              {cropOpen && data.product.image_url ? (
                <PhotoCropEditor src={data.product.image_url} onCancel={() => setCropOpen(false)} onSave={saveCroppedPhoto} />
              ) : null}
            </Section>
            <Section title="Référence interne" className="max-lg:order-4">
              <p className="break-all rounded-md bg-admin-subtle px-2.5 py-1.5 font-mono text-[13px] text-admin-ink ring-1 ring-inset ring-admin-line">{data.product.id}</p>
              <p className="mt-2 text-xs leading-snug text-admin-muted">Non modifiable (utilisée par le panier et les commandes).</p>
            </Section>
          </aside>
        </div>

        <FormActionBar
          error={saveError}
          status={
            pending ? (
              "Enregistrement en cours…"
            ) : dirty ? (
              <span className="inline-flex items-center gap-2 font-medium text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                Modifications non enregistrées
              </span>
            ) : (
              "Aucune modification"
            )
          }
        >
          <button type="button" onClick={() => navigate(ADMIN_ROUTES.products)} className={buttonClass("secondary")}>
            Annuler
          </button>
          <button type="submit" disabled={pending || !dirty} className={`${buttonClass("primary")} sm:min-w-[9rem]`}>
            {pending ? <Spinner /> : null}
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </FormActionBar>
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
  const [toast, setToast] = useState<ToastNotice>(null);
  const edit = useMemo(() => (data.rows ? loadCatalogEdit(data.rows, productId) : null), [data.rows, productId]);
  const category = edit ? edit.categories.find((c) => c.id === edit.product.category_id) : undefined;

  const onSaved = async (n: SaveNotice) => {
    // Relecture depuis Supabase (sans écran de chargement) : le formulaire repart des valeurs enregistrées.
    if (!(await data.refresh())) data.reload();
    setToast(n.error ? { tone: "error", message: n.error } : n.success ? { tone: "success", message: n.success } : null);
  };
  const onDeleted = (name: string) => {
    setFlash(`Produit « ${name} » supprimé.`);
    data.reload();
    navigate(ADMIN_ROUTES.products);
  };

  return (
    <>
      <PageHeader
        back={{ href: ADMIN_ROUTES.products, label: "Produits" }}
        title={edit ? edit.product.name : "Modifier le produit"}
        meta={edit ? <StatusBadge active={edit.product.is_active && category?.is_active !== false} activeLabel="Visible" inactiveLabel={edit.product.is_active ? "Catégorie masquée" : "Masqué"} /> : null}
        description={category ? `Catégorie « ${category.name} » · modifier un produit existant.` : "Modifier un produit existant."}
      />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" && !edit ? <Notice tone="info">Produit introuvable : {productId}</Notice> : null}
      {edit ? (
        <ProductEditForm
          key={JSON.stringify([edit.form, edit.product.image_url, edit.product.sort_order])}
          data={edit}
          client={client}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ) : null}
      <Toast notice={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
