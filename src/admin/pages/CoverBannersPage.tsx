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
import { useCallback, useEffect, useRef, useState } from "react";
import { GripIcon, PlusIcon, TrashIcon } from "../components/icons";
import {
  ConfirmDialog,
  LoadingState,
  PageHeader,
  StatusBadge,
  Toast,
  buttonClass,
  cardClass,
  type ToastNotice,
} from "../components/ui";
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

const dropAnimation: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

function CoverThumb({ src, className = "" }: { src: string; className?: string }) {
  return (
    <img
      src={src}
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
  onSetFirst,
  onReplace,
  onToggle,
  onDelete,
}: {
  banner: CoverBannerRow;
  position: number;
  total: number;
  busy: boolean;
  savingOrder: boolean;
  onSetFirst: () => void;
  onReplace: () => void;
  onToggle: () => void;
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
 * Gestion des photos de couverture du menu public (carrousel).
 * Ordre : glisser-déposer fluide (overlay qui suit le doigt / la souris) + enregistrement auto.
 */
export function CoverBannersPage({ client }: { client: SupabaseClient }) {
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
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const orderBeforeDragRef = useRef<CoverBannerRow[] | null>(null);

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

  const onAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !banners) return;
    setAddBusy(true);
    try {
      let list = banners;
      let added = 0;
      for (const file of Array.from(files)) {
        const invalid = validatePhotoFile(file);
        if (invalid) {
          setToast({ tone: "error", message: invalid });
          continue;
        }
        const res = await createCoverBanner(client, list, {
          file,
          isActive: true,
          position: list.length + 1,
        });
        if (!res.ok) {
          setToast({ tone: "error", message: res.error });
          break;
        }
        list = orderedCoverBanners([...list, res.banner]);
        setBanners(list);
        added += 1;
      }
      if (added > 0) setToast({ tone: "success", message: added === 1 ? "Photo ajoutée." : `${added} photos ajoutées.` });
      await reload();
    } finally {
      setAddBusy(false);
      if (addInputRef.current) addInputRef.current.value = "";
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
        description="Photos du bandeau d'accueil du menu public. Glissez une photo (elle suit votre doigt ou la souris) pour changer l'ordre. Le carrousel public suit cet ordre pour les photos actives."
        actions={
          banners ? (
            <>
              <input
                ref={addInputRef}
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => void onAddFiles(e.target.files)}
              />
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={addBusy || savingOrder}
                onClick={() => addInputRef.current?.click()}
              >
                <PlusIcon className="h-4 w-4" />
                {addBusy ? "Ajout…" : "Ajouter des photos"}
              </button>
            </>
          ) : null
        }
      />

      {!ready ? <LoadingState /> : null}
      {ready && banners === null ? (
        <p className={`${cardClass} p-5 text-sm leading-relaxed text-admin-soft`}>{COVER_BANNERS_MIGRATION_HINT}</p>
      ) : null}

      {ready && banners ? (
        <>
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
                    onSetFirst={() => void setFirst(b)}
                    onReplace={() => {
                      replaceTargetRef.current = b.id;
                      replaceInputRef.current?.click();
                    }}
                    onToggle={() => void toggle(b)}
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
