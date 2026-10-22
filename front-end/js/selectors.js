// selectors.js — TOUTES les règles de calcul du §5 du PDF. Fonctions pures (entrées → sorties).
import { ecartJours, ajouterMois } from "./dates.js"; // helpers de dates sans DOM

export const ETAPES = ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu", "Archivé"]; // §3 listes de valeurs
export const ETAPES_NEGOCIATION = ["RDV", "Proposition", "Négociation"]; // §5 « En négociation »
export const COTISATION_PAR_DEFAUT = 200; // §5 règle 4 : cotisation demandée d'une nouvelle fiche

export const enCents = (euros) => Math.round((Number(euros) || 0) * 100); // euros → cents entiers (évite les flottants)
export const enEuros = (cents) => cents / 100; // cents → euros
// Somme en cents d'une liste (fn extrait le montant en euros de chaque élément), rendue en euros.
const somme = (liste, fn) => enEuros(liste.reduce((t, x) => t + enCents(fn(x)), 0));

// Total validé d'un partenaire = montant validé + cotisation validée.
export const totalValide = (v) => enEuros(enCents(v.montantValide) + enCents(v.cotisationValidee));
// Total demandé d'un partenaire = montant demandé + cotisation demandée.
export const totalDemande = (v) => enEuros(enCents(v.montantDemande) + enCents(v.cotisationDemandee));

// Montant affiché sur une carte ou une ligne (§5) + mention associée.
export function montantCarte(v) {
  if (v.etape === "Signé") return { montant: totalValide(v), mention: "" }; // signé : le validé
  if (v.etape === "Perdu" || v.etape === "Archivé") return { montant: v.montantPrecedent || 0, mention: "saison préc." }; // perdu : validé N-1
  return { montant: totalDemande(v), mention: "demandé" }; // sinon : le demandé
}

// Une échéance est en retard si elle n'est pas payée et que sa date est strictement dépassée (§5).
export const enRetard = (e, aujourdhui) => !e.paye && !!e.datePrevue && ecartJours(e.datePrevue, aujourdhui) < 0;

// Un reçu CERFA est à émettre si : Signé + part de mécénat > 0 + case « CERFA émis » décochée (§5).
export const cerfaAEmettre = (v) => v.etape === "Signé" && (Number(v.dontMecenat) || 0) > 0 && !v.cerfaEmis;

// Statut visuel d'une prochaine action (§5 règle 2) : "late" (dépassée), "soon" (≤ 3 jours), "" sinon.
export function statutAction(dateIso, aujourdhui) {
  if (!dateIso) return ""; // pas de date → pas d'alerte
  const ecart = ecartJours(dateIso, aujourdhui); // jours restants (négatif = dépassé)
  if (ecart < 0) return "late"; // rouge
  if (ecart <= 3) return "soon"; // orange
  return ""; // normal
}

// Indicateurs de l'écran Paiements (§4.6) à partir des échéances de la saison en cours.
export function calculerPaiements(echeances, aujourdhui) {
  const attendu = somme(echeances, (e) => e.montant); // total attendu
  const encaisse = somme(echeances.filter((e) => e.paye), (e) => e.montant); // total encaissé
  const retard = echeances.filter((e) => enRetard(e, aujourdhui)); // échéances en retard
  return {
    attendu, // total attendu
    encaisse, // total encaissé
    pctEncaisse: attendu > 0 ? Math.round((encaisse / attendu) * 100) : 0, // % encaissé (0 si rien d'attendu)
    reste: Math.max(0, enEuros(enCents(attendu) - enCents(encaisse))), // reste à encaisser
    retardMontant: somme(retard, (e) => e.montant), // montant en retard
    retardNombre: retard.length // nombre d'échéances en retard
  };
}

// Tout le tableau de bord (§4.2) en un seul objet. etat = { partenaires (vues), echeances (saison), reglages }.
export function calculerTableauDeBord(etat, aujourdhui) {
  const { partenaires, echeances, reglages } = etat; // déstructure l'état
  const objectif = Number(reglages?.objectif) || 0; // objectif de saison (0 si absent)
  const signes = partenaires.filter((v) => v.etape === "Signé"); // seule l'étape décide du « signé » (§5)
  const nego = partenaires.filter((v) => ETAPES_NEGOCIATION.includes(v.etape)); // partenaires en négociation
  const perdus = partenaires.filter((v) => v.etape === "Perdu"); // non renouvelés

  const signe = somme(signes, totalValide); // montant signé
  const encaisse = somme(echeances.filter((e) => e.paye), (e) => e.montant); // encaissé : tous partenaires
  const negocie = somme(nego, totalDemande); // montant en négociation
  const pct = (x) => (objectif > 0 ? Math.min(100, Math.round((x / objectif) * 100)) : 0); // % borné de l'objectif
  const paiements = calculerPaiements(echeances, aujourdhui); // sous-calcul paiements (retards)

  const livrees = signes.reduce((t, v) => t + v.contrepartiesLivrees, 0); // contreparties livrées (signés)
  const totalCp = signes.reduce((t, v) => t + v.contrepartiesTotal, 0); // contreparties promises (signés)

  return {
    score: { objectif, signe, encaisse, negocie, reste: Math.max(0, enEuros(enCents(objectif) - enCents(signe))), pctSigne: pct(signe), pctEncaisse: pct(encaisse) }, // bloc « Score de la saison »
    kpis: {
      signes: { nombre: signes.length, natureMedia: signes.filter((v) => v.type === "En nature" || v.type === "Média").length, cotisations: somme(signes, (v) => v.cotisationValidee) }, // KPI 1
      negociation: { nombre: nego.length, montant: negocie }, // KPI 2
      retard: { nombre: paiements.retardNombre, montant: paiements.retardMontant }, // KPI 3
      contreparties: { livrees, total: totalCp, mecenat: somme(signes, (v) => v.dontMecenat), cerfa: signes.filter(cerfaAEmettre).length } // KPI 4
    },
    todo: construireAFaire(partenaires, echeances, aujourdhui), // liste « À faire »
    pipeline: ETAPES.filter((e) => e !== "Archivé").map((etape) => { // une ligne par étape visible
      const liste = partenaires.filter((v) => v.etape === etape); // partenaires de l'étape
      return { etape, nombre: liste.length, montant: somme(liste, (v) => montantCarte(v).montant) }; // nombre + montant
    }),
    nonRenouveles: { nombre: perdus.length, montant: somme(perdus, (v) => v.montantPrecedent), liste: perdus } // bloc « Non renouvelés »
  };
}

// Liste priorisée « À faire » (§4.2). Priorité 1 = le plus urgent.
export function construireAFaire(partenaires, echeances, aujourdhui) {
  const items = []; // résultat
  const parId = new Map(partenaires.map((v) => [v.id, v])); // accès rapide partenaire par id
  const actifs = partenaires.filter((v) => v.etape !== "Perdu" && v.etape !== "Archivé"); // on ignore perdus/archivés

  for (const e of echeances) { // 1) paiements échus
    if (!enRetard(e, aujourdhui) || !parId.has(e.partenaireId)) continue; // seulement les échéances en retard connues
    items.push({ priorite: 1, partenaireId: e.partenaireId, titre: `Paiement échu — ${parId.get(e.partenaireId).nom}`, meta: e.note || "Échéance non payée", date: e.datePrevue, montant: e.montant, ton: "danger" });
  }
  for (const v of actifs) { // 2) actions en retard, 4) actions sous 14 jours
    if (!v.prochaineActionDate) continue; // pas de date → rien
    const ecart = ecartJours(v.prochaineActionDate, aujourdhui); // jours avant l'action
    if (ecart < 0) items.push({ priorite: 2, partenaireId: v.id, titre: `${v.prochaineActionTexte || "Action à faire"} — ${v.nom}`, meta: "Prochaine action en retard", date: v.prochaineActionDate, ton: "danger" }); // en retard
    else if (ecart <= 14) items.push({ priorite: 4, partenaireId: v.id, titre: `${v.prochaineActionTexte || "Action à faire"} — ${v.nom}`, meta: ecart === 0 ? "Aujourd'hui" : `Dans ${ecart} jour${ecart > 1 ? "s" : ""}`, date: v.prochaineActionDate, ton: ecart <= 3 ? "warning" : "" }); // à venir
  }
  for (const v of partenaires.filter(cerfaAEmettre)) { // 3) reçus CERFA à émettre
    items.push({ priorite: 3, partenaireId: v.id, titre: `Émettre le reçu CERFA — ${v.nom}`, meta: `Part de mécénat : ${v.dontMecenat} €`, date: "9999-12-31", ton: "warning", badge: "CERFA" });
  }
  for (const v of actifs) { // 5) négociations sans prochaine action
    if (ETAPES_NEGOCIATION.includes(v.etape) && !v.prochaineActionDate && !v.prochaineActionTexte) {
      items.push({ priorite: 5, partenaireId: v.id, titre: v.nom, meta: `${v.etape}, sans prochaine action`, date: "9999-12-31", ton: "danger", badge: "Aucune action" });
    }
  }
  return items.sort((a, b) => a.priorite - b.priorite || String(a.date).localeCompare(String(b.date))); // priorité puis date croissante
}

// Répartit un total (en cents) en n parts égales ; la DERNIÈRE absorbe l'arrondi (§5 règle 3).
export function repartirCents(totalCents, n) {
  const base = Math.floor(totalCents / n); // part de base arrondie vers le bas
  const parts = Array(n).fill(base); // n parts identiques
  parts[n - 1] = totalCents - base * (n - 1); // la dernière récupère le reste
  return parts; // tableau de cents
}

// Montant par défaut du générateur : total validé moins ce qui est déjà payé (jamais négatif).
export function montantParDefaut(vue) {
  const dejaPaye = somme(vue.echeances.filter((e) => e.paye), (e) => e.montant); // somme des échéances payées
  return Math.max(0, enEuros(enCents(totalValide(vue)) - enCents(dejaPaye))); // reste à planifier
}

// Plan du générateur d'échéancier (§5 règle 3) : ne touche à RIEN, renvoie ce qu'il faut créer/supprimer.
export function planifierEcheancier(vue, { montant, nombre, premierVersement }) {
  const n = Math.max(1, Math.floor(Number(nombre) || 1)); // au moins 1 versement
  const parts = repartirCents(enCents(montant), n); // parts en cents
  return {
    aSupprimer: vue.echeances.filter((e) => !e.paye).map((e) => e.id), // les NON payées sont remplacées
    aCreer: parts.map((cents, i) => ({ // une échéance par versement mensuel
      datePrevue: ajouterMois(premierVersement, i), // 1er versement + i mois
      montant: enEuros(cents), // montant en euros
      paye: false, // jamais payée à la création
      note: "" // note vide
    }))
  };
}
