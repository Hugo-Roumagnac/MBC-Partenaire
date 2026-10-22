/**
 * utilitaires.js — helpers d'affichage (montants, dates, slugs, toast).
 * Aucune dépendance. Utilisé par toutes les pages de la maquette.
 */
import { aujourdhui } from "./dates.js"; // date du jour (ISO local)
import { ecartJours } from "./dates.js"; // écart en jours entre deux dates
import { montantCarte } from "./selectors.js"; // règle de calcul du montant affiché
import { store } from "./store.js"; // accès aux réglages du club (responsables)

/** Formate un nombre en euros (fr-FR), ou un tiret si vide. */
export function formatEuro(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
}

/** Date ISO (YYYY-MM-DD) → JJ/MM/AAAA. */
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

/** Date du jour en ISO (fuseau local). */
export function todayIso() {
  return aujourdhui(); // utilise le helper pur de dates.js
}

/**
 * Classe CSS pour une date d'action :
 * - due--late si dépassée
 * - due--soon si dans les 3 jours
 */
export function dueClass(iso) {
  if (!iso) return "";
  const ecart = ecartJours(iso, aujourdhui()); // utilise les helpers purs (pas de new Date)
  if (ecart < 0) return "due--late"; // dépassée
  if (ecart <= 3) return "due--soon"; // dans 3 jours ou moins
  return "";
}

/** Convertit une étape en slug CSS (Négociation → negociation). */
export function stageSlug(etape) {
  return String(etape || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Montant affiché sur une carte / ligne selon l'étape (règle métier §5). */
export function montantAffiche(p) {
  return montantCarte(p).montant; // utilise la règle unique de selectors.js
}

/** Libellé d'unité du montant (demandé / saison précédente). */
export function montantMeta(p) {
  return montantCarte(p).mention; // utilise la règle unique de selectors.js
}

/** Identifiant URL-safe à partir d'un nom. */
export function slugify(text) {
  return String(text || "partenaire")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || `p-${Date.now()}`;
}

let toastTimer = 0;

/** Affiche le bandeau « Enregistré » (ou un message) ~2,5 secondes. Les messages d'échec passent en rouge. */
export function showToast(message = "Enregistré", { erreur } = {}) {
  const el = document.getElementById("toast");
  if (!el) return;
  const estErreur = erreur ?? /^(Échec|Impossible|Valeur invalide|Export impossible)/i.test(message);
  el.textContent = message;
  el.classList.toggle("toast--error", estErreur);
  el.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast--visible"), estErreur ? 4000 : 2200);
}

/** Initiales d'un nom ou d'un e-mail : « Thomas Roumagnac » → « TR ». */
export function initiales(nom = "") {
  const mots = String(nom).split("@")[0].split(/[\s._-]+/).filter(Boolean);
  return ((mots[0]?.[0] || "?") + (mots[1]?.[0] || "")).toUpperCase();
}

/** Échappe le HTML pour l'injection via innerHTML. */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Remplit un élément <select> avec les responsables des réglages tout en conservant la sélection
export function remplirResponsables(select, { tous = false, sans = false } = {}) {
  // Vérifie que le nœud select existe bien dans le DOM
  if (!select) return;
  // Mémorise la valeur sélectionnée avant reconstruction
  const valeurActuelle = select.value;
  // Prépare l'option neutre de départ selon le mode demandé
  let html = tous ? '<option value="">Tous les responsables</option>' : '<option value="">—</option>';
  // Récupère les responsables configurés dans les réglages du store
  const liste = store?.reglages?.responsables || [];
  // Concatène chaque responsable sous forme d'élément option
  for (const r of liste) {
    // Échappe le nom du responsable pour éviter toute faille XSS
    html += `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`;
  }
  // Ajoute l'option sans responsable si requise par l'appelant
  if (sans) {
    // Valeur technique none pour désigner l'absence de responsable
    html += '<option value="none">Sans responsable</option>';
  }
  // Remplace le contenu HTML du select
  select.innerHTML = html;
  // Restaure la valeur si elle existe toujours parmi les options
  if (valeurActuelle) {
    // Réassignation de la valeur précédente
    select.value = valeurActuelle;
  }
}
