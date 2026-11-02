/**
 * QR personnel (SVG net, modules sombres sur ivoire, marge de silence de 4 modules).
 * Il encode l'URL du code public, jamais le jeton d'accès.
 */
import { memo, useMemo } from "react";
import { qrModules, qrPath, scanUrl } from "../lib/qr";

function CardQrImpl({ publicCode, origin, className = "" }: { publicCode: string; origin?: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const modules = qrModules(scanUrl(publicCode, origin));
    return { size: modules.length, d: qrPath(modules) };
  }, [publicCode, origin]);
  const quiet = 4;
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
      role="img"
      aria-label="QR code de votre carte, à présenter au comptoir"
      shapeRendering="crispEdges"
      className={`block rounded-xl bg-white ${className}`}
    >
      <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#ffffff" />
      <path d={d} fill="#0a0f0d" />
    </svg>
  );
}

export const CardQr = memo(CardQrImpl);
