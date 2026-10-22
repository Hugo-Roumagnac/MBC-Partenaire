/**
 * fallback-data.js — copie des JSON mock, utilisée si fetch() échoue
 * (ouverture en file://). Source de vérité : /mock/*.json
 */
export const FALLBACK_PIPELINE = {
  "saison": "2026-27",
  "colonnes": [
    {
      "id": "Prospect",
      "slug": "prospect",
      "description": "Entreprises identifiées, pas encore contactées"
    },
    {
      "id": "Contacté",
      "slug": "contacte",
      "description": "Premier contact établi"
    },
    {
      "id": "RDV",
      "slug": "rdv",
      "description": "Rendez-vous fixé ou à confirmer"
    },
    {
      "id": "Proposition",
      "slug": "proposition",
      "description": "Offre / devis envoyé"
    },
    {
      "id": "Négociation",
      "slug": "negociation",
      "description": "Discussion sur le pack et le montant"
    },
    {
      "id": "Signé",
      "slug": "signe",
      "description": "Accord validé pour la saison"
    },
    {
      "id": "Perdu",
      "slug": "perdu",
      "description": "Non reconduit ou refusé"
    }
  ]
};
export const FALLBACK_PARTENAIRES = [
  {
    "id": "boulangerie-dupont",
    "nom": "Boulangerie Dupont",
    "etape": "Prospect",
    "type": "Sponsoring",
    "secteur": "Alimentation",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 200,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-24",
    "prochaineActionTexte": "Appeler",
    "premierContact": "2026-10-10",
    "archive": false,
    "notes": "Commerce de proximité, pack entrée.",
    "contacts": [
      {
        "nom": "Marie Dupont",
        "fonction": "Gérante",
        "email": "marie@boulangerie-dupont.fr",
        "tel": "05 56 00 11 22"
      }
    ]
  },
  {
    "id": "garage-martin",
    "nom": "Garage Martin",
    "etape": "Prospect",
    "type": "Sponsoring",
    "secteur": "Automobile",
    "responsable": "Éric Bussing",
    "montantDemande": 400,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-28",
    "prochaineActionTexte": "Passer à l'atelier",
    "premierContact": "2026-10-12",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Paul Martin",
        "fonction": "Patron",
        "email": "contact@garage-martin.fr",
        "tel": "05 56 00 22 33"
      }
    ]
  },
  {
    "id": "cabinet-lefevre",
    "nom": "Cabinet Lefèvre",
    "etape": "Prospect",
    "type": "Mécénat",
    "secteur": "Expertise comptable",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 800,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 800,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-30",
    "prochaineActionTexte": "Envoyer plaquette mécénat",
    "premierContact": "2026-10-08",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Claire Lefèvre",
        "fonction": "Associée",
        "email": "c.lefevre@cabinet-lefevre.fr",
        "tel": "05 56 00 33 44"
      }
    ]
  },
  {
    "id": "pharmacie-centre",
    "nom": "Pharmacie du Centre",
    "etape": "Prospect",
    "type": "Sponsoring",
    "secteur": "Santé",
    "responsable": "",
    "montantDemande": 200,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-11-03",
    "prochaineActionTexte": "Identifier le décideur",
    "premierContact": "2026-10-15",
    "archive": false,
    "notes": "Sans responsable pour l'instant.",
    "contacts": []
  },
  {
    "id": "mairie",
    "nom": "Mairie",
    "etape": "Contacté",
    "type": "Institution",
    "secteur": "Collectivité",
    "responsable": "Éric Bussing",
    "montantDemande": 0,
    "cotisationDemandee": 0,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-11-05",
    "prochaineActionTexte": "Relance service sports",
    "premierContact": "2026-09-20",
    "archive": false,
    "notes": "Subvention / convention à clarifier.",
    "contacts": [
      {
        "nom": "Service sports",
        "fonction": "Chargé de mission",
        "email": "sports@mairie.fr",
        "tel": "05 56 00 00 01"
      }
    ]
  },
  {
    "id": "club-entreprises",
    "nom": "Club Entreprises Locales",
    "etape": "Contacté",
    "type": "Institution",
    "secteur": "Réseau",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 500,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-27",
    "prochaineActionTexte": "Présenter le pack Business Club",
    "premierContact": "2026-09-28",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Nadia K.",
        "fonction": "Présidente",
        "email": "contact@cel-local.fr",
        "tel": "06 00 00 11 22"
      }
    ]
  },
  {
    "id": "imprimerie-nord",
    "nom": "Imprimerie Nord",
    "etape": "Contacté",
    "type": "En nature",
    "secteur": "Communication",
    "responsable": "Éric Bussing",
    "montantDemande": 600,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2026-10-02",
    "archive": false,
    "notes": "Intéressé par un apport flyers / kakémonos.",
    "contacts": [
      {
        "nom": "Luc Moreau",
        "fonction": "Commercial",
        "email": "luc@imprimerie-nord.fr",
        "tel": "05 56 10 20 30"
      }
    ]
  },
  {
    "id": "votaff",
    "nom": "V.Otaff",
    "etape": "RDV",
    "type": "Sponsoring",
    "secteur": "Automobile",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 1500,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 1200,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-17",
    "prochaineActionTexte": "RDV à confirmer",
    "premierContact": "2026-09-01",
    "archive": false,
    "notes": "Partenaire historique, relance urgente.",
    "contacts": [
      {
        "nom": "Vincent Otaff",
        "fonction": "Directeur",
        "email": "v.otaff@exemple.fr",
        "tel": "06 12 34 56 78"
      }
    ]
  },
  {
    "id": "clinique-st-louis",
    "nom": "Clinique Saint-Louis",
    "etape": "RDV",
    "type": "Mécénat",
    "secteur": "Santé",
    "responsable": "Éric Bussing",
    "montantDemande": 2000,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 2000,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-25",
    "prochaineActionTexte": "RDV direction",
    "premierContact": "2026-09-18",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Dr. Bernard",
        "fonction": "Directeur",
        "email": "direction@clinique-stlouis.fr",
        "tel": "05 56 40 50 60"
      }
    ]
  },
  {
    "id": "super-u",
    "nom": "Super U",
    "etape": "RDV",
    "type": "Sponsoring",
    "secteur": "Grande distribution",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 800,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": "2026-10-29",
    "prochaineActionTexte": "RDV chef de magasin",
    "premierContact": "2026-10-01",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Chef de magasin",
        "fonction": "Direction",
        "email": "magasin@superu.fr",
        "tel": "05 56 70 80 90"
      }
    ]
  },
  {
    "id": "parlons-facades",
    "nom": "Parlons Façades",
    "etape": "Proposition",
    "type": "Sponsoring",
    "secteur": "BTP",
    "responsable": "Éric Bussing",
    "montantDemande": 1200,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 4,
    "prochaineActionDate": "2026-10-23",
    "prochaineActionTexte": "Envoyer devis",
    "premierContact": "2026-09-12",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Julien Façades",
        "fonction": "Gérant",
        "email": "julien@parlons-facades.fr",
        "tel": "06 98 76 54 32"
      }
    ]
  },
  {
    "id": "optique-vision",
    "nom": "Optique Vision",
    "etape": "Proposition",
    "type": "Sponsoring",
    "secteur": "Santé",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 600,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 3,
    "prochaineActionDate": "2026-10-26",
    "prochaineActionTexte": "Relancer le devis",
    "premierContact": "2026-09-22",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Inès Lopez",
        "fonction": "Opticienne",
        "email": "ines@optique-vision.fr",
        "tel": "05 56 11 22 33"
      }
    ]
  },
  {
    "id": "banquette-co",
    "nom": "Banquette & Co",
    "etape": "Proposition",
    "type": "En nature",
    "secteur": "Ameublement",
    "responsable": "Éric Bussing",
    "montantDemande": 900,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 2,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2026-10-05",
    "archive": false,
    "notes": "Canapés lounge pour le club house.",
    "contacts": []
  },
  {
    "id": "maif",
    "nom": "Maïf",
    "etape": "Négociation",
    "type": "Sponsoring",
    "secteur": "Assurance",
    "responsable": "",
    "montantDemande": 0,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 2500,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2026-08-15",
    "archive": false,
    "notes": "En négociation, sans prochaine action.",
    "contacts": [
      {
        "nom": "Agence Maïf",
        "fonction": "Responsable partenariat",
        "email": "agence@maif.fr",
        "tel": "05 56 00 44 55"
      }
    ]
  },
  {
    "id": "credit-agricole",
    "nom": "Crédit Agricole",
    "etape": "Négociation",
    "type": "Sponsoring + mécénat",
    "secteur": "Banque",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 3000,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 1000,
    "montantPrecedent": 2800,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 6,
    "prochaineActionDate": "2026-10-31",
    "prochaineActionTexte": "Arbitrer pack P3 vs P4",
    "premierContact": "2026-08-01",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Sophie R.",
        "fonction": "Chargée de mécénat",
        "email": "sophie.r@ca.fr",
        "tel": "05 56 99 88 77"
      }
    ]
  },
  {
    "id": "decathlon",
    "nom": "Decathlon",
    "etape": "Négociation",
    "type": "Sponsoring",
    "secteur": "Sport",
    "responsable": "Éric Bussing",
    "montantDemande": 2500,
    "cotisationDemandee": 200,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 5,
    "prochaineActionDate": "2026-11-04",
    "prochaineActionTexte": "Négocier visibilité magasin",
    "premierContact": "2026-09-05",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Rayon club",
        "fonction": "Responsable",
        "email": "club@decathlon.fr",
        "tel": "05 56 12 12 12"
      }
    ]
  },
  {
    "id": "myjob",
    "nom": "MyJob",
    "etape": "Signé",
    "type": "Sponsoring + mécénat",
    "secteur": "Intérim",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 2000,
    "cotisationDemandee": 200,
    "montantValide": 2200,
    "cotisationValidee": 200,
    "dontMecenat": 2000,
    "montantPrecedent": 0,
    "encaisse": 600,
    "contrepartiesLivrees": 4,
    "contrepartiesTotal": 6,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2025-09-01",
    "archive": false,
    "notes": "CERFA à émettre (part mécénat 2 000 €).",
    "contacts": [
      {
        "nom": "Contact Exemple",
        "fonction": "Directrice d'agence",
        "email": "contact@exemple.fr",
        "tel": "05 00 00 00 00"
      }
    ]
  },
  {
    "id": "safti",
    "nom": "Safti",
    "etape": "Signé",
    "type": "Sponsoring",
    "secteur": "Immobilier",
    "responsable": "Éric Bussing",
    "montantDemande": 1800,
    "cotisationDemandee": 200,
    "montantValide": 1600,
    "cotisationValidee": 200,
    "dontMecenat": 0,
    "montantPrecedent": 0,
    "encaisse": 0,
    "contrepartiesLivrees": 1,
    "contrepartiesTotal": 4,
    "prochaineActionDate": "2026-10-25",
    "prochaineActionTexte": "Envoyer logo",
    "premierContact": "2026-07-10",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Agence Safti",
        "fonction": "Conseiller",
        "email": "agence@safti.fr",
        "tel": "05 56 21 21 21"
      }
    ]
  },
  {
    "id": "proxisure",
    "nom": "Proxisure",
    "etape": "Signé",
    "type": "Sponsoring",
    "secteur": "Assurance",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 1400,
    "cotisationDemandee": 200,
    "montantValide": 1200,
    "cotisationValidee": 200,
    "dontMecenat": 0,
    "montantPrecedent": 1400,
    "encaisse": 0,
    "contrepartiesLivrees": 2,
    "contrepartiesTotal": 4,
    "prochaineActionDate": "2026-10-20",
    "prochaineActionTexte": "Relancer échéance septembre",
    "premierContact": "2025-08-01",
    "archive": false,
    "notes": "Échéance de septembre non payée (700 €).",
    "contacts": [
      {
        "nom": "Agence Proxisure",
        "fonction": "Gestionnaire",
        "email": "agence@proxisure.fr",
        "tel": "05 56 31 31 31"
      }
    ]
  },
  {
    "id": "intermarche",
    "nom": "Intermarché",
    "etape": "Signé",
    "type": "Sponsoring",
    "secteur": "Grande distribution",
    "responsable": "Éric Bussing",
    "montantDemande": 2000,
    "cotisationDemandee": 200,
    "montantValide": 1800,
    "cotisationValidee": 200,
    "dontMecenat": 0,
    "montantPrecedent": 1800,
    "encaisse": 400,
    "contrepartiesLivrees": 3,
    "contrepartiesTotal": 5,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2024-09-01",
    "archive": false,
    "notes": "",
    "contacts": []
  },
  {
    "id": "harmonie",
    "nom": "Harmonie Mutuelle",
    "etape": "Signé",
    "type": "Mécénat",
    "secteur": "Mutuelle",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 1600,
    "cotisationDemandee": 200,
    "montantValide": 1400,
    "cotisationValidee": 200,
    "dontMecenat": 1400,
    "montantPrecedent": 0,
    "encaisse": 1600,
    "contrepartiesLivrees": 5,
    "contrepartiesTotal": 5,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2026-06-01",
    "archive": false,
    "notes": "",
    "contacts": [
      {
        "nom": "Pôle mécénat",
        "fonction": "Chargée de mission",
        "email": "mecenat@harmonie.fr",
        "tel": "05 56 41 41 41"
      }
    ]
  },
  {
    "id": "lafter",
    "nom": "L'After",
    "etape": "Perdu",
    "type": "Sponsoring",
    "secteur": "Restauration",
    "responsable": "Éric Bussing",
    "montantDemande": 0,
    "cotisationDemandee": 0,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 2000,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2024-09-01",
    "archive": false,
    "notes": "Non renouvelé 2026-27.",
    "contacts": []
  },
  {
    "id": "exemple-perdu-2",
    "nom": "Atelier Bois",
    "etape": "Perdu",
    "type": "Sponsoring",
    "secteur": "Artisanat",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 0,
    "cotisationDemandee": 0,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 1200,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2025-01-10",
    "archive": false,
    "notes": "Budget 2026 gelé.",
    "contacts": []
  },
  {
    "id": "le-mail",
    "nom": "Restaurant Le Mail",
    "etape": "Perdu",
    "type": "Sponsoring",
    "secteur": "Restauration",
    "responsable": "Éric Bussing",
    "montantDemande": 0,
    "cotisationDemandee": 0,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 800,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2025-03-01",
    "archive": false,
    "notes": "",
    "contacts": []
  },
  {
    "id": "old-sponsor",
    "nom": "Ancien Sponsor 2024",
    "etape": "Archivé",
    "type": "Sponsoring",
    "secteur": "Divers",
    "responsable": "Thomas Roumagnac",
    "montantDemande": 0,
    "cotisationDemandee": 0,
    "montantValide": 0,
    "cotisationValidee": 0,
    "dontMecenat": 0,
    "montantPrecedent": 500,
    "encaisse": 0,
    "contrepartiesLivrees": 0,
    "contrepartiesTotal": 0,
    "prochaineActionDate": null,
    "prochaineActionTexte": "",
    "premierContact": "2023-09-01",
    "archive": true,
    "notes": "Fiche archivée, hors pipeline.",
    "contacts": []
  }
];
export const FALLBACK_EVENEMENTS = [
  {
    "id": "evt-1",
    "nom": "Afterwork de rentrée",
    "date": "2026-09-12",
    "type": "Afterwork",
    "presences": [
      {
        "partnerId": "myjob",
        "presence": "Oui",
        "personnes": 2,
        "noms": "Exemple Un, Exemple Deux"
      },
      {
        "partnerId": "safti",
        "presence": "Oui",
        "personnes": 3,
        "noms": "Léa, Marc, Nina"
      },
      {
        "partnerId": "harmonie",
        "presence": "En attente",
        "personnes": 0,
        "noms": ""
      },
      {
        "partnerId": "intermarche",
        "presence": "Oui",
        "personnes": 4,
        "noms": "Équipe magasin"
      },
      {
        "partnerId": "proxisure",
        "presence": "Non",
        "personnes": 0,
        "noms": ""
      }
    ]
  },
  {
    "id": "evt-2",
    "nom": "Match sponsors",
    "date": "2026-10-03",
    "type": "Match",
    "presences": [
      {
        "partnerId": "myjob",
        "presence": "En attente",
        "personnes": 0,
        "noms": ""
      },
      {
        "partnerId": "safti",
        "presence": "Oui",
        "personnes": 2,
        "noms": "Agence"
      },
      {
        "partnerId": "credit-agricole",
        "presence": "Oui",
        "personnes": 5,
        "noms": "Pôle mécénat"
      },
      {
        "partnerId": "decathlon",
        "presence": "Oui",
        "personnes": 3,
        "noms": "Rayon club"
      }
    ]
  },
  {
    "id": "evt-3",
    "nom": "Business Club d'automne",
    "date": "2026-11-14",
    "type": "Business Club",
    "presences": [
      {
        "partnerId": "myjob",
        "presence": "En attente",
        "personnes": 0,
        "noms": ""
      },
      {
        "partnerId": "harmonie",
        "presence": "En attente",
        "personnes": 0,
        "noms": ""
      }
    ]
  }
];
