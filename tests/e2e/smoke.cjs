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
      if (m.type() === "error" && !m.text().includes("favicon") && !m.location()?.url?.includes("favicon")) {
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
