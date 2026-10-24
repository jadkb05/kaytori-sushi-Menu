/**
 * Capteurs et animation partagés pour les listes admin glisser-déposer (couverture, formules).
 * Souris : démarrage dès quelques pixels. Tactile : court délai pour laisser scroller.
 */
import {
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DropAnimation,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";

export const ADMIN_DND_MODIFIERS = [restrictToVerticalAxis, restrictToWindowEdges];

export const ADMIN_DROP_ANIMATION: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

export function useAdminListSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  );
}

/** Réordonne une liste d'ids (indices 0…N-1). */
export function reorderIds(ids: readonly string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length ||
    fromIndex === toIndex
  ) {
    return [...ids];
  }
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
