(function () {
  var cfg = window.LOF_SUPABASE || {};
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var KEY = "lof_admin_pass";
  var pass = sessionStorage.getItem(KEY) || "";
  var settings = { meta: 7, premio: "1 café gratis a elección", correo: "" };

  var screens = {
    login: document.getElementById("screen-login"),
    home: document.getElementById("screen-home"),
    stamp: document.getElementById("screen-stamp"),
    nuevo: document.getElementById("screen-nuevo"),
    clientes: document.getElementById("screen-clientes"),
    ajustes: document.getElementById("screen-ajustes")
  };

  function go(name, prefillRut) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("is-on", k === name);
    });
    document.getElementById("btn-logout").hidden = name === "login";
    document.getElementById("correo-box").hidden = true;
    document.getElementById("correo-box").innerHTML = "";
    if (name === "home") loadHome();
    if (name === "clientes") loadClientes();
    if (name === "ajustes") loadAjustes();
    if (name === "stamp" && prefillRut) {
      document.getElementById("stamp-rut").value = prefillRut;
    }
  }

  function setStatus(id, text, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "status-bar" + (text ? (ok ? " ok" : " err") : "");
  }

  async function rpc(name, args) {
    var res = await sb.rpc(name, args);
    if (res.error) throw res.error;
    return res.data;
  }

  function esc(s) { return window.LofStampCard.esc(s); }

  function cardFor(member, meta, premio) {
    return window.LofStampCard.cardHTML({
      name: member.name,
      rutFmt: window.LofRut.format(member.rut) || member.rut,
      stickers: member.stickers,
      meta: meta || settings.meta,
      premio: premio || settings.premio
    });
  }

  document.getElementById("form-login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p = new FormData(e.target).get("pass");
    setStatus("login-status", "Comprobando…");
    try {
      await rpc("admin_stats", { p_pass: p });
      pass = String(p);
      sessionStorage.setItem(KEY, pass);
      setStatus("login-status", "");
      go("home");
    } catch (err) {
      setStatus("login-status", "Clave incorrecta.");
    }
  });

  document.getElementById("btn-logout").addEventListener("click", function () {
    pass = "";
    sessionStorage.removeItem(KEY);
    go("login");
  });

  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.getAttribute("data-go")); });
  });

  document.getElementById("help-btn").addEventListener("click", function () {
    var p = document.getElementById("help-panel");
    p.hidden = !p.hidden;
  });

  async function loadHome() {
    var box = document.getElementById("home-stats");
    box.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      var s = await rpc("admin_stats", { p_pass: pass });
      settings.meta = s.meta;
      settings.premio = s.premio;
      document.getElementById("home-lead").innerHTML =
        "Cada visita = 1 sello. Al llegar a <b>" + esc(s.meta) + "</b>: <b>" + esc(s.premio) + "</b>.";
      box.innerHTML =
        '<div class="admin-stat"><b>' + (s.clientes || 0) + '</b><span>clientes</span></div>' +
        '<div class="admin-stat"><b>' + (s.premio_listo || 0) + '</b><span>premio listo</span></div>';
    } catch (e) {
      box.innerHTML = '<p class="muted">No se pudo cargar.</p>';
      if (String(e.message || e).indexOf("unauthorized") >= 0 || e.code === "42501") go("login");
    }
  }

  document.getElementById("form-stamp").addEventListener("submit", async function (e) {
    e.preventDefault();
    var rut = String(new FormData(e.target).get("rut") || "");
    setStatus("stamp-status", "");
    var box = document.getElementById("stamp-result");
    box.innerHTML = "";
    if (!window.LofRut.validate(rut)) {
      setStatus("stamp-status", "RUT inválido.");
      return;
    }
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    setStatus("stamp-status", "Guardando…");
    try {
      var data = await rpc("admin_add_stamp", {
        p_pass: pass,
        p_rut: window.LofRut.normalize(rut),
        p_delta: 1,
        p_note: "sello admin"
      });
      if (!data.ok) {
        if (data.error === "member_not_found") {
          setStatus("stamp-status", "No hay cliente con ese RUT. Regístralo en Nuevo cliente.");
        } else if (data.error === "already_full") {
          setStatus("stamp-status", "Ya completó la tarjeta. Entrégalo en Ver clientes.");
          box.innerHTML = cardFor(data.member, data.meta, data.premio) +
            '<div class="admin-row"><button type="button" class="btn btn-ghost" data-go="clientes">Ir a entregar premio</button></div>';
        } else if (data.error === "too_soon") {
          setStatus("stamp-status", "Muy seguido. Espera unos " + (data.retry_after_minutes || 45) + " min.");
          if (data.member) box.innerHTML = cardFor(data.member, data.meta, settings.premio);
        } else {
          setStatus("stamp-status", "No se pudo: " + (data.error || ""));
        }
        return;
      }
      var faltan = Math.max(0, (data.meta || 8) - (data.member.stickers || 0));
      setStatus(
        "stamp-status",
        faltan <= 0
          ? "Listo. " + data.member.name + " completó la tarjeta."
          : "Listo. " + data.member.name + ": " + data.member.stickers + "/" + data.meta + ". Faltan " + faltan + ".",
        true
      );
      box.innerHTML = cardFor(data.member, data.meta, data.premio) +
        (faltan <= 0
          ? '<div class="admin-row"><button type="button" class="btn btn-primary" data-go="clientes">Ir a entregar premio</button></div>'
          : "");
    } catch (err) {
      setStatus("stamp-status", "Error al guardar sello.");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("form-nuevo").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var rut = String(fd.get("rut") || "");
    var name = String(fd.get("name") || "").trim();
    setStatus("nuevo-status", "");
    document.getElementById("nuevo-result").innerHTML = "";
    if (!name) { setStatus("nuevo-status", "Escribe el nombre."); return; }
    if (!window.LofRut.validate(rut)) { setStatus("nuevo-status", "RUT inválido."); return; }
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      var data = await rpc("admin_create_member", {
        p_pass: pass,
        p_name: name,
        p_rut: window.LofRut.normalize(rut),
        p_email: String(fd.get("email") || "").trim() || null,
        p_phone: String(fd.get("phone") || "").trim() || null,
        p_first_stamp: !!fd.get("first_stamp")
      });
      if (!data.ok) {
        setStatus("nuevo-status", data.error === "already_registered"
          ? "Ya está registrado. Usa Sumar sello."
          : "No se pudo registrar.");
        return;
      }
      var m = data.member;
      setStatus("nuevo-status", m.name + " registrado.", true);
      document.getElementById("nuevo-result").innerHTML = cardFor(m, data.meta, data.premio);
      e.target.reset();
      e.target.first_stamp.checked = true;
    } catch (err) {
      setStatus("nuevo-status", "Error al registrar.");
    } finally {
      btn.disabled = false;
    }
  });

  async function loadClientes(q) {
    var box = document.getElementById("clientes-list");
    box.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      var data = await rpc("admin_list_clientes", { p_pass: pass, p_q: q || "" });
      settings.meta = data.meta;
      settings.premio = data.premio;
      var rows = data.clientes || [];
      if (!rows.length) {
        box.innerHTML = '<div class="admin-card"><p>Sin clientes. Usa «Nuevo cliente».</p></div>';
        return;
      }
      box.innerHTML = rows.map(function (c) {
        var ready = c.stickers >= data.meta;
        var faltan = Math.max(0, data.meta - c.stickers);
        var actions = ready
          ? '<button type="button" class="btn btn-warn" data-canje="' + esc(c.rut) + '">Entregar premio</button>'
          : '<button type="button" class="btn btn-primary" data-sumar="' + esc(c.rut) + '">Sumar sello</button>' +
            (c.email
              ? '<button type="button" class="btn btn-ghost" data-correo="' + esc(c.rut) + '">Recordatorio' +
                (faltan ? " · faltan " + faltan : "") + "</button>"
              : "");
        return '<div class="admin-card" data-rut="' + esc(c.rut) + '">' +
          '<div class="cliente-head"><div><h3>' + esc(c.name) + "</h3>" +
          "<p>" + esc(window.LofRut.format(c.rut) || c.rut) +
          (c.email ? " · " + esc(c.email) : "") + "</p></div>" +
          (ready
            ? '<span class="badge-premio">PREMIO</span>'
            : '<span class="badge-prog">' + c.stickers + "/" + data.meta + "</span>") +
          "</div>" +
          window.LofStampCard.stampsHTML(c.stickers, data.meta) +
          '<div class="admin-row">' + actions + "</div></div>";
      }).join("");
    } catch (e) {
      box.innerHTML = '<p class="muted">No se pudo cargar.</p>';
    }
  }

  document.getElementById("form-search").addEventListener("submit", function (e) {
    e.preventDefault();
    loadClientes(String(new FormData(e.target).get("q") || ""));
  });

  document.getElementById("clientes-list").addEventListener("click", async function (e) {
    var canje = e.target.closest("[data-canje]");
    if (canje) {
      if (!confirm("¿Entregaste el premio? La tarjeta vuelve a 0 sellos.")) return;
      canje.disabled = true;
      try {
        var data = await rpc("admin_entregar_premio", { p_pass: pass, p_rut: canje.getAttribute("data-canje") });
        if (!data.ok) {
          alert("No se pudo: " + (data.error || ""));
          return;
        }
        loadClientes(document.getElementById("clientes-q").value);
      } catch (err) {
        alert("Error al entregar premio.");
      } finally {
        canje.disabled = false;
      }
      return;
    }
    var sumar = e.target.closest("[data-sumar]");
    if (sumar) {
      go("stamp", window.LofRut.format(sumar.getAttribute("data-sumar")) || sumar.getAttribute("data-sumar"));
      return;
    }
    var correo = e.target.closest("[data-correo]");
    if (correo) {
      showCorreo(correo.getAttribute("data-correo"));
    }
  });

  // buttons inside stamp-result that use data-go
  document.getElementById("stamp-result").addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (b) go(b.getAttribute("data-go"));
  });

  async function showCorreo(rut) {
    var box = document.getElementById("correo-box");
    box.hidden = false;
    box.innerHTML = '<p class="muted">Armando correo…</p>';
    try {
      var data = await rpc("admin_lookup_member", { p_pass: pass, p_rut: rut });
      if (!data.found) { box.innerHTML = '<p class="muted">Cliente no encontrado.</p>'; return; }
      var st = await rpc("admin_get_settings", { p_pass: pass });
      settings = { meta: st.meta, premio: st.premio, correo: st.correo || "" };
      var m = data.member;
      var faltan = Math.max(0, settings.meta - (m.stickers || 0));
      var nom = (m.name || "").split(" ")[0];
      if (!m.email) {
        box.innerHTML = '<div class="admin-card"><p>Este cliente no tiene correo. Agrégalo al registrar o pide uno.</p></div>';
        return;
      }
      box.innerHTML =
        '<div class="mail-preview">' +
        '<div class="meta-line"><b>De:</b> Lof Espresso &lt;' + esc(settings.correo || "(pon tu correo en Ajustes)") + "&gt;<br>" +
        "<b>Para:</b> " + esc(m.email) + "<br>" +
        "<b>Asunto:</b> " + esc(nom) + ", te faltan " + faltan + " sellos</div>" +
        "<p>Hola " + esc(nom) + ",</p>" +
        "<p>En tu tarjeta llevas <b>" + (m.stickers || 0) + " de " + settings.meta + "</b>. " +
        "Te faltan <b>" + faltan + "</b> para " + esc(String(settings.premio).toLowerCase()) + ".</p>" +
        window.LofStampCard.stampsHTML(m.stickers, settings.meta) +
        "<p>Te esperamos en Paseo Estado 498, Rancagua.</p>" +
        '<button type="button" class="btn btn-primary btn-block" id="btn-sim-send">Enviar recordatorio (simulado)</button>' +
        '<p class="status-bar" id="correo-status"></p></div>';
      document.getElementById("btn-sim-send").addEventListener("click", function () {
        this.outerHTML = '<div class="status-bar ok">Envío simulado (demo). No se usó Resend.</div>';
      });
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      box.innerHTML = '<p class="muted">No se pudo armar el correo.</p>';
    }
  }

  async function loadAjustes() {
    setStatus("ajustes-status", "");
    try {
      var st = await rpc("admin_get_settings", { p_pass: pass });
      settings = { meta: st.meta, premio: st.premio, correo: st.correo || "" };
      document.getElementById("aj-correo").value = settings.correo;
      document.getElementById("aj-meta").value = settings.meta;
      document.getElementById("aj-premio").value = settings.premio;
    } catch (e) {
      setStatus("ajustes-status", "No se pudo cargar.");
    }
  }

  document.getElementById("form-ajustes").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    setStatus("ajustes-status", "Guardando…");
    try {
      var data = await rpc("admin_save_settings", {
        p_pass: pass,
        p_meta: parseInt(fd.get("meta"), 10) || 8,
        p_premio: String(fd.get("premio") || "").trim(),
        p_correo: String(fd.get("correo") || "").trim()
      });
      if (!data.ok) {
        setStatus("ajustes-status", data.error === "correo_invalid" ? "Correo inválido." : "No se pudo guardar.");
        return;
      }
      settings = { meta: data.meta, premio: data.premio, correo: data.correo || "" };
      setStatus("ajustes-status", "Guardado.", true);
    } catch (err) {
      setStatus("ajustes-status", "Error al guardar.");
    }
  });

  if (pass) {
    rpc("admin_stats", { p_pass: pass })
      .then(function () { go("home"); })
      .catch(function () { sessionStorage.removeItem(KEY); pass = ""; go("login"); });
  } else {
    go("login");
  }
})();
