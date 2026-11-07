// selectors.js — TOUTES les règles de calcul du §5 du PDF. Fonctions pures (entrées → sorties).
import { ecartJours, ajouterMois } from "./dates.js"; // helpers de dates sans DOM

export const ETAPES = ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu", "Archivé"]; // §3 listes de valeurs
export const ETAPES_NEGOCIATION = ["RDV", "Proposition", "Négociation"]; // §5 « En négociation »
export const COTISATION_PAR_DEFAUT = 200; // §5 règle 4 : cotisation demandée d'une nouvelle fiche
// v2 : statuts de présence aux événements. « Contact à rajouter » = quelqu'un de l'entreprise est venu
// (ou s'est inscrit) mais n'existe pas encore dans ses contacts : choisir ce statut ouvre la saisie du contact.
export const PRESENCE_CONTACT = "Contact à rajouter";
export const PRESENCES = ["Oui", "En attente", "Non", PRESENCE_CONTACT];

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
// v2 — PIPELINE : colonne « Non encaissé »
// =============================================================================
// « Non encaissé » n'est PAS une étape enregistrée en base : c'est une colonne CALCULÉE, placée
// juste après « Signé ». Une fiche à l'étape « Signé » qui doit encore de l'argent (reste à encaisser > 0)
// y est rangée automatiquement ; dès que ses échéances payées couvrent le total validé, elle revient
// d'elle-même dans « Signé ». La colonne « Signé » ne montre donc que les partenaires SOLDÉS.
// Avantages : aucune donnée en double, impossible d'avoir une carte mal rangée, et toutes les règles
// existantes qui testent etape === "Signé" (score, KPI, CERFA, invitations…) restent justes.

// Reste à encaisser d'un partenaire signé : total validé − déjà payé (jamais négatif).
export const resteAEncaisser = (v) => (v.etape === "Signé" ? Math.max(0, enEuros(enCents(totalValide(v)) - enCents(v.encaisse))) : 0);

// Vrai si le partenaire est signé ET n'a plus rien à payer (y compris un contrat à 0 €, ex. apport en nature).
export const estSolde = (v) => v.etape === "Signé" && enCents(resteAEncaisser(v)) === 0;

// Colonne du Kanban dans laquelle afficher une fiche.
export const colonnePipeline = (v) => (v.etape === "Signé" && !estSolde(v) ? "Non encaissé" : v.etape);

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
// v2 — RÉPARTITION DE L'ARGENT : montants validés / cotisations (bloc « Score de la saison »)
// =============================================================================
// Affichée SOUS les totaux « Signé » et « Encaissé », calculée à partir des contrats, sans saisie.
// Exemple : AXA a validé 500 € + 200 € de cotisation et a tout payé (700 €)
//   → Signé    : 500 € dans « Montants validés », 200 € dans « Cotisations »
//   → Encaissé : 500 € dans « Montants validés », 200 € dans « Cotisations »
// et ainsi de suite pour chaque partenaire : on obtient le TOTAL des cotisations, etc.
//
// Signé    : partenaires à l'étape « Signé » (même règle que le score) ; montant validé et cotisation validée.
// Encaissé : TOUTES les échéances payées de la saison (même règle que le score « Encaissé »).
//            Un paiement partiel est réparti au PRORATA du contrat du partenaire : s'il a payé la moitié,
//            la moitié va aux cotisations… La cotisation encaissée ne dépasse jamais la cotisation validée ;
//            le reste (y compris un paiement sans contrat validé) compte en « Montants validés ».
// Les deux parts retombent donc EXACTEMENT sur les totaux affichés.
export function calculerRepartition(partenaires) {
  const signe = { montants: 0, cotisations: 0, mecenat: 0 }, encaisse = { montants: 0, cotisations: 0 }; // en cents
  for (const v of partenaires) {
    const mv = enCents(v.montantValide), cv = enCents(v.cotisationValidee); // contrat de la saison
    if (v.etape === "Signé") { signe.montants += mv; signe.cotisations += cv; signe.mecenat += Math.min(enCents(v.dontMecenat), mv); } // signé
    const paye = enCents(v.encaisse); // échéances payées du partenaire
    if (!paye) continue;
    const cot = mv + cv > 0 ? Math.min(cv, Math.round((paye * cv) / (mv + cv))) : 0; // part « cotisation » au prorata, plafonnée
    encaisse.cotisations += cot; encaisse.montants += paye - cot; // le reste va aux montants validés
  }
  const euros = (o) => Object.fromEntries(Object.entries(o).map(([k, c]) => [k, enEuros(c)])); // cents → euros
  return { signe: euros(signe), encaisse: euros(encaisse) };
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

// =============================================================================
// v2 — LOGOS AUTOMATIQUES : candidats à partir du NOM et des E-MAILS des contacts
// =============================================================================
// Le service logo.dev fournit une image de logo :
//   • à partir d'un nom d'entreprise : https://img.logo.dev/name/<nom>?token=pk_…
//   • à partir d'un site web          : https://img.logo.dev/<domaine>?token=pk_…
// Le site web se déduit souvent de l'e-mail professionnel d'un contact (jean@ecf82.fr → ecf82.fr).
// Les messageries grand public (gmail.com, orange.fr…) ne disent rien de l'entreprise : on les ignore.
export const WEBMAILS = new Set(["gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "mac.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "aol.com", "gmx.fr", "gmx.com", "protonmail.com", "proton.me"]);

// Domaine d'une adresse e-mail professionnelle, ou "" (adresse invalide ou messagerie grand public).
export function domaineProfessionnel(email) {
  const d = String(email || "").trim().toLowerCase().split("@")[1] || ""; // partie après @
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !WEBMAILS.has(d) ? d : "";
}

// Noms à essayer pour une fiche : le nom complet, puis chaque marque d'un nom composé
// (« Acuitis - Optic 2000 » → « Acuitis », « Optic 2000 »), sans formes juridiques ni précisions entre parenthèses.
export function nomsDeRecherche(nom) {
  const propre = String(nom || "").replace(/\(.*?\)/g, " ").replace(/\b(sarl|sas|sasu|eurl|sa|sci|ets|etablissements)\b\.?/gi, " ").replace(/\s+/g, " ").trim(); // sans parenthèses ni forme juridique
  const parties = propre.split(/\s[-+]\s|\s*\/\s*/).map((x) => x.trim()).filter((x) => x.length >= 3); // marques d'un nom composé (« & » fait partie du nom : « Paulette & Risette »)
  return [...new Set([propre, ...(parties.length > 1 ? parties : [])].filter((x) => x.length >= 2))]; // sans doublon
}

// Liste ordonnée des logos possibles pour une fiche { nom, contacts } : d'abord les sites trouvés dans les
// e-mails (les plus fiables : c'est la vraie entreprise du contact), puis la recherche par nom.
// cle = clé publique logo.dev. Renvoie [{ url, source }] — c'est le NAVIGATEUR qui vérifie ensuite quelles
// images existent vraiment (fallback=404 : pas de logo connu → erreur de chargement → candidat écarté).
export function candidatsLogo({ nom, contacts = [] }, cle) {
  if (!cle) return []; // fonctionnalité désactivée
  const options = `token=${encodeURIComponent(cle)}&size=256&format=png&fallback=404`; // PNG transparent 256 px, 404 si inconnu
  const domaines = [...new Set(contacts.map((c) => domaineProfessionnel(c.email)).filter(Boolean))]; // sites des contacts
  return [
    ...domaines.map((d) => ({ url: `https://img.logo.dev/${encodeURIComponent(d)}?${options}`, source: d })),
    ...nomsDeRecherche(nom).map((n) => ({ url: `https://img.logo.dev/name/${encodeURIComponent(n)}?${options}`, source: `nom « ${n} »` }))
  ];
}

// Vrai si une adresse de logo vient de la recherche automatique (pour l'affichage et la mention logo.dev).
export const estLogoAutomatique = (url) => String(url || "").startsWith("https://img.logo.dev/");
