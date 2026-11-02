/**
 * Barre du banc d'essai de l'espace du personnel (npm run dev:fidelite uniquement) :
 * profil du banc (responsable / comptoir), réglages du programme qui changent le comportement
 * de la base PGlite (taux d'attribution, fenêtre de confirmation, ouverture), réseau simulé
 * et remise à zéro.
 */
import { useEffect, useState } from "react";
import { devProgram, devReset, devSetProgram, networkMode, setNetworkMode, type NetworkMode } from "./localBackend";
import { DEMO_PIN, benchProfile, setBenchProfile } from "./staffDemo";

const btn = "rounded-md border border-white/25 px-2 py-1 text-left hover:bg-white/10 disabled:opacity-50";

type Program = {
  isActive: boolean;
  recentCreditWindowSeconds: number;
  earningPoints: number | null;
  earningDirhams: number | null;
};

export default function StaffDevToolbar() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NetworkMode>(networkMode());
  const [program, setProgram] = useState<Program | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void devProgram().then((p) => setProgram(p as Program));
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      window.location.reload();
    } catch (e) {
      console.warn("[banc local]", e instanceof Error ? e.message : e);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed bottom-3 right-3 z-[60] max-w-[18rem] rounded-xl bg-black/85 p-2 font-sans text-[12px] text-white shadow-lg"
      data-dev-toolbar
    >
      <button type="button" className={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Banc local {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="px-1 text-white/80">
            Code QR manager : <strong className="tracking-widest text-white">{DEMO_PIN}</strong>
          </p>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => act(async () => setBenchProfile(benchProfile() === "owner" ? "counter" : "owner"))}
          >
            Profil : {benchProfile() === "owner" ? "responsable → comptoir" : "comptoir → responsable"}
          </button>
          <button
            type="button"
            disabled={busy || !program}
            className={btn}
            onClick={() =>
              act(() =>
                devSetProgram(
                  program?.earningPoints
                    ? { earning_points: null, earning_dirhams: null }
                    : { earning_points: 1, earning_dirhams: 2 },
                ),
              )
            }
          >
            Taux d&apos;attribution :{" "}
            {program ? (program.earningPoints ? `${program.earningPoints} pt / ${program.earningDirhams} DH` : "non défini") : "…"}
          </button>
          <button
            type="button"
            disabled={busy || !program}
            className={btn}
            onClick={() =>
              act(() =>
                devSetProgram({
                  recent_credit_window_seconds: program?.recentCreditWindowSeconds ? 0 : 120,
                }),
              )
            }
          >
            Crédit rapproché :{" "}
            {program
              ? program.recentCreditWindowSeconds
                ? `confirmation sous ${program.recentCreditWindowSeconds} s`
                : "sans confirmation"
              : "…"}
          </button>
          <button
            type="button"
            disabled={busy || !program}
            className={btn}
            onClick={() => act(() => devSetProgram({ is_active: !program?.isActive }))}
          >
            Programme : {program ? (program.isActive ? "ouvert → fermer" : "fermé → ouvrir") : "…"}
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
                sessionStorage.clear();
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
