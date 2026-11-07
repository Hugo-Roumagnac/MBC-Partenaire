// selectors.js — TOUTES les règles de calcul du §5 du PDF. Fonctions pures (entrées → sorties).
import { ecartJours, ajouterMois } from "./dates.js"; // helpers de dates sans DOM

export const ETAPES = ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu", "Archivé"]; // §3 listes de valeurs
export const ETAPES_NEGOCIATION = ["RDV", "Proposition", "Négociation"]; // §5 « En négociation »
export const COTISATION_PAR_DEFAUT = 200; // §5 règle 4 : cotisation demandée d'une nouvelle fiche
// v2 : statuts de présence aux événements. « Contact à rajouter » = quelqu'un de l'entreprise est venu
// (ou s'est inscrit) mais n'existe pas encore dans ses contacts : choisir ce statut ouvre la saisie du contact.
export const PRESENCE_CONTACT = "Contact à rajouter";
export const PRESENCES = ["Oui", "En attente", "Non", PRESENCE_CONTACT];
// v2 : catégories d'affectation des fonds proposées par défaut (modifiables dans « Réglages du club »).
export const CATEGORIES_PAR_DEFAUT = ["Cotisations", "Sponsoring", "Mécénat", "Équipement", "Événementiel", "Déplacements", "Formation jeunes", "Fonctionnement"];

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
    todo: construireAFaire(partenaires, echeances, aujourdhui, etat.evenements || []), // liste « À faire » (v2 : + contacts à rajouter)
    pipeline: ETAPES.filter((e) => e !== "Archivé").map((etape) => { // une ligne par étape visible
      const liste = partenaires.filter((v) => v.etape === etape); // partenaires de l'étape
      return { etape, nombre: liste.length, montant: somme(liste, (v) => montantCarte(v).montant) }; // nombre + montant
    }),
    nonRenouveles: { nombre: perdus.length, montant: somme(perdus, (v) => v.montantPrecedent), liste: perdus } // bloc « Non renouvelés »
  };
}

// Liste priorisée « À faire » (§4.2). Priorité 1 = le plus urgent.
export function construireAFaire(partenaires, echeances, aujourdhui, evenements = []) {
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
  for (const evt of evenements) { // 3 bis) v2 : contacts repérés à un événement mais pas encore saisis
    for (const x of evt.presences || []) {
      if (x.presence !== PRESENCE_CONTACT || !parId.has(x.partenaireId)) continue; // seulement ce statut, fiche existante
      items.push({ priorite: 3, partenaireId: x.partenaireId, titre: `Contact à rajouter — ${parId.get(x.partenaireId).nom}`, meta: `${evt.nom}${x.noms ? ` · ${x.noms}` : ""}`, date: evt.date || "9999-12-31", ton: "info", badge: "Contact", icone: "users" });
    }
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

// =============================================================================
// v2 — PIPELINE : colonne « Encaissé »
// =============================================================================
// « Encaissé » n'est PAS une étape enregistrée en base : c'est une colonne CALCULÉE.
// Une fiche « Signé » dont toutes les échéances payées couvrent le total validé y passe
// automatiquement ; si une échéance est décochée, elle revient dans « Signé ».
// Avantages : aucune donnée en double, impossible d'avoir une carte « Encaissé » qui ne l'est pas,
// et toutes les règles existantes qui testent etape === "Signé" restent justes.

// Vrai si le partenaire est signé ET intégralement encaissé (comparaison en cents).
export const estSolde = (v) => v.etape === "Signé" && enCents(totalValide(v)) > 0 && enCents(v.encaisse) >= enCents(totalValide(v));

// Colonne du Kanban dans laquelle afficher une fiche.
export const colonnePipeline = (v) => (estSolde(v) ? "Encaissé" : v.etape);

// =============================================================================
// v2 — SIRET
// =============================================================================
// Un SIRET = 14 chiffres (SIREN sur 9 chiffres + NIC sur 5). Le dernier chiffre est une clé de
// contrôle selon l'algorithme de Luhn. Exception connue : les établissements de La Poste
// (SIREN 356 000 000) : leurs SIRET peuvent ne pas respecter Luhn, la somme des chiffres est alors un multiple de 5.

// Ne garde que les chiffres : « 123 456 789 00012 » → « 12345678900012 ».
export const normaliserSiret = (texte) => String(texte ?? "").replace(/\D/g, "");

// Clé de Luhn : en partant de la droite, on double un chiffre sur deux (en retirant 9 si > 9) ; total multiple de 10.
export function luhnValide(chiffres) {
  let total = 0; // somme pondérée
  for (let i = 0; i < chiffres.length; i++) {
    let n = Number(chiffres[chiffres.length - 1 - i]); // lecture de droite à gauche
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } // un chiffre sur deux est doublé
    total += n; // cumule
  }
  return total % 10 === 0; // valide si multiple de 10
}

// Valide une saisie. Renvoie { valide, siret (normalisé), erreur }. Une saisie VIDE est valide (champ facultatif).
export function validerSiret(texte) {
  const siret = normaliserSiret(texte); // chiffres uniquement
  if (!siret) return { valide: true, siret: "", erreur: "" }; // vide = « pas encore renseigné »
  if (siret.length !== 14) return { valide: false, siret, erreur: `Le SIRET doit comporter 14 chiffres (${siret.length} saisi${siret.length > 1 ? "s" : ""}).` };
  const laPoste = siret.startsWith("356000000"); // exception La Poste
  const ok = luhnValide(siret) || (laPoste && [...siret].reduce((t, c) => t + Number(c), 0) % 5 === 0); // Luhn, ou règle « somme multiple de 5 » des établissements La Poste
  return ok ? { valide: true, siret, erreur: "" } : { valide: false, siret, erreur: "Numéro SIRET invalide (clé de contrôle incorrecte) : vérifiez la saisie." };
}

// Affichage lisible : « 12345678900012 » → « 123 456 789 00012 ».
export const formaterSiret = (siret) => (String(siret || "").length === 14 ? `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}` : String(siret || ""));

// =============================================================================
// v2 — VENTILATION FINANCIÈRE : « où va l'argent »
// =============================================================================
// Chaque fiche signée peut répartir son total validé en lignes d'affectation (catégorie + montant).
// Le tableau de bord cumule ces lignes par catégorie pour TOUS les partenaires signés.
// « Encaissé » par catégorie = montant affecté × part déjà encaissée du partenaire (prorata) :
// un partenaire qui a payé 50 % de son contrat a encaissé 50 % de chacune de ses affectations.

// Total affecté d'une fiche (somme de ses lignes).
export const totalAffecte = (v) => somme(v.affectations || [], (a) => a.montant);

// Propose les lignes d'affectation « évidentes » déduites du contrat (bouton « Pré-remplir ») :
// cotisation validée → Cotisations ; part de mécénat → Mécénat ; le reste du montant validé → Sponsoring.
// Les catégories déjà présentes sur la fiche ne sont pas reproposées (pas de doublon).
export function proposerAffectations(v) {
  const deja = new Set((v.affectations || []).map((a) => a.categorie)); // catégories déjà utilisées
  const mecenat = Math.min(Number(v.dontMecenat) || 0, Number(v.montantValide) || 0); // le mécénat est inclus dans le montant validé
  return [
    { categorie: "Cotisations", montant: Number(v.cotisationValidee) || 0 },
    { categorie: "Mécénat", montant: mecenat },
    { categorie: "Sponsoring", montant: enEuros(enCents(v.montantValide) - enCents(mecenat)) }
  ].filter((l) => l.montant > 0 && !deja.has(l.categorie)); // ni montant nul, ni doublon
}

// Cumuls par catégorie. partenaires = vues (seuls les « Signé » comptent) ; categories = liste des réglages.
export function calculerVentilation(partenaires, categories = CATEGORIES_PAR_DEFAUT) {
  const signes = partenaires.filter((v) => v.etape === "Signé"); // même règle que le score de saison
  const parCategorie = new Map(categories.map((c) => [c, { categorie: c, affecteCents: 0, encaisseCents: 0, partenaires: [] }])); // ordre des réglages
  for (const v of signes) {
    const total = enCents(totalValide(v)); // total validé du partenaire
    const taux = total > 0 ? Math.min(1, enCents(v.encaisse) / total) : 0; // part déjà encaissée (0 → 1)
    for (const a of v.affectations || []) {
      if (!parCategorie.has(a.categorie)) parCategorie.set(a.categorie, { categorie: a.categorie, affecteCents: 0, encaisseCents: 0, partenaires: [], horsListe: true }); // catégorie retirée des réglages : on la garde visible
      const ligne = parCategorie.get(a.categorie); // cumul de la catégorie
      const cents = enCents(a.montant); // montant affecté
      ligne.affecteCents += cents; // cumul affecté
      ligne.encaisseCents += Math.round(cents * taux); // cumul encaissé (prorata)
      ligne.partenaires.push({ id: v.id, nom: v.nom, montant: a.montant, note: a.note || "" }); // détail
    }
  }
  const totalSigne = somme(signes, totalValide); // base de comparaison
  const lignes = [...parCategorie.values()].map((l) => ({
    categorie: l.categorie, horsListe: !!l.horsListe,
    affecte: enEuros(l.affecteCents), encaisse: enEuros(l.encaisseCents), // euros
    nombre: new Set(l.partenaires.map((p) => p.id)).size, // nombre de partenaires distincts
    partenaires: l.partenaires.sort((a, b) => b.montant - a.montant) // plus gros d'abord
  }));
  const totalAffecteCents = lignes.reduce((t, l) => t + enCents(l.affecte), 0); // somme de toutes les catégories
  return {
    lignes, // une ligne par catégorie (même vide, pour voir les catégories disponibles)
    totalSigne, // total validé des signés
    totalAffecte: enEuros(totalAffecteCents), // total réparti
    totalEncaisse: enEuros(lignes.reduce((t, l) => t + enCents(l.encaisse), 0)), // encaissé réparti
    nonAffecte: enEuros(Math.max(0, enCents(totalSigne) - totalAffecteCents)), // reste à répartir (jamais négatif)
    depassement: enEuros(Math.max(0, totalAffecteCents - enCents(totalSigne))), // affecté au-delà du signé (erreur de saisie)
    pctAffecte: totalSigne > 0 ? Math.min(100, Math.round((enEuros(totalAffecteCents) / totalSigne) * 100)) : 0, // % du signé réparti
    aVentiler: signes.filter((v) => enCents(totalAffecte(v)) !== enCents(totalValide(v))).length // fiches dont la ventilation ≠ total validé
  };
}

// =============================================================================
// v2 — JOURNAL : résumé lisible de l'appareil (« depuis quel compte / quel poste »)
// =============================================================================
// « Mozilla/5.0 (Macintosh; …) … Chrome/131 Safari/537 » → « Chrome · macOS ».
export function resumerAppareil(ua = "") {
  if (!ua) return ""; // inconnu (ex. modification faite directement en SQL)
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur"; // ordre important : Edge et Opera contiennent « Chrome »
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : ""; // système
  return [nav, os].filter(Boolean).join(" · ");
}
