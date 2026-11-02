/**
 * QR personnel : il encode l'URL /fidelite/scan/<code public>, JAMAIS le jeton d'accès.
 * Le code public n'ouvre rien au public et ne donne aucun droit ; le personnel s'en servira
 * pour ouvrir la fiche (phase administration).
 *
 * Domaine : VITE_LOYALTY_QR_ORIGIN s'il est défini (domaine officiel, une fois confirmé),
 * sinon le domaine qui sert la page. Aucun domaine de production n'est figé ici.
 */
import { encode } from "uqr";
import { LOYALTY_ROUTES } from "../routes";

const PUBLIC_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export function isPublicCode(value: string): boolean {
  return PUBLIC_CODE.test(value);
}

export function qrOrigin(
  env: Record<string, string | undefined> = { VITE_LOYALTY_QR_ORIGIN: import.meta.env.VITE_LOYALTY_QR_ORIGIN },
  location: { origin: string } | undefined = typeof window !== "undefined" ? window.location : undefined,
): string {
  const configured = env.VITE_LOYALTY_QR_ORIGIN?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("VITE_LOYALTY_QR_ORIGIN doit être en https");
    return url.origin;
  }
  if (!location) throw new Error("Domaine du QR inconnu");
  return location.origin;
}

export function scanUrl(publicCode: string, origin: string = qrOrigin()): string {
  if (!isPublicCode(publicCode)) throw new Error("Code public invalide");
  return `${origin}${LOYALTY_ROUTES.scan}/${publicCode}`;
}

/** « 9tn5-d14k yzy2 » → « 9TN5D14KYZY2 » (nettoyage de la saisie ou de l'URL). */
export function cleanPublicCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(0, 12);
}

/** « 9TN5D14KYZY2 » → « 9TN5 D14K YZY2 » (lecture au comptoir). */
export function formatPublicCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Matrice du QR (true = module sombre), correction M : lisible même un peu abîmé ou reflété. */
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 0 }).data;
}

/** Un seul chemin SVG : un carré 1×1 par module sombre, lignes regroupées. */
export function qrPath(modules: boolean[][]): string {
  let d = "";
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end += 1;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return d;
}
