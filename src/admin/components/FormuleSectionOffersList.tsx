import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import { AdminLink } from "./AdminLink";
import { ADMIN_LIST_PHOTO_WIDTH, AdminPhoto } from "./AdminPhoto";
import { GripIcon, PencilIcon, TrashIcon } from "./icons";
import { StatusBadge, buttonClass, cardClass, inputClass } from "./ui";
import { ADMIN_DND_MODIFIERS, ADMIN_DROP_ANIMATION, reorderIds, useAdminListSensors } from "../lib/adminDnd";
import { ranksInOrderedGroup, type FormuleSectionRow } from "../lib/formuleSectionAdmin";
import type { AdminProduct } from "../lib/menuAdmin";
import { formuleEditPath } from "../lib/routes";

function SortableFormuleOffer({
  product,
  position,
  total,
  sectionId,
  orderedSections,
  disabled,
  movingSectionId,
  pendingId,
  onMoveToSection,
  onToggle,
  onDelete,
}: {
  product: AdminProduct;
  position: number;
  total: number;
  sectionId: string;
  orderedSections: readonly FormuleSectionRow[];
  disabled: boolean;
  movingSectionId: string | null;
  pendingId: string | null;
  onMoveToSection: (product: AdminProduct, sectionId: string) => void;
  onToggle: (product: AdminProduct) => void;
  onDelete: (product: AdminProduct) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled: disabled || total < 2,
    animateLayoutChanges: ({ isSorting, wasDragging }) => !(isSorting || wasDragging),
  });
  const canDrag = total >= 2 && !disabled;
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${
        product.isActive ? "" : "opacity-70"
      } ${isDragging ? "ring-1 ring-kaytori-green/30" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="flex h-14 w-8 shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-lg border border-admin-line bg-admin-canvas text-admin-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Déplacer ${product.name}, position ${position}`}
          disabled={!canDrag}
          {...attributes}
          {...listeners}
        >
          <GripIcon className="h-4 w-4" />
        </button>
        <span className="w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-admin-ink" title="Position dans la section">
          {position}
          <span className="font-normal text-admin-muted">/{total}</span>
        </span>
        <div
          className={`shrink-0 ${canDrag ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
          {...(canDrag ? listeners : {})}
        >
          {product.imageUrl ? (
            <AdminPhoto
              src={product.imageUrl}
              photoWidth={ADMIN_LIST_PHOTO_WIDTH}
              alt=""
              loading="lazy"
              decoding="async"
              className="pointer-events-none h-20 w-16 rounded-lg bg-[#0f1815] object-contain ring-1 ring-black/5"
              draggable={false}
            />
          ) : (
            <span className="grid h-20 w-16 place-items-center rounded-lg bg-admin-subtle text-xs text-admin-muted">
              Sans photo
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-admin-ink">{product.name}</p>
          <p className="mt-0.5 text-sm tabular-nums text-admin-soft">{product.price} DH</p>
          <div className="mt-1.5">
            <StatusBadge active={product.isActive} activeLabel="Active" inactiveLabel="Désactivée" />
          </div>
          {total >= 2 ? (
            <p className="mt-1 text-[11px] text-admin-muted">Glissez la photo pour réordonner</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        {orderedSections.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-admin-muted">
            <span className="shrink-0">Section</span>
            <select
              className={`${inputClass} max-w-[14rem] py-1.5 text-sm`}
              value={sectionId}
              disabled={movingSectionId === product.id || disabled}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next !== sectionId) onMoveToSection(product, next);
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
          <AdminLink href={formuleEditPath(product.id)} className={buttonClass("secondary", "sm")}>
            <PencilIcon className="h-3.5 w-3.5" />
            Modifier
          </AdminLink>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={pendingId === product.id || disabled}
            onClick={() => onToggle(product)}
          >
            {product.isActive ? "Désactiver" : "Activer"}
          </button>
          <button
            type="button"
            className={buttonClass("dangerOutline", "sm")}
            disabled={disabled}
            onClick={() => onDelete(product)}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Supprimer
          </button>
        </div>
      </div>
    </li>
  );
}

function FormuleDragPreview({ product }: { product: AdminProduct }) {
  return (
    <div
      className={`${cardClass} flex w-[min(100vw-2rem,22rem)] items-center gap-3 p-3 shadow-admin-lg ring-2 ring-kaytori-green/50`}
    >
      {product.imageUrl ? (
        <AdminPhoto
          src={product.imageUrl}
          photoWidth={ADMIN_LIST_PHOTO_WIDTH}
          alt=""
          className="h-16 w-12 shrink-0 rounded-lg bg-[#0f1815] object-contain"
          draggable={false}
        />
      ) : (
        <span className="grid h-16 w-12 shrink-0 place-items-center rounded-lg bg-admin-subtle text-[10px] text-admin-muted">
          —
        </span>
      )}
      <p className="min-w-0 truncate text-sm font-semibold text-admin-ink">{product.name}</p>
    </div>
  );
}

/**
 * Offres d'une section formules : glisser-déposer fluide (overlay) + enregistrement auto de l'ordre.
 */
export function FormuleSectionOffersList({
  sectionId,
  items,
  orderedSections,
  disabled,
  savingOrder,
  movingSectionId,
  pendingId,
  onReorderPersist,
  onMoveToSection,
  onToggle,
  onDelete,
}: {
  sectionId: string;
  items: readonly AdminProduct[];
  orderedSections: readonly FormuleSectionRow[];
  disabled: boolean;
  savingOrder: boolean;
  movingSectionId: string | null;
  pendingId: string | null;
  onReorderPersist: (
    productId: string,
    toPosition: number,
    previousItems: AdminProduct[],
    nextItems: AdminProduct[],
  ) => Promise<void>;
  onMoveToSection: (product: AdminProduct, sectionId: string) => void;
  onToggle: (product: AdminProduct) => void;
  onDelete: (product: AdminProduct) => void;
}) {
  const sensors = useAdminListSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const beforeRef = useRef<AdminProduct[] | null>(null);
  const list = [...items];
  const ranks = ranksInOrderedGroup(list.map((p) => p.id));
  const active = activeId ? (list.find((p) => p.id === activeId) ?? null) : null;
  const locked = disabled || savingOrder;

  const onDragStart = (event: DragStartEvent) => {
    beforeRef.current = list;
    setActiveId(String(event.active.id));
  };

  const onDragCancel = () => {
    beforeRef.current = null;
    setActiveId(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragActive, over } = event;
    const previous = beforeRef.current;
    beforeRef.current = null;
    setActiveId(null);
    if (!over || dragActive.id === over.id || !previous) return;
    const fromIndex = previous.findIndex((p) => p.id === dragActive.id);
    const toIndex = previous.findIndex((p) => p.id === over.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextIds = reorderIds(
      previous.map((p) => p.id),
      fromIndex,
      toIndex,
    );
    const byId = new Map(previous.map((p) => [p.id, p]));
    const nextItems = nextIds.map((id) => byId.get(id)!);
    void onReorderPersist(String(dragActive.id), toIndex + 1, previous, nextItems);
  };

  if (list.length === 0) {
    return (
      <ul className="space-y-3">
        <li className={`${cardClass} p-4 text-sm text-admin-soft`}>Aucune offre dans cette section.</li>
      </ul>
    );
  }

  return (
    <>
      {savingOrder ? (
        <p className="mb-2 text-xs font-medium text-admin-muted" aria-live="polite">
          Enregistrement de l'ordre…
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={ADMIN_DND_MODIFIERS}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={list.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {list.map((p) => {
              const rank = ranks.get(p.id)!;
              return (
                <SortableFormuleOffer
                  key={p.id}
                  product={p}
                  position={rank.position}
                  total={rank.total}
                  sectionId={sectionId}
                  orderedSections={orderedSections}
                  disabled={locked}
                  movingSectionId={movingSectionId}
                  pendingId={pendingId}
                  onMoveToSection={onMoveToSection}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              );
            })}
          </ul>
        </SortableContext>
        <DragOverlay adjustScale={false} dropAnimation={ADMIN_DROP_ANIMATION}>
          {active ? <FormuleDragPreview product={active} /> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
