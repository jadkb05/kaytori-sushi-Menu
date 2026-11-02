/**
 * Menu de référence historique (yumloMenu.ts) tel que l'affichait l'ancien MenuProvider en mode
 * statique (formules scindées en sections publiques). Sert aux tests de rendu sur des données figées.
 */
import { promoteFormulesCategory } from "../../src/data/formulesMenu";
import { getStaticMenu } from "../../src/data/menuSource";

export const REFERENCE_MENU = promoteFormulesCategory(getStaticMenu());
