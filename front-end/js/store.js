// store.js — état en mémoire + abonnement temps réel. Seule source de vérité des écrans.
import * as api from "./api.js"; // couche d'accès aux données
import { aujourdhui } from "./dates.js"; // date du jour (ISO local)
import { COTISATION_PAR_DEFAUT, enEuros, enCents } from "./selectors.js"; // constantes et conversions
import { slugify } from "./utils.js"; // identifiant lisible à partir d'un nom

const vide = () => Object.fromEntries(api.TABLES.map((t) => [t, []])); // { partenaires: [], contrats: [], ... }

export const store = {
  raw: vide(), // tables brutes (camelCase), telles que reçues de l'api
  partenaires: [], // VUES plates des partenaires (calculées)
  evenements: [], // événements avec leurs présences imbriquées (calculé)
  echeancesSaison: [], // échéances de la saison en cours (calculé)
  reglages: { saisonEnCours: "2026-27", saisonPrecedente: "2025-26", objectif: 0, responsables: [], catalogue: [] }, // réglages du club
  utilisateur: null, // { email, nom } du membre connecté (rempli par auth.js)
  sync: "hors-ligne" // "connecte" | "hors-ligne" | "erreur" (affiché dans l'en-tête)
};

const ecouteurs = new Set(); // fonctions abonnées aux changements
export const onChange = (fn) => { ecouteurs.add(fn); return () => ecouteurs.delete(fn); }; // s'abonner / se désabonner
export const emitChange = (raison = "update") => ecouteurs.forEach((fn) => fn(raison)); // prévient tous les écrans

// ---------- Calcul des vues ----------
function reconstruire() {
  const { raw } = store; // tables brutes
  store.reglages = { ...store.reglages, ...(raw.reglages[0] || {}) }; // réglages (une seule ligne)
  const { saisonEnCours: N, saisonPrecedente: P } = store.reglages; // saison courante et précédente
  const grouper = (lignes) => { const m = new Map(); for (const l of lignes) { (m.get(l.partenaireId) || m.set(l.partenaireId, []).get(l.partenaireId)).push(l); } return m; }; // regroupe par partenaire
  const contrats = grouper(raw.contrats), echeances = grouper(raw.echeances.filter((e) => e.saison === N)), cps = grouper(raw.contreparties.filter((c) => c.saison === N)), contacts = grouper(raw.contacts), echanges = grouper(raw.echanges); // index par partenaire

  store.partenaires = raw.partenaires.map((p) => { // une vue par fiche
    const cs = contrats.get(p.id) || []; // contrats du partenaire
    const c = cs.find((x) => x.saison === N) || null; // contrat de la saison en cours
    const cp = cs.find((x) => x.saison === P) || null; // contrat de la saison précédente
    const ech = echeances.get(p.id) || []; // échéances de la saison
    const liste = cps.get(p.id) || []; // contreparties de la saison
    return {
      ...p, // champs du partenaire
      archive: p.etape === "Archivé", // compat : ancien drapeau
      contrat: c, // contrat courant (ou null)
      contratPrecedent: cp, // contrat N-1 (ou null)
      montantDemande: c?.montantDemande ?? 0, cotisationDemandee: c?.cotisationDemandee ?? COTISATION_PAR_DEFAUT, // demandé
      montantValide: c?.montantValide ?? 0, cotisationValidee: c?.cotisationValidee ?? 0, // validé
      dontMecenat: c?.dontMecenat ?? 0, cerfaEmis: !!c?.cerfaEmis, // mécénat + CERFA
      montantPrecedent: cp ? enEuros(enCents(cp.montantValide) + enCents(cp.cotisationValidee)) : 0, // validé N-1
      echeances: ech, // échéances de la saison
      encaisse: enEuros(ech.filter((e) => e.paye).reduce((t, e) => t + enCents(e.montant), 0)), // total payé
      contreparties: liste, // contreparties de la saison
      contrepartiesTotal: liste.length, contrepartiesLivrees: liste.filter((x) => x.livree).length, // compteurs
      contacts: contacts.get(p.id) || [], // contacts
      echanges: (echanges.get(p.id) || []).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.creeLe).localeCompare(String(a.creeLe))) // historique, récent d'abord
    };
  });
  const ids = new Set(raw.partenaires.map((p) => p.id)); // fiches existantes (écarte les échéances orphelines)
  store.echeancesSaison = raw.echeances.filter((e) => e.saison === N && ids.has(e.partenaireId)); // échéances de la saison (tous partenaires)
  store.evenements = raw.evenements.map((e) => ({ ...e, presences: raw.presences.filter((x) => x.evenementId === e.id).map((x) => ({ ...x, partnerId: x.partenaireId })) })); // présences imbriquées (compat evenements.js)
}

let enAttente = null; // reconstruction planifiée
function planifier(raison) {
  if (enAttente) return; // déjà planifiée : on regroupe les rafales d'évènements
  enAttente = requestAnimationFrame(() => { enAttente = null; reconstruire(); emitChange(raison); }); // 1 seul rendu par image
}

// ---------- Chargement + temps réel ----------
let desabonner = null; // fonction de désabonnement temps réel
export async function initStore() {
  await api.init(); // prépare le client
  await recharger("hydrate"); // premier chargement complet
  desabonner?.(); // évite un double abonnement
  desabonner = api.subscribe(appliquerEvenement, (statut) => { // abonnement postgres_changes
    store.sync = statut === "SUBSCRIBED" ? "connecte" : statut === "CLOSED" ? "hors-ligne" : "erreur"; // état affiché
    emitChange("sync"); // met à jour le voyant
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recharger("retour-onglet"); }); // §7 : rechargement complet au retour sur l'onglet
}

export async function recharger(raison = "reload") {
  store.raw = { ...vide(), ...(await api.loadAll()) }; // relit toutes les tables
  reconstruire(); // recalcule les vues
  emitChange(raison); // notifie les écrans
}

// Applique UN évènement temps réel (idempotent : rejouer le même évènement ne change rien).
function appliquerEvenement({ table, type, row }) {
  const cle = table === "membres" ? "email" : "id"; // clé primaire
  const liste = store.raw[table] || []; // table concernée
  const i = liste.findIndex((l) => l[cle] === row[cle]); // position de la ligne
  if (type === "DELETE") { // suppression
    if (i >= 0) liste.splice(i, 1); // on retire la ligne
    if (table === "partenaires") for (const t of ["contrats", "echeances", "contreparties", "contacts", "echanges", "presences"]) store.raw[t] = store.raw[t].filter((l) => l.partenaireId !== row.id); // cascade locale
  } else if (i >= 0) liste[i] = { ...liste[i], ...row }; // mise à jour : on FUSIONNE (ne perd pas les champs absents du payload)
  else liste.push(row); // insertion
  planifier(`rt:${table}`); // re-rend (regroupé)
}

// ---------- Écritures optimistes ----------
// Écrit un patch : l'UI change tout de suite, puis on confirme auprès de l'api ; en cas d'échec on annule.
export async function ecrire(table, id, patch) {
  const cle = table === "membres" ? "email" : "id"; // clé primaire
  const ligne = store.raw[table].find((l) => l[cle] === id); // ligne locale
  const avant = ligne ? { ...ligne } : null; // copie pour pouvoir annuler
  if (ligne) { Object.assign(ligne, patch); reconstruire(); emitChange(`local:${table}`); } // application optimiste immédiate
  try {
    const sauvee = await api.update(table, id, patch); // écriture réelle (seuls les champs modifiés : règle §5.6)
    if (ligne) Object.assign(ligne, sauvee); // aligne sur la valeur serveur
    if (["contrats", "echeances", "contreparties", "contacts"].includes(table)) toucher(ligne?.partenaireId); // « dernière modification » du partenaire
    return sauvee; // renvoie la ligne enregistrée
  } catch (err) {
    if (ligne && avant) { Object.assign(ligne, avant); reconstruire(); emitChange(`rollback:${table}`); } // annule l'affichage optimiste
    throw err; // l'appelant affiche l'erreur
  }
}

export async function ajouter(table, ligne) {
  const sauvee = await api.insert(table, ligne); // insertion
  const liste = store.raw[table]; // table locale
  if (!liste.some((l) => l.id === sauvee.id)) liste.push(sauvee); // évite le doublon si l'écho temps réel est arrivé avant
  if (["contrats", "echeances", "contreparties", "contacts"].includes(table)) toucher(sauvee.partenaireId); // met à jour modifie_le/par
  reconstruire(); emitChange(`local:${table}`); // rendu
  return sauvee; // ligne créée
}

export async function supprimer(table, id) {
  const cle = table === "membres" ? "email" : "id"; // clé primaire
  const ligne = store.raw[table].find((l) => l[cle] === id); // ligne à retirer
  await api.remove(table, id); // suppression réelle
  store.raw[table] = store.raw[table].filter((l) => l[cle] !== id); // retrait local
  if (table === "partenaires") for (const t of ["contrats", "echeances", "contreparties", "contacts", "echanges", "presences"]) store.raw[t] = store.raw[t].filter((l) => l.partenaireId !== id); // cascade locale (la base le fait aussi)
  if (["contrats", "echeances", "contreparties", "contacts"].includes(table)) toucher(ligne?.partenaireId); // dernière modification
  reconstruire(); emitChange(`local:${table}`); // rendu
}

// Met à jour « dernière modification » (date + auteur) d'un partenaire, sans bloquer l'UI.
function toucher(partenaireId) {
  if (!partenaireId) return; // rien à faire
  api.update("partenaires", partenaireId, { modifieLe: new Date().toISOString(), modifiePar: store.utilisateur?.nom || store.utilisateur?.email || "?" }).catch(() => {}); // best-effort
}

// ---------- Actions métier (règles §5) ----------
export const auteur = () => store.utilisateur?.nom || store.utilisateur?.email || "?"; // nom affiché dans l'historique

export async function noterHistorique(partenaireId, texte, { auto = false, date = aujourdhui() } = {}) {
  return ajouter("echanges", { partenaireId, date, texte, auteur: auteur(), auto }); // une ligne d'historique
}

// Règle §5.1 : tout changement d'étape (fiche OU glisser-déposer) écrit « Étape : A → B » dans l'historique.
export async function changerEtape(partenaireId, nouvelle) {
  const p = store.raw.partenaires.find((x) => x.id === partenaireId); // fiche concernée
  if (!p || p.etape === nouvelle) return; // rien à faire
  const ancienne = p.etape; // mémorise l'ancienne étape
  await ecrire("partenaires", partenaireId, { etape: nouvelle, modifieLe: new Date().toISOString(), modifiePar: auteur() }); // écrit l'étape
  await noterHistorique(partenaireId, `Étape : ${ancienne} → ${nouvelle}`, { auto: true }); // trace dans l'historique
}

// Règle §5.4 : nouvelle fiche = cotisation demandée 200 € + « Fiche créée » dans l'historique.
export async function creerPartenaire({ nom, secteur = "", etape = "Prospect", type = "Sponsoring", responsable = "", montantDemande = 0, prochaineActionDate = null, prochaineActionTexte = "" }) {
  let id = slugify(nom), n = 2; // identifiant lisible
  while (store.raw.partenaires.some((p) => p.id === id)) id = `${slugify(nom)}-${n++}`; // garantit l'unicité
  const p = await ajouter("partenaires", { id, nom, secteur, etape, type, responsable, notes: "", prochaineActionDate, prochaineActionTexte, premierContact: aujourdhui(), modifieLe: new Date().toISOString(), modifiePar: auteur() }); // la fiche
  await ajouter("contrats", { partenaireId: p.id, saison: store.reglages.saisonEnCours, montantDemande, cotisationDemandee: COTISATION_PAR_DEFAUT, montantValide: 0, cotisationValidee: 0, dontMecenat: 0, cerfaEmis: false, natureValeur: 0, natureDescription: "", modalites: "" }); // contrat de la saison
  await noterHistorique(p.id, "Fiche créée", { auto: true }); // trace de création
  return p; // fiche créée
}

// Garantit l'existence du contrat de la saison en cours (créé à la volée si besoin).
export async function assurerContrat(partenaireId) {
  const existant = store.raw.contrats.find((c) => c.partenaireId === partenaireId && c.saison === store.reglages.saisonEnCours); // contrat courant ?
  if (existant) return existant; // déjà là
  return ajouter("contrats", { partenaireId, saison: store.reglages.saisonEnCours, montantDemande: 0, cotisationDemandee: COTISATION_PAR_DEFAUT, montantValide: 0, cotisationValidee: 0, dontMecenat: 0, cerfaEmis: false, natureValeur: 0, natureDescription: "", modalites: "" }); // sinon on le crée
}

// Génère l'échéancier d'après le plan de selectors.planifierEcheancier (§5.3). INSÈRE d'abord, SUPPRIME ensuite :
// en cas d'échec au milieu, on a des doublons visibles et corrigeables, jamais une perte de données.
export async function appliquerPlanEcheancier(partenaireId, plan) {
  const saison = store.reglages.saisonEnCours; // saison courante
  for (const e of plan.aCreer) await ajouter("echeances", { partenaireId, saison, ...e }); // 1) crée les nouvelles échéances
  for (const id of plan.aSupprimer) await supprimer("echeances", id); // 2) supprime les anciennes non payées
}

// ---------- Compatibilité avec les écrans existants ----------
export const getPartner = (id) => store.partenaires.find((p) => p.id === id) || null; // ancien nom, utilisé par evenements.js

export const COLONNES = [ // colonnes du Kanban (remplace mock/pipeline.json, §4.3 : « les archivés sont masqués »)
  { id: "Prospect", slug: "prospect", description: "Entreprises identifiées, pas encore contactées" },
  { id: "Contacté", slug: "contacte", description: "Premier contact établi" },
  { id: "RDV", slug: "rdv", description: "Rendez-vous fixé ou à confirmer" },
  { id: "Proposition", slug: "proposition", description: "Offre / devis envoyé" },
  { id: "Négociation", slug: "negociation", description: "Discussion sur le pack et le montant" },
  { id: "Signé", slug: "signe", description: "Accord validé pour la saison" },
  { id: "Perdu", slug: "perdu", description: "Non reconduit ou refusé" }
]; // 7 colonnes
store.colonnes = COLONNES; // pipeline.js lit store.colonnes
