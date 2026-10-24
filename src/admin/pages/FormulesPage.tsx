import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { AdminLink } from "../components/AdminLink";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Field } from "../components/formControls";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Toast,
  buttonClass,
  cardClass,
  inputClass,
  orderButton,
  touchButton,
  type ToastNotice,
} from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { deleteFormule, formuleCategoryReady, setFormuleActive } from "../lib/formuleAdmin";
import {
  FORMULE_SECTION_DESCRIPTION_MAX,
  FORMULE_SECTION_NAME_MAX,
  createFormuleSection,
  deleteFormuleSection,
  deleteFormuleSectionBlockedMessage,
  fetchFormuleSectionAssignments,
  fetchFormuleSections,
  formuleSectionDescriptionError,
  formuleSectionNameError,
  formuleSectionPosition,
  formuleSectionProductCount,
  orderedFormuleSections,
  ranksInOrderedGroup,
  resolveFormuleSectionId,
  sectionMoveTarget,
  setFormuleSection,
  updateFormuleSection,
  type FormuleSectionAssignment,
  type FormuleSectionRank,
  type FormuleSectionRow,
} from "../lib/formuleSectionAdmin";
import { takeFlash } from "../lib/flash";
import { buildProductList, type AdminProduct } from "../lib/menuAdmin";
import { moveTarget, runProductMove, type MoveDirection } from "../lib/productOrder";
import { ADMIN_ROUTES, formuleEditPath } from "../lib/routes";

/**
 * Liste des formules groupées par section. Distincte de la liste Produits :
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
  const [sections, setSections] = useState<FormuleSectionRow[] | null>(null);
  const [assignments, setAssignments] = useState<FormuleSectionAssignment[] | null>(null);
  const [sectionsReady, setSectionsReady] = useState(false);
  const [renaming, setRenaming] = useState<FormuleSectionRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingSection, setDeletingSection] = useState<FormuleSectionRow | null>(null);
  const [sectionDeleteBusy, setSectionDeleteBusy] = useState(false);
  const [sectionDeleteError, setSectionDeleteError] = useState<string | null>(null);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionDescription, setNewSectionDescription] = useState("");
  const [newSectionError, setNewSectionError] = useState<string | null>(null);
  const [newSectionBusy, setNewSectionBusy] = useState(false);
  const [movingSectionId, setMovingSectionId] = useState<string | null>(null);
  const [reorderingSectionId, setReorderingSectionId] = useState<string | null>(null);

  const reloadSections = useCallback(async () => {
    try {
      const [secs, assigns] = await Promise.all([
        fetchFormuleSections(client),
        fetchFormuleSectionAssignments(client),
      ]);
      setSections(secs);
      setAssignments(assigns);
    } catch (e) {
      setToast({ tone: "error", message: e instanceof Error ? e.message : "Lecture des sections impossible." });
      setSections(null);
      setAssignments(null);
    } finally {
      setSectionsReady(true);
    }
  }, [client]);

  useEffect(() => {
    const flash = takeFlash();
    if (flash) setToast({ tone: "success", message: flash });
  }, []);

  useEffect(() => {
    void reloadSections();
  }, [reloadSections]);

  const formules = useMemo(() => {
    if (data.status !== "ready") return [];
    return buildProductList(data.rows).filter((p) => p.categoryId === FORMULES_CATEGORY_ID);
  }, [data]);

  const ready = data.status === "ready" && formuleCategoryReady(data.rows);
  const dbSections = sections !== null;
  const orderedSections = useMemo(() => (sections ? orderedFormuleSections(sections) : []), [sections]);
  const assignmentMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const a of assignments ?? []) m.set(a.productId, a.sectionId);
    return m;
  }, [assignments]);

  const formulesBySection = useMemo(() => {
    const groups = new Map<string, AdminProduct[]>();
    for (const s of orderedSections) groups.set(s.id, []);
    const unassigned: AdminProduct[] = [];
    for (const p of formules) {
      const sid = resolveFormuleSectionId(p, orderedSections, assignmentMap.get(p.id));
      if (sid && groups.has(sid)) groups.get(sid)!.push(p);
      else unassigned.push(p);
    }
    return { groups, unassigned };
  }, [formules, orderedSections, assignmentMap]);

  /** Rangs 1…N par section (pas le total de la catégorie formules). */
  const ranksBySection = useMemo(() => {
    const out = new Map<string, Map<string, FormuleSectionRank>>();
    for (const [sectionId, items] of formulesBySection.groups) {
      out.set(sectionId, ranksInOrderedGroup(items.map((p) => p.id)));
    }
    return out;
  }, [formulesBySection]);

  const move = async (p: AdminProduct, direction: MoveDirection, sectionId: string | null) => {
    if (moving || data.status !== "ready") return;
    setMoving(p);
    setToast({ tone: "pending", message: `Déplacement de « ${p.name} »…` });

    if (sectionId) {
      const rank = ranksBySection.get(sectionId)?.get(p.id);
      const target = rank ? sectionMoveTarget(rank.position, rank.total, direction) : null;
      if (target === null) {
        setMoving(null);
        setToast({
          tone: "error",
          message: `« ${p.name} » est déjà en ${direction === "up" ? "première" : "dernière"} position.`,
        });
        return;
      }
      const res = await setFormuleSection(client, p.id, sectionId, target);
      const refreshed = await data.refresh();
      await reloadSections();
      setMoving(null);
      if (!res.ok) {
        setToast({ tone: "error", message: res.error });
        return;
      }
      const sectionName = orderedSections.find((s) => s.id === sectionId)?.name ?? sectionId;
      setToast(
        refreshed
          ? { tone: "success", message: `« ${p.name} » déplacé en position ${target} dans « ${sectionName} ».` }
          : { tone: "error", message: `« ${p.name} » a été déplacé, mais la liste n'a pas pu être rechargée. Actualisez la page.` },
      );
      return;
    }

    // Sans sections DB : ordre catégorie (comportement historique).
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
    await reloadSections();
    setDeleteBusy(false);
    setDeleting(null);
    setToast({ tone: "success", message: `« ${deleting.name} » a été supprimée. Les commandes déjà envoyées ne sont pas modifiées.` });
  };

  const moveToSection = async (p: AdminProduct, sectionId: string) => {
    setMovingSectionId(p.id);
    const res = await setFormuleSection(client, p.id, sectionId, null);
    await reloadSections();
    await data.refresh();
    setMovingSectionId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    const label = orderedSections.find((s) => s.id === sectionId)?.name ?? sectionId;
    setToast({ tone: "success", message: `« ${p.name} » déplacée vers « ${label} ».` });
  };

  const createSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!sections || newSectionBusy) return;
    const nameError = formuleSectionNameError(newSectionName, sections);
    if (nameError) {
      setNewSectionError(nameError);
      return;
    }
    const descError = formuleSectionDescriptionError(newSectionDescription);
    if (descError) {
      setNewSectionError(descError);
      return;
    }
    setNewSectionBusy(true);
    setNewSectionError(null);
    const res = await createFormuleSection(client, sections, {
      name: newSectionName,
      description: newSectionDescription,
      isActive: true,
      position: null,
    });
    setNewSectionBusy(false);
    if (!res.ok) {
      setNewSectionError(res.error);
      return;
    }
    setNewSectionName("");
    setNewSectionDescription("");
    setNewSectionOpen(false);
    await reloadSections();
    setToast({ tone: "success", message: `Section « ${res.section.name} » créée.` });
  };

  const saveRename = async () => {
    if (!renaming || !sections) return;
    const nameError = formuleSectionNameError(renameValue, sections, renaming.id);
    if (nameError) {
      setRenameError(nameError);
      return;
    }
    const descError = formuleSectionDescriptionError(renameDescription);
    if (descError) {
      setRenameError(descError);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    const res = await updateFormuleSection(client, renaming.id, {
      name: renameValue,
      description: renameDescription.trim() === "" ? null : renameDescription,
    });
    setRenameBusy(false);
    if (!res.ok) {
      setRenameError(res.error);
      return;
    }
    setRenaming(null);
    await reloadSections();
    setToast({ tone: "success", message: `Section « ${res.section.name} » enregistrée.` });
  };

  const moveSection = async (section: FormuleSectionRow, direction: MoveDirection) => {
    if (!sections || reorderingSectionId) return;
    const pos = formuleSectionPosition(sections, section.id);
    const target = sectionMoveTarget(pos, sections.length, direction);
    if (target === null) return;
    setReorderingSectionId(section.id);
    setToast({ tone: "pending", message: `Déplacement de « ${section.name} »…` });
    const res = await updateFormuleSection(client, section.id, { position: target });
    await reloadSections();
    setReorderingSectionId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({
      tone: "success",
      message: `Section « ${section.name} » en position ${target} sur le site public.`,
    });
  };

  const confirmDeleteSection = async () => {
    if (!deletingSection || !assignments) return;
    const count = formuleSectionProductCount(assignments, deletingSection.id);
    if (count > 0) {
      setSectionDeleteError(deleteFormuleSectionBlockedMessage(count));
      return;
    }
    setSectionDeleteBusy(true);
    setSectionDeleteError(null);
    const res = await deleteFormuleSection(client, deletingSection.id);
    setSectionDeleteBusy(false);
    if (!res.ok) {
      setSectionDeleteError(res.error);
      return;
    }
    setDeletingSection(null);
    await reloadSections();
    setToast({ tone: "success", message: `Section « ${deletingSection.name} » supprimée.` });
  };

  const renderFormuleRow = (p: AdminProduct, sectionId: string | null) => {
    const sectionRank = sectionId ? ranksBySection.get(sectionId)?.get(p.id) : undefined;
    const position = sectionRank?.position ?? p.position;
    const total = sectionRank?.total ?? p.categoryTotal;
    const canUp = sectionRank
      ? sectionMoveTarget(sectionRank.position, sectionRank.total, "up") !== null
      : moveTarget(p, "up") !== null;
    const canDown = sectionRank
      ? sectionMoveTarget(sectionRank.position, sectionRank.total, "down") !== null
      : moveTarget(p, "down") !== null;
    // Avec sections DB : flèches uniquement dans une section ; sinon ordre catégorie.
    const arrowsEnabled = sectionId !== null ? Boolean(sectionRank) : !dbSections && p.manualOrder;

    return (
    <li
      key={p.id}
      className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${p.isActive ? "" : "opacity-70"}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            className={`${orderButton} ${touchButton}`}
            disabled={Boolean(moving) || !arrowsEnabled || !canUp}
            onClick={() => void move(p, "up", sectionId)}
            aria-label={`Monter ${p.name}`}
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold tabular-nums text-admin-ink" title={sectionId ? `Position dans la section (${position}/${total})` : undefined}>
            {position}
            <span className="font-normal text-admin-muted">/{total}</span>
          </span>
          <button
            type="button"
            className={`${orderButton} ${touchButton}`}
            disabled={Boolean(moving) || !arrowsEnabled || !canDown}
            onClick={() => void move(p, "down", sectionId)}
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
      <div className="flex flex-col gap-2 sm:items-end">
        {dbSections && orderedSections.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-admin-muted">
            <span className="shrink-0">Section</span>
            <select
              className={`${inputClass} max-w-[14rem] py-1.5 text-sm`}
              value={sectionId ?? ""}
              disabled={movingSectionId === p.id}
              onChange={(e) => {
                const next = e.target.value;
                if (next) void moveToSection(p, next);
              }}
            >
              {orderedSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
      </div>
    </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Formules & Promos"
        description="Organisez les offres en sections (Solo/Duo/Family, Midi, Promo, ou les vôtres). Une seule catégorie catalogue ; le site public lit les sections dès que la migration est appliquée."
        actions={
          ready ? (
            <div className="flex flex-wrap gap-2">
              {dbSections ? (
                <button type="button" className={buttonClass("secondary")} onClick={() => setNewSectionOpen(true)}>
                  <PlusIcon className="h-4 w-4" />
                  Nouvelle section
                </button>
              ) : null}
              <AdminLink href={ADMIN_ROUTES.formuleNew} className={buttonClass("primary")}>
                <PlusIcon className="h-4 w-4" />
                Ajouter une formule
              </AdminLink>
            </div>
          ) : null
        }
      />
      {data.status === "loading" || !sectionsReady ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={() => data.reload()} /> : null}
      {data.status === "ready" && !ready ? (
        <p className={`${cardClass} p-5 text-sm leading-relaxed text-admin-soft`}>
          La catégorie n'est pas encore dans Supabase. Le script{" "}
          <span className="font-medium text-admin-ink">supabase/production/07_formules_promos.sql</span> doit être appliqué
          une fois, avec autorisation, avant de pouvoir ajouter ou modifier des formules ici.
        </p>
      ) : null}
      {ready && sectionsReady && !dbSections ? (
        <p className={`${cardClass} mb-4 p-5 text-sm leading-relaxed text-admin-soft`}>
          Les sections administrables ne sont pas encore en base. Appliquez{" "}
          <span className="font-medium text-admin-ink">supabase/production/08_formule_sections.sql</span> puis{" "}
          <span className="font-medium text-admin-ink">09_formule_section_description.sql</span> (avec autorisation)
          pour créer, ordonner et décrire des sections. En attendant, les offres restent listées ci-dessous.
        </p>
      ) : null}

      {ready && newSectionOpen && dbSections ? (
        <form onSubmit={(e) => void createSection(e)} className={`${cardClass} mb-4 space-y-3 p-4`}>
          <p className="text-sm font-semibold text-admin-ink">Nouvelle section</p>
          <Field htmlFor="fs-create-name" label="Nom" error={newSectionError ?? undefined}>
            <input
              id="fs-create-name"
              className={inputClass}
              value={newSectionName}
              maxLength={FORMULE_SECTION_NAME_MAX}
              onChange={(e) => setNewSectionName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field
            htmlFor="fs-create-desc"
            label="Description (optionnel)"
            hint="Affichée sous le nom sur le site public."
          >
            <input
              id="fs-create-desc"
              className={inputClass}
              value={newSectionDescription}
              maxLength={FORMULE_SECTION_DESCRIPTION_MAX}
              onChange={(e) => setNewSectionDescription(e.target.value)}
              placeholder="Ex. Nos formules pour toutes les envies"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass("primary", "sm")} disabled={newSectionBusy}>
              {newSectionBusy ? "Création…" : "Créer la section"}
            </button>
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              disabled={newSectionBusy}
              onClick={() => {
                setNewSectionOpen(false);
                setNewSectionName("");
                setNewSectionDescription("");
                setNewSectionError(null);
              }}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {ready && dbSections
        ? orderedSections.map((section, sectionIndex) => {
            const items = formulesBySection.groups.get(section.id) ?? [];
            const sectionPos = sectionIndex + 1;
            const sectionTotal = orderedSections.length;
            const canSectionUp = sectionMoveTarget(sectionPos, sectionTotal, "up") !== null;
            const canSectionDown = sectionMoveTarget(sectionPos, sectionTotal, "down") !== null;
            return (
              <section key={section.id} className="mb-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <button
                      type="button"
                      className={`${orderButton} ${touchButton}`}
                      disabled={Boolean(reorderingSectionId) || !canSectionUp}
                      onClick={() => void moveSection(section, "up")}
                      aria-label={`Monter la section ${section.name}`}
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-semibold tabular-nums text-admin-ink" title="Ordre sur le site public">
                      {sectionPos}
                      <span className="font-normal text-admin-muted">/{sectionTotal}</span>
                    </span>
                    <button
                      type="button"
                      className={`${orderButton} ${touchButton}`}
                      disabled={Boolean(reorderingSectionId) || !canSectionDown}
                      onClick={() => void moveSection(section, "down")}
                      aria-label={`Descendre la section ${section.name}`}
                    >
                      <ArrowDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-base font-semibold text-admin-ink">{section.name}</h2>
                    {section.description ? (
                      <p className="mt-0.5 text-xs text-admin-muted">{section.description}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-admin-muted">
                    {items.length} offre{items.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => {
                      setRenaming(section);
                      setRenameValue(section.name);
                      setRenameDescription(section.description ?? "");
                      setRenameError(null);
                    }}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                  <button
                    type="button"
                    className={buttonClass("dangerOutline", "sm")}
                    onClick={() => {
                      setSectionDeleteError(null);
                      setDeletingSection(section);
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Supprimer
                  </button>
                  <AdminLink
                    href={`${ADMIN_ROUTES.formuleNew}?section=${encodeURIComponent(section.id)}`}
                    className={buttonClass("secondary", "sm")}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Ajouter
                  </AdminLink>
                </div>
                <ul className="space-y-3">
                  {items.map((p) => renderFormuleRow(p, section.id))}
                  {items.length === 0 ? (
                    <li className={`${cardClass} p-4 text-sm text-admin-soft`}>Aucune offre dans cette section.</li>
                  ) : null}
                </ul>
              </section>
            );
          })
        : null}

      {ready && dbSections && formulesBySection.unassigned.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-base font-semibold text-admin-ink">Sans section</h2>
          <ul className="space-y-3">{formulesBySection.unassigned.map((p) => renderFormuleRow(p, null))}</ul>
        </section>
      ) : null}

      {ready && !dbSections ? (
        <ul className="space-y-3">
          {formules.map((p) => renderFormuleRow(p, null))}
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

      {deletingSection ? (
        <ConfirmDialog
          title={`Supprimer la section « ${deletingSection.name} » ?`}
          description="La section doit être vide. Les offres ne sont pas effacées : déplacez-les avant."
          confirmLabel="Supprimer la section"
          pendingLabel="Suppression…"
          busy={sectionDeleteBusy}
          error={sectionDeleteError}
          onConfirm={() => void confirmDeleteSection()}
          onClose={() => {
            if (!sectionDeleteBusy) setDeletingSection(null);
          }}
        />
      ) : null}

      {renaming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal>
          <div className={`${cardClass} w-full max-w-md space-y-3 p-5`}>
            <h3 className="text-base font-semibold text-admin-ink">Modifier la section</h3>
            <Field htmlFor="fs-rename" label="Nom" error={renameError ?? undefined}>
              <input
                id="fs-rename"
                className={inputClass}
                value={renameValue}
                maxLength={FORMULE_SECTION_NAME_MAX}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </Field>
            <Field
              htmlFor="fs-rename-desc"
              label="Description (optionnel)"
              hint="Petit texte gris sous le titre sur le site public. Laissez vide pour n'afficher que le nom."
            >
              <input
                id="fs-rename-desc"
                className={inputClass}
                value={renameDescription}
                maxLength={FORMULE_SECTION_DESCRIPTION_MAX}
                onChange={(e) => setRenameDescription(e.target.value)}
                placeholder="Ex. Nos formules pour toutes les envies"
              />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={buttonClass("primary")} disabled={renameBusy} onClick={() => void saveRename()}>
                {renameBusy ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className={buttonClass("secondary")} disabled={renameBusy} onClick={() => setRenaming(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast notice={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
