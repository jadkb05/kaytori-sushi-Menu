/**
 * Premier affichage en source distante : écran de chargement, jamais l'ancien menu statique.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MenuSource } from "../src/data/menuSource";
import { MenuProvider, useMenu } from "../src/menu/MenuProvider";

function FirstCategory() {
  return <p>{useMenu().categories[0]}</p>;
}

describe("MenuProvider (source distante)", () => {
  it("affiche le chargement, sans contenu du menu statique, avant la réponse Supabase", () => {
    const remote: MenuSource = { id: "supabase", load: () => new Promise(() => {}) };
    const html = renderToStaticMarkup(
      <MenuProvider source={remote}>
        <FirstCategory />
      </MenuProvider>,
    );
    expect(html).toContain("Chargement du menu");
    expect(html).not.toContain("<p>");
  });
});
