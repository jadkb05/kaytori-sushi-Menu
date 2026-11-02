/**
 * BANC D'ESSAI LOCAL — espace du personnel (npm run dev:fidelite), jamais en production : chargé
 * seulement si LOCAL_BACKEND (import.meta.env.DEV et VITE_LOYALTY_LOCAL_BACKEND=1), donc retiré
 * du build ; tests/loyaltyStaffBundle.test.ts le vérifie sur le build réel.
 */
import { COUNTER_EMAIL, DEMO_QR_PIN, OWNER_EMAIL, benchEmail, benchProfile, setBenchProfile, staffRpc } from "./localBackend";

export const DEMO_MARKER = "kaytori-staff-demo-bench";
export const DEMO_PIN = DEMO_QR_PIN;

export { COUNTER_EMAIL, OWNER_EMAIL, benchEmail, benchProfile, setBenchProfile, staffRpc };
