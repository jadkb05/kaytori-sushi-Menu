/**
 * Optimisation d'une photo AVANT téléversement : redimensionnement (1254 px maximum sur le plus
 * grand côté, proportions conservées, jamais d'agrandissement) puis compression WebP (JPEG si le
 * navigateur ne sait pas encoder le WebP), qualité 0,85 abaissée par paliers jusqu'à 0,70 pour
 * viser ≤ 250 Ko. Les photos déjà en ligne ne sont jamais retouchées : seul le nouveau fichier l'est.
 *
 * Le décodage / encodage passe par un « codec » injectable : celui du navigateur
 * (createImageBitmap + canvas) en production, un faux codec dans les tests.
 */

/** Taille des photos actuelles du menu (côté le plus long). */
export const PHOTO_MAX_DIMENSION = 1254;
export const PHOTO_QUALITY = 0.85;
export const PHOTO_MIN_QUALITY = 0.7;
const QUALITY_STEP = 0.05;
/** Objectif de poids (les photos actuelles font 53 à 259 Ko). */
export const PHOTO_TARGET_BYTES = 250 * 1024;
/** Garde-fou mémoire : au-delà, le décodage peut faire planter un téléphone. */
export const PHOTO_MAX_INPUT_PIXELS = 50_000_000;

export type OutputMime = "image/webp" | "image/jpeg";

export type DecodedImage = {
  width: number;
  height: number;
  /** Image décodée, propre au codec. */
  source: unknown;
  close?: () => void;
};

export type ImageCodec = {
  decode(file: Blob): Promise<DecodedImage>;
  /** null si le format demandé n'est pas encodable par ce navigateur. */
  encode(image: DecodedImage, width: number, height: number, mime: OutputMime, quality: number): Promise<Blob | null>;
};

export type PhotoOptimizeResult =
  | {
      ok: true;
      file: File;
      /** false : fichier d'origine conservé (déjà au bon format, à la bonne taille et léger). */
      transformed: boolean;
      width: number;
      height: number;
      originalBytes: number;
      quality: number | null;
    }
  | { ok: false; error: string };

export type PhotoOptimizer = (file: File) => Promise<PhotoOptimizeResult>;

/** Dimensions finales : plus grand côté ≤ max, proportions conservées, jamais d'agrandissement. */
export function targetDimensions(width: number, height: number, max = PHOTO_MAX_DIMENSION): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Qualités essayées : 0,85 ; 0,80 ; 0,75 ; 0,70. */
export function qualitySteps(): number[] {
  const steps: number[] = [];
  for (let q = PHOTO_QUALITY; q >= PHOTO_MIN_QUALITY - 1e-9; q -= QUALITY_STEP) steps.push(Math.round(q * 100) / 100);
  return steps;
}

function renamed(name: string, mime: OutputMime): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.${mime === "image/webp" ? "webp" : "jpg"}`;
}

/**
 * Redimensionne et compresse. Le fichier doit déjà avoir passé validatePhotoFile (type et 5 Mo).
 * Le fichier d'origine est conservé tel quel seulement s'il est déjà en JPEG/WebP, ≤ 1254 px et
 * ≤ 250 Ko (aucune perte de qualité inutile).
 */
export async function optimizePhoto(file: File, codec: ImageCodec): Promise<PhotoOptimizeResult> {
  let image: DecodedImage;
  try {
    image = await codec.decode(file);
  } catch {
    return { ok: false, error: "Impossible de lire cette photo : le fichier est peut-être endommagé." };
  }
  try {
    const { width: w0, height: h0 } = image;
    if (!(w0 > 0 && h0 > 0)) return { ok: false, error: "Impossible de lire cette photo : dimensions invalides." };
    if (w0 * h0 > PHOTO_MAX_INPUT_PIXELS) {
      return { ok: false, error: `Photo trop grande (${w0} × ${h0} pixels) : réduisez-la avant de l'envoyer.` };
    }
    const { width, height } = targetDimensions(w0, h0);
    const base = { originalBytes: file.size, width, height };

    if (
      (file.type === "image/jpeg" || file.type === "image/webp") &&
      width === w0 &&
      height === h0 &&
      file.size <= PHOTO_TARGET_BYTES
    ) {
      return { ok: true, file, transformed: false, quality: null, ...base };
    }

    for (const mime of ["image/webp", "image/jpeg"] as const) {
      let best: { blob: Blob; quality: number } | null = null;
      for (const quality of qualitySteps()) {
        const blob = await codec.encode(image, width, height, mime, quality);
        if (!blob) break; // format non pris en charge par ce navigateur → format suivant
        if (!best || blob.size < best.blob.size) best = { blob, quality };
        if (blob.size <= PHOTO_TARGET_BYTES) break;
      }
      if (best) {
        const out = new File([best.blob], renamed(file.name, mime), { type: mime, lastModified: Date.now() });
        return { ok: true, file: out, transformed: true, quality: best.quality, ...base };
      }
    }
    return { ok: false, error: "Ce navigateur ne sait pas compresser la photo (WebP ou JPEG)." };
  } catch {
    return { ok: false, error: "La photo n'a pas pu être optimisée. Réessayez ou choisissez une autre photo." };
  } finally {
    image.close?.();
  }
}

/** Codec du navigateur : createImageBitmap (orientation EXIF appliquée) + canvas. */
export const browserImageCodec: ImageCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  async encode(image, width, height, mime, quality) {
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    if (mime === "image/jpeg") {
      // JPEG sans transparence : fond blanc plutôt que noir pour un PNG/WebP transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source as ImageBitmap, 0, 0, width, height);
    const blob =
      "convertToBlob" in canvas
        ? await canvas.convertToBlob({ type: mime, quality })
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    // Format non pris en charge : le navigateur renvoie un PNG au lieu du format demandé.
    return blob && blob.type === mime ? blob : null;
  },
};

/** Optimiseur par défaut : celui du navigateur ; hors navigateur (Node), fichier inchangé. */
export const defaultPhotoOptimizer: PhotoOptimizer = (file) =>
  typeof createImageBitmap === "function"
    ? optimizePhoto(file, browserImageCodec)
    : Promise.resolve({ ok: true, file, transformed: false, width: 0, height: 0, originalBytes: file.size, quality: null });
