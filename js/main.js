(function () {
  var nav = document.querySelector("[data-carta-nav]");
  if (!nav) return;
  var buttons = nav.querySelectorAll("button[data-panel]");
  var panels = document.querySelectorAll("[data-carta-panel]");

  function show(id) {
    buttons.forEach(function (b) {
      var on = b.getAttribute("data-panel") === id;
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      var on = p.getAttribute("data-carta-panel") === id;
      if (on) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
    if (history.replaceState) {
      history.replaceState(null, "", "#" + id);
    }
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      show(b.getAttribute("data-panel"));
    });
  });

  var hash = (location.hash || "").replace(/^#/, "");
  if (hash && document.querySelector('[data-carta-panel="' + hash + '"]')) {
    show(hash);
  } else {
    show("cafe");
  }
})();
