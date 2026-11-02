/**
 * Barre du banc d'essai local (npm run dev:fidelite uniquement) : cartes de démonstration,
 * ajout rapide de points par ticket, programme ouvert / fermé, réseau simulé.
 */
import { useEffect, useState } from "react";
import { viewCard } from "../lib/api";
import { readSavedToken } from "../lib/storage";
import { LOYALTY_ROUTES } from "../routes";
import {
  DEMO_CARDS,
  devCreditPoints,
  devProgram,
  devReset,
  devSetProgram,
  networkMode,
  setNetworkMode,
  type NetworkMode,
} from "./localBackend";

const btn = "rounded-md border border-white/25 px-2 py-1 text-left hover:bg-white/10";

export default function DevToolbar() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NetworkMode>(networkMode());
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void devProgram().then((p) => setActive((p as { isActive: boolean }).isActive));
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      window.location.reload();
    } catch (e) {
      alertLike(e);
      setBusy(false);
    }
  };

  const currentCode = async () => {
    const token = readSavedToken();
    if (!token) throw new Error("Aucune carte gardée sur cet appareil.");
    const saved = networkMode();
    setNetworkMode("normal");
    try {
      return (await viewCard(token)).publicCode;
    } finally {
      setNetworkMode(saved);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-[17rem] rounded-xl bg-black/85 p-2 text-[12px] text-white shadow-lg" data-dev-toolbar>
      <button type="button" className={btn} onClick={() => setOpen((v) => !v)}>
        Banc local {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {DEMO_CARDS.map((c) => (
            <a
              key={c.token}
              className={btn}
              href={`${LOYALTY_ROUTES.card}#${c.token}`}
              onClick={(e) => {
                e.preventDefault();
                window.location.assign(`${LOYALTY_ROUTES.card}#${c.token}`);
                window.location.reload();
              }}
            >
              {c.label}
            </a>
          ))}
          <button type="button" disabled={busy} className={btn} onClick={() => act(async () => devCreditPoints(await currentCode(), 15000))}>
            +150 pts / ticket 150 DH (carte affichée)
          </button>
          <button type="button" disabled={busy || active === null} className={btn} onClick={() => act(() => devSetProgram({ is_active: !active }))}>
            Programme : {active === null ? "…" : active ? "ouvert → fermer" : "fermé → ouvrir"}
          </button>
          <label className="flex items-center gap-1">
            Réseau
            <select
              className="flex-1 rounded bg-white/10 px-1 py-0.5"
              value={mode}
              onChange={(e) => {
                const m = e.target.value as NetworkMode;
                setNetworkMode(m);
                setMode(m);
              }}
            >
              <option value="normal">normal</option>
              <option value="slow">lent (2,5 s)</option>
              <option value="offline">coupé</option>
              <option value="lostResponse">réponse perdue</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() =>
              act(async () => {
                await devReset();
                localStorage.clear();
              })
            }
          >
            Réinitialiser la base locale
          </button>
        </div>
      ) : null}
    </div>
  );
}

function alertLike(e: unknown) {
  console.warn("[banc local]", e instanceof Error ? e.message : e);
}
