// theme.js — choix du thème : "auto" (système), "light" ou "dark". Mémorisé dans le navigateur.
const CLE = "mbc-theme";

export function themeActuel() {
  try { const t = localStorage.getItem(CLE); return t === "light" || t === "dark" ? t : "auto"; } catch { return "auto"; }
}

export function appliquerTheme(t) {
  const racine = document.documentElement;
  if (t === "light" || t === "dark") racine.setAttribute("data-theme", t); else racine.removeAttribute("data-theme");
  try { if (t === "auto") localStorage.removeItem(CLE); else localStorage.setItem(CLE, t); } catch { /* ignore */ }
}

export const LIBELLES_THEME = { auto: "Automatique", light: "Clair", dark: "Sombre" };
