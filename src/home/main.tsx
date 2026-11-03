import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { HomePage } from "./HomePage";
import { legacyMenuUrl } from "./legacyMenuHash";
import { warmMenu } from "./warmMenu";

/** Page d'accueil (/). Les anciens liens du menu (« /#formules-midi »…) repartent vers /menu. */
const menuUrl = legacyMenuUrl(window.location.hash);
if (menuUrl) {
  window.location.replace(menuUrl);
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <HomePage />
    </StrictMode>,
  );
  warmMenu();
}
