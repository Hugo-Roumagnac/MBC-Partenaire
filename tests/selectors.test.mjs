// selectors.test.mjs — tests des règles métier. Lancer : node --test
import test from "node:test"; // lanceur de tests intégré à Node
import assert from "node:assert/strict"; // assertions strictes
import { repartirCents, planifierEcheancier, calculerTableauDeBord, enRetard, cerfaAEmettre } from "../front-end/js/selectors.js"; // fonctions testées
import { validerSiret, formaterSiret, estSolde, colonnePipeline, resteAEncaisser, calculerRepartition, construireAFaire, resumerAppareil, PRESENCES } from "../front-end/js/selectors.js"; // v2
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

// =============================================================================
// v2 — nouvelles règles
// =============================================================================

test("SIRET : 14 chiffres, espaces tolérés, clé de Luhn vérifiée", () => {
  assert.deepEqual(validerSiret(""), { valide: true, siret: "", erreur: "" }); // facultatif
  assert.equal(validerSiret("732 829 320 00074").valide, true); // espaces retirés, clé correcte
  assert.equal(validerSiret("732 829 320 00074").siret, "73282932000074"); // normalisé
  assert.equal(validerSiret("73282932000075").valide, false); // dernier chiffre faux → clé incorrecte
  assert.match(validerSiret("123").erreur, /14 chiffres/); // longueur
  assert.equal(validerSiret("35600000049837").valide, true); // exception La Poste (somme multiple de 5)
  assert.equal(formaterSiret("73282932000074"), "732 829 320 00074"); // affichage lisible
});

const vue = (o) => ({ id: "x", nom: "X", etape: "Signé", montantValide: 1000, cotisationValidee: 200, montantDemande: 0, cotisationDemandee: 0, dontMecenat: 0, encaisse: 0, montantPrecedent: 0, contrepartiesLivrees: 0, contrepartiesTotal: 0, echeances: [], affectations: [], ...o }); // fabrique de vues

test("pipeline : « Signé » = soldés, « Non encaissé » = signés avec un reste dû", () => {
  assert.equal(colonnePipeline(vue({ encaisse: 600 })), "Non encaissé"); // 1200 € validés, 600 € payés
  assert.equal(resteAEncaisser(vue({ encaisse: 600 })), 600); // reste dû affiché sur la carte
  assert.equal(colonnePipeline(vue({ encaisse: 1200 })), "Signé"); // tout payé → reste dans « Signé »
  assert.equal(estSolde(vue({ montantValide: 0, cotisationValidee: 0 })), true); // contrat à 0 € (apport en nature) : rien à encaisser
  assert.equal(colonnePipeline(vue({ etape: "Négociation", encaisse: 0 })), "Négociation"); // seule l'étape « Signé » est concernée
});

test("répartition automatique : cotisations / sponsoring / mécénat, encaissé au prorata", () => {
  const a = vue({ id: "a", montantValide: 2500, cotisationValidee: 200, dontMecenat: 2000, encaisse: 1350 }); // cas « MyJob », payé à 50 %
  const b = vue({ id: "b", montantValide: 1000, cotisationValidee: 200, encaisse: 1200 }); // payé à 100 %
  const c = vue({ id: "c", etape: "Négociation", montantValide: 9999, cotisationValidee: 200 }); // non signé : ignoré
  const n = vue({ id: "n", montantValide: 0, cotisationValidee: 0, contrat: { natureValeur: 800 } }); // apport en nature
  const r = calculerRepartition([a, b, c, n]);
  const l = Object.fromEntries(r.lignes.map((x) => [x.categorie, x]));
  assert.equal(l.Cotisations.signe, 400); // 200 + 200
  assert.equal(l.Mécénat.signe, 2000); // part de mécénat de A
  assert.equal(l.Sponsoring.signe, 1500); // (2500 − 2000) + 1000
  assert.equal(r.totalSigne, 3900); // = 2700 + 1200, le signé du score
  assert.equal(l.Cotisations.encaisse, 300); // 100 (50 % de 200) + 200
  assert.equal(l.Mécénat.encaisse, 1000); // 50 % de 2000
  assert.equal(r.totalEncaisse, 2550); // 1350 + 1200 : les catégories retombent exactement sur l'encaissé
  assert.equal(r.nature.valeur, 800); // apports en nature à part
  assert.equal(l.Cotisations.nombre, 2);
});

test("événements : « Contact à rajouter » existe et alimente la liste « À faire »", () => {
  assert.equal(PRESENCES.includes("Contact à rajouter"), true); // nouvelle valeur
  const evts = [{ nom: "Afterwork", date: "2026-11-20", presences: [{ partenaireId: "x", presence: "Contact à rajouter", noms: "Jean D." }, { partenaireId: "x", presence: "Oui" }] }];
  const todo = construireAFaire([vue({})], [], "2026-11-07", evts);
  assert.equal(todo.length, 1); // une seule ligne : le « Oui » n'en crée pas
  assert.match(todo[0].titre, /Contact à rajouter/);
});

test("journal : résumé lisible de l'appareil", () => {
  assert.equal(resumerAppareil("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"), "Chrome · macOS");
  assert.equal(resumerAppareil("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari · iOS");
  assert.equal(resumerAppareil(""), "");
});
