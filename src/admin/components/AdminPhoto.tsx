import { useState, type ImgHTMLAttributes } from "react";
import { supabaseImageUrl } from "../../lib/supabase/imageTransform";

/** Largeur des vignettes des listes (≈ 2× leur taille affichée, écrans Retina). */
export const ADMIN_LIST_PHOTO_WIDTH = 160;
/** Largeur des aperçus (couvertures, fiche produit, affiche de formule). */
export const ADMIN_PREVIEW_PHOTO_WIDTH = 640;

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { src: string; photoWidth: number };

/**
 * Photo affichée dans l'admin : version allégée Supabase (`photoWidth` px, ratio conservé) au lieu du
 * fichier d'origine. Affichage seulement : téléversement, recadrage et enregistrement utilisent
 * toujours l'original. Transformation en erreur, fichier local ou aperçu `blob:` → original.
 */
export function AdminPhoto({ src, photoWidth, onError, ...img }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resized = failedSrc === src ? null : supabaseImageUrl(src, photoWidth);
  return (
    <img
      {...img}
      src={resized ?? src}
      onError={(e) => {
        if (resized) setFailedSrc(src);
        else onError?.(e);
      }}
    />
  );
}
