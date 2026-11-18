// evenements.js — écran « Événements » (§4.7) : liste, création, présences par partenaire.
import { store, ajouter, ecrire, supprimer, getPartner } from "./store.js";
import { ficheHref } from "./router.js";
import { formatDate, escapeHtml, showToast, slugify } from "./utils.js";
import { aujourdhui } from "./dates.js";
import { ouvrirModale, fermerModale } from "./modal.js";
import { PRESENCES, PRESENCE_CONTACT, PRESENCE_ATTENTE, emailsInvites, telephonesInvites } from "./selectors.js"; // v5 : « À contacter », « Contacté en attente », « Oui », « Non »
import { ouvrirNouveauContact } from "./contacts.js"; // v2 : fenêtre « Nouveau contact »
import { icon } from "./icons.js"; // v2 : icône du bouton « Ajouter le contact »

let selectedId = null; // événement affiché à droite
const $ = (id) => document.getElementById(id);

// =============================================================================
// v3 — STATUT « Contacter » (remplace « Contact à rajouter »)
// =============================================================================
// Déroulé :
//   1. un membre choisit « Contacter » dans la liste Présence d'un partenaire ;
//   2. le statut est ENREGISTRÉ IMMÉDIATEMENT dans Supabase (écriture optimiste : l'écran change tout de suite,
//      et revient en arrière avec un message si la base refuse) ;
//   3. le temps réel le diffuse aux autres membres, et le statut remonte partout : badge « À contacter » sur
//      les cartes du pipeline, la liste des partenaires (+ filtre) et la fiche, ligne dans « À faire » ;
//   4. le statut disparaît de ces vues dès qu'on choisit un autre statut (ici ou depuis la fiche).
// Le bouton « Ajouter le contact » de la ligne ouvre, si besoin, la fenêtre « Nouveau contact » pré-remplie ;
// il ne change pas le statut.
export function ouvrirContactPresence(presenceId) {
  const row = store.raw.presences.find((x) => x.id === presenceId); // présence concernée
  if (!row) return; // supprimée entre-temps
  const evt = store.evenements.find((e) => e.id === row.evenementId); // son événement
  ouvrirNouveauContact({
    partenaireId: row.partenaireId,
    origine: evt ? `${evt.nom} du ${formatDate(evt.date)}` : "", // affiché dans la fenêtre et dans l'historique
    noms: row.noms || "", // noms notés pour l'événement (aide au pré-remplissage)
    onEnregistre: async (contact) => { // reporte le nom dans « Noms » s'il était vide
      const actuelle = store.raw.presences.find((x) => x.id === presenceId); if (!actuelle) return;
      if (!String(actuelle.noms || "").trim()) { try { await ecrire("presences", presenceId, { noms: contact.nom }); } catch { /* le contact est créé : on n'insiste pas */ } }
    }
  });
}

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

  initCopieEmails(); // v6 : bouton « Copier les e-mails »
  initCopieNumeros(); // v7 : bouton « Copier les numéros »

  // Présences : délégation (les lignes sont recréées à chaque rendu)
  const tbody = $("attendance-tbody");
  tbody?.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-field]"); if (!el) return;
    const id = el.closest("tr")?.dataset.presenceId; if (!id) return;
    const champ = el.dataset.field;
    const valeur = champ === "personnes" ? Math.max(0, Math.floor(Number(el.value) || 0)) : champ === "noms" ? el.value.replace(/\s*\n+\s*/g, " ").trim() : el.value; // v7 : noms sur une ligne (collage multi-lignes)
    if (champ === "noms") { el.value = valeur; el.title = valeur; ajusterHauteur(el); }
    const patch = { [champ]: valeur };
    if (champ === "presence" && valeur === "Oui") { // « Oui » sans nombre → 1 personne par défaut
      const row = store.raw.presences.find((x) => x.id === id);
      if (row && !(Number(row.personnes) > 0)) patch.personnes = 1;
    }
    try { await ecrire("presences", id, patch); showToast(champ === "presence" && valeur === PRESENCE_CONTACT ? "Statut « À contacter » enregistré : visible sur la fiche et dans le pipeline" : "Présence enregistrée"); } // v3 : sauvegarde immédiate
    catch (err) { console.error(err); showToast("Échec de l'enregistrement", { erreur: true }); }
  });
  // v7 — Noms des participants : hauteur ajustée pendant la saisie, Entrée valide (pas de saut de ligne enregistré)
  tbody?.addEventListener("input", (e) => { if (e.target.matches("textarea[data-field='noms']")) ajusterHauteur(e.target); });
  tbody?.addEventListener("focusin", (e) => { if (e.target.matches("textarea[data-field='noms']")) ajusterHauteur(e.target); });
  tbody?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.target.matches("textarea[data-field='noms']")) { e.preventDefault(); e.target.blur(); }
  });
  let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => ajusterNoms(), 120); });
  tbody?.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-contact-presence]"); // fenêtre « Nouveau contact » (facultatif)
    if (c) { ouvrirContactPresence(c.dataset.contactPresence); return; }
    const b = e.target.closest("[data-remove-guest]"); if (!b) return;
    try { await supprimer("presences", b.dataset.removeGuest); showToast("Partenaire retiré"); }
    catch { showToast("Échec du retrait"); }
  });
}

const inviter = (evenementId, ids) => Promise.all(ids.map((partenaireId) => ajouter("presences", { evenementId, partenaireId, presence: PRESENCE_ATTENTE, personnes: 0, noms: "" })));

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
  return { invites: p.length, entreprises: oui.length, personnes: oui.reduce((s, x) => s + (Number(x.personnes) || 0), 0), attente: p.filter((x) => x.presence === PRESENCE_ATTENTE).length, contacts: p.filter((x) => x.presence === PRESENCE_CONTACT).length }; // v3 : partenaires à contacter
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
    ["Entreprises présentes", s.entreprises, "success"], ["Personnes présentes", s.personnes, ""], ["En attente de réponse", `${s.attente} / ${s.invites}`, "info"],
    ...(s.contacts ? [["À contacter", s.contacts, "info"]] : []) // v3 : visible seulement s'il y en a
  ].map(([l, v, t]) => `<div class="score__fig kpi ${t ? `score__fig--${t}` : ""}"><span class="kpi__label">${l}</span><span class="kpi__value">${v}</span></div>`).join("");

  renderAttendance(evt);
  fillGuestSelect(evt);
}

function renderAttendance(evt) {
  const tbody = $("attendance-tbody");
  if (!tbody) return;
  if (tbody.contains(document.activeElement) && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return; // ne pas voler la saisie
  const rows = [...(evt.presences || [])].sort((a, b) => String(getPartner(a.partenaireId)?.nom || "").localeCompare(String(getPartner(b.partenaireId)?.nom || ""), "fr"));
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Aucun partenaire invité. Ajoutez-en ci-dessous.</td></tr>`; return; }
  tbody.innerHTML = rows.map((row) => {
    const p = getPartner(row.partenaireId);
    const name = p ? p.nom : "(fiche supprimée)";
    const ton = row.presence === "Oui" ? "success" : row.presence === "Non" ? "danger" : row.presence === PRESENCE_CONTACT ? "info" : "warning"; // v5 : bleu « À contacter », orange « Contacté en attente »
    return `
      <tr data-presence-id="${escapeHtml(row.id)}">
        <td class="td--main">${p ? `<a class="link-fiche" href="${ficheHref(p.id)}">${escapeHtml(name)}</a>` : escapeHtml(name)} <span class="badge badge--${ton}" style="margin-left:4px">${escapeHtml(row.presence)}</span>${row.presence === PRESENCE_CONTACT && p ? ` <button type="button" class="btn btn--small btn--ghost" data-contact-presence="${escapeHtml(row.id)}">${icon("plus", "icon--sm")}Ajouter le contact</button>` : ""}</td>
        <td data-label="Présence"><select class="input--sm" data-field="presence" aria-label="Présence de ${escapeHtml(name)}">${PRESENCES.map((v) => `<option ${v === row.presence ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td data-label="Personnes" class="num"><input class="input--sm" data-field="personnes" type="number" min="0" value="${Number(row.personnes) || 0}" aria-label="Nombre de personnes, ${escapeHtml(name)}" style="max-width:76px"></td>
        <td data-label="Noms" class="td--noms"><textarea class="input--sm noms-participants" data-field="noms" rows="1" placeholder="Noms des participants" aria-label="Noms des participants, ${escapeHtml(name)}"${row.noms ? ` title="${escapeHtml(row.noms)}"` : ""}>${escapeHtml(row.noms || "")}</textarea></td>
        <td class="td--retirer"><button type="button" class="btn btn--ghost btn--icon btn--small" data-remove-guest="${escapeHtml(row.id)}" aria-label="Retirer ${escapeHtml(name)}" title="Retirer"><svg class="icon icon--sm"><use href="#i-x"/></svg></button></td>
      </tr>`;
  }).join("");
  ajusterNoms(tbody);
}

// v7 — « Noms des participants » : zone de texte qui s'agrandit avec son contenu (retour à la ligne automatique),
// pour que tous les noms restent lisibles. CSS `field-sizing: content` quand le navigateur le gère, sinon calcul ici.
const FIELD_SIZING = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
function ajusterHauteur(t) {
  if (FIELD_SIZING || !t || !t.offsetParent) return; // écran masqué : on refera le calcul à l'affichage / au focus
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + (t.offsetHeight - t.clientHeight)}px`;
}
function ajusterNoms(racine = $("attendance-tbody")) {
  racine?.querySelectorAll("textarea[data-field='noms']").forEach(ajusterHauteur);
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

// =============================================================================
// v6 — « COPIER LES E-MAILS » / v7 — « COPIER LES NUMÉROS » : coordonnées des contacts des partenaires invités
// =============================================================================
// Déroulé : le bouton ouvre une fenêtre → on choisit qui (tous / « Oui » / sans réponse) et le séparateur
// → l'aperçu se met à jour → « Copier » place la liste dans le presse-papiers et affiche un message de confirmation.
// Les partenaires invités sans coordonnée exploitable sont listés pour être complétés.
// Les deux fenêtres partagent la même logique (initCopieListe) : seuls la source des données et les libellés changent.
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

function initCopieEmails() {
  initCopieListe({
    bouton: "btn-copy-emails", modal: "modal-emails", form: "form-emails", prefixe: "emails", sepDefaut: "; ",
    calcul: (evt, cle) => { const r = emailsInvites(evt, store.partenaires, cle); return { valeurs: r.adresses, manquants: r.sansEmail, partenaires: r.partenaires }; },
    libelleBouton: (n) => n ? `Copier ${pluriel(n, "adresse")}` : "Aucune adresse à copier",
    alerte: (noms) => `Sans adresse e-mail (${noms.length}) : ${noms.join(", ")}. Ajoutez un contact dans leur fiche.`,
    toast: (n) => `${pluriel(n, "adresse")} e-mail copiée${n > 1 ? "s" : ""}`
  });
}

// v7 — séparateurs des numéros : la valeur des boutons radio est une clé (un retour à la ligne ne passe pas bien dans un attribut HTML)
const SEPARATEURS_NUMEROS = { virgule: ", ", "point-virgule": "; ", ligne: "\n" };
function initCopieNumeros() {
  initCopieListe({
    bouton: "btn-copy-phones", modal: "modal-phones", form: "form-phones", prefixe: "phones", sepDefaut: ", ", separateurs: SEPARATEURS_NUMEROS,
    calcul: (evt, cle) => { const r = telephonesInvites(evt, store.partenaires, cle); return { valeurs: r.numeros, manquants: r.sansTel, partenaires: r.partenaires }; },
    libelleBouton: (n) => n ? `Copier ${pluriel(n, "numéro")}` : "Aucun numéro à copier",
    alerte: (noms) => `Sans numéro de téléphone (${noms.length}) : ${noms.join(", ")}. Ajoutez un contact dans leur fiche.`,
    toast: (n) => `${pluriel(n, "numéro")} de téléphone copié${n > 1 ? "s" : ""}`
  });
}

// Fenêtre générique « Copier … » : ids `${prefixe}-evenement`, `-apercu`, `-count`, `-copier`, `-manquants`.
function initCopieListe(c) {
  const modal = $(c.modal), form = $(c.form);
  if (!modal || !form) return;
  const el = (suffixe) => $(`${c.prefixe}-${suffixe}`);
  const separateur = () => { const v = form.sep.value; return c.separateurs ? (c.separateurs[v] ?? c.sepDefaut) : (v || c.sepDefaut); };
  const majApercu = () => {
    const evt = selectedEvent(); if (!evt) return;
    const qui = form.qui.value || "tous";
    for (const cle of ["tous", "oui", "attente"]) { const n = form.querySelector(`[data-n="${cle}"]`); if (n) n.textContent = `(${c.calcul(evt, cle).partenaires})`; }
    const r = c.calcul(evt, qui);
    el("apercu").value = r.valeurs.join(separateur());
    el("count").textContent = String(r.valeurs.length);
    const bouton = el("copier"); bouton.disabled = !r.valeurs.length;
    bouton.querySelector("span").textContent = c.libelleBouton(r.valeurs.length);
    const manque = el("manquants");
    manque.hidden = !r.manquants.length;
    manque.textContent = r.manquants.length ? c.alerte(r.manquants) : "";
  };
  $(c.bouton)?.addEventListener("click", () => {
    const evt = selectedEvent(); if (!evt) return;
    if (!(evt.presences || []).length) { showToast("Aucun partenaire invité à cet événement"); return; }
    el("evenement").textContent = `${evt.nom} · ${formatDate(evt.date)}`;
    form.qui.value = "tous";
    majApercu();
    ouvrirModale(modal);
  });
  form.addEventListener("change", majApercu);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = el("apercu").value, n = Number(el("count").textContent) || 0;
    if (!n) return;
    if (await copier(texte, el("apercu"))) { fermerModale(modal); showToast(c.toast(n)); }
    else showToast("Copie impossible : sélectionnez le texte et copiez-le à la main", { erreur: true });
  });
}

// Presse-papiers : API moderne, sinon sélection + commande « copier » (anciens navigateurs, contexte non sécurisé).
async function copier(texte, champ) {
  try { await navigator.clipboard.writeText(texte); return true; } catch { /* repli ci-dessous */ }
  try { champ.focus(); champ.select(); return document.execCommand("copy"); } catch { return false; }
}
