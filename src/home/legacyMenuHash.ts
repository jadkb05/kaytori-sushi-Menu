/**
 * Le menu était servi à la racine : les anciens liens (QR codes, partages) du type
 * « /#formules-midi » ou « /#menu-cat-… » doivent toujours ouvrir la bonne section du menu.
 * Les ancres propres à la page d'accueil (#restaurant, #specialites…) ne sont pas concernées.
 */
import { MENU_PATH } from "./homeContent";

const MENU_HASH = /^(?:formules-solo-duo-family|formules-midi|promos|menu-cat-[a-z0-9-]+)$/;

/** URL du menu à ouvrir pour ce hash, ou null si le hash ne vise pas une section du menu. */
export function legacyMenuUrl(hash: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(hash.replace(/^#/, "")).trim().toLowerCase();
  } catch {
    return null;
  }
  return MENU_HASH.test(key) ? `${MENU_PATH}#${key}` : null;
}
