// invitations.cjs — parcours complet d'invitation en mode démo (serveur local sur :8765 requis).
// Lancer : python3 -m http.server 8765  puis  npm run test:invitations
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const BASE = "http://localhost:8765/";

(async () => {
  const nav = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  const ctx = await nav.newContext();
  const erreurs = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erreurs.push(e.message));

  console.log("Connexion d'un membre et ouverture de « Inviter un membre »...");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.fill("#login-email", "thomas@exemple.fr"); await page.fill("#login-password", "motdepasse");
  await page.click("#login-submit"); await page.waitForSelector("body.is-ready");
  await page.click("[data-user-menu]:visible"); await page.click("#btn-invite");
  await page.waitForSelector("#modal-invite:not([hidden])");

  console.log("Contrôles : format invalide, adresse déjà membre...");
  await page.fill("#invite-email", "pas-un-email"); await page.click("#invite-submit");
  assert.match(await page.textContent("#invite-error"), /invalide/);
  await page.fill("#invite-email", "eric@exemple.fr"); await page.click("#invite-submit");
  assert.match(await page.textContent("#invite-error"), /déjà associée/);

  console.log("Envoi d'une invitation valide...");
  await page.fill("#invite-email", "Lea.Martin@Exemple.fr"); await page.click("#invite-submit");
  await page.waitForSelector("#invite-demo:not([hidden])");
  const lien = await page.inputValue("#invite-demo-link");
  assert.match(lien, /register\.html\?token=[A-Za-z0-9_-]{43}$/);
  await page.waitForSelector("#invite-list >> text=lea.martin@exemple.fr");
  assert.match(await page.textContent("#invite-list"), /En attente/);
  const stocke = await page.evaluate(() => localStorage.getItem("mbc:invitations"));
  assert.ok(!stocke.includes(lien.split("token=")[1]), "le jeton ne doit pas être stocké en clair");

  console.log("Lien invalide → message d'erreur...");
  const visiteur = await (await nav.newContext()).newPage();
  visiteur.on("pageerror", (e) => erreurs.push(e.message));
  await visiteur.goto(BASE + "register.html?token=" + "A".repeat(43), { waitUntil: "networkidle" });
  await visiteur.waitForSelector("#view-invalid:not([hidden])");
  // le contexte du visiteur n'a pas le même localStorage : on rejoue dans le contexte du membre (même origine)
  const inscrit = await ctx.newPage();
  inscrit.on("pageerror", (e) => erreurs.push(e.message));
  await inscrit.goto(lien, { waitUntil: "networkidle" });
  await inscrit.waitForSelector("#view-register:not([hidden])");
  assert.equal(await inscrit.inputValue("#register-email"), "lea.martin@exemple.fr");
  assert.equal(await inscrit.getAttribute("#register-email", "readonly"), "");
  assert.ok(!inscrit.url().includes("token="), "le jeton est retiré de la barre d'adresse");

  console.log("Formulaire : mots de passe différents refusés, puis inscription...");
  await inscrit.fill("#register-prenom", "Léa"); await inscrit.fill("#register-nom", "Martin");
  await inscrit.fill("#register-password", "motdepasse1"); await inscrit.fill("#register-confirm", "autre");
  await inscrit.click("#register-submit");
  assert.match(await inscrit.textContent("#register-error"), /diffèrent/);
  await inscrit.fill("#register-confirm", "motdepasse1");
  await inscrit.click("#register-submit");
  await inscrit.waitForURL(/app\.html/); await inscrit.waitForSelector("body.is-ready");
  assert.equal((await inscrit.textContent(".user-chip__name")).trim(), "Léa Martin");

  console.log("Le lien ne peut pas être réutilisé...");
  const rejeu = await ctx.newPage();
  await rejeu.goto(lien, { waitUntil: "networkidle" });
  await rejeu.waitForSelector("#view-invalid:not([hidden])");
  assert.match(await rejeu.textContent("#invalid-message"), /déjà été utilisée/);

  console.log("Statut « Acceptée » dans la liste...");
  await page.click("#modal-invite .modal__head [data-close-modal]"); await page.click("[data-user-menu]:visible"); await page.click("#btn-invite");
  await page.waitForSelector("#invite-list >> text=Acceptée");

  console.log("Invitation expirée → message dédié...");
  await page.fill("#invite-email", "expire@exemple.fr"); await page.click("#invite-submit");
  await page.waitForSelector("#invite-demo:not([hidden])");
  const lienExpire = await page.inputValue("#invite-demo-link");
  await page.evaluate(() => { const t = JSON.parse(localStorage.getItem("mbc:invitations")); t[0].expireLe = "2020-01-01T00:00:00Z"; localStorage.setItem("mbc:invitations", JSON.stringify(t)); });
  const exp = await ctx.newPage();
  await exp.goto(lienExpire, { waitUntil: "networkidle" });
  await exp.waitForSelector("#view-invalid:not([hidden])");
  assert.match(await exp.textContent("#invalid-message"), /expiré/);

  assert.deepEqual(erreurs, [], `Erreurs JS : ${erreurs.join(", ")}`);
  console.log("OK — parcours d'invitation validé.");
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
