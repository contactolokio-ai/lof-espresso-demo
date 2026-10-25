/* Tarjeta gráfica de fidelización — 7 sellos, el 7.º gratis */
(function (global) {
  var DEFAULT_META = 7;
  var DEFAULT_PREMIO = "1 café gratis";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function stampsHTML(n, meta) {
    var m = Math.max(3, Math.min(20, parseInt(meta, 10) || DEFAULT_META));
    var filled = Math.max(0, Math.min(m, parseInt(n, 10) || 0));
    /* Flex wrap: 4 por fila en móvil, sin desborde */
    var h = '<div class="stamps stamps--' + m + '" aria-label="Sellos ' + filled + ' de ' + m + '">';
    for (var i = 0; i < m; i++) {
      var isPrize = i === m - 1;
      var cls = "stamp" + (i < filled ? " on" : "") + (isPrize ? " prize-slot" : "");
      var label = isPrize ? (i < filled ? "✓" : "Gratis") : String(i + 1);
      h += '<span class="' + cls + '" aria-hidden="true"><span class="stamp-n">' + label + "</span></span>";
    }
    h += "</div>";
    return h;
  }

  function cardHTML(opts) {
    opts = opts || {};
    var name = opts.name || "";
    var rut = opts.rutFmt || opts.rut || "";
    var stickers = parseInt(opts.stickers, 10) || 0;
    var meta = parseInt(opts.meta, 10) || DEFAULT_META;
    var premio = opts.premio || DEFAULT_PREMIO;
    var faltan = Math.max(0, meta - stickers);
    var ready = stickers >= meta;
    var demo = !!opts.demo;

    var status = ready
      ? "Tarjeta completa. Cobra en caja: " + premio
      : stickers === 0
        ? "Junta " + meta + " sellos; el " + meta + ".º es " + premio + "."
        : "Llevas " + stickers + " de " + meta + ". Te faltan " + faltan + ".";

    var html = '<article class="digital-card' + (ready ? " is-ready" : "") + (demo ? " is-demo" : "") + '">';
    html += '<div class="dc-band" aria-hidden="true"></div>';
    html += '<div class="dc-top"><span class="dc-label">Tarjeta de sellos</span>';
    if (ready) html += '<span class="dc-badge">LISTO</span>';
    else html += '<span class="dc-prize-tag">' + esc(meta) + "º gratis</span>";
    html += "</div>";
    html += '<p class="dc-brand">Lof Espresso</p>';
    if (name) html += "<h3>" + esc(name) + "</h3>";
    if (rut) html += '<p class="dc-meta">RUT ' + esc(rut) + "</p>";
    else if (demo) html += '<p class="dc-meta">Así se ve tu tarjeta</p>';
    html += stampsHTML(stickers, meta);
    html += '<p class="dc-reward">Premio: <strong>' + esc(premio) + "</strong></p>";
    html += '<div class="dc-foot"><span>' + esc(status) + "</span><strong>" + stickers + "/" + meta + "</strong></div>";
    html += "</article>";
    return html;
  }

  global.LofStampCard = {
    esc: esc,
    stampsHTML: stampsHTML,
    cardHTML: cardHTML,
    DEFAULT_META: DEFAULT_META,
    DEFAULT_PREMIO: DEFAULT_PREMIO
  };
})(window);
