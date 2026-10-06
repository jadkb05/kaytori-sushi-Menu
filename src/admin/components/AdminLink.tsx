import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "../hooks/useAdminPath";

/** Lien interne à l'admin : navigation sans rechargement (Ctrl/Cmd+clic reste un vrai lien). */
export function AdminLink({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
