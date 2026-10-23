// login.js — page d'accueil = connexion (§4.1). Pas d'inscription libre (§6) : uniquement sur invitation (register.html).
import * as api from "./api.js";
import { CONFIG } from "./config.js";
import { injecterIcones } from "./icons.js";

injecterIcones();

const $ = (id) => document.getElementById(id);
const form = $("login-form");
const APP = "app.html"; // page de l'application, à côté de index.html

// ---------- Messages ----------
function cacherMessages() { ["login-error", "login-info", "login-unauthorized"].forEach((id) => { $(id).hidden = true; }); }
function erreur(txt) { cacherMessages(); $("login-error").textContent = txt; $("login-error").hidden = false; }
function info(txt) { cacherMessages(); $("login-info").textContent = txt; $("login-info").hidden = false; }
function nonAutorise() { cacherMessages(); $("login-unauthorized").hidden = false; }

// ---------- Bouton en cours de chargement ----------
function occupe(bouton, actif, libelle = "Connexion…") {
  if (!bouton) return;
  if (actif) { bouton.dataset.label = bouton.innerHTML; bouton.disabled = true; bouton.innerHTML = `<span class="spinner"></span> ${libelle}`; }
  else { bouton.disabled = false; if (bouton.dataset.label) bouton.innerHTML = bouton.dataset.label; }
}

// ---------- Afficher / masquer le mot de passe ----------
document.querySelectorAll("[data-toggle-password]").forEach((b) => b.addEventListener("click", () => {
  const champ = $(b.dataset.togglePassword);
  const visible = champ.type === "text";
  champ.type = visible ? "password" : "text";
  b.setAttribute("aria-label", visible ? "Afficher le mot de passe" : "Masquer le mot de passe");
  b.querySelector("use").setAttribute("href", visible ? "#i-eye" : "#i-eyeOff");
  champ.focus();
}));

const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- Mode démonstration : liste des membres lue dans les données locales ----------
let membresDemo = [];
async function preparerDemo() {
  const tables = await api.loadAll(); // amorce les données fictives au premier lancement
  membresDemo = (tables.membres || []).map((m) => String(m.email).toLowerCase());
  const saison = tables.reglages?.[0]?.saisonEnCours; if (saison) $("login-season").textContent = saison;
  $("demo-accounts").textContent = membresDemo.join(", ") || "—";
  $("demo-box").hidden = false;
  $("demo-fill").addEventListener("click", () => {
    form.email.value = membresDemo[0] || ""; form.password.value = "demo-2026";
    form.querySelector("button[type=submit]").focus();
  });
  if (sessionStorage.getItem("mbc-user")) location.replace(APP); // déjà connecté dans cet onglet
}

// ---------- Soumission ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  cacherMessages();
  const email = form.email.value.trim().toLowerCase();
  const mdp = form.password.value;
  if (!email || !emailValide(email)) { erreur("Saisissez une adresse e-mail valide."); form.email.focus(); return; }
  if (mdp.length < 8) { erreur("Le mot de passe contient au moins 8 caractères."); form.password.focus(); return; }

  const bouton = $("login-submit");
  occupe(bouton, true);
  try {
    if (CONFIG.MODE !== "supabase") { // ----- démonstration -----
      await new Promise((r) => setTimeout(r, 350)); // petit délai réaliste
      if (!membresDemo.includes(email)) { nonAutorise(); return; }
      sessionStorage.setItem("mbc-user", email);
      location.href = APP;
      return;
    }
    // ----- Supabase -----
    const client = await api.init();
    const { error } = await client.auth.signInWithPassword({ email, password: mdp });
    if (error) { erreur("Identifiants incorrects."); return; } // message générique (anti-énumération)
    const { data: membre } = await client.from("membres").select("email").eq("email", email).maybeSingle(); // le RLS ne renvoie la ligne qu'à un membre
    if (!membre) { await client.auth.signOut(); nonAutorise(); return; }
    location.href = APP;
  } catch (err) {
    console.error(err);
    erreur("Connexion impossible pour le moment. Vérifiez votre connexion internet.");
  } finally {
    occupe(bouton, false);
  }
});

// ---------- Mot de passe oublié ----------
$("forgot-password").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = form.email.value.trim().toLowerCase();
  if (!emailValide(email)) { erreur("Saisissez d'abord votre adresse e-mail, puis cliquez sur « Mot de passe oublié ? »."); form.email.focus(); return; }
  try {
    if (CONFIG.MODE === "supabase") {
      const client = await api.init();
      await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    }
    info("Si ce compte existe, un lien de réinitialisation vient d'être envoyé par e-mail."); // message uniforme (§6)
  } catch { erreur("Envoi impossible pour le moment, réessayez plus tard."); }
});

// ---------- Retour depuis le lien de réinitialisation (Supabase) ----------
async function preparerSupabase() {
  const client = await api.init();
  client.auth.onAuthStateChange((evt) => {
    if (evt === "PASSWORD_RECOVERY") { $("view-login").hidden = true; $("view-recovery").hidden = false; $("recovery-password").focus(); }
  });
  // Déjà connecté (et pas en récupération) → directement dans l'application
  const { data: { session } } = await client.auth.getSession();
  if (session && !location.hash.includes("type=recovery")) location.replace(APP);

  $("recovery-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = $("recovery-password").value, b = $("recovery-confirm").value, err = $("recovery-error");
    err.hidden = true;
    if (a.length < 8) { err.textContent = "8 caractères minimum."; err.hidden = false; return; }
    if (a !== b) { err.textContent = "Les deux mots de passe diffèrent."; err.hidden = false; return; }
    const { error } = await client.auth.updateUser({ password: a });
    if (error) { err.textContent = "Lien expiré : redemandez un lien depuis « Mot de passe oublié ? »."; err.hidden = false; return; }
    location.href = APP;
  });
}

// Message transmis par l'application (ex. après déconnexion ou compte retiré)
const raison = new URLSearchParams(location.search).get("raison");
if (raison === "deconnexion") info("Vous êtes déconnecté.");
if (raison === "non-autorise") nonAutorise();
if (raison === "compte-cree") info("Votre compte est créé. Connectez-vous avec votre adresse e-mail et votre mot de passe.");

if (CONFIG.MODE === "supabase") preparerSupabase().catch((e) => { console.error(e); erreur("Service de connexion indisponible."); });
else preparerDemo().catch((e) => console.error(e));
