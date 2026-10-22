// drawer.js — ouverture/fermeture accessible d'un panneau latéral (réutilisable pour d'autres panneaux).

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'; // éléments atteignables au clavier

export function creerDrawer(overlay, { onFermer }) {
  let declencheur = null; // élément qui avait le focus avant l'ouverture

  function ouvrir() {
    if (overlay.classList.contains("is-open")) return; // déjà ouvert
    declencheur = document.activeElement; // mémorise pour rendre le focus à la fermeture
    overlay.removeAttribute("hidden"); // rend l'overlay visible aux lecteurs d'écran
    overlay.classList.add("is-open"); // l'affiche (CSS)
    document.body.classList.add("no-scroll"); // empêche le défilement de la page derrière
    overlay.querySelector(".drawer")?.focus({ preventScroll: true }); // place le focus dans le panneau
  }

  function fermer() {
    if (!overlay.classList.contains("is-open")) return; // déjà fermé
    overlay.classList.remove("is-open"); // masque (CSS)
    overlay.setAttribute("hidden", ""); // masque aussi pour l'accessibilité
    document.body.classList.remove("no-scroll"); // réactive le défilement
    declencheur?.focus?.({ preventScroll: true }); // rend le focus à l'élément d'origine
  }

  overlay.querySelectorAll("[data-close-fiche]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); onFermer(); })); // croix + fond cliquable
  overlay.addEventListener("keydown", (e) => { // gestion du clavier dans le panneau
    if (e.key === "Escape") { e.stopPropagation(); onFermer(); return; } // Échap ferme
    if (e.key !== "Tab") return; // seul Tab nous intéresse ensuite
    const liste = [...overlay.querySelectorAll(FOCUSABLES)].filter((el) => el.offsetParent !== null); // éléments visibles
    if (!liste.length) return; // rien à piéger
    const premier = liste[0], dernier = liste[liste.length - 1]; // bornes du cycle
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); } // Shift+Tab depuis le 1er → dernier
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); } // Tab depuis le dernier → 1er
  });

  return { ouvrir, fermer }; // API publique
}
