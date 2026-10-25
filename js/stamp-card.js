/* Tarjeta gráfica de fidelización — 7 sellos, el 7.º gratis */
(function (global) {
  var DEFAULT_META = 7;
  var DEFAULT_PREMIO = "1 café gratis";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  /** Inline SVG taza — usa currentColor; filled=true relleno sólido */
  function cupSVG(filled, withSteam) {
    var cup;
    if (filled) {
      cup =
        '<path d="M7 10h14c.6 0 1 .5.9 1.1l-1.4 9.2A2.2 2.2 0 0 1 18.3 22H9.7a2.2 2.2 0 0 1-2.2-1.7L6.1 11.1A1 1 0 0 1 7 10z"/>' +
        '<path d="M21 12.2c1.7.2 3 1.5 3 3.3s-1.3 3.1-3 3.3"/>' +
        '<path d="M5.5 23.5h17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>';
    } else {
      cup =
        '<path d="M7 10h14c.6 0 1 .5.9 1.1l-1.4 9.2A2.2 2.2 0 0 1 18.3 22H9.7a2.2 2.2 0 0 1-2.2-1.7L6.1 11.1A1 1 0 0 1 7 10z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>' +
        '<path d="M21 12.2c1.7.2 3 1.5 3 3.3s-1.3 3.1-3 3.3" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>' +
        '<path d="M5.5 23.5h17" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';
    }
    var steam = withSteam
      ? '<path d="M11 3.2c.4 1.1-.2 1.8-.2 2.8M15 2.8c.5 1.2-.3 2-.3 3.1M18.5 3.5c.35 1-.15 1.6-.15 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>'
      : "";
    return (
      '<svg class="stamp-cup" viewBox="0 0 28 26" width="28" height="26" aria-hidden="true" focusable="false">' +
      steam +
      cup +
      "</svg>"
    );
  }

  function stampsHTML(n, meta) {
    var m = Math.max(3, Math.min(20, parseInt(meta, 10) || DEFAULT_META));
    var filled = Math.max(0, Math.min(m, parseInt(n, 10) || 0));
    /* Flex wrap: 4 por fila en móvil, sin desborde */
    var h = '<div class="stamps stamps--' + m + '" aria-label="Sellos ' + filled + ' de ' + m + '">';
    for (var i = 0; i < m; i++) {
      var isPrize = i === m - 1;
      var isOn = i < filled;
      var cls = "stamp" + (isOn ? " on" : "") + (isPrize ? " prize-slot" : "");
      var inner;
      if (isPrize) {
        if (isOn) {
          inner =
            cupSVG(true, false) +
            '<span class="stamp-n stamp-n--prize">Gratis</span>';
        } else {
          inner =
            cupSVG(false, true) +
            '<span class="stamp-n stamp-n--prize">Gratis</span>';
        }
      } else {
        inner = cupSVG(isOn, !isOn);
      }
      h += '<span class="' + cls + '" aria-hidden="true">' + inner + "</span>";
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
    html += '<div class="dc-ornament" aria-hidden="true"></div>';
    html += '<div class="dc-top"><span class="dc-label">Tarjeta de sellos</span>';
    if (ready) html += '<span class="dc-badge">LISTO</span>';
    else html += '<span class="dc-prize-tag">' + esc(meta) + "º gratis</span>";
    html += "</div>";
    html += '<p class="dc-brand">Lof Espresso</p>';
    if (name) html += "<h3>" + esc(name) + "</h3>";
    if (rut) html += '<p class="dc-meta">RUT ' + esc(rut) + "</p>";
    else if (demo) html += '<p class="dc-meta">Ejemplo de tarjeta</p>';
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
