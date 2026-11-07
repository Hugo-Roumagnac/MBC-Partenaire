// documents.js — v3 : documents d'un partenaire dans la fiche › Informations.
// Deux emplacements : « Convention » (convention signée) et « Autres documents » (factures, RIB, justificatifs…).
//
// Fonctionnement :
//   1. on DÉPOSE un ou plusieurs fichiers sur un emplacement (glisser-déposer) ou on clique « Parcourir » ;
//   2. chaque fichier est vérifié (type, poids), puis envoyé dans le bucket PRIVÉ Supabase « documents »
//      (<id-partenaire>/<categorie>/<horodatage>-<nom>) ;
//   3. une ligne est créée dans public.documents → le temps réel la montre aux autres membres ;
//   4. « Ouvrir » / « Télécharger » demandent une adresse signée valable 2 minutes (le fichier n'est jamais public) ;
//   5. « Supprimer » (deux clics) retire la ligne puis le fichier.
// Les étapes 2 à 5 sont dans api.js (stockage) et store.js (ajouterDocument / supprimerDocument).
import { store, ajouterDocument, supprimerDocument, CATEGORIES_DOCUMENTS } from "./store.js";
import { adresseDocument, DOCUMENT_MAX_OCTETS, DOCUMENT_MAX_OCTETS_MOCK } from "./api.js";
import { CONFIG } from "./config.js";
import { escapeHtml, formatDate, showToast } from "./utils.js";
import { icon } from "./icons.js";

const $ = (id) => document.getElementById(id);
let partenaireCourant = null; // id de la fiche affichée (renseigné à chaque rendu)
const envois = { convention: 0, autre: 0 }; // fichiers en cours d'envoi par emplacement
let suppressionArmee = null; // id du document dont la suppression attend sa confirmation

// Types acceptés (identiques à allowed_mime_types du bucket). Certains systèmes ne donnent pas le type
// d'un fichier : on le déduit alors de l'extension.
const TYPES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain", csv: "text/csv"
};
const MIMES = new Set(Object.values(TYPES));
export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
const maxOctets = () => (CONFIG.MODE === "supabase" ? DOCUMENT_MAX_OCTETS : DOCUMENT_MAX_OCTETS_MOCK);

export const tailleLisible = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

// Renvoie un File au bon type MIME, ou un message d'erreur (chaîne).
export function preparerFichier(f) {
  const ext = String(f.name || "").split(".").pop().toLowerCase();
  const type = MIMES.has(f.type) ? f.type : TYPES[ext];
  if (!type) return `« ${f.name} » : format non accepté (PDF, image, Word, Excel, OpenDocument, texte)`;
  if (f.size > maxOctets()) return `« ${f.name} » : ${tailleLisible(f.size)}, maximum ${tailleLisible(maxOctets())}`;
  if (!f.size) return `« ${f.name} » : fichier vide`;
  return f.type === type ? f : new File([f], f.name, { type, lastModified: f.lastModified });
}

export function initDocuments() {
  const zone = $("fiche-documents"), overlay = $("fiche-partenaire");
  if (!zone) return;

  // Un fichier lâché à côté d'un emplacement ne doit pas remplacer la page par le fichier.
  overlay.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
  overlay.addEventListener("drop", (e) => { if (!e.target.closest("[data-doc-drop], #fiche-logo")) e.preventDefault(); });

  zone.addEventListener("dragover", (e) => {
    const cible = e.target.closest("[data-doc-drop]");
    if (!cible || ![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    cible.classList.add("doczone--drop");
  });
  zone.addEventListener("dragleave", (e) => {
    const cible = e.target.closest("[data-doc-drop]");
    if (cible && !cible.contains(e.relatedTarget)) cible.classList.remove("doczone--drop");
  });
  zone.addEventListener("drop", (e) => {
    const cible = e.target.closest("[data-doc-drop]"); if (!cible) return;
    e.preventDefault(); cible.classList.remove("doczone--drop");
    envoyer(cible.dataset.docDrop, [...(e.dataTransfer?.files || [])]);
  });
  // Les champs « fichier » sont créés UNE fois, hors de la zone redessinée : un rendu (ex. modification d'un
  // autre membre) pendant que la fenêtre « Parcourir » est ouverte ne doit pas faire perdre le fichier choisi.
  for (const cat of Object.keys(CATEGORIES_DOCUMENTS)) {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ACCEPT, multiple: true, hidden: true });
    input.dataset.docInput = cat;
    input.addEventListener("change", () => { const fichiers = [...(input.files || [])]; input.value = ""; envoyer(cat, fichiers); }); // vider : re-choisir le même fichier redéclenche « change »
    zone.after(input);
  }
  zone.addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc-action]"); if (!b) return;
    e.preventDefault();
    const { docAction: action, id, categorie } = b.dataset;
    if (action === "parcourir") { choisir(categorie); return; }
    const doc = store.raw.documents.find((d) => d.id === id); if (!doc) return;
    if (action === "ouvrir") ouvrir(doc, false);
    else if (action === "telecharger") ouvrir(doc, true);
    else if (action === "supprimer") supprimer(doc, b);
  });
  // Clavier : Entrée / Espace sur un emplacement = « Parcourir »
  zone.addEventListener("keydown", (e) => {
    const cible = e.target.closest("[data-doc-drop]");
    if (cible && e.target === cible && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(cible.dataset.docDrop); }
  });
}

const choisir = (categorie) => document.querySelector(`input[data-doc-input="${categorie}"]`)?.click(); // ouvre « Parcourir »

async function envoyer(categorie, fichiers) {
  const id = partenaireCourant;
  if (!id || !fichiers.length || !CATEGORIES_DOCUMENTS[categorie]) return;
  const prets = [], erreurs = [];
  for (const f of fichiers) { const r = preparerFichier(f); (typeof r === "string" ? erreurs : prets).push(r); }
  if (erreurs.length) showToast(erreurs.join(" · "), { erreur: true });
  if (!prets.length) return;
  envois[categorie] += prets.length; rendreSiOuverte(id);
  let ok = 0;
  for (const f of prets) { // un par un : messages clairs et pas de saturation réseau
    try { await ajouterDocument(id, categorie, f); ok++; }
    catch (err) { console.error(err); showToast(`Échec de l'envoi de « ${f.name} »${err?.message ? ` : ${err.message}` : ""}`, { erreur: true }); }
    finally { envois[categorie]--; rendreSiOuverte(id); }
  }
  if (ok) showToast(ok > 1 ? `${ok} documents enregistrés` : categorie === "convention" ? "Convention enregistrée" : "Document enregistré");
}

async function ouvrir(doc, telecharger) {
  // La fenêtre est ouverte TOUT DE SUITE (dans le clic), sinon le navigateur la bloquerait après l'attente réseau.
  const fenetre = !telecharger && CONFIG.MODE === "supabase" ? window.open("", "_blank") : null;
  try {
    const url = await adresseDocument(doc, { telecharger });
    if (!url) throw new Error("fichier introuvable");
    if (fenetre) { fenetre.opener = null; fenetre.location.href = url; return; }
    const a = document.createElement("a"); // téléchargement (et ouverture en mode démo : un « data: » ne s'ouvre pas dans un onglet)
    a.href = url; a.download = doc.nom; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
  } catch (err) { fenetre?.close(); console.error(err); showToast(`Impossible d'ouvrir le document${err?.message ? ` : ${err.message}` : ""}`, { erreur: true }); }
}

async function supprimer(doc, bouton) {
  if (suppressionArmee !== doc.id) { // 1er clic : on arme pendant 4 s
    suppressionArmee = doc.id; bouton.classList.add("is-armed"); bouton.title = "Cliquer de nouveau pour confirmer"; bouton.setAttribute("aria-label", `Confirmer la suppression de ${doc.nom}`);
    setTimeout(() => { if (suppressionArmee === doc.id) { suppressionArmee = null; rendreSiOuverte(doc.partenaireId); } }, 4000);
    return;
  }
  suppressionArmee = null;
  try { await supprimerDocument(doc.id); showToast("Document supprimé"); }
  catch (err) { console.error(err); showToast("Échec de la suppression", { erreur: true }); }
}

function rendreSiOuverte(id) { if (id === partenaireCourant) { const v = store.partenaires.find((p) => p.id === id); if (v) renderDocuments(v); } }

// ---------- Rendu (appelé par fiche.renderFiche à chaque changement) ----------
export function renderDocuments(v) {
  const zone = $("fiche-documents"); if (!zone || !v) return;
  if (partenaireCourant !== v.id) suppressionArmee = null;
  partenaireCourant = v.id;
  const html = Object.entries(CATEGORIES_DOCUMENTS).map(([cat, titre]) => blocHtml(cat, titre, v.documents.filter((d) => d.categorie === cat))).join("");
  if (zone.innerHTML !== html) zone.innerHTML = html; // évite de recréer les boutons à chaque rendu identique
  const compte = $("count-documents"); if (compte) compte.textContent = v.documents.length ? `${v.documents.length} document${v.documents.length > 1 ? "s" : ""}` : "";
}

const ICONE_TYPE = (d) => (d.typeMime === "application/pdf" ? "PDF" : String(d.typeMime).startsWith("image/") ? "IMG" : /sheet|excel|csv/.test(d.typeMime) ? "XLS" : /word|text/.test(d.typeMime) ? "DOC" : "FIC");

function blocHtml(cat, titre, docs) {
  const enCours = envois[cat];
  const aide = cat === "convention" ? "Convention signée du partenaire (PDF de préférence)" : "Factures, RIB, justificatifs, attestations…";
  return `<section class="doczone doczone--${cat}" aria-label="${escapeHtml(titre)}">
    <header class="doczone__head">
      <span class="doczone__title">${icon(cat === "convention" ? "file" : "folder", "icon--sm")}${escapeHtml(titre)}</span>
      ${cat === "convention" ? (docs.length ? '<span class="badge badge--success">Reçue</span>' : '<span class="badge badge--warning">Manquante</span>') : docs.length ? `<span class="section__count">${docs.length}</span>` : ""}
    </header>
    <div class="doczone__drop ${enCours ? "is-busy" : ""}" data-doc-drop="${cat}" tabindex="0" role="button" aria-label="Déposer un fichier dans ${escapeHtml(titre)}, ou appuyer sur Entrée pour parcourir">
      ${icon("upload")}
      <span class="doczone__drop-text">${enCours ? `Envoi en cours… (${enCours})` : `Glissez-déposez ${cat === "convention" ? "la convention" : "vos fichiers"} ici`}</span>
      <span class="doczone__drop-or">ou <button type="button" class="btn btn--small" data-doc-action="parcourir" data-categorie="${cat}">Parcourir</button></span>
      <span class="field__hint">${escapeHtml(aide)} · ${tailleLisible(maxOctets())} max</span>
    </div>
    ${docs.length ? `<ul class="doclist">${docs.map(ligneHtml).join("")}</ul>` : ""}
  </section>`;
}

const ligneHtml = (d) => `<li class="doclist__item">
  <span class="doclist__type" aria-hidden="true">${ICONE_TYPE(d)}</span>
  <span class="doclist__body">
    <button type="button" class="doclist__name" data-doc-action="ouvrir" data-id="${escapeHtml(d.id)}" title="Ouvrir ${escapeHtml(d.nom)}">${escapeHtml(d.nom)}</button>
    <span class="doclist__meta">${tailleLisible(Number(d.taille) || 0)} · ${d.creeLe ? formatDate(String(d.creeLe).slice(0, 10)) : "—"}${d.ajoutePar ? ` · ${escapeHtml(d.ajoutePar)}` : ""}${d.saison ? ` · saison ${escapeHtml(d.saison)}` : ""}</span>
  </span>
  <span class="doclist__actions">
    <button type="button" class="btn btn--ghost btn--icon btn--small" data-doc-action="telecharger" data-id="${escapeHtml(d.id)}" aria-label="Télécharger ${escapeHtml(d.nom)}" title="Télécharger">${icon("download", "icon--sm")}</button>
    <button type="button" class="btn btn--ghost btn--icon btn--small ${suppressionArmee === d.id ? "is-armed" : ""}" data-doc-action="supprimer" data-id="${escapeHtml(d.id)}" aria-label="${suppressionArmee === d.id ? "Confirmer la suppression de" : "Supprimer"} ${escapeHtml(d.nom)}" title="${suppressionArmee === d.id ? "Cliquer de nouveau pour confirmer" : "Supprimer (deux clics)"}">${icon("trash", "icon--sm")}</button>
  </span>
</li>`;
