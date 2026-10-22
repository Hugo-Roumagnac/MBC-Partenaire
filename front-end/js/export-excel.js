// export-excel.js — génère le classeur Excel daté à 6 onglets à partir du store (§4.8).
import { jourNumero, aujourdhui } from "./dates.js"; // conversion ISO → numéro de jour
import { totalValide, totalDemande } from "./selectors.js"; // totaux
import { showToast } from "./utils.js"; // message

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
    ["Partenaire", "Secteur", "Étape", "Type", "Responsable", "Premier contact", `Demandé ${reglages.saisonEnCours}`, "Cotisation demandée", "Montant validé", "Cotisation validée", "Total validé", "Dont mécénat", "CERFA émis", "Valeur apport en nature", "Description apport en nature", "Modalités de paiement", "Encaissé", "Reste à encaisser", `Validé ${reglages.saisonPrecedente}`, "Prochaine action (date)", "Prochaine action (texte)", "Notes", "Dernière modification", "Modifié par"],
    store.partenaires.slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((v) => [
      v.nom, v.secteur || "", v.etape, v.type || "", v.responsable || "", date(v.premierContact),
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

  XLSX.writeFile(wb, `MBC-Partenaires_${aujourdhui()}.xlsx`); // déclenche le téléchargement du fichier daté
  showToast("Export généré — rangez-le sur l'espace partagé du club (RGPD)"); // rappel §6
}
