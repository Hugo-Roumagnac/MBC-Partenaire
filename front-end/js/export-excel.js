// export-excel.js — génère le classeur Excel daté à partir du store (§4.8).
// 6 onglets d'origine + v2 : « Affectations » (ventilation des fonds) et « Journal » (audit).
import { jourNumero, aujourdhui } from "./dates.js"; // conversion ISO → numéro de jour
import { totalValide, totalDemande, formaterSiret, colonnePipeline, calculerVentilation, resumerAppareil } from "./selectors.js"; // totaux (v2 : + SIRET, ventilation, journal)
import { showToast } from "./utils.js"; // message
import { LIBELLES_TABLES } from "./journal.js"; // v2 : « Fiche », « Échéance »… au lieu des noms techniques

const SOURCES_XLSX = ["./vendor/xlsx.mjs", "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"]; // fichier local d'abord, CDN en secours

async function chargerSheetJS() {
  for (const src of SOURCES_XLSX) { try { return await import(src); } catch { /* on essaie la source suivante */ } } // essaie chaque source
  throw new Error("SheetJS introuvable"); // aucune source disponible
}

// ----- Fabriques de cellules typées -----
const date = (iso) => (iso ? { t: "n", v: jourNumero(String(iso).slice(0, 10)) + 25569, z: "dd/mm/yyyy" } : ""); // ISO → série Excel (25569 = 01/01/1970)
const euro = (n) => ({ t: "n", v: Number(n) || 0, z: '#,##0.00" €"' }); // montant formaté en euros
const oui = (b) => (b ? "Oui" : "Non"); // booléen lisible

// Construit une feuille : en-têtes + lignes, largeurs de colonnes, filtre automatique.
function feuille(XLSX, entetes, lignes) {
  const ws = XLSX.utils.aoa_to_sheet([entetes, ...lignes]); // tableau de tableaux → feuille
  ws["!cols"] = entetes.map((h, i) => ({ wch: Math.min(60, Math.max(h.length + 2, ...lignes.slice(0, 200).map((l) => String(l[i]?.v ?? l[i] ?? "").length + 2))) })); // largeur adaptée au contenu
  ws["!autofilter"] = { ref: ws["!ref"] }; // filtres sur la ligne d'en-têtes
  return ws; // feuille prête
}

export async function exporterExcel(store) {
  const XLSX = await chargerSheetJS(); // charge SheetJS
  const { raw, reglages } = store; // tables brutes + réglages
  const nom = new Map(raw.partenaires.map((p) => [p.id, p.nom])); // nom du partenaire par id
  const parNom = (a, b) => String(nom.get(a.partenaireId)).localeCompare(String(nom.get(b.partenaireId)), "fr"); // tri alphabétique par partenaire

  const wb = XLSX.utils.book_new(); // nouveau classeur

  // 1) PARTENAIRES : une ligne par fiche, tous les montants de la saison en cours
  XLSX.utils.book_append_sheet(wb, feuille(XLSX,
    ["Partenaire", "SIRET", "Secteur", "Étape", "Colonne pipeline", "Type", "Responsable", "Premier contact", `Demandé ${reglages.saisonEnCours}`, "Cotisation demandée", "Montant validé", "Cotisation validée", "Total validé", "Dont mécénat", "CERFA émis", "Valeur apport en nature", "Description apport en nature", "Modalités de paiement", "Encaissé", "Reste à encaisser", `Validé ${reglages.saisonPrecedente}`, "Prochaine action (date)", "Prochaine action (texte)", "Notes", "Dernière modification", "Modifié par"],
    store.partenaires.slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((v) => [
      v.nom, formaterSiret(v.siret), v.secteur || "", v.etape, colonnePipeline(v), v.type || "", v.responsable || "", date(v.premierContact),
      euro(v.montantDemande), euro(v.cotisationDemandee), euro(v.montantValide), euro(v.cotisationValidee), euro(totalValide(v)),
      euro(v.dontMecenat), oui(v.cerfaEmis), euro(v.contrat?.natureValeur), v.contrat?.natureDescription || "", v.contrat?.modalites || "",
      euro(v.encaisse), euro(Math.max(0, totalValide(v) - v.encaisse)), euro(v.montantPrecedent),
      date(v.prochaineActionDate), v.prochaineActionTexte || "", v.notes || "", date(v.modifieLe), v.modifiePar || ""
    ])), "Partenaires"); // ligne par ligne : mêmes colonnes que l'en-tête

  // 2) CONTACTS
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Partenaire", "Nom", "Fonction", "E-mail", "Téléphone"],
    raw.contacts.slice().sort(parNom).map((c) => [nom.get(c.partenaireId) || "?", c.nom || "", c.fonction || "", c.email || "", c.tel || ""])), "Contacts"); // une ligne par contact

  // 3) ÉCHÉANCIER (toutes saisons)
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Partenaire", "Saison", "Date prévue", "Montant", "Payé", "Note"],
    raw.echeances.slice().sort(parNom).map((e) => [nom.get(e.partenaireId) || "?", e.saison || "", date(e.datePrevue), euro(e.montant), oui(e.paye), e.note || ""])), "Échéancier"); // une ligne par échéance

  // 4) CONTREPARTIES (toutes saisons)
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Partenaire", "Saison", "Contrepartie", "Livrée"],
    raw.contreparties.slice().sort(parNom).map((c) => [nom.get(c.partenaireId) || "?", c.saison || "", c.libelle || "", oui(c.livree)])), "Contreparties"); // une ligne par contrepartie

  // 5) PRÉSENCES (une ligne par partenaire et par événement)
  const evt = new Map(raw.evenements.map((e) => [e.id, e])); // événements par id
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Événement", "Date", "Type", "Partenaire", "Présence", "Nombre de personnes", "Noms"],
    raw.presences.map((p) => [evt.get(p.evenementId)?.nom || "?", date(evt.get(p.evenementId)?.date), evt.get(p.evenementId)?.type || "", nom.get(p.partenaireId) || "?", p.presence, Number(p.personnes) || 0, p.noms || ""])
      .sort((a, b) => String(b[1].v ?? 0).localeCompare(String(a[1].v ?? 0)) || String(a[3]).localeCompare(String(b[3]), "fr"))), "Présences"); // plus récent d'abord

  // 6) HISTORIQUE (toutes saisons, plus récent d'abord)
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Partenaire", "Date", "Auteur", "Échange", "Automatique"],
    raw.echanges.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((x) => [nom.get(x.partenaireId) || "?", date(x.date), x.auteur || "", x.texte || "", oui(x.auto)])), "Historique"); // une ligne par échange

  // 7) v2 — AFFECTATIONS : une ligne par affectation (saison en cours), puis le récapitulatif par catégorie
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Partenaire", "Étape", "Saison", "Catégorie", "Montant", "Note"],
    raw.affectations.slice().sort(parNom).map((a) => [nom.get(a.partenaireId) || "?", raw.partenaires.find((p) => p.id === a.partenaireId)?.etape || "", a.saison || "", a.categorie || "", euro(a.montant), a.note || ""])), "Affectations");
  const vent = calculerVentilation(store.partenaires, reglages.categories); // mêmes cumuls que le tableau de bord
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Catégorie", "Affecté (signés)", "Dont encaissé (prorata)", "Nombre de partenaires"],
    [...vent.lignes.map((l) => [l.categorie, euro(l.affecte), euro(l.encaisse), l.nombre]), ["Reste à affecter", euro(vent.nonAffecte), "", ""], ["TOTAL SIGNÉ", euro(vent.totalSigne), euro(vent.totalEncaisse), ""]]), "Ventilation");

  // 8) v2 — JOURNAL : entrées chargées (les plus récentes), avec compte et appareil
  const heure = (iso) => (iso ? { t: "n", v: new Date(iso).getTime() / 86400000 + 25569 - new Date(iso).getTimezoneOffset() / 1440, z: "dd/mm/yyyy hh:mm" } : ""); // horodatage → série Excel (heure locale)
  XLSX.utils.book_append_sheet(wb, feuille(XLSX, ["Date et heure", "Membre", "Compte (e-mail)", "Appareil", "Action", "Élément", "Partenaire", "Champs modifiés", "Avant", "Après"],
    store.journal.map((j) => [heure(j.le), j.nom || (j.email ? "" : "Administration"), j.email || "", resumerAppareil(j.appareil), { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" }[j.action] || j.action, LIBELLES_TABLES[j.tableNom] || j.tableNom, nom.get(j.partenaireId) || j.partenaireId || "", (j.champs || []).join(", "), JSON.stringify(j.avant ?? ""), JSON.stringify(j.apres ?? "")].map((c) => (typeof c === "string" && c.length > 32000 ? c.slice(0, 32000) : c)))), "Journal"); // Excel limite une cellule à 32 767 caractères

  XLSX.writeFile(wb, `MBC-Partenaires_${aujourdhui()}.xlsx`); // déclenche le téléchargement du fichier daté
  showToast("Export généré — rangez-le sur l'espace partagé du club (RGPD)"); // rappel §6
}
