(function () {
  var cfg = window.LOF_SUPABASE || {};
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var KEY = "lof_admin_pass";
  var pass = sessionStorage.getItem(KEY) || "";

  var screens = {
    login: document.getElementById("screen-login"),
    home: document.getElementById("screen-home"),
    stamp: document.getElementById("screen-stamp"),
    coupons: document.getElementById("screen-coupons"),
    redeem: document.getElementById("screen-redeem")
  };

  function go(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("is-on", k === name);
    });
    document.getElementById("btn-logout").hidden = name === "login";
    if (name === "home") loadRecent();
    if (name === "coupons") loadCoupons();
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

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  document.getElementById("form-login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p = new FormData(e.target).get("pass");
    setStatus("login-status", "Comprobando…");
    try {
      await rpc("admin_recent_members", { p_pass: p, p_limit: 1 });
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

  async function loadRecent() {
    var box = document.getElementById("recent-list");
    box.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      var rows = await rpc("admin_recent_members", { p_pass: pass, p_limit: 12 });
      if (!rows || !rows.length) {
        box.innerHTML = '<p class="muted">Aún no hay socios.</p>';
        return;
      }
      box.innerHTML = rows.map(function (m) {
        return '<div class="admin-card"><h3>' + esc(m.name) + '</h3><p>' + esc(window.LofRut.format(m.rut) || m.rut) +
          (m.phone ? " · " + esc(m.phone) : "") + "</p></div>";
      }).join("");
    } catch (e) {
      box.innerHTML = '<p class="muted">No se pudo cargar.</p>';
      if (String(e.message || e).indexOf("unauthorized") >= 0 || (e.code === "42501")) {
        go("login");
      }
    }
  }

  document.getElementById("form-lookup").addEventListener("submit", async function (e) {
    e.preventDefault();
    var rut = String(new FormData(e.target).get("rut") || "");
    setStatus("stamp-status", "");
    if (!window.LofRut.validate(rut)) {
      setStatus("stamp-status", "RUT inválido.");
      return;
    }
    var box = document.getElementById("stamp-result");
    box.innerHTML = '<p class="muted">Buscando…</p>';
    try {
      var data = await rpc("admin_lookup_member", { p_pass: pass, p_rut: window.LofRut.normalize(rut) });
      if (!data.found) {
        box.innerHTML = '<div class="admin-card"><p>No hay socio con ese RUT. Pídele que se registre en Club.</p></div>';
        return;
      }
      var m = data.member;
      var cards = data.cards || [];
      var html = '<div class="admin-card"><h3>' + esc(m.name) + '</h3><p>' + esc(window.LofRut.format(m.rut) || m.rut) + "</p></div>";
      cards.forEach(function (c) {
        html += '<div class="admin-card" data-mc="' + esc(c.member_card_id) + '" data-cc="' + esc(c.coupon_card_id) + '">';
        html += "<h3>" + esc(c.title) + "</h3>";
        html += "<p>" + c.stamps + " / " + c.stamps_required + " sellos · Canjes: " + (c.redeemed_count || 0) + "</p>";
        html += '<div class="admin-row">';
        html += '<button type="button" class="btn btn-primary" data-add-stamp data-rut="' + esc(m.rut) + '" data-cc="' + esc(c.coupon_card_id) + '">+1 sello</button>';
        html += "</div></div>";
      });
      if (!cards.length) {
        html += '<div class="admin-card"><p>Sin cupones activos. Crea uno en Cupones.</p>';
        html += '<div class="admin-row"><button type="button" class="btn btn-primary" data-add-stamp data-rut="' + esc(m.rut) + '">+1 sello (cupón activo)</button></div></div>';
      }
      box.innerHTML = html;
    } catch (err) {
      setStatus("stamp-status", "Error al buscar.");
      box.innerHTML = "";
    }
  });

  document.getElementById("stamp-result").addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-add-stamp]");
    if (!btn) return;
    if (!confirm("¿Sumar 1 sello a este socio?")) return;
    btn.disabled = true;
    setStatus("stamp-status", "Guardando…");
    try {
      var args = {
        p_pass: pass,
        p_rut: btn.getAttribute("data-rut"),
        p_delta: 1,
        p_note: "sello admin"
      };
      var cc = btn.getAttribute("data-cc");
      if (cc) args.p_coupon_card_id = cc;
      var data = await rpc("admin_add_stamp", args);
      if (!data.ok) {
        setStatus("stamp-status", "No se pudo: " + (data.error || ""));
        return;
      }
      setStatus("stamp-status", "Sello registrado: " + data.card.stamps + "/" + data.card.stamps_required, true);
      // refresh by re-submit
      document.getElementById("form-lookup").requestSubmit();
    } catch (err) {
      setStatus("stamp-status", "Error al guardar sello.");
    } finally {
      btn.disabled = false;
    }
  });

  async function loadCoupons() {
    var box = document.getElementById("coupon-list");
    box.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      var rows = await rpc("admin_list_coupons", { p_pass: pass });
      if (!rows || !rows.length) {
        box.innerHTML = '<p class="muted">No hay cupones.</p>';
        return;
      }
      box.innerHTML = rows.map(function (c) {
        return '<div class="admin-card" data-coupon-id="' + esc(c.id) + '">' +
          "<h3>" + esc(c.title) + (c.active ? "" : " (inactivo)") + "</h3>" +
          "<p>" + c.stamps_required + " sellos → " + esc(c.reward) + "</p>" +
          '<div class="switch-row"><span class="muted">Activo</span>' +
          '<button type="button" class="btn btn-ghost" data-toggle-active data-id="' + esc(c.id) + '" data-active="' + (c.active ? "1" : "0") + '">' +
          (c.active ? "Desactivar" : "Activar") + "</button></div>" +
          '<div class="admin-row">' +
          '<button type="button" class="btn btn-ghost" data-edit-coupon data-id="' + esc(c.id) + '" data-title="' + esc(c.title) + '" data-desc="' + esc(c.description || "") + '" data-req="' + c.stamps_required + '" data-reward="' + esc(c.reward) + '">Editar</button>' +
          "</div></div>";
      }).join("");
    } catch (e) {
      box.innerHTML = '<p class="muted">No se pudo cargar.</p>';
    }
  }

  document.getElementById("coupon-list").addEventListener("click", async function (e) {
    var t = e.target.closest("[data-toggle-active]");
    if (t) {
      var id = t.getAttribute("data-id");
      var next = t.getAttribute("data-active") !== "1";
      if (!confirm(next ? "¿Activar este cupón?" : "¿Desactivar este cupón?")) return;
      try {
        await rpc("admin_upsert_coupon", { p_pass: pass, p_id: id, p_active: next });
        loadCoupons();
      } catch (err) {
        setStatus("coupon-status", "No se pudo cambiar.");
      }
      return;
    }
    var ed = e.target.closest("[data-edit-coupon]");
    if (ed) {
      var title = prompt("Título", ed.getAttribute("data-title"));
      if (title === null) return;
      var reward = prompt("Premio", ed.getAttribute("data-reward"));
      if (reward === null) return;
      var req = prompt("Sellos necesarios", ed.getAttribute("data-req"));
      if (req === null) return;
      try {
        await rpc("admin_upsert_coupon", {
          p_pass: pass,
          p_id: ed.getAttribute("data-id"),
          p_title: title,
          p_reward: reward,
          p_stamps_required: parseInt(req, 10) || 8,
          p_description: ed.getAttribute("data-desc") || ""
        });
        setStatus("coupon-status", "Cupón actualizado.", true);
        loadCoupons();
      } catch (err) {
        setStatus("coupon-status", "No se pudo editar.");
      }
    }
  });

  document.getElementById("form-coupon").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    setStatus("coupon-status", "Creando…");
    try {
      var data = await rpc("admin_upsert_coupon", {
        p_pass: pass,
        p_title: String(fd.get("title") || ""),
        p_description: String(fd.get("description") || ""),
        p_stamps_required: parseInt(fd.get("stamps_required"), 10) || 8,
        p_reward: String(fd.get("reward") || ""),
        p_active: true
      });
      if (!data.ok) { setStatus("coupon-status", "No se pudo crear."); return; }
      setStatus("coupon-status", "Cupón creado.", true);
      e.target.reset();
      e.target.stamps_required.value = 8;
      loadCoupons();
    } catch (err) {
      setStatus("coupon-status", "Error al crear.");
    }
  });

  document.getElementById("form-redeem-lookup").addEventListener("submit", async function (e) {
    e.preventDefault();
    var rut = String(new FormData(e.target).get("rut") || "");
    setStatus("redeem-status", "");
    if (!window.LofRut.validate(rut)) {
      setStatus("redeem-status", "RUT inválido.");
      return;
    }
    var box = document.getElementById("redeem-result");
    box.innerHTML = '<p class="muted">Buscando…</p>';
    try {
      var data = await rpc("admin_lookup_member", { p_pass: pass, p_rut: window.LofRut.normalize(rut) });
      if (!data.found) {
        box.innerHTML = '<div class="admin-card"><p>Socio no encontrado.</p></div>';
        return;
      }
      var html = '<div class="admin-card"><h3>' + esc(data.member.name) + '</h3><p>' + esc(window.LofRut.format(data.member.rut) || data.member.rut) + "</p></div>";
      (data.cards || []).forEach(function (c) {
        var ready = c.stamps >= c.stamps_required;
        html += '<div class="admin-card">';
        html += "<h3>" + esc(c.title) + "</h3>";
        html += "<p>" + c.stamps + " / " + c.stamps_required + " · Premio: " + esc(c.reward) + "</p>";
        if (ready) {
          html += '<div class="admin-row"><button type="button" class="btn btn-primary" data-redeem="' + esc(c.member_card_id) + '">Canjear ahora</button></div>';
        } else {
          html += '<p class="muted">Aún faltan sellos.</p>';
        }
        html += "</div>";
      });
      box.innerHTML = html;
    } catch (err) {
      setStatus("redeem-status", "Error al buscar.");
      box.innerHTML = "";
    }
  });

  document.getElementById("redeem-result").addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-redeem]");
    if (!btn) return;
    if (!confirm("¿Confirmar canje? Se descontarán los sellos del premio.")) return;
    btn.disabled = true;
    try {
      var data = await rpc("admin_redeem", { p_pass: pass, p_member_card_id: btn.getAttribute("data-redeem") });
      if (!data.ok) {
        setStatus("redeem-status", "No se pudo canjear: " + (data.error || ""));
        return;
      }
      setStatus("redeem-status", "Canje OK. Quedan " + data.card.stamps + " sellos.", true);
      document.getElementById("form-redeem-lookup").requestSubmit();
    } catch (err) {
      setStatus("redeem-status", "Error al canjear.");
    } finally {
      btn.disabled = false;
    }
  });

  if (pass) {
    rpc("admin_recent_members", { p_pass: pass, p_limit: 1 })
      .then(function () { go("home"); })
      .catch(function () { sessionStorage.removeItem(KEY); pass = ""; go("login"); });
  } else {
    go("login");
  }
})();
