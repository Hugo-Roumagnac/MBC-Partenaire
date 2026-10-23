// register.js — création de compte depuis un lien d'invitation (register?token=…).
// 1) vérifie le jeton  2) affiche le formulaire pré-rempli  3) crée le compte  4) connecte et ouvre l'application.
import * as api from "./api.js";
import { CONFIG } from "./config.js";
import { injecterIcones } from "./icons.js";
import { controlerInscription, MESSAGES_JETON } from "./invitations-core.js";

injecterIcones();

const $ = (id) => document.getElementById(id);
const APP = "app.html", ACCUEIL = "index.html";
const CLE_JETON = "mbc-invite-token";
const VUES = ["view-checking", "view-invalid", "view-register"];
const afficher = (vue) => VUES.forEach((v) => { $(v).hidden = v !== vue; });

// Le jeton est retiré de la barre d'adresse (historique, captures d'écran) mais conservé pour l'onglet.
function lireJeton() {
  const p = new URLSearchParams(location.search);
  const t = p.get("token");
  if (t) {
    try { sessionStorage.setItem(CLE_JETON, t); } catch { /* navigation privée */ }
    history.replaceState(null, "", location.pathname);
    return t;
  }
  try { return sessionStorage.getItem(CLE_JETON); } catch { return null; }
}
const oublierJeton = () => { try { sessionStorage.removeItem(CLE_JETON); } catch { /* ignore */ } };

function invalide(code, message) {
  oublierJeton();
  $("invalid-message").textContent = MESSAGES_JETON[code] || message || MESSAGES_JETON.invalide;
  afficher("view-invalid");
  document.title = "Invitation non valide · MBC Partenaires";
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

// ---------- 1) Vérification du jeton ----------
const jeton = lireJeton();
const form = $("register-form");
let emailInvite = "";

async function demarrer() {
  if (!jeton) { invalide("invalide"); return; }
  if (CONFIG.MODE !== "supabase") await api.loadAll(); // mode démo : amorce les données locales si besoin
  const rep = await api.verifierInvitation(jeton);
  if (!rep.ok) { invalide(rep.code, rep.message); return; }
  emailInvite = rep.email;
  $("register-email").value = rep.email;
  afficher("view-register");
  $("register-prenom").focus();
}

// ---------- 2) Création du compte ----------
function erreur(txt, champ) {
  const el = $("register-error");
  el.textContent = txt; el.hidden = false;
  form.querySelectorAll("[aria-invalid]").forEach((c) => c.removeAttribute("aria-invalid"));
  if (champ) { const c = $(`register-${champ}`); c?.setAttribute("aria-invalid", "true"); c?.focus(); }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("register-error").hidden = true;
  const saisie = { prenom: $("register-prenom").value, nom: $("register-nom").value, motDePasse: $("register-password").value, confirmation: $("register-confirm").value };
  const pb = controlerInscription(saisie);
  if (pb) { erreur(pb.message, pb.champ); return; }

  const bouton = $("register-submit"), libelle = bouton.innerHTML;
  bouton.disabled = true; bouton.innerHTML = `<span class="spinner"></span> Création du compte…`;
  try {
    const rep = await api.accepterInvitation({ token: jeton, prenom: saisie.prenom.trim(), nom: saisie.nom.trim(), motDePasse: saisie.motDePasse });
    if (!rep.ok) {
      if (["invalide", "expiree", "utilisee", "revoquee"].includes(rep.code)) { invalide(rep.code, rep.message); return; }
      erreur(rep.message || "Création du compte impossible.", rep.code === "mot-de-passe" ? "password" : null);
      return;
    }
    oublierJeton();
    // ---------- 3) Connexion automatique ----------
    if (CONFIG.MODE === "supabase") {
      const client = await api.init();
      const { error } = await client.auth.signInWithPassword({ email: emailInvite, password: saisie.motDePasse });
      if (error) { location.replace(`${ACCUEIL}?raison=compte-cree`); return; } // compte créé : connexion manuelle
    } else {
      sessionStorage.setItem("mbc-user", emailInvite); // session de démonstration
    }
    location.replace(APP);
  } catch (err) {
    console.error(err);
    erreur("Création impossible pour le moment. Vérifiez votre connexion internet et réessayez.");
  } finally {
    bouton.disabled = false; bouton.innerHTML = libelle;
  }
});

demarrer().catch((e) => { console.error(e); invalide("indisponible", "Service indisponible pour le moment. Réessayez plus tard."); });
