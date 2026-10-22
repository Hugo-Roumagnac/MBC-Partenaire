// evenements.js — écran « Événements » (§4.7) : liste, création, présences par partenaire.
import { store, ajouter, ecrire, supprimer, getPartner } from "./store.js";
import { ficheHref } from "./router.js";
import { formatDate, escapeHtml, showToast, slugify } from "./utils.js";
import { aujourdhui } from "./dates.js";
import { ouvrirModale, fermerModale } from "./modal.js";

let selectedId = null; // événement affiché à droite
const $ = (id) => document.getElementById(id);
const PRESENCES = ["Oui", "En attente", "Non"];

export function ouvrirNouvelEvenement() {
  const form = $("form-new-event");
  form.reset();
  form.date.value = aujourdhui();
  $("ne-signed-count").textContent = store.partenaires.filter((p) => p.etape === "Signé").length;
  ouvrirModale($("modal-new-event"));
}

export function initEvenements() {
  $("btn-new-event")?.addEventListener("click", ouvrirNouvelEvenement);

  $("form-new-event")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, nom = form.nom.value.trim();
    if (!nom || !form.date.value) { showToast("Nom et date obligatoires", { erreur: true }); return; }
    try {
      const evt = await ajouter("evenements", { id: uniqueEventId(slugify(nom)), nom, date: form.date.value, type: form.type.value || "Autre" });
      if (form.prefill.checked) await inviter(evt.id, store.partenaires.filter((p) => p.etape === "Signé").map((p) => p.id)); // option du §4.7
      selectedId = evt.id;
      fermerModale($("modal-new-event"));
      showToast("Événement créé");
      renderEvenements();
    } catch (err) { console.error(err); showToast("Échec de la création"); }
  });

  $("events-list")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-event-id]");
    if (!item) return;
    e.preventDefault();
    selectedId = item.dataset.eventId;
    renderEvenements();
    if (innerWidth < 1024) $("event-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("btn-delete-event")?.addEventListener("click", onDeleteEvent);
  $("add-guest")?.addEventListener("change", onAddGuest);
  $("event-form")?.addEventListener("change", onEditEvent);
  $("btn-invite-signed")?.addEventListener("click", async () => {
    const evt = selectedEvent(); if (!evt) return;
    const invites = new Set(evt.presences.map((p) => p.partenaireId));
    const ids = store.partenaires.filter((p) => p.etape === "Signé" && !invites.has(p.id)).map((p) => p.id);
    if (!ids.length) { showToast("Tous les partenaires signés sont déjà invités"); return; }
    try { await inviter(evt.id, ids); showToast(`${ids.length} partenaire${ids.length > 1 ? "s" : ""} invité${ids.length > 1 ? "s" : ""}`); }
    catch { showToast("Échec de l'ajout"); }
  });

  // Présences : délégation (les lignes sont recréées à chaque rendu)
  const tbody = $("attendance-tbody");
  tbody?.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-field]"); if (!el) return;
    const id = el.closest("tr")?.dataset.presenceId; if (!id) return;
    const champ = el.dataset.field;
    const valeur = champ === "personnes" ? Math.max(0, Math.floor(Number(el.value) || 0)) : el.value;
    const patch = { [champ]: valeur };
    if (champ === "presence" && valeur === "Oui") { // « Oui » sans nombre → 1 personne par défaut
      const row = store.raw.presences.find((x) => x.id === id);
      if (row && !(Number(row.personnes) > 0)) patch.personnes = 1;
    }
    try { await ecrire("presences", id, patch); showToast("Présence enregistrée"); }
    catch { showToast("Échec de l'enregistrement"); }
  });
  tbody?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-remove-guest]"); if (!b) return;
    try { await supprimer("presences", b.dataset.removeGuest); showToast("Partenaire retiré"); }
    catch { showToast("Échec du retrait"); }
  });
}

const inviter = (evenementId, ids) => Promise.all(ids.map((partenaireId) => ajouter("presences", { evenementId, partenaireId, presence: "En attente", personnes: 0, noms: "" })));

function uniqueEventId(base) {
  let id = `evt-${base}`, n = 2;
  while (store.evenements.some((e) => e.id === id)) id = `evt-${base}-${n++}`;
  return id;
}

function trier() { return [...store.evenements].sort((a, b) => String(b.date).localeCompare(String(a.date))); }

function selectedEvent() {
  if (!store.evenements.length) return null;
  if (!selectedId || !store.evenements.some((e) => e.id === selectedId)) { // par défaut : le prochain à venir, sinon le plus récent
    const jour = aujourdhui();
    const avenir = store.evenements.filter((e) => e.date >= jour).sort((a, b) => a.date.localeCompare(b.date));
    selectedId = (avenir[0] || trier()[0]).id;
  }
  return store.evenements.find((e) => e.id === selectedId) || null;
}

// Présents = entreprises à « Oui » et somme de leurs personnes (§5)
function stats(evt) {
  const p = evt.presences || [];
  const oui = p.filter((x) => x.presence === "Oui");
  return { invites: p.length, entreprises: oui.length, personnes: oui.reduce((s, x) => s + (Number(x.personnes) || 0), 0), attente: p.filter((x) => x.presence === "En attente").length };
}

const MOIS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

export function renderEvenements() {
  const list = $("events-list"), empty = $("events-empty"), detail = $("event-detail");
  const evt = selectedEvent();
  const jour = aujourdhui();

  if (list) list.innerHTML = trier().map((e) => {
    const s = stats(e);
    const [, m, d] = String(e.date || "").split("-");
    return `
      <a class="event-item ${e.id === selectedId ? "event-item--selected" : ""} ${e.date < jour ? "event-item--past" : ""}" href="#" data-event-id="${escapeHtml(e.id)}">
        <span class="event-item__cal"><span class="event-item__cal-m">${MOIS[Number(m) - 1] || "—"}</span><span class="event-item__cal-d">${Number(d) || "?"}</span></span>
        <span class="event-item__body">
          <span class="event-item__name">${escapeHtml(e.nom)}</span>
          <span class="event-item__date">${escapeHtml(e.type)} · ${formatDate(e.date)}</span>
          <span class="table__sub">${s.entreprises} entreprise${s.entreprises > 1 ? "s" : ""} · ${s.personnes} personne${s.personnes > 1 ? "s" : ""} présente${s.personnes > 1 ? "s" : ""}</span>
        </span>
      </a>`;
  }).join("");

  if (empty) empty.hidden = store.evenements.length > 0;
  if (detail) detail.hidden = !evt;
  if (!evt) return;

  $("h-event-detail").textContent = evt.nom;
  const form = $("event-form");
  if (document.activeElement !== form.nom) form.nom.value = evt.nom;
  if (document.activeElement !== form.date) form.date.value = evt.date || "";
  if (document.activeElement !== form.type) form.type.value = evt.type || "Autre";

  const s = stats(evt);
  $("event-stats").innerHTML = [
    ["Entreprises présentes", s.entreprises, "success"], ["Personnes présentes", s.personnes, ""], ["En attente de réponse", `${s.attente} / ${s.invites}`, "info"]
  ].map(([l, v, t]) => `<div class="score__fig kpi ${t ? `score__fig--${t}` : ""}"><span class="kpi__label">${l}</span><span class="kpi__value">${v}</span></div>`).join("");

  renderAttendance(evt);
  fillGuestSelect(evt);
}

function renderAttendance(evt) {
  const tbody = $("attendance-tbody");
  if (!tbody) return;
  if (tbody.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return; // ne pas voler la saisie
  const rows = [...(evt.presences || [])].sort((a, b) => String(getPartner(a.partenaireId)?.nom || "").localeCompare(String(getPartner(b.partenaireId)?.nom || ""), "fr"));
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Aucun partenaire invité. Ajoutez-en ci-dessous.</td></tr>`; return; }
  tbody.innerHTML = rows.map((row) => {
    const p = getPartner(row.partenaireId);
    const name = p ? p.nom : "(fiche supprimée)";
    const ton = row.presence === "Oui" ? "success" : row.presence === "Non" ? "danger" : "warning";
    return `
      <tr data-presence-id="${escapeHtml(row.id)}">
        <td class="td--main">${p ? `<a class="link-fiche" href="${ficheHref(p.id)}">${escapeHtml(name)}</a>` : escapeHtml(name)} <span class="badge badge--${ton}" style="margin-left:4px">${escapeHtml(row.presence)}</span></td>
        <td data-label="Présence"><select class="input--sm" data-field="presence" aria-label="Présence de ${escapeHtml(name)}">${PRESENCES.map((v) => `<option ${v === row.presence ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td data-label="Personnes" class="num"><input class="input--sm" data-field="personnes" type="number" min="0" value="${Number(row.personnes) || 0}" aria-label="Nombre de personnes, ${escapeHtml(name)}" style="max-width:76px"></td>
        <td data-label="Noms"><input class="input--sm" data-field="noms" type="text" value="${escapeHtml(row.noms || "")}" placeholder="Noms des participants" aria-label="Noms, ${escapeHtml(name)}"></td>
        <td><button type="button" class="btn btn--ghost btn--icon btn--small" data-remove-guest="${escapeHtml(row.id)}" aria-label="Retirer ${escapeHtml(name)}" title="Retirer"><svg class="icon icon--sm"><use href="#i-x"/></svg></button></td>
      </tr>`;
  }).join("");
}

function fillGuestSelect(evt) {
  const sel = $("add-guest");
  if (!sel) return;
  const invited = new Set((evt.presences || []).map((p) => p.partenaireId));
  const candidats = store.partenaires.filter((p) => p.etape !== "Archivé" && !invited.has(p.id)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const groupes = [["Signés", candidats.filter((p) => p.etape === "Signé")], ["Autres", candidats.filter((p) => p.etape !== "Signé")]];
  sel.innerHTML = `<option value="">Ajouter un partenaire…</option>` + groupes.filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${g}">${l.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nom)}</option>`).join("")}</optgroup>`).join("");
}

async function onAddGuest(e) {
  const id = e.target.value, evt = selectedEvent();
  if (!id || !evt) return;
  e.target.value = "";
  try { await inviter(evt.id, [id]); showToast("Partenaire ajouté"); }
  catch { showToast("Échec de l'ajout"); }
}

async function onEditEvent(e) {
  const evt = selectedEvent(), champ = e.target.name;
  if (!evt || !champ) return;
  const valeur = e.target.value.trim();
  if ((champ === "nom" || champ === "date") && !valeur) { renderEvenements(); showToast("Ce champ est obligatoire", { erreur: true }); return; }
  try { await ecrire("evenements", evt.id, { [champ]: valeur }); showToast(); }
  catch { showToast("Échec de l'enregistrement"); }
}

// Suppression en deux clics
async function onDeleteEvent(e) {
  const btn = e.currentTarget, label = btn.querySelector("span"), evt = selectedEvent();
  if (!evt) return;
  if (btn.dataset.confirm !== "1") {
    btn.dataset.confirm = "1"; btn.classList.add("is-armed"); label.textContent = "Confirmer la suppression";
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.dataset.confirm = "0"; btn.classList.remove("is-armed"); label.textContent = "Supprimer l'événement"; }, 4000);
    return;
  }
  clearTimeout(btn._t); btn.dataset.confirm = "0"; btn.classList.remove("is-armed"); label.textContent = "Supprimer l'événement";
  try {
    await Promise.all((evt.presences || []).map((p) => supprimer("presences", p.id)));
    await supprimer("evenements", evt.id);
    selectedId = null;
    showToast("Événement supprimé");
  } catch { showToast("Échec de la suppression"); }
}
