// selectors.test.mjs — tests des règles métier. Lancer : node --test
import test from "node:test"; // lanceur de tests intégré à Node
import assert from "node:assert/strict"; // assertions strictes
import { repartirCents, planifierEcheancier, calculerTableauDeBord, enRetard, cerfaAEmettre } from "../front-end/js/selectors.js"; // fonctions testées
import { ajouterMois } from "../front-end/js/dates.js"; // helper de dates
import { CATALOGUE_CONTREPARTIES } from "../front-end/js/mock-seed.js"; // catalogue officiel du §3 du PDF

test("catalogue officiel des contreparties : exactement 20 libellés", () => { // règle §3 du PDF
  assert.equal(CATALOGUE_CONTREPARTIES.length, 20); // 20 entrées imposées
  assert.equal(CATALOGUE_CONTREPARTIES.includes("Logo short NM3"), true); // équipement
  assert.equal(CATALOGUE_CONTREPARTIES.includes("Dos maillot NM3"), true); // équipement
  assert.equal(CATALOGUE_CONTREPARTIES.includes("Diffusion radio NM3"), true); // radio
});

test("le dernier versement absorbe l'arrondi", () => { // règle §5.3
  assert.deepEqual(repartirCents(100000, 3), [33333, 33333, 33334]); // 1000 € en 3 → 333,33 / 333,33 / 333,34
});

test("ajouterMois borne le jour au dernier jour du mois", () => { // piège du 31
  assert.equal(ajouterMois("2026-01-31", 1), "2026-02-28"); // février n'a pas de 31
  assert.equal(ajouterMois("2026-11-15", 3), "2027-02-15"); // passage d'année
});

test("le générateur garde les payées et remplace les non payées", () => { // règle §5.3
  const vue = { echeances: [{ id: "a", paye: true, montant: 300 }, { id: "b", paye: false, montant: 300 }] }; // 1 payée + 1 non payée
  const plan = planifierEcheancier(vue, { montant: 800, nombre: 8, premierVersement: "2026-10-31" }); // 8 versements
  assert.deepEqual(plan.aSupprimer, ["b"]); // seule la non payée est supprimée
  assert.equal(plan.aCreer.length, 8); // 8 nouvelles échéances
  assert.equal(plan.aCreer.reduce((t, e) => t + e.montant, 0), 800); // la somme est exacte
  assert.equal(plan.aCreer[1].datePrevue, "2026-11-30"); // 31 octobre + 1 mois → 30 novembre
});

test("en retard = non payée ET date dépassée", () => { // §5
  assert.equal(enRetard({ paye: false, datePrevue: "2026-10-01" }, "2026-10-22"), true); // dépassée
  assert.equal(enRetard({ paye: true, datePrevue: "2026-10-01" }, "2026-10-22"), false); // payée
  assert.equal(enRetard({ paye: false, datePrevue: null }, "2026-10-22"), false); // sans date
});

test("CERFA à émettre", () => { // §5
  assert.equal(cerfaAEmettre({ etape: "Signé", dontMecenat: 2000, cerfaEmis: false }), true); // cas nominal
  assert.equal(cerfaAEmettre({ etape: "Négociation", dontMecenat: 2000, cerfaEmis: false }), false); // pas signé
});

test("tableau de bord : négociation = RDV + Proposition + Négociation, reste jamais négatif", () => { // §5
  const v = (etape, d, c, vd = 0, cv = 0) => ({ id: etape + d, nom: etape, etape, montantDemande: d, cotisationDemandee: c, montantValide: vd, cotisationValidee: cv, dontMecenat: 0, montantPrecedent: 0, contrepartiesLivrees: 0, contrepartiesTotal: 0, echeances: [] }); // fabrique de vues
  const etat = { partenaires: [v("RDV", 100, 200), v("Proposition", 300, 200), v("Négociation", 500, 200), v("Prospect", 999, 200), v("Signé", 0, 0, 40000, 200)], echeances: [], reglages: { objectif: 1000 } }; // 5 partenaires
  const t = calculerTableauDeBord(etat, "2026-10-22"); // calcul
  assert.equal(t.score.negocie, 1500); // (100+200)+(300+200)+(500+200), le Prospect est exclu
  assert.equal(t.score.signe, 40200); // validé + cotisation validée
  assert.equal(t.score.reste, 0); // jamais négatif
  assert.equal(t.score.pctSigne, 100); // pourcentage borné à 100
});
