// mock-seed.js — transforme mock/*.json (modèle plat) en tables normalisées pour le mode "mock".
import { loadMockData } from "./data.js"; // charge les JSON plats existants

// Catalogue des contreparties du §3 du PDF (exactement 20 libellés officiels).
export const CATALOGUE_CONTREPARTIES = [
  "Pack P1", "Pack P2", "Pack P3", "Pack P4", // les 4 packs
  "Écran géant", // affichage dans la salle
  "Logo short NM3", "Dos maillot NM3", // visibilité sur l'équipement
  "Post réseaux sociaux", "Post résultats", "Newsletter", "Vidéo réel", // communication
  "Invitations match", "Business Club / afterworks", // invitations et événements
  "Intervention équipe seniors", // animation
  "Équipe U15 Élite", "Équipe U18", "Équipe SF1", // équipes (3 lignes distinctes)
  "Véhicules exposés", // présence de véhicules
  "Diffusion radio NM3", // radio
  "Places cinéma à gagner" // jeu concours
]; // = 20 entrées officielles

// Transforme les JSON plats en tables normalisées.
export async function seedTables() {
  const data = await loadMockData(); // charge partenaires.json et evenements.json
  const tables = {
    partenaires: [],
    contrats: [],
    echeances: [],
    contreparties: [],
    contacts: [],
    echanges: [],
    evenements: [],
    presences: [],
    reglages: [{ id: 1, saisonEnCours: "2026-27", saisonPrecedente: "2025-26", objectif: 50000, responsables: ["Thomas Roumagnac", "Éric Bussing"], catalogue: CATALOGUE_CONTREPARTIES }],
    membres: [{ email: "thomas@exemple.fr", nom: "Thomas Roumagnac" }, { email: "eric@exemple.fr", nom: "Éric Bussing" }]
  };

  const SAISON_N = "2026-27"; // saison en cours
  const SAISON_P = "2025-26"; // saison précédente

  // Transformation des partenaires
  for (const p of data.partenaires) {
    tables.partenaires.push({
      id: p.id,
      nom: p.nom,
      secteur: p.secteur || "",
      etape: p.archive ? "Archivé" : p.etape,
      type: p.type || "",
      responsable: p.responsable || "",
      notes: p.notes || "",
      prochaineActionDate: p.prochaineActionDate || null,
      prochaineActionTexte: p.prochaineActionTexte || "",
      premierContact: p.premierContact || null,
      modifieLe: new Date().toISOString(),
      modifiePar: "import"
    });

    // Contrat de la saison en cours
    tables.contrats.push({
      id: crypto.randomUUID(),
      partenaireId: p.id,
      saison: SAISON_N,
      montantDemande: p.montantDemande || 0,
      cotisationDemandee: p.cotisationDemandee || 200,
      montantValide: p.montantValide || 0,
      cotisationValidee: p.cotisationValidee || 0,
      dontMecenat: p.dontMecenat || 0,
      cerfaEmis: false,
      natureValeur: 0,
      natureDescription: "",
      modalites: ""
    });

    // Contrat de la saison précédente s'il y a un montant précédent
    if (p.montantPrecedent > 0) {
      tables.contrats.push({
        id: crypto.randomUUID(),
        partenaireId: p.id,
        saison: SAISON_P,
        montantDemande: 0,
        cotisationDemandee: 0,
        montantValide: p.montantPrecedent,
        cotisationValidee: 0,
        dontMecenat: 0,
        cerfaEmis: false,
        natureValeur: 0,
        natureDescription: "",
        modalites: ""
      });
    }

    // Échéances (démo) : échéancier mensuel de septembre à avril pour les signés ;
    // les premières sont marquées payées à hauteur de l'encaissé, d'autres restent en retard.
    const totalValide = (p.montantValide || 0) + (p.cotisationValidee || 0);
    if (p.etape === "Signé" && totalValide > 0) {
      const n = totalValide >= 1500 ? 8 : totalValide >= 800 ? 4 : 1;
      const base = Math.floor((totalValide * 100) / n);
      const payees = Math.round(((p.encaisse || 0) / totalValide) * n);
      for (let i = 0; i < n; i++) {
        const cents = i === n - 1 ? totalValide * 100 - base * (n - 1) : base;
        const mois = 9 + i, annee = mois > 12 ? 2027 : 2026;
        tables.echeances.push({
          id: crypto.randomUUID(), partenaireId: p.id, saison: SAISON_N,
          datePrevue: `${annee}-${String(((mois - 1) % 12) + 1).padStart(2, "0")}-15`,
          montant: cents / 100, paye: i < payees,
          note: i < payees ? (i % 2 ? "Chèque" : "Virement") : ""
        });
      }
    }

    // Contreparties : autant que le total, les N premières livrées
    const totalCp = p.contrepartiesTotal || 0;
    const livrees = p.contrepartiesLivrees || 0;
    for (let i = 0; i < totalCp; i++) {
      tables.contreparties.push({
        id: crypto.randomUUID(),
        partenaireId: p.id,
        saison: SAISON_N,
        libelle: CATALOGUE_CONTREPARTIES[i % CATALOGUE_CONTREPARTIES.length],
        livree: i < livrees
      });
    }

    // Contacts
    for (const c of p.contacts || []) {
      tables.contacts.push({
        id: crypto.randomUUID(),
        partenaireId: p.id,
        nom: c.nom || "",
        fonction: c.fonction || "",
        email: c.email || "",
        tel: c.tel || ""
      });
    }

    // Échange de création
    tables.echanges.push({
      id: crypto.randomUUID(),
      partenaireId: p.id,
      date: p.premierContact || new Date().toISOString().slice(0, 10),
      texte: "Fiche créée (import)",
      auteur: "import",
      auto: true,
      creeLe: new Date().toISOString()
    });
  }

  // Transformation des événements
  for (const evt of data.evenements) {
    tables.evenements.push({
      id: evt.id,
      nom: evt.nom,
      date: evt.date,
      type: evt.type
    });

    // Présences
    for (const pres of evt.presences || []) {
      tables.presences.push({
        id: crypto.randomUUID(),
        evenementId: evt.id,
        partenaireId: pres.partnerId,
        presence: pres.presence,
        personnes: pres.personnes || 0,
        noms: pres.noms || ""
      });
    }
  }

  return tables; // toutes les tables normalisées
}
