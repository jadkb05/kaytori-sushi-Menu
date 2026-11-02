/**
 * Contexte partagé de l'administration de la fidélité (/admin/fidelite…) :
 * transport RPC vers la base (relié au compte authentifié ou au banc local),
 * rôle vérifié par le serveur, paramètres du programme de points, liste des cartes
 * et mémoire de recherche en cours.
 */
import { createContext, useContext } from "react";
import type { CardCollection } from "./lib/cardStats";
import type { SearchPage, StaffProgram, StaffRole, StaffRpc } from "./lib/staffApi";

export type AccessMode = "demo" | "account";

/** Dernière recherche, gardée en mémoire seulement (retour depuis une fiche), jamais stockée. */
export type SearchMemory = { query: string; page: SearchPage | null };

export type CardsState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: CardCollection }
  | { status: "error"; error: unknown };

export type StaffSpace = {
  mode: AccessMode;
  rpc: StaffRpc;
  role: StaffRole;
  /** Compte connecté (adresse e-mail) ou profil du banc local. */
  identity: string;
  /** Déconnexion du compte d'administration. */
  lock: () => void;
  program: StaffProgram | null;
  reloadProgram: () => void;
  cards: CardsState;
  refreshCards: () => void;
  search: SearchMemory;
  setSearch: (s: SearchMemory) => void;
};

export const StaffContext = createContext<StaffSpace | null>(null);

export function useStaff(): StaffSpace {
  const v = useContext(StaffContext);
  if (!v) throw new Error("useStaff hors de l'espace fidélité");
  return v;
}
