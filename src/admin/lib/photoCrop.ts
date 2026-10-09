/**
 * Recadrage carré d'une photo produit : calculs (zoom, position, zone source) et rendu du fichier.
 *
 * Le cadrage est décrit dans les pixels de la photo source : un carré de côté `side` centré en
 * (centerX, centerY). Zoom 1 = plus grand carré possible ; zoom 2 = carré deux fois plus petit.
 * Le fichier produit contient uniquement ces pixels (vrai recadrage, pas un simple CSS) et passe
 * ensuite par l'optimisation et le téléversement habituels (uploadProductPhoto).
 */
import { PHOTO_MAX_DIMENSION } from "./photoOptimize";

/**
 * Côté minimal du carré source au zoom maximal : en dessous, la photo serait trop agrandie
 * (artificiellement) pour les cartes du menu.
 */
export const CROP_MIN_SOURCE_SIDE = 512;
/** Zoom maximal quelle que soit la taille de la photo. */
export const CROP_MAX_ZOOM = 4;

export type Crop = { zoom: number; centerX: number; centerY: number };
export type CropRect = { x: number; y: number; side: number };

/** Zoom maximal pour une photo : le carré source garde au moins 512 px (ou toute la photo si plus petite). */
export function maxCropZoom(width: number, height: number): number {
  const shortest = Math.min(width, height);
  return Math.max(1, Math.min(CROP_MAX_ZOOM, shortest / CROP_MIN_SOURCE_SIDE));
}

/** Cadrage initial : zoom 1, centré. */
export function initialCrop(width: number, height: number): Crop {
  return { zoom: 1, centerX: width / 2, centerY: height / 2 };
}

/** Zoom borné et centre maintenu pour que le carré reste entièrement dans la photo. */
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const zoom = Math.min(maxCropZoom(width, height), Math.max(1, crop.zoom));
  const half = Math.min(width, height) / zoom / 2;
  const clamp = (v: number, size: number) => Math.min(size - half, Math.max(half, v));
  return { zoom, centerX: clamp(crop.centerX, width), centerY: clamp(crop.centerY, height) };
}

/** Zone source (pixels de la photo) du cadrage. */
export function cropRect(crop: Crop, width: number, height: number): CropRect {
  const c = clampCrop(crop, width, height);
  const side = Math.min(width, height) / c.zoom;
  return { x: c.centerX - side / 2, y: c.centerY - side / 2, side };
}

/** Côté du fichier produit : celui de la zone source, jamais agrandi, plafonné à 1254 px. */
export function cropOutputSide(rect: CropRect): number {
  return Math.max(1, Math.min(PHOTO_MAX_DIMENSION, Math.round(rect.side)));
}

/** Déplacement à la souris / au doigt : `dx`, `dy` en pixels d'écran, `viewport` = côté du cadre affiché. */
export function panCrop(crop: Crop, dx: number, dy: number, viewport: number, width: number, height: number): Crop {
  const scale = viewport / cropRect(crop, width, height).side; // pixels d'écran par pixel source
  return clampCrop({ ...crop, centerX: crop.centerX - dx / scale, centerY: crop.centerY - dy / scale }, width, height);
}

/**
 * Zoom autour d'un point du cadre (pincement à deux doigts, centré sur leur milieu) : le point de la
 * photo situé sous (fx, fy) — fractions 0…1 du cadre affiché — reste sous les doigts. Mêmes bornes
 * que le slider (clampCrop : zoom 1…maxCropZoom, carré toujours dans la photo).
 */
export function zoomCropAt(crop: Crop, zoom: number, fx: number, fy: number, width: number, height: number): Crop {
  const before = cropRect(crop, width, height);
  const px = before.x + fx * before.side;
  const py = before.y + fy * before.side;
  const z = clampCrop({ ...crop, zoom }, width, height).zoom;
  const side = Math.min(width, height) / z;
  return clampCrop({ zoom: z, centerX: px - fx * side + side / 2, centerY: py - fy * side + side / 2 }, width, height);
}

/**
 * Rendu du recadrage : les pixels de la zone source dessinés dans un carré, encodés presque sans
 * perte (WebP 0,95, JPEG 0,95 si le navigateur n'encode pas le WebP). L'optimisation habituelle
 * (≤ 250 Ko, qualité ≥ 0,70) s'applique ensuite au téléversement.
 */
export async function renderCroppedPhoto(image: CanvasImageSource, rect: CropRect, baseName: string): Promise<File> {
  const side = cropOutputSide(rect);
  const canvas = Object.assign(document.createElement("canvas"), { width: side, height: side });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Recadrage impossible : canvas indisponible.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, side, side);
  for (const mime of ["image/webp", "image/jpeg"] as const) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.95));
    if (blob && blob.type === mime) {
      return new File([blob], `${baseName}-recadree.${mime === "image/webp" ? "webp" : "jpg"}`, { type: mime, lastModified: Date.now() });
    }
  }
  throw new Error("Recadrage impossible : ce navigateur ne sait pas encoder la photo.");
}

/**
 * Charge la photo actuelle pour l'éditer. Téléchargée en Blob (CORS du Storage public) : le canvas
 * n'est pas « contaminé » et peut être exporté. Orientation EXIF appliquée.
 */
export async function loadPhotoForCrop(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!response.ok) throw new Error(`Photo introuvable (${response.status}).`);
  return createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
}
