// modal.js — ouverture / fermeture accessible des fenêtres modales (.modal) :
// focus sur le 1er champ, Échap pour fermer, focus rendu à l'élément d'origine.
const pile = []; // modales ouvertes (la dernière est au-dessus)

export function ouvrirModale(modal) {
  if (!modal || !modal.hidden) return;
  modal._declencheur = document.activeElement;
  modal.hidden = false;
  modal.classList.add("is-open");
  pile.push(modal);
  document.body.classList.add("no-scroll");
  setTimeout(() => modal.querySelector("input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-close-modal])")?.focus(), 30);
}

export function fermerModale(modal) {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.classList.remove("is-open");
  pile.splice(pile.indexOf(modal), 1);
  if (!pile.length && !document.querySelector(".drawer-overlay.is-open")) document.body.classList.remove("no-scroll");
  modal._declencheur?.focus?.({ preventScroll: true });
}

// Branche une fois pour toutes : boutons [data-close-modal] et touche Échap.
export function initModales() {
  document.querySelectorAll(".modal").forEach((m) => m.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => fermerModale(m))));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pile.length) { e.stopPropagation(); fermerModale(pile[pile.length - 1]); }
  }, true);
}
