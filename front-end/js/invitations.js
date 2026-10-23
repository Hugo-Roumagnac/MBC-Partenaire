// invitations.js — fenêtre « Inviter un membre » : envoi d'une invitation par e-mail et suivi des invitations.
import * as api from "./api.js";
import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { ouvrirModale } from "./modal.js";
import { showToast, escapeHtml } from "./utils.js";
import { normaliserEmail, controlerEmailInvite, statutEffectif, LIBELLES_STATUT } from "./invitations-core.js";

const $ = (id) => document.getElementById(id);
const dateCourte = (iso) => (iso ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

export function initInvitations() {
  const modale = $("modal-invite"), form = $("form-invite"), champ = $("invite-email"), bouton = $("invite-submit");
  if (!modale) return;

  const masquerMessages = () => { $("invite-error").hidden = true; $("invite-success").hidden = true; $("invite-demo").hidden = true; champ.removeAttribute("aria-invalid"); };
  const erreur = (txt) => { masquerMessages(); $("invite-error").textContent = txt; $("invite-error").hidden = false; champ.setAttribute("aria-invalid", "true"); champ.focus(); };

  $("btn-invite").addEventListener("click", () => { form.reset(); masquerMessages(); ouvrirModale(modale); rafraichirListe(); });

  async function envoyer(email) {
    masquerMessages();
    const msg = controlerEmailInvite(email, store.raw.membres.map((m) => m.email)); // contrôle immédiat (re-vérifié côté serveur)
    if (msg) { erreur(msg); return; }
    bouton.disabled = true; const libelle = bouton.innerHTML; bouton.innerHTML = `<span class="spinner"></span> Envoi…`;
    try {
      const rep = await api.envoyerInvitation(email, store.utilisateur?.email);
      if (!rep.ok) { erreur(rep.message || "Envoi impossible."); return; }
      form.reset();
      $("invite-success").textContent = CONFIG.MODE === "supabase" ? `Invitation envoyée à ${email}.` : `Invitation créée pour ${email}.`;
      $("invite-success").hidden = false;
      if (rep.lien) { $("invite-demo-link").value = rep.lien; $("invite-open").href = rep.lien; $("invite-demo").hidden = false; }
      showToast("Invitation envoyée");
      rafraichirListe();
    } catch (e) {
      console.error(e); erreur("Envoi impossible pour le moment. Vérifiez votre connexion et réessayez.");
    } finally {
      bouton.disabled = false; bouton.innerHTML = libelle;
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); envoyer(normaliserEmail(champ.value)); });
  champ.addEventListener("input", () => { if (!$("invite-error").hidden) masquerMessages(); });

  $("invite-copy").addEventListener("click", async () => {
    const lien = $("invite-demo-link");
    try { await navigator.clipboard.writeText(lien.value); } catch { lien.select(); document.execCommand?.("copy"); }
    showToast("Lien copié");
  });

  // « Renvoyer » depuis la liste (invitation en attente ou expirée)
  $("invite-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-renvoyer]");
    if (b) { champ.value = b.dataset.renvoyer; envoyer(b.dataset.renvoyer); }
  });
}

async function rafraichirListe() {
  const corps = $("invite-list");
  try {
    const liste = await api.listerInvitations();
    if (!liste.length) { corps.innerHTML = `<tr><td colspan="4" class="empty-cell">Aucune invitation pour le moment.</td></tr>`; return; }
    const maintenant = new Date();
    corps.innerHTML = liste.map((i) => {
      const statut = statutEffectif(i, maintenant);
      const { libelle, ton } = LIBELLES_STATUT[statut] || { libelle: statut, ton: "neutral" };
      const echeance = statut === "accepted" ? `Acceptée le ${dateCourte(i.accepteLe)}` : statut === "pending" ? `Expire le ${dateCourte(i.expireLe)}` : statut === "expired" ? `Expirée le ${dateCourte(i.expireLe)}` : "—";
      const action = statut === "pending" || statut === "expired"
        ? `<button type="button" class="btn btn--ghost btn--small" data-renvoyer="${escapeHtml(i.email)}">Renvoyer</button>` : "";
      return `<tr>
        <td><span class="invite-list__email">${escapeHtml(i.email)}</span>${i.invitePar ? `<span class="table__sub">par ${escapeHtml(i.invitePar)}</span>` : ""}</td>
        <td><span class="badge ${ton === "neutral" ? "" : `badge--${ton}`}">${libelle}</span></td>
        <td class="muted">${echeance}</td>
        <td class="num">${action}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error(e);
    corps.innerHTML = `<tr><td colspan="4" class="empty-cell">Liste indisponible pour le moment.</td></tr>`;
  }
}
