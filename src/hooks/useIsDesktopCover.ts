import { useEffect, useState } from "react";

/** Largeur à partir de laquelle la couverture est la bannière PC fixe (en dessous : carrousel mobile). */
export const DESKTOP_COVER_QUERY = "(min-width: 768px)";

/** true sur PC / tablette (bannière fixe), false sur mobile (carrousel géré dans l'admin). */
export function useIsDesktopCover(): boolean {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DESKTOP_COVER_QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_COVER_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return desktop;
}
