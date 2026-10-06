/** Message à afficher une fois sur la page suivante (ex. « Produit supprimé. » sur la liste). */
let pending: string | null = null;

export function setFlash(message: string): void {
  pending = message;
}

export function takeFlash(): string | null {
  const message = pending;
  pending = null;
  return message;
}
