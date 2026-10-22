// auth.js — session, contrôle d'appartenance (table « membres »), menu du compte : mot de passe, thème, déconnexion.
import * as api from "./api.js";
import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { showToast, initiales } from "./utils.js";
import { ouvrirModale, fermerModale } from "./modal.js";
import { themeActuel, appliquerTheme } from "./theme.js";

const ACCUEIL = "index.html"; // la page d'accueil est la page de connexion
const versLogin = (raison = "") => { location.replace(ACCUEIL + (raison ? `?raison=${raison}` : "")); return new Promise(() => {}); }; // ne résout jamais : stoppe le chargement

// Appelé en tout premier par app.js : garantit une session valide ET un membre autorisé.
export async function requireSession() {
  if (CONFIG.MODE !== "supabase") { // mode démonstration : session simulée par login.js
    const email = sessionStorage.getItem("mbc-user");
    if (!email) await versLogin();
    store.utilisateur = { email, nom: email.split("@")[0] }; // complété après chargement des membres (voir completerUtilisateur)
    return;
  }
  const client = await api.init();
  const { data: { session } } = await client.auth.getSession();
  if (!session) await versLogin();
  const email = session.user.email.toLowerCase();
  const { data: membre, error } = await client.from("membres").select("email, nom").eq("email", email).maybeSingle(); // le RLS ne renvoie la ligne qu'à un membre
  if (error || !membre) { await client.auth.signOut(); await versLogin("non-autorise"); } // §4.1 « Compte non autorisé »
  store.utilisateur = { email: membre.email, nom: membre.nom || membre.email };
}

// Mode démo : une fois les données chargées, vérifie l'appartenance et récupère le nom du membre.
export function completerUtilisateur() {
  if (CONFIG.MODE === "supabase") return true;
  const m = store.raw.membres.find((x) => String(x.email).toLowerCase() === store.utilisateur.email);
  if (!m) { sessionStorage.removeItem("mbc-user"); versLogin("non-autorise"); return false; }
  store.utilisateur.nom = m.nom || m.email;
  return true;
}

// Remplit les zones [data-bind] (nom, e-mail, initiales, saison…).
export function majLiaisons() {
  const u = store.utilisateur || {};
  const valeurs = {
    nom: u.nom || u.email || "—",
    prenom: String(u.nom || "").split(" ")[0] || "",
    email: u.email || "—",
    initiales: initiales(u.nom || u.email),
    saison: store.reglages.saisonEnCours || "—",
    "saison-prec": store.reglages.saisonPrecedente || "—"
  };
  document.querySelectorAll("[data-bind]").forEach((el) => { const v = valeurs[el.dataset.bind]; if (v !== undefined && el.textContent !== v) el.textContent = v; });
}

// Menu du compte (popover positionné sous / au-dessus du bouton cliqué).
function initMenu() {
  const menu = document.getElementById("user-menu");
  let declencheur = null;
  const fermer = () => { menu.hidden = true; declencheur?.setAttribute("aria-expanded", "false"); };
  document.querySelectorAll("[data-user-menu]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!menu.hidden && declencheur === b) { fermer(); return; }
    declencheur = b; b.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    const r = b.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    const enBas = r.bottom + h + 8 < innerHeight;
    menu.style.top = `${enBas ? r.bottom + 6 : r.top - h - 6}px`;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + (r.width > 120 ? 0 : r.width - w)))}px`;
    menu.querySelector("button")?.focus();
  }));
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) fermer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { fermer(); declencheur?.focus(); } });
  menu.addEventListener("click", (e) => { if (e.target.closest(".menu__item[role=menuitem]")) fermer(); });

  // Thème clair / automatique / sombre (§7)
  const boutons = menu.querySelectorAll("[data-theme-choice]");
  const majTheme = () => boutons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === themeActuel())));
  boutons.forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); appliquerTheme(b.dataset.themeChoice); majTheme(); }));
  majTheme();
}

// Branche l'en-tête : export, menu du compte, mot de passe, déconnexion.
export function initEnTete({ onExport }) {
  majLiaisons();
  initMenu();
  document.getElementById("btn-export").addEventListener("click", onExport);

  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (CONFIG.MODE === "supabase") await api.getClient().auth.signOut();
    sessionStorage.removeItem("mbc-user");
    location.replace(`${ACCUEIL}?raison=deconnexion`);
  });

  const modale = document.getElementById("modal-password");
  const form = document.getElementById("form-password");
  const erreur = document.getElementById("pw-error");
  document.getElementById("btn-password").addEventListener("click", () => { form.reset(); erreur.hidden = true; ouvrirModale(modale); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = document.getElementById("pw-new").value, b = document.getElementById("pw-confirm").value;
    erreur.hidden = true;
    if (a.length < 8) { erreur.textContent = "8 caractères minimum."; erreur.hidden = false; return; } // §6
    if (a !== b) { erreur.textContent = "Les deux mots de passe diffèrent."; erreur.hidden = false; return; }
    if (CONFIG.MODE === "supabase") {
      const { error } = await api.getClient().auth.updateUser({ password: a });
      if (error) { erreur.textContent = "Changement impossible : reconnectez-vous puis réessayez."; erreur.hidden = false; return; }
    }
    fermerModale(modale); showToast("Mot de passe modifié");
  });
}
