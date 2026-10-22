// theme-init.js — script classique chargé dans <head> AVANT l'affichage : applique le thème choisi
// (clair / sombre / auto) sans « flash ». Fichier externe car la CSP Netlify interdit les scripts en ligne.
(function () {
  try {
    var t = localStorage.getItem("mbc-theme"); // "light" | "dark" | null (= automatique)
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* stockage indisponible : thème du système */ }
  // Avertit si la page est ouverte en double-cliquant le fichier (file://) : les modules JS y sont bloqués.
  if (location.protocol === "file:") {
    document.addEventListener("DOMContentLoaded", function () {
      var d = document.createElement("div");
      d.setAttribute("role", "alert");
      d.style.cssText = "position:fixed;inset:auto 16px 16px 16px;z-index:999;padding:14px 16px;border-radius:10px;background:#c42b2b;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)";
      d.textContent = "Cette page doit être ouverte via un serveur web (Netlify, ou « python3 -m http.server » dans le dossier du projet puis http://localhost:8000). En double-cliquant le fichier, le navigateur bloque les scripts.";
      document.body.appendChild(d);
    });
  }
})();
