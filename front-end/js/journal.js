// journal.js — v2 : écran « Journal » (qui modifie quoi, depuis quel compte) + bloc « Journal » de la fiche.
//
// ARCHITECTURE RETENUE : « journal générique avant / après » (voir README-front.md § « Historique & audit »)
//   • UNE table journal, alimentée automatiquement par un trigger PostgreSQL sur toutes les tables
//     métier (supabase/schema.sql §2 bis) — en mode mock, api.js reproduit le même comportement ;
//   • chaque entrée = QUAND (le), QUI (email + nom), DEPUIS OÙ (appareil), QUOI (table, ligne, fiche),
//     et le DÉTAIL (valeurs avant / après des seuls champs modifiés) ;
//   • ce seul format alimente les trois usages : journal global filtrable (cet écran), historique
//     d'une fiche (bloc dans la fiche) et restauration (« historique réversible », store.restaurer).
import { store, restaurer, restaurable } from "./store.js"; // état + restauration
import { resumerAppareil, formaterSiret } from "./selectors.js"; // règles pures
import { ecartJours, aujourdhui } from "./dates.js"; // dates
import { formatEuro, formatDate, escapeHtml, showToast } from "./utils.js"; // affichage
import { ficheHref } from "./router.js"; // liens vers les fiches
import { icon } from "./icons.js"; // icônes

const $ = (id) => document.getElementById(id); // raccourci

// ---------- Libellés lisibles ----------
export const LIBELLES_TABLES = { partenaires: "Fiche", contrats: "Contrat", echeances: "Échéance", contreparties: "Contrepartie", contacts: "Contact", echanges: "Historique", evenements: "Événement", presences: "Présence", reglages: "Réglages" };
const LIBELLES_ACTIONS = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" };
const TONS_ACTIONS = { INSERT: "success", UPDATE: "info", DELETE: "danger" };
const LIBELLES_CHAMPS = {
  nom: "Nom", secteur: "Secteur", etape: "Étape", type: "Type", responsable: "Responsable", notes: "Notes", siret: "SIRET", logo: "Logo",
  prochaineActionDate: "Prochaine action (date)", prochaineActionTexte: "Prochaine action", premierContact: "Premier contact",
  montantDemande: "Montant demandé", cotisationDemandee: "Cotisation demandée", montantValide: "Montant validé", cotisationValidee: "Cotisation validée",
  dontMecenat: "Dont mécénat", cerfaEmis: "CERFA émis", natureValeur: "Apport en nature", natureDescription: "Description de l'apport", modalites: "Modalités",
  datePrevue: "Date prévue", montant: "Montant", paye: "Payé", note: "Note", libelle: "Libellé", livree: "Livrée", fonction: "Fonction", email: "E-mail", tel: "Téléphone",
  presence: "Présence", personnes: "Personnes", noms: "Noms", categorie: "Catégorie", date: "Date", texte: "Texte", objectif: "Objectif",
  saisonEnCours: "Saison en cours", saisonPrecedente: "Saison précédente", responsables: "Responsables", catalogue: "Catalogue", categories: "Catégories d'affectation", saison: "Saison"
};
const CHAMPS_MONTANTS = new Set(["montantDemande", "cotisationDemandee", "montantValide", "cotisationValidee", "dontMecenat", "natureValeur", "montant", "objectif"]); // affichés en euros
const CHAMPS_DATES = new Set(["prochaineActionDate", "premierContact", "datePrevue", "date"]); // affichés JJ/MM/AAAA

// Formate UNE valeur pour l'affichage dans le journal.
function valeur(champ, v) {
  if (v === null || v === undefined || v === "") return '<span class="faint">vide</span>';
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (champ === "logo") return v === "-" ? "aucun (automatique désactivé)" : String(v).startsWith("http") || String(v).startsWith("data:") ? "nouvelle image" : escapeHtml(String(v));
  if (CHAMPS_MONTANTS.has(champ)) return formatEuro(v);
  if (CHAMPS_DATES.has(champ)) return formatDate(String(v).slice(0, 10));
  if (champ === "siret") return escapeHtml(formaterSiret(v));
  if (Array.isArray(v)) return escapeHtml(v.join(", ")) || '<span class="faint">vide</span>';
  const t = String(v); return escapeHtml(t.length > 90 ? `${t.slice(0, 90)}…` : t); // textes longs tronqués
}

// Nom de la fiche concernée : depuis le store, sinon depuis l'entrée elle-même (fiche supprimée).
function nomFiche(e) {
  if (!e.partenaireId) return "";
  const p = store.partenaires.find((x) => x.id === e.partenaireId); // fiche existante ?
  if (p) return p.nom;
  const archive = store.journal.find((j) => j.tableNom === "partenaires" && j.ligneId === e.partenaireId && (j.avant?.nom || j.apres?.nom)); // dernier nom connu
  return archive?.avant?.nom || archive?.apres?.nom || e.partenaireId;
}

// Petit résumé de l'élément touché (ex. « Contact : Jean Dupont », « Échéance du 15/10/2026 »).
function sousObjet(e) {
  const l = e.apres || e.avant || {}; // données disponibles
  const ligne = store.raw[e.tableNom]?.find((x) => String(x.id) === String(e.ligneId)) || {}; // ligne actuelle (UPDATE : avant/après ne contiennent que les champs modifiés)
  const d = { ...ligne, ...l }; // fusion
  switch (e.tableNom) {
    case "contacts": return d.nom || "(sans nom)";
    case "echeances": return [d.datePrevue ? formatDate(d.datePrevue) : "", d.montant != null ? formatEuro(d.montant) : ""].filter(Boolean).join(" · ");
    case "contreparties": return d.libelle || "";
    case "contrats": return d.saison ? `saison ${d.saison}` : "";
    case "echanges": return d.texte ? `« ${String(d.texte).slice(0, 60)} »` : "";
    case "evenements": return d.nom || "";
    case "presences": return store.evenements.find((x) => x.id === d.evenementId)?.nom || "";
    default: return "";
  }
}

// Détail des changements : « Étape : Prospect → Contacté » (UPDATE) ou les champs principaux (INSERT/DELETE).
function detail(e) {
  if (e.action === "UPDATE") return (e.champs || Object.keys(e.apres || {})).map((c) => `<span class="jdiff"><span class="jdiff__champ">${escapeHtml(LIBELLES_CHAMPS[c] || c)}</span> ${valeur(c, e.avant?.[c])} <span class="jdiff__fleche" aria-label="devient">→</span> ${valeur(c, e.apres?.[c])}</span>`).join("");
  const l = e.apres || e.avant || {}; // ligne complète
  const cles = ["nom", "etape", "libelle", "categorie", "montant", "datePrevue", "presence", "fonction", "email", "texte", "montantValide"].filter((c) => l[c] !== undefined && l[c] !== "" && l[c] !== null).slice(0, 3); // 3 champs parlants
  return cles.map((c) => `<span class="jdiff"><span class="jdiff__champ">${escapeHtml(LIBELLES_CHAMPS[c] || c)}</span> ${valeur(c, l[c])}</span>`).join("");
}

// « Qui » : nom + compte (e-mail) + appareil. Une entrée sans e-mail vient d'une action d'administration (SQL).
function qui(e) {
  const appareil = resumerAppareil(e.appareil); // « Chrome · macOS »
  if (!e.email) return `<span class="jqui"><strong>Administration</strong><span class="table__sub">modification directe en base</span></span>`;
  return `<span class="jqui"><strong>${escapeHtml(e.nom || e.email)}</strong><span class="table__sub">${escapeHtml(e.email)}${appareil ? ` · ${escapeHtml(appareil)}` : ""}</span></span>`;
}

const heure = (iso) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); // 07/11/2026 14:32

// Bouton « Restaurer » (deux clics, comme les suppressions) — présent seulement si l'opération inverse est possible.
const LIBELLES_RESTAURER = { UPDATE: "Restaurer", DELETE: "Recréer", INSERT: "Annuler" };
const boutonRestaurer = (e) => (restaurable(e) ? `<button type="button" class="btn btn--small btn--ghost" data-restaurer="${escapeHtml(String(e.id))}" title="${e.action === "UPDATE" ? "Remettre les anciennes valeurs" : e.action === "DELETE" ? "Recréer l'élément supprimé" : "Supprimer l'élément créé"}">${icon("history", "icon--sm")}<span>${LIBELLES_RESTAURER[e.action]}</span></button>` : "");

// ---------- Gestion du clic « Restaurer » (partagée par l'écran et la fiche) ----------
export async function surClicRestaurer(e) {
  const b = e.target.closest("[data-restaurer]"); // bouton cliqué
  if (!b) return false; // pas pour nous
  const entree = store.journal.find((j) => String(j.id) === b.dataset.restaurer); // entrée visée
  if (!entree) return true;
  const libelle = b.querySelector("span"); // texte du bouton
  if (b.dataset.confirm !== "1") { // 1er clic : on arme
    b.dataset.confirm = "1"; b.classList.add("is-armed"); libelle.textContent = "Confirmer";
    clearTimeout(b._t); b._t = setTimeout(() => { b.dataset.confirm = "0"; b.classList.remove("is-armed"); libelle.textContent = LIBELLES_RESTAURER[entree.action]; }, 4000);
    return true;
  }
  clearTimeout(b._t); b.disabled = true; // 2e clic : on exécute
  try { await restaurer(entree); showToast(entree.action === "DELETE" ? "Élément recréé" : entree.action === "INSERT" ? "Création annulée" : "Valeurs restaurées"); }
  catch (err) { console.error(err); showToast("Échec de la restauration"); b.disabled = false; }
  return true;
}

// ---------- Bloc « Journal des modifications » de la fiche ----------
// Toutes les entrées rattachées à la fiche (elle-même + contrat, échéances, contacts…), 40 plus récentes.
export function journalFicheHtml(partenaireId) {
  const entrees = store.journal.filter((j) => j.partenaireId === partenaireId && !(j.tableNom === "echanges" && (j.apres || j.avant)?.auto)).slice(0, 40); // sans l'historique automatique (déjà visible plus haut)
  if (!entrees.length) return '<p class="faint" style="font-size: var(--text-sm)">Aucune modification enregistrée pour l\'instant.</p>';
  return entrees.map((e) => `<div class="jitem">
    <div class="jitem__head"><span class="badge badge--${TONS_ACTIONS[e.action]}">${LIBELLES_ACTIONS[e.action]}</span> <strong>${escapeHtml(LIBELLES_TABLES[e.tableNom] || e.tableNom)}</strong> <span class="muted">${escapeHtml(sousObjet(e))}</span>${boutonRestaurer(e)}</div>
    <div class="jitem__detail">${detail(e)}</div>
    <div class="timeline__meta">${heure(e.le)} · ${escapeHtml(e.nom || e.email || "Administration")}${e.email ? ` (${escapeHtml(e.email)})` : ""}${resumerAppareil(e.appareil) ? ` · ${escapeHtml(resumerAppareil(e.appareil))}` : ""}</div>
  </div>`).join("");
}

// ---------- Écran « Journal » ----------
const filtres = { membre: "", table: "", action: "", periode: "30", q: "", auto: false }; // état des filtres
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); // recherche sans accents

export function initJournal() {
  const form = $("journal-filtres"); // barre de filtres
  if (!form) return;
  form.addEventListener("input", () => { // tout changement de filtre redessine
    filtres.membre = form.membre.value; filtres.table = form.table.value; filtres.action = form.action.value;
    filtres.periode = form.periode.value; filtres.q = norm(form.q.value.trim()); filtres.auto = form.auto.checked;
    renderJournal();
  });
  $("journal-liste")?.addEventListener("click", surClicRestaurer); // restauration
  $("journal-membres")?.addEventListener("click", (e) => { // clic sur un membre du récapitulatif → filtre
    const b = e.target.closest("[data-membre]"); if (!b) return;
    form.membre.value = b.dataset.membre === filtres.membre ? "" : b.dataset.membre; form.dispatchEvent(new Event("input"));
  });
}

function entreesFiltrees() {
  const jour = aujourdhui(); // pour la période
  return store.journal.filter((e) => {
    if (!filtres.auto && e.tableNom === "echanges" && (e.apres || e.avant)?.auto) return false; // historique automatique masqué par défaut (doublon des changements d'étape)
    if (filtres.membre && (e.email || "admin") !== filtres.membre) return false;
    if (filtres.table && e.tableNom !== filtres.table) return false;
    if (filtres.action && e.action !== filtres.action) return false;
    if (filtres.periode && ecartJours(jour, String(e.le).slice(0, 10)) > Number(filtres.periode)) return false; // trop ancien
    if (filtres.q && !norm(`${nomFiche(e)} ${e.nom} ${e.email} ${JSON.stringify(e.avant)} ${JSON.stringify(e.apres)}`).includes(filtres.q)) return false; // recherche plein texte
    return true;
  });
}

export function renderJournal() {
  const liste = $("journal-liste"); if (!liste) return;
  const form = $("journal-filtres");

  // Listes déroulantes : membres présents dans le journal (+ « Administration »)
  const membres = new Map(); store.journal.forEach((e) => membres.set(e.email || "admin", e.email ? e.nom || e.email : "Administration")); // e-mail → nom
  const selM = form.membre, courant = selM.value;
  selM.innerHTML = '<option value="">Tous les membres</option>' + [...membres].sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([k, n]) => `<option value="${escapeHtml(k)}">${escapeHtml(n)}</option>`).join("");
  selM.value = membres.has(courant) ? courant : "";

  // Récapitulatif « tableau de suivi global » : actions par membre sur la période choisie
  const entrees = entreesFiltrees();
  const parMembre = new Map(); // email → { nom, total, INSERT, UPDATE, DELETE, dernier }
  for (const e of store.journal.filter((x) => !filtres.periode || ecartJours(aujourdhui(), String(x.le).slice(0, 10)) <= Number(filtres.periode))) {
    const k = e.email || "admin";
    const m = parMembre.get(k) || { nom: e.email ? e.nom || e.email : "Administration", email: e.email, total: 0, INSERT: 0, UPDATE: 0, DELETE: 0, dernier: e.le };
    m.total++; m[e.action]++; if (e.le > m.dernier) m.dernier = e.le; parMembre.set(k, m);
  }
  $("journal-membres").innerHTML = [...parMembre].sort((a, b) => b[1].total - a[1].total).map(([k, m]) => `
    <button type="button" class="jmembre ${filtres.membre === k ? "jmembre--actif" : ""}" data-membre="${escapeHtml(k)}" aria-pressed="${filtres.membre === k}">
      <span class="jmembre__nom">${escapeHtml(m.nom)}</span>
      <span class="jmembre__mail">${escapeHtml(m.email || "modifications directes en base")}</span>
      <span class="jmembre__chiffres"><strong>${m.total}</strong> action${m.total > 1 ? "s" : ""} · <span class="due--ok">${m.INSERT} créations</span> · ${m.UPDATE} modif. · <span class="due--late">${m.DELETE} suppr.</span></span>
      <span class="jmembre__mail">Dernière : ${heure(m.dernier)}</span>
    </button>`).join("") || '<p class="faint">Aucune activité sur la période.</p>';

  $("journal-compte").textContent = `${entrees.length} entrée${entrees.length > 1 ? "s" : ""} affichée${entrees.length > 1 ? "s" : ""}${store.journal.length >= 1000 ? " · les 1 000 plus récentes sont chargées" : ""}`;

  // Liste détaillée (300 lignes max à l'écran : au-delà, affiner les filtres ou exporter)
  liste.innerHTML = entrees.length ? entrees.slice(0, 300).map((e) => {
    const fiche = nomFiche(e), existe = store.partenaires.some((p) => p.id === e.partenaireId);
    return `<tr>
      <td data-label="Quand" class="nowrap">${heure(e.le)}</td>
      <td data-label="Qui">${qui(e)}</td>
      <td data-label="Action"><span class="badge badge--${TONS_ACTIONS[e.action]}">${LIBELLES_ACTIONS[e.action]}</span></td>
      <td data-label="Objet"><strong>${escapeHtml(LIBELLES_TABLES[e.tableNom] || e.tableNom)}</strong>${fiche ? ` · ${existe ? `<a class="link-fiche" href="${ficheHref(e.partenaireId)}">${escapeHtml(fiche)}</a>` : `${escapeHtml(fiche)} <span class="faint">(supprimée)</span>`}` : ""}<span class="table__sub">${escapeHtml(sousObjet(e))}</span></td>
      <td data-label="Détail"><div class="jdetail">${detail(e)}</div></td>
      <td>${boutonRestaurer(e)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="empty-cell">Aucune modification ne correspond à ces filtres.</td></tr>`;
}
