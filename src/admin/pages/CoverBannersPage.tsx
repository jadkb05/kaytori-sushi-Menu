import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { ADMIN_PREVIEW_PHOTO_WIDTH, AdminPhoto } from "../components/AdminPhoto";
import { CloseIcon, GripIcon, PlusIcon, TrashIcon } from "../components/icons";
import {
  ConfirmDialog,
  LoadingState,
  PageHeader,
  StatusBadge,
  Switch,
  Toast,
  buttonClass,
  cardClass,
  inputClass,
  type ToastNotice,
} from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import {
  COVER_BANNERS_MIGRATION_HINT,
  PHOTO_ACCEPT,
  coverBannerPosition,
  createCoverBanner,
  deleteCoverBanner,
  fetchCoverBanners,
  orderedCoverBanners,
  persistCoverBannerPosition,
  reorderCoverBanners,
  replaceCoverBannerPhoto,
  updateCoverBanner,
  validatePhotoFile,
  type CoverBannerRow,
} from "../lib/coverBannerAdmin";
import { buildProductList } from "../lib/menuAdmin";
import { SITE_SETTINGS_MIGRATION_HINT, fetchSiteSettings, updateCoverAutoplay } from "../lib/siteSettingsAdmin";

type FormuleOption = { id: string; label: string };

const dropAnimation: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

function CoverThumb({ src, className = "" }: { src: string; className?: string }) {
  return (
    <AdminPhoto
      src={src}
      photoWidth={ADMIN_PREVIEW_PHOTO_WIDTH}
      alt=""
      className={`pointer-events-none h-full w-full object-cover ${className}`}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/**
 * Ligne sortable : la photo (ou la poignée) suit le doigt / la souris via DragOverlay.
 * Souris = démarrage dès quelques pixels ; tactile = court appui pour laisser scroller.
 */
function SortableCoverRow({
  banner,
  position,
  total,
  busy,
  savingOrder,
  formuleOptions,
  onSetFirst,
  onReplace,
  onToggle,
  onProductChange,
  onDelete,
}: {
  banner: CoverBannerRow;
  position: number;
  total: number;
  busy: boolean;
  savingOrder: boolean;
  formuleOptions: readonly FormuleOption[];
  onSetFirst: () => void;
  onReplace: () => void;
  onToggle: () => void;
  onProductChange: (productId: string | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
    disabled: busy || savingOrder || total < 2,
    animateLayoutChanges: ({ isSorting, wasDragging }) => !(isSorting || wasDragging),
  });
  const isFirst = position === 1;
  const canDrag = total >= 2 && !busy && !savingOrder;
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center ${
        isDragging ? "ring-1 ring-kaytori-green/30" : ""
      }`}
    >
      <div className="flex w-full shrink-0 items-stretch gap-2 sm:w-auto">
        <button
          type="button"
          className="flex w-9 shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-lg border border-admin-line bg-admin-canvas text-admin-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Déplacer la photo, position ${position}`}
          disabled={!canDrag}
          {...attributes}
          {...listeners}
        >
          <GripIcon className="h-4 w-4" />
        </button>
        <div
          className={`aspect-[2/1] min-w-0 flex-1 overflow-hidden rounded-lg bg-admin-canvas sm:w-48 sm:flex-none ${
            canDrag ? "cursor-grab touch-none active:cursor-grabbing" : ""
          }`}
          {...(canDrag ? listeners : {})}
        >
          <CoverThumb src={banner.image_url} />
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge active={banner.is_active} />
          {isFirst ? (
            <span className="rounded-full bg-admin-tint px-2 py-0.5 text-[11px] font-semibold text-kaytori-green">
              Première
            </span>
          ) : null}
          <span className="text-xs text-admin-muted">Position {position}</span>
          {total >= 2 ? (
            <span className="text-xs text-admin-muted">Glissez la photo pour réordonner</span>
          ) : null}
        </div>
        <label className="block min-w-0 space-y-1">
          <span className="text-[12px] font-medium text-admin-ink">Formule liée (bouton « + »)</span>
          <select
            className={`${inputClass} max-w-md`}
            value={banner.product_id ?? ""}
            disabled={busy || savingOrder}
            onChange={(e) => onProductChange(e.target.value.trim() === "" ? null : e.target.value)}
            aria-label={`Formule liée à la photo en position ${position}`}
          >
            <option value="">Photo seule — sans « + »</option>
            {formuleOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="block text-[11px] leading-snug text-admin-muted">
            Le prix affiché au panier est celui de la formule catalogue (non inventé ici).
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={busy || savingOrder || isFirst}
            onClick={onSetFirst}
          >
            Définir comme première
          </button>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={busy || savingOrder}
            onClick={onReplace}
          >
            Remplacer
          </button>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={busy || savingOrder}
            onClick={onToggle}
          >
            {banner.is_active ? "Désactiver" : "Activer"}
          </button>
          <button
            type="button"
            className={buttonClass("dangerOutline", "sm")}
            disabled={busy || savingOrder}
            onClick={onDelete}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Supprimer
          </button>
        </div>
      </div>
    </li>
  );
}

function CoverDragPreview({ banner }: { banner: CoverBannerRow }) {
  return (
    <div
      className={`${cardClass} flex w-[min(100vw-2rem,22rem)] items-center gap-3 p-3 shadow-admin-lg ring-2 ring-kaytori-green/50`}
    >
      <div className="aspect-[2/1] w-36 shrink-0 overflow-hidden rounded-lg bg-admin-canvas sm:w-44">
        <CoverThumb src={banner.image_url} />
      </div>
      <p className="min-w-0 truncate text-sm font-medium text-admin-ink">Déplacement…</p>
    </div>
  );
}

/**
 * Ajout d'une ou plusieurs photos : formule optionnelle (nom + prix catalogue)
 * ou photo seule sans bouton « + ».
 */
function AddCoverDialog({
  busy,
  error,
  formuleOptions,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  formuleOptions: readonly FormuleOption[];
  onClose: () => void;
  onSubmit: (files: File[], productId: string | null) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [productId, setProductId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const onPick = (list: FileList | null) => {
    setLocalError(null);
    if (!list || list.length === 0) {
      setFiles([]);
      return;
    }
    const next: File[] = [];
    for (const file of Array.from(list)) {
      const invalid = validatePhotoFile(file);
      if (invalid) {
        setLocalError(invalid);
        setFiles([]);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const submit = () => {
    setLocalError(null);
    if (files.length === 0) {
      setLocalError("Choisissez au moins une photo.");
      return;
    }
    onSubmit(files, productId.trim() === "" ? null : productId);
  };

  const displayError = error ?? localError;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-admin-ink/40 p-4 font-sans motion-safe:animate-admin-fade sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cover-title"
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-admin-lg motion-safe:animate-admin-pop sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="add-cover-title" className="text-lg font-semibold text-admin-ink">
              Ajouter des photos de couverture
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-admin-soft">
              Liez une formule pour afficher le « + » or (nom et prix du catalogue), ou laissez « Photo seule »
              pour une image décorative sans bouton.
            </p>
          </div>
          <button
            type="button"
            className={buttonClass("ghost", "sm")}
            disabled={busy}
            aria-label="Fermer"
            onClick={onClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-admin-ink">Photos</span>
            <input
              ref={fileRef}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              data-autofocus
              disabled={busy}
              className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-admin-tint file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-kaytori-green`}
              onChange={(e) => onPick(e.target.files)}
            />
            {files.length > 0 ? (
              <span className="block text-xs text-admin-muted">
                {files.length === 1 ? files[0].name : `${files.length} fichiers sélectionnés`}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-admin-ink">Formule (optionnel)</span>
            <select
              className={inputClass}
              value={productId}
              disabled={busy}
              onChange={(e) => setProductId(e.target.value)}
              aria-label="Formule liée aux photos ajoutées"
            >
              <option value="">Photo seule — sans « + »</option>
              {formuleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="block text-[11px] leading-snug text-admin-muted">
              Même choix pour toutes les photos de cet ajout. Modifiable ensuite ligne par ligne. Le prix vient de
              la fiche formule.
            </span>
          </label>
        </div>

        {displayError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {displayError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={buttonClass("primary")} disabled={busy} onClick={submit}>
            <PlusIcon className="h-4 w-4" />
            {busy ? "Ajout…" : files.length > 1 ? `Ajouter ${files.length} photos` : "Ajouter"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Gestion des photos de couverture du menu public (carrousel).
 * Ordre : glisser-déposer fluide (overlay qui suit le doigt / la souris) + enregistrement auto.
 */
/** Réglage « Défilement automatique des couvertures » (site_settings.cover_autoplay). */
function CoverAutoplaySetting({
  client,
  onNotice,
}: {
  client: SupabaseClient;
  onNotice: (notice: ToastNotice) => void;
}) {
  /** undefined = chargement ; null = migration 12 non appliquée. */
  const [autoplay, setAutoplay] = useState<boolean | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSiteSettings(client)
      .then((settings) => {
        if (!cancelled) setAutoplay(settings ? settings.coverAutoplay : null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setAutoplay(null);
        onNotice({ tone: "error", message: e instanceof Error ? e.message : "Lecture du réglage impossible." });
      });
    return () => {
      cancelled = true;
    };
  }, [client, onNotice]);

  const onChange = async (next: boolean) => {
    setSaving(true);
    const res = await updateCoverAutoplay(client, next);
    setSaving(false);
    if (!res.ok) {
      onNotice({ tone: "error", message: res.error });
      return;
    }
    setAutoplay(res.settings.coverAutoplay);
    onNotice({
      tone: "success",
      message: res.settings.coverAutoplay ? "Défilement automatique activé." : "Défilement automatique désactivé.",
    });
  };

  return (
    <div className={`${cardClass} mb-4 p-4`}>
      <Switch
        checked={autoplay !== false}
        disabled={autoplay === undefined || autoplay === null || saving}
        onChange={(next) => void onChange(next)}
        label="Défilement automatique des couvertures"
        description={
          autoplay === null
            ? SITE_SETTINGS_MIGRATION_HINT
            : "Permet de faire défiler automatiquement les couvertures du menu."
        }
      />
    </div>
  );
}

export function CoverBannersPage({ client }: { client: SupabaseClient }) {
  const menuData = useAdminMenuData();
  const [banners, setBanners] = useState<CoverBannerRow[] | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CoverBannerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const orderBeforeDragRef = useRef<CoverBannerRow[] | null>(null);

  const formuleOptions = useMemo(() => {
    if (menuData.status !== "ready") return [];
    return buildProductList(menuData.rows)
      .filter((p) => p.categoryId === FORMULES_CATEGORY_ID)
      .map((p) => ({
        id: p.id,
        label: `${p.name} — ${p.displayPrice} DH`,
      }));
  }, [menuData]);

  const reload = useCallback(async () => {
    try {
      setBanners(await fetchCoverBanners(client));
    } catch (e) {
      setToast({ tone: "error", message: e instanceof Error ? e.message : "Lecture impossible." });
      setBanners(null);
    } finally {
      setReady(true);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ordered = banners ? orderedCoverBanners(banners) : [];
  const activeBanner = activeId ? (ordered.find((b) => b.id === activeId) ?? null) : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  );

  const onAddSubmit = async (files: File[], productId: string | null) => {
    if (!banners || files.length === 0) return;
    setAddBusy(true);
    setAddError(null);
    try {
      let list = banners;
      let added = 0;
      for (const file of files) {
        const res = await createCoverBanner(client, list, {
          file,
          isActive: true,
          position: list.length + 1,
          productId,
        });
        if (!res.ok) {
          setAddError(res.error);
          break;
        }
        list = orderedCoverBanners([...list, res.banner]);
        setBanners(list);
        added += 1;
      }
      if (added > 0) {
        const linked = productId ? " avec formule liée" : " (photo seule)";
        setToast({
          tone: "success",
          message:
            added === 1 ? `Photo ajoutée${linked}.` : `${added} photos ajoutées${linked}.`,
        });
        setAddOpen(false);
        await reload();
      }
    } finally {
      setAddBusy(false);
    }
  };

  const onReplace = async (file: File | undefined) => {
    const id = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !id) return;
    const invalid = validatePhotoFile(file);
    if (invalid) {
      setToast({ tone: "error", message: invalid });
      return;
    }
    setBusyId(id);
    const res = await replaceCoverBannerPhoto(client, id, file);
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({ tone: "success", message: "Photo remplacée." });
    await reload();
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  };

  const toggle = async (b: CoverBannerRow) => {
    setBusyId(b.id);
    const res = await updateCoverBanner(client, b.id, { isActive: !b.is_active });
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    await reload();
  };

  const setFirst = async (b: CoverBannerRow) => {
    if (coverBannerPosition(ordered, b.id) === 1) return;
    setBusyId(b.id);
    const res = await persistCoverBannerPosition(client, b.id, 1);
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({ tone: "success", message: "Première photo du carrousel." });
    await reload();
  };

  const setProduct = async (b: CoverBannerRow, productId: string | null) => {
    if ((b.product_id ?? null) === productId) return;
    setBusyId(b.id);
    const res = await updateCoverBanner(client, b.id, { productId });
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({
      tone: "success",
      message: productId ? "Formule liée à la couverture." : "Couverture décorative (sans « + »).",
    });
    await reload();
  };

  const onDragStart = (event: DragStartEvent) => {
    orderBeforeDragRef.current = ordered;
    setActiveId(String(event.active.id));
  };

  const finishDrag = () => {
    setActiveId(null);
  };

  const onDragCancel = () => {
    orderBeforeDragRef.current = null;
    finishDrag();
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const previous = orderBeforeDragRef.current;
    orderBeforeDragRef.current = null;
    finishDrag();
    if (!over || active.id === over.id || !previous) return;

    const fromIndex = previous.findIndex((b) => b.id === active.id);
    const toIndex = previous.findIndex((b) => b.id === over.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const next = reorderCoverBanners(previous, fromIndex, toIndex);
    setBanners(next);
    setSavingOrder(true);
    const res = await persistCoverBannerPosition(client, String(active.id), toIndex + 1);
    if (!res.ok) {
      setBanners(previous);
      setToast({ tone: "error", message: res.error || "Ordre non enregistré." });
      setSavingOrder(false);
      return;
    }
    await reload();
    setSavingOrder(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await deleteCoverBanner(client, deleting.id);
    setDeleteBusy(false);
    if (!res.ok) {
      setDeleteError(res.error);
      return;
    }
    setDeleting(null);
    setToast({ tone: "success", message: "Photo supprimée." });
    await reload();
  };

  return (
    <>
      <PageHeader
        title="Couverture"
        description="Photos du bandeau d'accueil du menu public. Glissez pour réordonner. Liez une formule pour afficher le « + » or sur la photo (ajout au panier avec le nom et le prix catalogue)."
        actions={
          banners ? (
            <button
              type="button"
              className={buttonClass("primary")}
              disabled={addBusy || savingOrder}
              onClick={() => {
                setAddError(null);
                setAddOpen(true);
              }}
            >
              <PlusIcon className="h-4 w-4" />
              Ajouter des photos
            </button>
          ) : null
        }
      />

      {!ready ? <LoadingState /> : null}
      {ready && banners === null ? (
        <p className={`${cardClass} p-5 text-sm leading-relaxed text-admin-soft`}>{COVER_BANNERS_MIGRATION_HINT}</p>
      ) : null}

      {ready && banners ? (
        <>
          <CoverAutoplaySetting client={client} onNotice={setToast} />
          {savingOrder ? (
            <p className="mb-3 text-xs font-medium text-admin-muted" aria-live="polite">
              Enregistrement de l'ordre…
            </p>
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
            onDragStart={onDragStart}
            onDragCancel={onDragCancel}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <SortableContext items={ordered.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {ordered.map((b) => (
                  <SortableCoverRow
                    key={b.id}
                    banner={b}
                    position={coverBannerPosition(ordered, b.id)}
                    total={ordered.length}
                    busy={busyId === b.id}
                    savingOrder={savingOrder}
                    formuleOptions={formuleOptions}
                    onSetFirst={() => void setFirst(b)}
                    onReplace={() => {
                      replaceTargetRef.current = b.id;
                      replaceInputRef.current?.click();
                    }}
                    onToggle={() => void toggle(b)}
                    onProductChange={(productId) => void setProduct(b, productId)}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleting(b);
                    }}
                  />
                ))}
                {ordered.length === 0 ? (
                  <li className={`${cardClass} p-5 text-sm text-admin-soft`}>
                    Aucune photo. Ajoutez-en pour alimenter le carrousel (sinon le site affiche la bannière par défaut).
                  </li>
                ) : null}
              </ul>
            </SortableContext>
            <DragOverlay adjustScale={false} dropAnimation={dropAnimation}>
              {activeBanner ? <CoverDragPreview banner={activeBanner} /> : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : null}

      <input
        ref={replaceInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        onChange={(e) => void onReplace(e.target.files?.[0])}
      />

      {addOpen ? (
        <AddCoverDialog
          busy={addBusy}
          error={addError}
          formuleOptions={formuleOptions}
          onClose={() => {
            if (!addBusy) {
              setAddOpen(false);
              setAddError(null);
            }
          }}
          onSubmit={(files, productId) => void onAddSubmit(files, productId)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Supprimer cette photo ?"
          description="La photo disparaîtra du carrousel public. L'image n'est retirée du stockage que si vous le faites séparément."
          confirmLabel="Supprimer"
          pendingLabel="Suppression…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        />
      ) : null}

      {toast ? <Toast notice={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
