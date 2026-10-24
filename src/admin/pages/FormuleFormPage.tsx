import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { Field, PriceInput, Section, fieldError } from "../components/formControls";
import { ErrorState, LoadingState, PageHeader, buttonClass, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { navigate } from "../hooks/useAdminPath";
import {
  createFormule,
  formuleCategoryReady,
  formuleCount,
  formuleCountInSection,
  hasFormuleErrors,
  saveFormule,
  validateFormuleForm,
  type FormuleFormErrors,
  type FormuleFormInput,
} from "../lib/formuleAdmin";
import {
  fetchFormuleSectionAssignments,
  fetchFormuleSections,
  orderedFormuleSections,
  resolveFormuleSectionId,
  type FormuleSectionAssignment,
  type FormuleSectionRow,
} from "../lib/formuleSectionAdmin";
import { setFlash } from "../lib/flash";
import { PHOTO_ACCEPT } from "../lib/productPhoto";
import { ADMIN_ROUTES } from "../lib/routes";

type Props = {
  client: SupabaseClient;
  productId: string | null;
};

function sectionFromQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get("section") ?? "";
  } catch {
    return "";
  }
}

export function FormuleFormPage({ client, productId }: Props) {
  const data = useAdminMenuData();
  const editing = productId !== null;
  const product = data.status === "ready" ? data.rows.products.find((p) => p.id === productId) : undefined;
  const missing = data.status === "ready" && editing && (!product || product.category_id !== FORMULES_CATEGORY_ID);
  const ready = data.status === "ready" && formuleCategoryReady(data.rows) && !missing;

  const [sections, setSections] = useState<FormuleSectionRow[] | null>(null);
  const [assignments, setAssignments] = useState<FormuleSectionAssignment[] | null>(null);
  const [sectionAssignment, setSectionAssignment] = useState<string | null>(null);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [secsLoad, assigns] = await Promise.all([
          fetchFormuleSections(client),
          fetchFormuleSectionAssignments(client),
        ]);
        if (cancelled) return;
        setSections(secsLoad?.sections ?? null);
        setAssignments(assigns);
        if (productId && assigns) {
          setSectionAssignment(assigns.find((a) => a.productId === productId)?.sectionId ?? null);
        }
      } finally {
        if (!cancelled) setSectionsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, productId]);

  const ordered = useMemo(() => (sections ? orderedFormuleSections(sections) : []), [sections]);

  const initial = useMemo<FormuleFormInput | null>(() => {
    if (data.status !== "ready" || !formuleCategoryReady(data.rows) || !sectionsLoaded) return null;
    const querySection = sectionFromQuery();
    if (!editing) {
      const defaultSection =
        (querySection && ordered.some((s) => s.id === querySection) ? querySection : null) ??
        ordered[0]?.id ??
        "";
      const sectionTotal =
        defaultSection && assignments
          ? formuleCountInSection(assignments, defaultSection) + 1
          : formuleCount(data.rows) + 1;
      return {
        name: "",
        description: "",
        price: "",
        isActive: true,
        position: String(sectionTotal),
        sectionId: defaultSection,
      };
    }
    if (!product || product.category_id !== FORMULES_CATEGORY_ID) return null;
    const sectionId =
      resolveFormuleSectionId({ id: product.id, name: product.name }, ordered, sectionAssignment) ?? "";
    const siblings = data.rows.products
      .filter((p) => p.category_id === FORMULES_CATEGORY_ID)
      .filter((p) => {
        if (!sectionId || !assignments) return true;
        const sid = assignments.find((a) => a.productId === p.id)?.sectionId ?? null;
        return sid === sectionId;
      })
      .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1));
    const position = Math.max(1, siblings.findIndex((p) => p.id === product.id) + 1);
    return {
      name: product.name,
      description: product.description ?? "",
      price: Number(product.price).toFixed(2).replace(".", ","),
      isActive: product.is_active,
      position: String(position),
      sectionId,
    };
  }, [data, editing, product, sectionsLoaded, ordered, sectionAssignment, assignments]);

  const [form, setForm] = useState<FormuleFormInput | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormuleFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [initial, form]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const shownImage = preview ?? (editing ? product?.image_url ?? null : null);
  const requireSection = ordered.length > 0;

  const sectionOthersCount = (sectionId: string) => {
    if (!assignments || !sectionId) return undefined;
    return formuleCountInSection(assignments, sectionId, productId);
  };

  const onSectionChange = (sectionId: string) => {
    if (!form) return;
    const others = assignments ? formuleCountInSection(assignments, sectionId, productId) : 0;
    // Nouvelle section : placer en dernier (N+1 des autres).
    setForm({ ...form, sectionId, position: String(others + 1) });
  };

  const onSubmit = async () => {
    if (!form || data.status !== "ready" || busy) return;
    const mode = editing ? "edit" : "create";
    const nextErrors = validateFormuleForm(form, data.rows, photo, mode, {
      requireSection,
      sectionOthersCount: form.sectionId ? sectionOthersCount(form.sectionId) : undefined,
    });
    setErrors(nextErrors);
    if (hasFormuleErrors(nextErrors)) return;
    setBusy(true);
    setSubmitError(null);
    const result = editing
      ? await saveFormule(client, data.rows, productId, form, photo)
      : photo
        ? await createFormule(client, data.rows, form, photo)
        : { ok: false as const, error: "L'affiche est obligatoire." };
    setBusy(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setFlash(editing ? `« ${form.name.trim()} » a été mise à jour.` : `« ${form.name.trim()} » a été ajoutée.`);
    navigate(ADMIN_ROUTES.formules);
  };

  return (
    <>
      <PageHeader
        title={editing ? "Modifier la formule" : "Ajouter une formule"}
        description="L'affiche est enregistrée telle quelle, sans recadrage ni filtre."
        back={{ href: ADMIN_ROUTES.formules, label: "Formules & Promos" }}
      />
      {data.status === "loading" || !sectionsLoaded || (ready && !form) ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={() => data.reload()} /> : null}
      {missing ? <ErrorState message="Cette formule est introuvable." /> : null}
      {data.status === "ready" && !formuleCategoryReady(data.rows) ? (
        <p className="rounded-xl border border-admin-line bg-white p-5 text-sm text-admin-soft">
          Appliquez d'abord supabase/production/07_formules_promos.sql sur Supabase. Tant que ce script n'est pas passé, les formules ne peuvent pas être enregistrées ici.
        </p>
      ) : null}
      {ready && form ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <Section title="Affiche">
            <Field htmlFor="formule-photo" label="Photo" error={errors.photo} hint="JPEG, PNG ou WebP, 5 Mo maximum. Le fichier n'est pas modifié.">
              <input
                id="formule-photo"
                type="file"
                accept={PHOTO_ACCEPT}
                className={fieldError(`${inputClass} py-2`, errors.photo)}
                onChange={(e) => {
                  setPhoto(e.target.files?.[0] ?? null);
                  setErrors((prev) => ({ ...prev, photo: undefined }));
                }}
              />
            </Field>
            {shownImage ? (
              <img src={shownImage} alt="Aperçu de l'affiche" className="mt-4 max-h-80 w-auto max-w-full rounded-lg bg-[#0f1815] object-contain ring-1 ring-black/5" />
            ) : null}
          </Section>
          <Section title="Informations">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="formule-name" label="Nom" error={errors.name}>
                <input
                  id="formule-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={fieldError(inputClass, errors.name)}
                  autoComplete="off"
                />
              </Field>
              <Field htmlFor="formule-price" label="Prix" error={errors.price}>
                <PriceInput id="formule-price" value={form.price} error={errors.price} onChange={(price) => setForm({ ...form, price })} />
              </Field>
              {ordered.length > 0 ? (
                <Field htmlFor="formule-section" label="Section" error={errors.sectionId}>
                  <select
                    id="formule-section"
                    value={form.sectionId}
                    onChange={(e) => onSectionChange(e.target.value)}
                    className={fieldError(inputClass, errors.sectionId)}
                  >
                    {ordered.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field
                htmlFor="formule-position"
                label="Position"
                error={errors.position}
                hint={
                  form.sectionId
                    ? "Ordre dans cette section (1 = première offre de la section)."
                    : "Ordre dans la catégorie formules (1 = première)."
                }
              >
                <input
                  id="formule-position"
                  inputMode="numeric"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className={fieldError(`${inputClass} tabular-nums`, errors.position)}
                />
              </Field>
              <Field htmlFor="formule-description" label="Description (optionnel)" error={errors.description}>
                <input
                  id="formule-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={fieldError(inputClass, errors.description)}
                  autoComplete="off"
                />
              </Field>
              <div className="flex items-end">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-admin-ink">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4 accent-kaytori-green"
                  />
                  Visible sur le site
                </label>
              </div>
            </div>
          </Section>
          {submitError ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              {submitError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass("primary")} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={() => navigate(ADMIN_ROUTES.formules)}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
