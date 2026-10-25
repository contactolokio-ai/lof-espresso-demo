(function () {
  var cfg = window.LOF_SUPABASE || {};
  var sb = null;
  if (window.supabase && cfg.url && cfg.anonKey) {
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  }

  var views = {
    home: document.querySelector('[data-view="home"]'),
    carta: document.querySelector('[data-view="carta"]'),
    sellos: document.querySelector('[data-view="sellos"]') || document.querySelector('[data-view="club"]'),
    local: document.querySelector('[data-view="local"]')
  };
  var navItems = document.querySelectorAll(".bn-item, [data-nav]");

  function route() {
    var hash = (location.hash || "#/").replace(/^#\/?/, "");
    var name = (hash.split("?")[0].split("/")[0] || "home").toLowerCase();
    if (name === "" || name === "inicio") name = "home";
    // legacy anchors
    if (["cafe", "frios", "comida", "pasteleria", "helado"].indexOf(name) >= 0) {
      show("carta");
      setTimeout(function () { scrollToSec(name); }, 60);
      return;
    }
    if (name === "ubicacion") name = "local";
    if (name === "club" || name === "fidelizacion") name = "sellos";
    if (!views[name]) name = "home";
    show(name);
    if (name === "carta") {
      var chip = (hash.split("/")[1] || "").toLowerCase();
      if (chip) setTimeout(function () { scrollToSec(chip); }, 60);
    }
  }

  function show(name) {
    Object.keys(views).forEach(function (k) {
      var el = views[k];
      if (!el) return;
      var on = k === name;
      if (on) {
        el.hidden = false;
        el.classList.add("is-active");
      } else {
        el.hidden = true;
        el.classList.remove("is-active");
      }
    });
    document.querySelectorAll(".bn-item").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-nav") === name);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-nav]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var n = a.getAttribute("data-nav");
      if (!n) return;
      if (a.getAttribute("href") && a.getAttribute("href").charAt(0) === "#") {
        e.preventDefault();
        location.hash = "#/" + n;
      }
    });
  });

  document.querySelectorAll("[data-jump]").forEach(function (el) {
    el.addEventListener("click", function () {
      var sec = el.getAttribute("data-jump");
      location.hash = "#/carta/" + sec;
    });
  });

  /* —— Carta chips + scroll spy —— */
  var chips = document.querySelectorAll("[data-carta-chips] button");
  var secs = document.querySelectorAll("[data-sec]");
  var chipLock = false;

  function scrollToSec(id) {
    var el = document.getElementById("sec-" + id) || document.querySelector('[data-sec="' + id + '"]');
    if (!el) return;
    chipLock = true;
    setChip(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(function () { chipLock = false; }, 600);
  }

  function setChip(id) {
    chips.forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-chip") === id ? "true" : "false");
    });
  }

  chips.forEach(function (b) {
    b.addEventListener("click", function () {
      scrollToSec(b.getAttribute("data-chip"));
    });
  });

  if ("IntersectionObserver" in window && secs.length) {
    var io = new IntersectionObserver(function (entries) {
      if (chipLock) return;
      entries.forEach(function (en) {
        if (en.isIntersecting) setChip(en.target.getAttribute("data-sec"));
      });
    }, { rootMargin: "-30% 0px -55% 0px", threshold: 0.01 });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* —— Item bottom sheet —— */
  var sheet = document.querySelector("[data-sheet]");
  var sheetTitle = document.querySelector("[data-sheet-title]");
  var sheetPrice = document.querySelector("[data-sheet-price]");
  var sheetDesc = document.querySelector("[data-sheet-desc]");

  function openSheet(name, price, desc) {
    if (!sheet) return;
    sheetTitle.textContent = name || "";
    sheetPrice.textContent = price || "";
    sheetDesc.textContent = desc || "";
    sheetDesc.hidden = !desc;
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.style.overflow = "";
  }
  if (sheet) {
    sheet.querySelectorAll("[data-sheet-close]").forEach(function (b) {
      b.addEventListener("click", closeSheet);
    });
  }

  document.querySelectorAll(".menu-list li").forEach(function (li) {
    li.setAttribute("tabindex", "0");
    li.setAttribute("role", "button");
    function open() {
      var name = (li.querySelector(".item-name") || {}).textContent || "";
      var price = (li.querySelector(".item-price") || {}).textContent || "";
      var desc = (li.querySelector(".item-desc") || {}).textContent || "";
      openSheet(name.trim(), price.trim(), desc.trim());
    }
    li.addEventListener("click", open);
    li.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });

  /* —— Demo card on home teaser —— */
  (function () {
    var box = document.querySelector("[data-teaser-card]");
    if (!box || !window.LofStampCard) return;
    box.innerHTML = window.LofStampCard.cardHTML({
      demo: true,
      stickers: 3,
      meta: window.LofStampCard.DEFAULT_META || 7,
      premio: window.LofStampCard.DEFAULT_PREMIO || "1 café gratis"
    });
  })();

  /* —— Tarjeta de sellos —— */
  var clubTabs = document.querySelectorAll("[data-club-tab]");
  var forms = {
    lookup: document.querySelector('[data-club-form="lookup"]'),
    register: document.querySelector('[data-club-form="register"]')
  };
  var cardArea = document.querySelector("[data-club-card]");

  clubTabs.forEach(function (t) {
    t.addEventListener("click", function () {
      var which = t.getAttribute("data-club-tab");
      clubTabs.forEach(function (x) { x.classList.toggle("is-on", x === t); });
      Object.keys(forms).forEach(function (k) {
        if (forms[k]) forms[k].hidden = k !== which;
      });
      if (cardArea) cardArea.hidden = true;
    });
  });

  function setMsg(form, text, ok) {
    var msg = form.querySelector("[data-msg]");
    if (!msg) return;
    if (!text) { msg.hidden = true; msg.textContent = ""; return; }
    msg.hidden = false;
    msg.textContent = text;
    msg.classList.toggle("ok", !!ok);
  }

  function renderCards(member, cards, meta, premio) {
    if (!cardArea) return;
    var m = typeof meta === "number" ? meta : (cards && cards[0] && cards[0].stamps_required) || 8;
    var pr = premio || (cards && cards[0] && cards[0].reward) || "1 café gratis";
    var stickers = typeof member.stickers === "number"
      ? member.stickers
      : (cards && cards[0] ? cards[0].stamps : 0);
    cardArea.innerHTML = window.LofStampCard.cardHTML({
      name: member.name,
      rutFmt: window.LofRut.format(member.rut) || member.rut,
      stickers: stickers,
      meta: m,
      premio: pr
    });
    cardArea.hidden = false;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function rpc(name, args) {
    if (!sb) throw new Error("Supabase no configurado");
    var res = await sb.rpc(name, args);
    if (res.error) throw res.error;
    return res.data;
  }

  if (forms.lookup) {
    forms.lookup.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(forms.lookup);
      var rut = String(fd.get("rut") || "");
      setMsg(forms.lookup, "");
      if (!window.LofRut.validate(rut)) {
        setMsg(forms.lookup, "RUT inválido. Revisa el dígito verificador.");
        return;
      }
      var btn = forms.lookup.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        var data = await rpc("club_get_by_rut", { p_rut: window.LofRut.normalize(rut) });
        if (!data || !data.found) {
          setMsg(forms.lookup, "No encontramos ese RUT. Prueba con «Quiero entrar».");
          cardArea.hidden = true;
        } else {
          setMsg(forms.lookup, "Listo — esta es tu tarjeta.", true);
          renderCards(data.member, data.cards, data.meta, data.premio);
        }
      } catch (err) {
        setMsg(forms.lookup, "No se pudo consultar. Intenta de nuevo.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (forms.register) {
    forms.register.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(forms.register);
      var name = String(fd.get("name") || "").trim();
      var rut = String(fd.get("rut") || "");
      var phone = String(fd.get("phone") || "").trim();
      setMsg(forms.register, "");
      if (!name) { setMsg(forms.register, "Escribe tu nombre."); return; }
      if (!window.LofRut.validate(rut)) {
        setMsg(forms.register, "RUT inválido. Revisa el dígito verificador.");
        return;
      }
      var btn = forms.register.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        var email = String(fd.get("email") || "").trim();
        var data = await rpc("club_register", {
          p_name: name,
          p_rut: window.LofRut.normalize(rut),
          p_phone: phone || null,
          p_email: email || null
        });
        if (!data || !data.ok) {
          setMsg(forms.register, "No se pudo registrar. Revisa el RUT.");
          return;
        }
        setMsg(forms.register, "Listo. Esta es tu tarjeta de sellos.", true);
        renderCards(data.member, data.cards, data.meta, data.premio);
      } catch (err) {
        setMsg(forms.register, "No se pudo registrar. Intenta de nuevo.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.addEventListener("hashchange", route);
  // support old #carta links
  if (location.hash === "#carta") location.hash = "#/carta";
  if (location.hash === "#club" || location.hash === "#sellos") location.hash = "#/sellos";
  if (location.hash === "#/club") location.hash = "#/sellos";
  if (location.hash === "#ubicacion") location.hash = "#/local";
  route();
})();
