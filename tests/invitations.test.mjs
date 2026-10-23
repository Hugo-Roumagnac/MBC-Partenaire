// invitations.test.mjs — règles des invitations par e-mail. Lancer : npm test
import test from "node:test";
import assert from "node:assert/strict";
import { genererJeton, jetonPlausible, empreinte, statutEffectif, controlerEmailInvite, controlerInscription, normaliserEmail, emailValide } from "../front-end/js/invitations-core.js";

test("jeton : 256 bits en base64url, unique à chaque appel", () => {
  const a = genererJeton(), b = genererJeton();
  assert.equal(a.length, 43);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
  assert.equal(jetonPlausible(a), true);
  assert.equal(jetonPlausible("abc"), false);
  assert.equal(jetonPlausible("x".repeat(40) + "'; drop"), false);
});

test("empreinte SHA-256 : stable, hexadécimale, différente du jeton", async () => {
  assert.equal(await empreinte("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); // vecteur de test officiel
  const t = genererJeton();
  assert.equal(await empreinte(t), await empreinte(t));
  assert.notEqual(await empreinte(t), t);
});

test("statut effectif : une invitation en attente périmée est expirée", () => {
  const maintenant = new Date("2026-10-23T12:00:00Z");
  assert.equal(statutEffectif({ statut: "pending", expireLe: "2026-10-30T12:00:00Z" }, maintenant), "pending");
  assert.equal(statutEffectif({ statut: "pending", expireLe: "2026-10-23T11:59:59Z" }, maintenant), "expired");
  assert.equal(statutEffectif({ statut: "accepted", expireLe: "2020-01-01T00:00:00Z" }, maintenant), "accepted");
});

test("contrôle de l'adresse à inviter : format et compte existant", () => {
  assert.equal(normaliserEmail("  Paul@Club.FR "), "paul@club.fr");
  assert.equal(emailValide("paul@club.fr"), true);
  assert.equal(emailValide("paul@club"), false);
  assert.match(controlerEmailInvite(""), /Saisissez/);
  assert.match(controlerEmailInvite("pas-un-email"), /invalide/);
  assert.match(controlerEmailInvite("thomas@exemple.fr", ["Thomas@Exemple.fr"]), /déjà associée/);
  assert.equal(controlerEmailInvite("nouveau@exemple.fr", ["thomas@exemple.fr"]), null);
});

test("contrôle du formulaire d'inscription", () => {
  const ok = { prenom: "Léa", nom: "Martin", motDePasse: "motdepasse", confirmation: "motdepasse" };
  assert.equal(controlerInscription(ok), null);
  assert.equal(controlerInscription({ ...ok, prenom: " " }).champ, "prenom");
  assert.equal(controlerInscription({ ...ok, nom: "" }).champ, "nom");
  assert.equal(controlerInscription({ ...ok, motDePasse: "court", confirmation: "court" }).champ, "password");
  assert.equal(controlerInscription({ ...ok, motDePasse: "x".repeat(73), confirmation: "x".repeat(73) }).champ, "password");
  assert.equal(controlerInscription({ ...ok, confirmation: "autre-chose" }).champ, "confirm");
});
