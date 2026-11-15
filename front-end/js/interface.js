// interface.js — v6 : comportements d'interface sans lien avec les données.
//   1. barre latérale repliable (mémorisée dans le navigateur : localStorage « mbc-sidebar ») ;
//   2. sélecteur de thème clair / sombre de la barre latérale et du menu « Plus » (localStorage « mbc-theme »,
//      le même que le menu du compte : theme.js) ;
//   3. menu « Plus » de la navigation mobile (Événements, Journal, Réglages, export, thème).
import { themeActuel, appliquerTheme } from "./theme.js";

const CLE_SIDEBAR = "mbc-sidebar";
const racine = document.documentElement;

export function initInterface() {
  initSidebar();
  initTheme();
  initMenuPlus();
}

// ---------- 1. Barre latérale repliable ----------
function initSidebar() {
  const bouton = document.getElementById("sidebar-toggle");
  if (!bouton) return;
  const maj = () => {
    const replie = racine.dataset.sidebar === "replie";
    bouton.setAttribute("aria-expanded", String(!replie));
    const libelle = replie ? "Déplier la barre latérale" : "Replier la barre latérale";
    bouton.setAttribute("aria-label", libelle); bouton.title = libelle;
  };
  bouton.addEventListener("click", () => {
    const replie = racine.dataset.sidebar !== "replie";
    if (replie) racine.dataset.sidebar = "replie"; else delete racine.dataset.sidebar;
    try { if (replie) localStorage.setItem(CLE_SIDEBAR, "replie"); else localStorage.removeItem(CLE_SIDEBAR); } catch { /* stockage indisponible */ }
    maj();
  });
  maj();
}

// ---------- 2. Thème clair / sombre ----------
// « Automatique » (thème du système) reste disponible dans le menu du compte ; ici, deux boutons explicites.
// Le bouton enfoncé indique le thème réellement affiché (y compris en automatique).
const sombreSysteme = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;
export const themeAffiche = () => { const t = themeActuel(); return t === "auto" ? (sombreSysteme() ? "dark" : "light") : t; };

function majBoutonsTheme() {
  const t = themeAffiche();
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === t)));
}

function initTheme() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-set]");
    if (!b) return;
    e.stopPropagation();
    appliquerTheme(b.dataset.themeSet);
    document.dispatchEvent(new CustomEvent("mbc:theme")); // le menu du compte se met à jour aussi
    majBoutonsTheme();
  });
  document.addEventListener("mbc:theme", majBoutonsTheme);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", majBoutonsTheme);
  majBoutonsTheme();
}

// ---------- 3. Menu « Plus » (mobile) ----------
function initMenuPlus() {
  const bouton = document.getElementById("btn-plus"), menu = document.getElementById("plus-menu");
  if (!bouton || !menu) return;
  const fermer = () => { if (menu.hidden) return; menu.hidden = true; bouton.setAttribute("aria-expanded", "false"); };
  const ouvrir = () => { menu.hidden = false; bouton.setAttribute("aria-expanded", "true"); majBoutonsTheme(); menu.querySelector(".menu__item")?.focus(); };
  bouton.addEventListener("click", (e) => { e.stopPropagation(); if (menu.hidden) ouvrir(); else fermer(); });
  menu.addEventListener("click", (e) => { if (e.target.closest("a, [data-quick]")) fermer(); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) fermer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { fermer(); bouton.focus(); } });
  window.addEventListener("hashchange", fermer);
  // « Plus » apparaît actif quand l'écran affiché fait partie de son menu
  const majActif = () => bouton.classList.toggle("is-current", ["evenements", "journal", "reglages"].includes(document.body.dataset.screen));
  window.addEventListener("hashchange", () => setTimeout(majActif));
  majActif();
}
