// dates.js — helpers de dates PURS : aucun accès au DOM, donc testables sous Node.

const pad = (n) => String(n).padStart(2, "0"); // complète un nombre sur 2 chiffres : 3 → "03"

// Date du jour au format ISO "YYYY-MM-DD", dans le fuseau LOCAL de l'utilisateur.
export function aujourdhui() {
  const d = new Date(); // instant présent
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // assemble l'ISO local
}

// Convertit une date ISO en « numéro de jour » (jours depuis 1970) SANS effet de fuseau horaire.
export function jourNumero(iso) {
  const [a, m, j] = iso.split("-").map(Number); // "2026-10-22" → [2026, 10, 22]
  return Math.floor(Date.UTC(a, m - 1, j) / 86400000); // minuit UTC, converti en jours entiers
}

// Écart en jours entre deux dates ISO : positif si isoA est APRÈS isoB.
export function ecartJours(isoA, isoB) {
  return jourNumero(isoA) - jourNumero(isoB); // différence de numéros de jour
}

// Ajoute n mois à une date ISO ; si le jour n'existe pas (31 → février), on prend le dernier jour du mois.
export function ajouterMois(iso, n) {
  const [a, m, j] = iso.split("-").map(Number); // décompose la date
  const cible = new Date(Date.UTC(a, m - 1 + n, 1)); // 1er du mois cible (gère le passage d'année)
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate(); // nb de jours du mois cible
  const jour = Math.min(j, dernier); // on borne le jour au dernier jour valide
  return `${cible.getUTCFullYear()}-${pad(cible.getUTCMonth() + 1)}-${pad(jour)}`; // recompose l'ISO
}

// Clé de regroupement mensuel : "2026-10-31" → "2026-10".
export const cleMois = (iso) => String(iso).slice(0, 7);

// Libellé français d'une clé de mois : "2026-10" → "octobre 2026".
export function libelleMois(cle) {
  const [a, m] = cle.split("-").map(Number); // année et mois
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(a, m - 1, 1))); // formatage localisé en UTC pour éviter le décalage
}
