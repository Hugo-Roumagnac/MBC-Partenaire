// selectors.test.mjs — tests des règles métier. Lancer : node --test
import test from "node:test"; // lanceur de tests intégré à Node
import assert from "node:assert/strict"; // assertions strictes
import { repartirCents, planifierEcheancier, calculerTableauDeBord, enRetard, cerfaAEmettre } from "../front-end/js/selectors.js"; // fonctions testées
import { nomsDeRecherche, domaineProfessionnel, candidatsLogo } from "../front-end/js/selectors.js"; // v2 : logos automatiques
import { validerSiret, formaterSiret, estSolde, colonnePipeline, resteAEncaisser, calculerRepartition, construireAFaire, resumerAppareil, PRESENCES } from "../front-end/js/selectors.js"; // v2
import { normaliserPresence, aContacterParPartenaire, calculerBudget } from "../front-end/js/selectors.js"; // v3
import { calculerEncaisseParCategorie, categorieEcheance, CATEGORIES_ECHEANCE } from "../front-end/js/selectors.js"; // v6
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

test("répartition : le signé vient des contrats des fiches « Signé »", () => {
  const axa = vue({ id: "axa", montantValide: 500, cotisationValidee: 200 });
  const myjob = vue({ id: "myjob", montantValide: 2500, cotisationValidee: 200, dontMecenat: 2000 });
  const prospect = vue({ id: "p", etape: "Négociation", montantValide: 0, cotisationValidee: 0 });
  assert.deepEqual(calculerRepartition([axa, myjob, prospect]).signe, { montants: 3000, cotisations: 400, mecenat: 2000 }); // le non signé ne compte pas
});

test("v6 — encaissé : somme STRICTE des paiements payés selon leur étiquette, sans prorata", () => {
  const ech = (montant, paye, categorie) => ({ montant, paye, categorie });
  const garage = vue({ id: "g", montantValide: 1000, cotisationValidee: 200, echeances: [ech(200, true, "Cotisation"), ech(475, true, "Sponsoring"), ech(525, false, "Sponsoring")] });
  const myjob = vue({ id: "m", echeances: [ech(337.33, true, "Non précisé"), ech(100, true, undefined)] }); // ancienne échéance sans colonne → « Non précisé »
  const r = calculerRepartition([garage, myjob]).encaisse;
  assert.deepEqual(r, { sponsoring: 475, cotisations: 200, nonReparti: 437.33, total: 1112.33 }); // la non payée (525 €) ne compte pas
  assert.equal(Math.round((r.sponsoring + r.cotisations + r.nonReparti) * 100), Math.round(r.total * 100)); // au centime près
});

test("v6 — l'encaissé par étiquette retombe exactement sur l'encaissé total, même avec des centimes", () => {
  const liste = [];
  for (let i = 0; i < 50; i++) liste.push({ montant: 33.33 + i / 100, paye: i % 3 !== 0, categorie: CATEGORIES_ECHEANCE[i % 3] });
  const r = calculerEncaisseParCategorie(liste);
  const attendu = liste.filter((e) => e.paye).reduce((t, e) => t + Math.round(e.montant * 100), 0) / 100;
  assert.equal(r.total, attendu);
  assert.equal(Math.round((r.sponsoring + r.cotisations + r.nonReparti) * 100), Math.round(attendu * 100));
});

test("v6 — étiquette inconnue ou absente lue comme « Non précisé » ; le générateur pose l'étiquette choisie", () => {
  assert.equal(categorieEcheance({}), "Non précisé");
  assert.equal(categorieEcheance({ categorie: "Autre" }), "Non précisé");
  assert.equal(categorieEcheance({ categorie: "Cotisation" }), "Cotisation");
  const plan = planifierEcheancier({ echeances: [] }, { montant: 600, nombre: 3, premierVersement: "2026-10-15", categorie: "Sponsoring" });
  assert.deepEqual(plan.aCreer.map((e) => e.categorie), ["Sponsoring", "Sponsoring", "Sponsoring"]);
  assert.equal(planifierEcheancier({ echeances: [] }, { montant: 100, nombre: 1, premierVersement: "2026-10-15" }).aCreer[0].categorie, "Non précisé");
});

test("événements v5 : « À contacter », « Contacté en attente », « Oui », « Non »", () => {
  assert.deepEqual(PRESENCES, ["À contacter", "Contacté en attente", "Oui", "Non"]); // quatre choix
  for (const ancien of ["Contacter", "Contact à rajouter"]) assert.equal(normaliserPresence(ancien), "À contacter");
  assert.equal(normaliserPresence("En attente"), "Contacté en attente");
  assert.equal(normaliserPresence("Oui"), "Oui");
  const evts = [{ id: "e1", nom: "Afterwork", date: "2026-11-20", presences: [{ id: "p1", partenaireId: "x", presence: "À contacter", noms: "Jean D." }, { id: "p2", partenaireId: "x", presence: "Oui" }] }];
  assert.equal(construireAFaire([vue({})], [], "2026-11-07", evts).filter((i) => i.badge === "Contacter").length, 1); // ligne « À contacter » dans « À faire »
  assert.equal(aContacterParPartenaire(evts).get("x").length, 1); // badge « À contacter »
});

test("budget : total global = montants validés + cotisations validées, ventilation exacte", () => {
  const axa = vue({ id: "axa", montantValide: 500, cotisationValidee: 200, cotisationDemandee: 200, natureValeur: 0 });
  const myjob = vue({ id: "myjob", montantValide: 2500.5, cotisationValidee: 150, cotisationDemandee: 200, dontMecenat: 2000, natureValeur: 800 });
  const nego = vue({ id: "n", etape: "Négociation", montantValide: 1000, cotisationValidee: 0, cotisationDemandee: 200 }); // validé, étape pas encore changée
  const prospect = vue({ id: "p", etape: "Prospect", montantValide: 0, cotisationValidee: 0, cotisationDemandee: 200 }); // rien de validé : ignoré
  const perdu = vue({ id: "l", etape: "Perdu", montantValide: 900, cotisationValidee: 200 }); // perdu : ignoré
  const b = calculerBudget([axa, myjob, nego, prospect, perdu]);
  assert.equal(b.montants, 4000.5);
  assert.equal(b.cotisations, 350);
  assert.equal(b.total, 4350.5); // = montants + cotisations, sans erreur de virgule flottante
  assert.equal(b.cotisationsDemandees, 600); // mêmes fiches que les cotisations validées
  assert.equal(b.mecenat, 2000);
  assert.equal(b.nature, 800); // hors total
  assert.equal(b.nombre, 3);
  assert.equal(b.nonSignes, 1);
  const t = calculerTableauDeBord({ partenaires: [axa, myjob, nego], echeances: [], reglages: { objectif: 8701 } }, "2026-11-07");
  assert.equal(t.score.total, 4350.5); // la jauge suit le total global…
  assert.equal(t.score.pctTotal, 50);
  assert.equal(t.score.reste, 4350.5); // …et le reste à trouver aussi
  assert.equal(t.score.signe, 3350.5); // « Signé » reste limité aux fiches à l'étape Signé
});

test("journal : résumé lisible de l'appareil", () => {
  assert.equal(resumerAppareil("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"), "Chrome · macOS");
  assert.equal(resumerAppareil("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari · iOS");
  assert.equal(resumerAppareil(""), "");
});

test("logos automatiques : site tiré des e-mails pro, noms de recherche, adresses logo.dev", () => {
  assert.equal(domaineProfessionnel("ch.puyol@ecf82.fr"), "ecf82.fr"); // e-mail d'entreprise → site
  assert.equal(domaineProfessionnel("florian@gmail.com"), ""); // messagerie grand public : ignorée
  assert.deepEqual(nomsDeRecherche("Acuitis - Optic 2000"), ["Acuitis - Optic 2000", "Acuitis", "Optic 2000"]); // deux marques
  assert.deepEqual(nomsDeRecherche("Banquette & Co"), ["Banquette & Co"]); // « & » fait partie du nom
  assert.deepEqual(nomsDeRecherche("Antocyame (Muriel)"), ["Antocyame"]); // précision entre parenthèses retirée
  const c = candidatsLogo({ nom: "ECF", contacts: [{ email: "ch.puyol@ecf82.fr" }, { email: "x@gmail.com" }] }, "pk_test");
  assert.deepEqual(c.map((x) => x.source), ["ecf82.fr", "nom « ECF »"]); // e-mail d'abord (plus fiable), puis le nom
  assert.match(c[1].url, /^https:\/\/img\.logo\.dev\/name\/ECF\?token=pk_test&.*fallback=404/); // clé publique + 404 si inconnu
  assert.deepEqual(candidatsLogo({ nom: "ECF" }, ""), []); // sans clé : désactivé
});

test("v6 — e-mails des invités : filtre Oui / sans réponse, doublons retirés, partenaires sans adresse signalés", async () => {
  const { emailsInvites } = await import("../front-end/js/selectors.js");
  const partenaires = [
    { id: "a", nom: "Alpha", contacts: [{ email: "Jean@alpha.fr" }, { email: "compta@alpha.fr" }] },
    { id: "b", nom: "Bravo", contacts: [{ email: "jean@alpha.fr" }] }, // même adresse qu'Alpha (casse différente)
    { id: "c", nom: "Charlie", contacts: [{ email: "" }, { email: "pas-une-adresse" }] },
    { id: "d", nom: "Delta", contacts: [{ email: "d@delta.com" }] }
  ];
  const evt = { presences: [{ partenaireId: "a", presence: "Oui" }, { partenaireId: "b", presence: "Contacté en attente" }, { partenaireId: "c", presence: "Oui" }, { partenaireId: "d", presence: "Non" }, { partenaireId: "zz", presence: "Oui" }] };
  assert.deepEqual(emailsInvites(evt, partenaires, "tous"), { adresses: ["Jean@alpha.fr", "compta@alpha.fr", "d@delta.com"], sansEmail: ["Charlie"], partenaires: 4 });
  assert.deepEqual(emailsInvites(evt, partenaires, "oui"), { adresses: ["Jean@alpha.fr", "compta@alpha.fr"], sansEmail: ["Charlie"], partenaires: 2 });
  assert.deepEqual(emailsInvites(evt, partenaires, "attente"), { adresses: ["jean@alpha.fr"], sansEmail: [], partenaires: 1 });
  assert.deepEqual(emailsInvites({ presences: [] }, partenaires).adresses, []);
});

test("v6 — échéancier de la saison : prévu / encaissé / retard / à venir par mois, au centime près", async () => {
  const { echeancierSaison } = await import("../front-end/js/selectors.js");
  const e = (d, montant, paye) => ({ datePrevue: d, montant, paye });
  const r = echeancierSaison([e("2026-09-15", 100.5, true), e("2026-09-20", 50, false), e("2026-11-30", 75, false), e("2027-07-01", 10, false), e(null, 20, false), e("2025-09-15", 999, true)], "2026-27", "2026-11-15");
  assert.equal(r.mois[0].cle, "2026-09");
  assert.deepEqual([r.mois[0].prevu, r.mois[0].encaisse, r.mois[0].retard, r.mois[0].aVenir], [150.5, 100.5, 50, 0]);
  assert.deepEqual([r.mois[2].retard, r.mois[2].aVenir], [0, 75]); // 30/11 > 15/11 : à venir
  assert.equal(r.mois.length, 11); // juillet ajouté car une échéance y tombe, août non
  assert.deepEqual(r.sansDate, { prevu: 20, nombre: 1 });
  assert.equal(r.mois.reduce((t, m) => t + m.prevu, 0), 235.5); // l'échéance d'une autre saison est ignorée
  assert.deepEqual(r.encaisseCumule, [100.5, 100.5, 100.5]); // sept → nov
  assert.ok(r.aujourdhuiPos > 2 / 11 && r.aujourdhuiPos < 3 / 11);
  // Correctif : rien n'est perdu. Sans date + hors saison vont dans « autres », et les totaux couvrent tout.
  assert.deepEqual([r.autres.prevu, r.autres.encaisse, r.autres.sansDate, r.autres.horsSaison], [1019, 999, 1, 1]);
  assert.deepEqual(r.totaux, { prevu: 1254.5, encaisse: 1099.5, retard: 50, aVenir: 105 });
  assert.equal(r.max, 1019); // la colonne « autres » compte dans l'échelle
});

test("v6 — conversion d'après l'étape actuelle, et signé par responsable", async () => {
  const { calculerConversion, signeParResponsable } = await import("../front-end/js/selectors.js");
  const P = (etape, responsable = "", mv = 0) => ({ etape, responsable, montantValide: mv, cotisationValidee: 0 });
  const liste = [P("Prospect"), P("Négociation"), P("Signé", "Eric", 1000), P("Signé", "Thomas", 500), P("Signé", "Eric", 250.5), P("Perdu"), P("Archivé")];
  const c = calculerConversion(liste);
  assert.equal(c.total, 6);
  assert.deepEqual(c.etapes.map((x) => x.nombre), [6, 4, 4, 4, 4, 3]);
  assert.equal(c.taux, 75); // 3 signés / (3 + 1 perdu)
  assert.deepEqual(signeParResponsable(liste), [{ responsable: "Eric", montant: 1250.5 }, { responsable: "Thomas", montant: 500 }]);
});

test("v6 — signatures par semaine d'après le journal", async () => {
  const { signaturesParSemaine } = await import("../front-end/js/selectors.js");
  const j = [
    { tableNom: "partenaires", action: "UPDATE", champs: ["etape"], apres: { etape: "Signé" }, le: "2026-11-14T10:00:00Z" },
    { tableNom: "partenaires", action: "INSERT", champs: [], apres: { etape: "Signé" }, le: "2026-10-01T10:00:00Z" },
    { tableNom: "partenaires", action: "UPDATE", champs: ["nom"], apres: { etape: "Signé" }, le: "2026-11-10T10:00:00Z" }, // pas un changement d'étape
    { tableNom: "contrats", action: "UPDATE", champs: ["etape"], apres: { etape: "Signé" }, le: "2026-11-10T10:00:00Z" }
  ];
  const s = signaturesParSemaine(j, "2026-11-15", 8);
  assert.equal(s.length, 8); assert.equal(s[7], 2); assert.equal(s[0] <= s[7], true);
  assert.deepEqual(signaturesParSemaine([], "2026-11-15"), []);
});
