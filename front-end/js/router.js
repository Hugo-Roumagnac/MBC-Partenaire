// router.js — routage par hash : choisit l'écran actif et ouvre/ferme la fiche partenaire.
// URL : #/<ecran>[?fiche=<id>]  ex. #/paiements?fiche=myjob

export const ECRANS = ["dashboard", "pipeline", "partenaires", "paiements", "evenements"]; // les 5 écrans (§4)
const TITRES = { dashboard: "Tableau de bord", pipeline: "Pipeline", partenaires: "Partenaires", paiements: "Paiements", evenements: "Événements" };

const rendus = new Map(); // écran → fonction de rendu
let premierPassage = true;
let ecranCourant = "dashboard";
let ouvrirFiche = () => {};
let fermerFiche = () => {};

export const ecranActif = () => ecranCourant;
export function enregistrerEcran(nom, fonctionRendu) { rendus.set(nom, fonctionRendu); }

// Lien vers la fiche d'un partenaire, depuis l'écran courant.
export const ficheHref = (id) => `#/${ecranCourant}?fiche=${encodeURIComponent(id)}`;

// "#/paiements?fiche=abc" → { ecran: "paiements", ficheId: "abc" }
export function lireHash(hash = location.hash) {
  const [chemin, requete = ""] = hash.replace(/^#\/?/, "").split("?");
  const ecran = ECRANS.includes(chemin) ? chemin : "dashboard";
  const ficheId = new URLSearchParams(requete).get("fiche");
  return { ecran, ficheId };
}

export function naviguer({ ecran = ecranCourant, ficheId = null } = {}) {
  const cible = `#/${ecran}${ficheId ? `?fiche=${encodeURIComponent(ficheId)}` : ""}`;
  if (location.hash !== cible) location.hash = cible;
}

function afficherEcran(nom) {
  const change = nom !== ecranCourant;
  ecranCourant = nom;
  document.body.dataset.screen = nom; // le CSS affiche la section correspondante
  document.querySelectorAll("[data-nav]").forEach((a) => { // état actif des liens (barre latérale + navigation mobile)
    if (a.dataset.nav === nom) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const titre = document.getElementById("topbar-title"); if (titre) titre.textContent = TITRES[nom];
  document.title = `${TITRES[nom]} · MBC Partenaires`;
  if (change && !premierPassage) window.scrollTo({ top: 0 });
  rendus.get(nom)?.();
}

function surChangementDeHash() {
  const { ecran, ficheId } = lireHash();
  if (ecran !== ecranCourant || premierPassage) afficherEcran(ecran);
  premierPassage = false;
  if (ficheId) ouvrirFiche(ficheId); else fermerFiche();
}

export const rendreEcranActif = () => rendus.get(ecranCourant)?.();

export function initRouter({ onOuvrirFiche, onFermerFiche }) {
  ouvrirFiche = onOuvrirFiche;
  fermerFiche = onFermerFiche;
  window.addEventListener("hashchange", surChangementDeHash);
  surChangementDeHash();
}
