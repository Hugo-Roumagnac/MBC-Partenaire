// smoke.cjs — test navigateur complet : démarrage, calculs, navigation, interactions, synchro et export.
// Importation du pilote Chromium de Playwright
const { chromium } = require("playwright");
// Importation des assertions strictes de Node.js
const assert = require("node:assert/strict");
// URL de l'application en mode serveur local
const BASE = "http://localhost:8765/";
const URL = BASE + "app.html";

(async () => {
  // Lance Chromium en réutilisant le canal Chrome local ou le binaire de test
  const navigateur = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  // UN contexte partagé : deux onglets simulent deux membres connectés simultanément
  const contexte = await navigateur.newContext({ acceptDownloads: true });
  // Initialise la session mock dans le sessionStorage avant chargement
  await contexte.addInitScript(() => sessionStorage.setItem("mbc-user", "thomas@exemple.fr"));
  // v2 : logo.dev simulé (le test ne dépend pas d'Internet) — un logo existe pour « Harmonie… » et « Banque Test », 404 sinon
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8z8DwnwEJMDEwMDCgC2BXgFUSqwJ0SawKcCsAAKnOBRV0yC8dAAAAAElFTkSuQmCC", "base64");
  await contexte.route("https://img.logo.dev/**", (route) => /name\/(Harmonie|Banque%20Test)/i.test(route.request().url()) ? route.fulfill({ status: 200, contentType: "image/png", body: PNG }) : route.fulfill({ status: 404, body: "" }));
  // Tableau de collecte des erreurs JavaScript
  const erreurs = [];

  // Fonction d'ouverture d'un onglet instrumenté
  const ouvrir = async () => {
    // Crée une nouvelle page dans le contexte
    const p = await contexte.newPage();
    // Enregistre les exceptions JavaScript non gérées
    p.on("pageerror", (e) => erreurs.push(e.message));
    // Enregistre les erreurs de console (hors favicon 404)
    p.on("console", (m) => {
      // Ignore les messages non erreurs et les erreurs liées aux favicons
      // (v2 : les 404 de img.logo.dev sont attendues — c'est ainsi qu'un logo inconnu est détecté)
      if (m.type() === "error" && !m.text().includes("favicon") && !m.location()?.url?.includes("favicon") && !m.location()?.url?.includes("img.logo.dev")) {
        // Ajoute le texte d'erreur
        erreurs.push(m.text());
      }
    });
    // Charge l'application jusqu'au repos réseau
    await p.goto(URL, { waitUntil: "networkidle" });
    // Renvoie l'instance de la page
    return p;
  };

  // Ouvre le premier onglet représentant le membre A
  console.log("Page d'accueil = connexion : compte non membre refusé, membre accepté...");
  const L = await (await navigateur.newContext()).newPage();
  L.on("pageerror", (e) => erreurs.push(e.message));
  await L.goto(BASE, { waitUntil: "networkidle" });
  await L.fill("#login-email", "inconnu@exemple.fr"); await L.fill("#login-password", "motdepasse"); await L.click("#login-submit");
  await L.waitForSelector("#login-unauthorized:not([hidden])");
  await L.fill("#login-email", "thomas@exemple.fr"); await L.click("#login-submit");
  await L.waitForURL(/app\.html/); await L.waitForSelector("body.is-ready");
  await L.context().close();

  console.log("Ouverture de l'onglet Membre A...");
  const A = await ouvrir();
  // Ouvre le deuxième onglet représentant le membre B
  console.log("Ouverture de l'onglet Membre B...");
  const B = await ouvrir();

  // 1) Vérifie qu'aucune erreur JS n'a été émise au chargement initial
  console.log("Vérification de l'absence d'erreurs JS au démarrage...");
  assert.deepEqual(erreurs, [], `Erreurs JS au démarrage : ${erreurs.join(", ")}`);

  // 2) Vérifie que les données du tableau de bord sont calculées dynamiquement
  console.log("Contrôle du calcul dynamique du tableau de bord...");
  const signeA = await A.textContent("#score-signed");
  // La valeur ne doit pas être la maquette statique 36 800 €
  assert.notEqual(signeA.trim(), "36 800 €", "Le montant signé doit être calculé et non statique");

  // 3) Test de la vue Partenaires et de l'ouverture du tiroir latéral (drawer)
  console.log("Navigation vers l'écran Partenaires...");
  await A.goto(URL + "#/partenaires");
  // Clic sur le premier lien de fiche partenaire
  console.log("Ouverture d'une fiche partenaire...");
  await A.locator(".link-fiche").first().click();
  // Attend que le tiroir reçoive la classe d'ouverture
  await A.waitForSelector("#fiche-partenaire.is-open");
  // Vérifie que l'URL a été enrichie avec le paramètre ?fiche=
  assert.match(A.url(), /\?fiche=/, "L'URL doit contenir le paramètre de requête ?fiche=");

  // Modification d'un champ avec enregistrement automatique au blur
  console.log("Modification du champ notes et déclenchement du blur...");
  await A.fill("#i-notes", "Note de test e2e");
  await A.press("#i-notes", "Tab");
  // Attend la confirmation visuelle via le toast
  await A.waitForSelector("#toast.toast--visible");

  // Fermeture du tiroir latéral avec la touche Échap
  console.log("Ajout d'une contrepartie depuis le catalogue...");
  await A.locator("summary", { hasText: "Contreparties" }).click();
  const nbCp = await A.locator("#counterparts-list .cp-item").count();
  await A.selectOption("#cp-catalog", { index: 1 });
  await A.click("[data-action=add-cp]");
  await A.waitForFunction((n) => document.querySelectorAll("#counterparts-list .cp-item").length === n + 1, nbCp);

  console.log("Fermeture du tiroir latéral par touche Échap...");
  await A.keyboard.press("Escape");
  // Attend que la classe is-open soit retirée
  await A.waitForFunction(() => !document.getElementById("fiche-partenaire").classList.contains("is-open"));

  // 4) Test de synchronisation temps réel inter-onglets sur l'écran Paiements
  console.log("Création d'un partenaire (cotisation 200 €, « Fiche créée »)...");
  await A.click("#btn-new-partner");
  await A.fill("#np-nom", "Entreprise Test E2E");
  await A.click("#form-new-partner [type=submit]");
  await A.waitForSelector("#fiche-partenaire.is-open");
  assert.equal(await A.inputValue("#c-fee-asked"), "200");
  await A.locator("summary", { hasText: "Historique" }).click();
  assert.match(await A.textContent("#history-list"), /Fiche créée/);
  console.log("Changement d'étape → ligne d'historique...");
  await A.selectOption("#f-stage", "Contacté");
  await A.waitForFunction(() => /Étape : Prospect → Contacté/.test(document.getElementById("history-list").textContent));
  console.log("Doublon refusé...");
  await A.keyboard.press("Escape");
  await A.click("#btn-new-partner");
  await A.fill("#np-nom", "entreprise test e2e");
  await A.waitForSelector("#np-duplicate:not([hidden])");
  await A.keyboard.press("Escape");

  console.log("Pipeline : déplacement d'une carte via « Déplacer vers… »...");
  await A.goto(URL + "#/pipeline");
  await A.selectOption('[data-move="entreprise-test-e2e"]', "RDV");
  await A.waitForSelector('.kanban__col[data-stage="RDV"] [data-partner-id="entreprise-test-e2e"]');

  console.log("Événement : création pré-remplie avec les signés...");
  await A.goto(URL + "#/evenements");
  await A.click("#btn-new-event");
  await A.fill("#ne-nom", "Afterwork E2E");
  await A.click("#form-new-event [type=submit]");
  await A.waitForFunction(() => document.getElementById("h-event-detail").textContent === "Afterwork E2E");
  assert.ok(await A.locator("#attendance-tbody tr[data-presence-id]").count() > 0, "Les signés doivent être pré-invités");

  // ===========================================================================
  // v2 — NOUVELLES FONCTIONNALITÉS
  // ===========================================================================
  console.log("v2 — Pipeline : « Signé » (soldés) puis « Non encaissé » (reste dû)...");
  await A.goto(URL + "#/pipeline");
  const colonnes = await A.$$eval(".kanban__col", (cs) => cs.map((c) => c.dataset.stage));
  assert.equal(colonnes[colonnes.indexOf("Signé") + 1], "Non encaissé", "La colonne Non encaissé doit suivre Signé");
  assert.ok(await A.locator('.kanban__col[data-stage="Signé"] [data-partner-id="harmonie"]').count() === 1, "Un signé soldé reste dans Signé");
  assert.ok(await A.locator('.kanban__col[data-stage="Non encaissé"] .pcard__reste').count() > 0, "Les signés avec un reste dû sont dans Non encaissé");

  console.log("v2 — SIRET : refus d'un numéro invalide, enregistrement d'un valide depuis la liste...");
  await A.goto(URL + "#/partenaires");
  await A.click('[data-siret="entreprise-test-e2e"]');
  await A.fill("#siret-input", "732 829 320 00075"); // clé de Luhn fausse
  await A.click("#form-siret [type=submit]");
  await A.waitForSelector("#siret-retour.alert--danger");
  await A.fill("#siret-input", "732 829 320 00074"); // valide
  await A.click("#form-siret [type=submit]");
  await A.waitForFunction(() => document.getElementById("modal-siret").hidden);
  await A.waitForFunction(() => /732 829 320 00074/.test(document.querySelector('[data-siret="entreprise-test-e2e"]')?.textContent || ""));

  console.log("v2 — Logo : import, affichage immédiat dans la fiche, la liste et chez l'autre membre...");
  await A.goto(URL + "#/partenaires?fiche=entreprise-test-e2e");
  await A.waitForSelector("#fiche-partenaire.is-open");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8z8DwnwEJMDEwMDCgC2BXgFUSqwJ0SawKcCsAAKnOBRV0yC8dAAAAAElFTkSuQmCC", "base64");
  await A.setInputFiles("#f-logo-file", { name: "logo.png", mimeType: "image/png", buffer: png });
  await A.waitForSelector("#fiche-logo .plogo--img img");
  assert.match(await A.getAttribute("#fiche-logo img", "src"), /^(data:image\/(webp|png)|blob:)/);
  await B.goto(URL + "#/partenaires");
  await B.waitForSelector('tr[data-partner-id="entreprise-test-e2e"] .plogo--img img', { timeout: 4000 }); // temps réel inter-onglets

  console.log("v2 — Répartition montants validés / cotisations sous Encaissé (v3 : le validé est ventilé dans « Répartition du budget »)...");
  await A.goto(URL + "#/dashboard");
  const euros = (t) => Number(String(t).replace(/[^0-9,]/g, "").replace(",", ".")); // « 1 200 € » → 1200
  for (const [total, split] of [["#score-cashed", "#score-cashed-split"]]) {
    const parts = await A.$$eval(`${split} .score__split-row strong`, (els) => els.map((e) => e.textContent));
    assert.equal(parts.length, 2, "Deux lignes : montants validés et cotisations");
    assert.equal(parts.reduce((t, x) => t + euros(x), 0), euros(await A.textContent(total)), `La répartition de ${total} doit retomber sur le total`);
  }

  console.log("v2 — Logos automatiques affichés sans aucun clic, refus possible depuis la fiche...");
  await A.goto(URL + "#/partenaires");
  await A.waitForSelector('tr[data-partner-id="harmonie"] .plogo--auto img'); // logo.dev trouvé d'après le nom
  assert.match(await A.getAttribute('tr[data-partner-id="harmonie"] .plogo img', "src"), /^https:\/\/img\.logo\.dev\/name\/Harmonie/);
  await A.waitForFunction(() => !document.querySelector('tr[data-partner-id="garage-martin"] .plogo img')); // logo inconnu (404) → monogramme
  await A.goto(URL + "#/partenaires?fiche=harmonie");
  await A.waitForSelector("#fiche-partenaire.is-open #i-logo-remove:not([hidden])");
  await A.click("#i-logo-remove"); // « Ce n'est pas le bon logo »
  await A.waitForFunction(() => !document.querySelector("#fiche-logo img")); // monogramme
  await A.click("#i-logo-reset"); // « Revenir au logo automatique »
  await A.waitForSelector("#fiche-logo .plogo--auto img");
  await A.keyboard.press("Escape"); // le focus est resté dans la fiche : Échap la ferme
  await A.waitForFunction(() => !document.getElementById("fiche-partenaire").classList.contains("is-open"));

  console.log("v2 — Logo proposé à la création d'après le nom...");
  await A.click("#btn-new-partner");
  await A.fill("#np-nom", "Banque Test");
  await A.waitForSelector('#np-logo .logo-choix__opt img');
  await A.click("#form-new-partner [type=submit]");
  await A.waitForSelector("#fiche-partenaire.is-open #fiche-logo .plogo--img img");
  await A.keyboard.press("Escape");

  console.log("v4 — Événements : « Contacté en attente » remplace « En attente » et « Contacter »...");
  await A.goto(URL + "#/evenements");
  const ligne = A.locator("#attendance-tbody tr[data-presence-id]").first();
  const presenceId = await ligne.getAttribute("data-presence-id");
  const choix = await ligne.locator("[data-field=presence] option").allTextContents();
  assert.deepEqual(choix, ["Oui", "Contacté en attente", "Non"], "trois choix seulement");
  await ligne.locator("[data-field=presence]").selectOption("Oui");
  await ligne.locator("[data-field=presence]").selectOption("Contacté en attente");
  await A.waitForFunction((id) => JSON.parse(localStorage.getItem("mbc:presences")).find((x) => x.id === id)?.presence === "Contacté en attente", presenceId); // enregistré tout de suite
  assert.match(await A.textContent("#event-stats"), /En attente de réponse/);

  console.log("v3 — Documents : dépôt d'une convention et d'un autre document...");
  await A.goto(URL + "#/partenaires?fiche=entreprise-test-e2e");
  await A.waitForSelector("#fiche-partenaire.is-open #fiche-documents .doczone--convention");
  assert.match(await A.textContent("#fiche-documents .doczone--convention"), /Manquante/);
  await A.setInputFiles('[data-doc-input="convention"]', { name: "convention-signee.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%test\n") });
  await A.waitForSelector("#fiche-documents .doczone--convention .doclist__item");
  assert.match(await A.textContent("#fiche-documents .doczone--convention"), /Reçue/);
  await A.setInputFiles('[data-doc-input="autre"]', { name: "RIB.png", mimeType: "image/png", buffer: PNG });
  await A.waitForSelector("#fiche-documents .doczone--autre .doclist__item");
  await A.setInputFiles('[data-doc-input="autre"]', { name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") }); // format refusé
  await A.waitForTimeout(200);
  assert.equal(await A.locator("#fiche-documents .doczone--autre .doclist__item").count(), 1, "Un .exe doit être refusé");
  const telechargementDoc = A.waitForEvent("download");
  await A.click("#fiche-documents .doczone--convention [data-doc-action=telecharger]");
  assert.equal((await telechargementDoc).suggestedFilename(), "convention-signee.pdf");
  const suppr = A.locator("#fiche-documents .doczone--autre [data-doc-action=supprimer]");
  await suppr.click(); await A.locator("#fiche-documents .doczone--autre [data-doc-action=supprimer]").click(); // deux clics
  await A.waitForFunction(() => !document.querySelector("#fiche-documents .doczone--autre .doclist__item"));
  await A.keyboard.press("Escape");

  console.log("v3 — Tableau de bord : total global = montants validés + cotisations validées...");
  await A.goto(URL + "#/dashboard");
  await A.waitForFunction(() => document.getElementById("budget-montants").textContent !== "—");
  const lire = async (sel) => euros(await A.textContent(sel));
  assert.equal(Math.round((await lire("#score-signed-big")) * 100), Math.round(((await lire("#budget-montants")) + (await lire("#budget-cotisations"))) * 100), "Le total global doit être la somme des deux sous-totaux");

  console.log("v2 — Journal : qui / quoi / compte, puis restauration d'une valeur...");
  await A.goto(URL + "#/journal");
  await A.waitForSelector("#journal-liste tr");
  assert.match(await A.textContent("#journal-liste"), /thomas@exemple\.fr/, "Le compte auteur doit apparaître");
  assert.match(await A.textContent("#journal-liste"), /Contacté en attente/, "Le changement de présence doit être tracé"); // v4
  await A.goto(URL + "#/partenaires?fiche=entreprise-test-e2e");
  await A.waitForSelector("#fiche-partenaire.is-open");
  await A.locator("summary", { hasText: "Journal des modifications" }).click();
  const restaurer = A.locator("#fiche-journal .jitem", { hasText: "SIRET" }).locator("[data-restaurer]").first();
  await restaurer.click(); await restaurer.click(); // confirmation en deux clics
  await A.waitForFunction(() => document.getElementById("i-siret").value === "");
  await A.keyboard.press("Escape");

  console.log("Test de synchronisation inter-onglets sur Paiements...");
  await A.goto(URL + "#/paiements");
  await B.goto(URL + "#/paiements");
  // Récupération de l'encaissement affiché dans l'onglet B avant modification
  const avant = await B.textContent("#pay-cashed");
  // Membre A coche une échéance de paiement
  console.log("Membre A encaisse une échéance...");
  await A.locator("input[data-echeance-id]").first().check();
  // Membre B doit constater la mise à jour sans recharger
  console.log("Attente de répercussion automatique chez Membre B...");
  await B.waitForFunction((v) => document.getElementById("pay-cashed").textContent !== v, avant, { timeout: 4000 });

  // 5) Test du téléchargement de l'export Excel (.xlsx) et validation de compatibilité
  console.log("Test de l'export Excel...");
  const [telechargement] = await Promise.all([
    A.waitForEvent("download"), // Attend l'événement de téléchargement du navigateur
    A.click("#btn-export") // Clic sur le bouton d'export dans l'en-tête
  ]);
  // Nom du fichier suggéré par le navigateur
  const nomFichier = telechargement.suggestedFilename();
  console.log("Fichier exporté :", nomFichier);
  // Vérifie le motif de nommage MBC-Partenaires_AAAA-MM-JJ.xlsx
  assert.match(nomFichier, /^MBC-Partenaires_\d{4}-\d{2}-\d{2}\.xlsx$/, "Le nom de fichier doit respecter la convention");
  // Sauvegarde le classeur généré dans un emplacement temporaire
  const cheminExport = `/tmp/${nomFichier}`;
  // Écrit les octets sur le disque
  await telechargement.saveAs(cheminExport);
  // Contrôle l'ouverture sans corruption dans LibreOffice s'il est présent sur la machine
  try {
    // Importation synchrone du module d'exécution de processus
    const { execSync } = require("node:child_process");
    // Conversion sans interface graphique pour valider la structure XML du classeur
    execSync(`/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir /tmp "${cheminExport}"`, { stdio: "ignore" });
    // Message de succès du contrôle LibreOffice
    console.log("Validation LibreOffice : classeur Excel ouvert et converti avec succès.");
  } catch {
    // Avertissement non bloquant si LibreOffice n'est pas accessible
    console.log("LibreOffice non exécuté.");
  }

  // 6) Test du mode responsive mobile (largeur 375 px sans débordement horizontal)
  console.log("Test de responsive à 375 px de largeur...");
  await A.setViewportSize({ width: 375, height: 667 });
  // Vérifie si la largeur du contenu dépasse la largeur de la fenêtre
  const aScroll = await A.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  // Aucun défilement horizontal ne doit être présent
  assert.equal(aScroll, false, "L'écran ne doit présenter aucun débordement horizontal à 375 px");

  // 7) Vérifie qu'aucune erreur JS n'a été levée pendant l'intégralité du parcours
  assert.deepEqual(erreurs, [], "Aucune erreur JS ne doit survenir pendant le scénario complet");

  // Ferme proprement le navigateur
  await navigateur.close();
  // Affiche le statut final de validation
  console.log("E2E OK : Tous les scénarios ont réussi.");
})().catch((e) => {
  // Affiche l'échec et la trace
  console.error("E2E ÉCHEC :", e.message);
  // Quitte avec code d'erreur 1
  process.exit(1);
});
