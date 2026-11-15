// boule-chargement.js — écran de chargement : un ballon fait de points, à la couleur d'accent du club,
// qui tourne sur lui-même et rebondit avec son ombre. Script classique (pas un module) chargé juste après
// l'écran #boot, pour démarrer avant le reste de l'application. Il s'arrête tout seul quand l'application
// est prête (body.is-ready) ou en cas d'erreur (#boot.boot--error).
// Si l'utilisateur a demandé moins d'animations (réglage du système), le ballon reste posé et tourne lentement.
(function () {
  var canvas = document.getElementById("boot-ball");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var boot = document.getElementById("boot");
  var reduit = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Points répartis sur une sphère (spirale de Fibonacci)
  var N = 140, OR = Math.PI * (3 - Math.sqrt(5)), P = [];
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y);
    P.push([Math.cos(OR * i) * r, y, Math.sin(OR * i) * r]);
  }

  var cote = canvas.clientWidth || 96, dpr = window.devicePixelRatio || 1, echelle = cote / 72;
  canvas.width = Math.round(cote * dpr);
  canvas.height = Math.round(cote * dpr);

  function sphere(angle, rayon, inclinaison) {
    var ca = Math.cos(angle), sa = Math.sin(angle), ci = Math.cos(inclinaison), si = Math.sin(inclinaison);
    for (var k = 0; k < P.length; k++) {
      var p = P[k];
      var x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca;
      var yy = p[1] * ci - z * si, z2 = p[1] * si + z * ci;
      var proche = (z2 + 1) / 2; // 0 = derrière, 1 = devant
      ctx.globalAlpha = 0.12 + 0.88 * proche;
      ctx.beginPath();
      ctx.arc(x * rayon, yy * rayon, 0.7 + 1.3 * proche, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function tour(ms) {
    if (document.body.classList.contains("is-ready") || (boot && boot.classList.contains("boot--error"))) return;
    var t = ms / 1000;
    var style = getComputedStyle(canvas);
    ctx.setTransform(dpr * echelle, 0, 0, dpr * echelle, 0, 0);
    ctx.clearRect(0, 0, 72, 72);

    var h = reduit ? 0 : Math.abs(Math.sin(((t * 1.4) % 1) * Math.PI)); // 0 = au sol, 1 = en haut
    var ecrase = h < 0.12 ? 1 - (0.12 - h) * 1.2 : 1; // léger écrasement au contact du sol

    // Ombre (couleur du texte) : plus large et plus foncée près du sol
    ctx.fillStyle = style.getPropertyValue("--boot-ombre").trim() || style.color;
    ctx.globalAlpha = 0.12 + (1 - h) * 0.18;
    ctx.beginPath();
    ctx.ellipse(36, 68, 14 - h * 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ballon : couleur d'accent (orange MBC)
    ctx.fillStyle = style.color;
    ctx.save();
    ctx.translate(36, 52 - h * 30);
    ctx.scale(1 / ecrase, ecrase);
    sphere(t * (reduit ? 0.6 : 3), 13, 0.4);
    ctx.restore();

    requestAnimationFrame(tour);
  }
  requestAnimationFrame(tour);
})();
