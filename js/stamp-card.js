/* Shared digital stamp card renderer — tarjeta de sellos Lof */
(function (global) {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function stampsHTML(n, meta) {
    var m = Math.max(3, Math.min(20, parseInt(meta, 10) || 8));
    var filled = Math.max(0, Math.min(m, parseInt(n, 10) || 0));
    var h = '<div class="stamps" style="grid-template-columns:repeat(' + m + ',minmax(0,1fr))" aria-label="Sellos ' + filled + ' de ' + m + '">';
    for (var i = 0; i < m; i++) {
      var cls = "stamp";
      if (i < filled) cls += " on";
      if (i === m - 1) cls += " prize-slot";
      h += '<span class="' + cls + '" aria-hidden="true"></span>';
    }
    h += "</div>";
    return h;
  }

  function cardHTML(opts) {
    var name = opts.name || "";
    var rut = opts.rutFmt || opts.rut || "";
    var stickers = parseInt(opts.stickers, 10) || 0;
    var meta = parseInt(opts.meta, 10) || 8;
    var premio = opts.premio || "1 café de especialidad";
    var faltan = Math.max(0, meta - stickers);
    var ready = stickers >= meta;
    var status = ready
      ? "Completaste la tarjeta. Cobra en caja: " + premio
      : "Llevas " + stickers + " de " + meta + ". Faltan " + faltan + " para: " + premio;

    var html = '<div class="digital-card' + (ready ? " is-ready" : "") + '">';
    html += '<div class="dc-top"><span class="dc-label">Tarjeta de sellos</span>';
    if (ready) html += '<span class="dc-badge">PREMIO</span>';
    else html += '<span class="dc-prize-tag">' + esc(premio) + "</span>";
    html += "</div>";
    if (name) html += "<h3>" + esc(name) + "</h3>";
    if (rut) html += '<p class="dc-meta">RUT ' + esc(rut) + "</p>";
    html += stampsHTML(stickers, meta);
    html += '<div class="dc-foot"><span>' + esc(status) + "</span><strong>" + stickers + "/" + meta + "</strong></div>";
    html += "</div>";
    return html;
  }

  global.LofStampCard = { esc: esc, stampsHTML: stampsHTML, cardHTML: cardHTML };
})(window);
