/**
 * Lof Espresso — invite pop-up tarjeta de sellos (30s after load).
 */
(function () {
  var STORAGE_KEY = "lof_fid_invite_v1";
  var DELAY_MS = 30000;
  var TTL_MS = 3 * 24 * 60 * 60 * 1000; // ~3 días
  var RETRY_MS = 2500;

  if (/\/admin(\/|$)/i.test(location.pathname)) return;

  var modal = document.querySelector("[data-fid-invite]");
  if (!modal) return;

  var dialog = modal.querySelector(".fid-invite-dialog");
  var stampsMount = modal.querySelector("[data-fid-invite-stamps]");
  var cta = modal.querySelector("[data-fid-invite-cta]");
  var lastFocus = null;
  var opened = false;
  var timer = null;
  var FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function storageGet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.until !== "number") return null;
      if (Date.now() > data.until) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function storageSet(reason) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ until: Date.now() + TTL_MS, reason: reason || "dismiss" })
      );
    } catch (e) {}
  }

  function hashIsSellos() {
    var h = (location.hash || "").toLowerCase();
    return (
      h === "#/sellos" ||
      h === "#/club" ||
      h === "#sellos" ||
      h === "#club" ||
      h.indexOf("#/sellos") === 0 ||
      h.indexOf("#/club") === 0
    );
  }

  function blockingOverlayOpen() {
    var howto = document.querySelector("[data-howto]");
    var sheet = document.querySelector("[data-sheet]");
    var howtoOpen = howto && !howto.hidden;
    var sheetOpen = sheet && !sheet.hidden;
    return !!(howtoOpen || sheetOpen);
  }

  function focusables() {
    if (!dialog) return [];
    return Array.prototype.slice.call(dialog.querySelectorAll(FOCUSABLE)).filter(function (el) {
      return el.offsetParent !== null || el === dialog;
    });
  }

  function fillStamps() {
    if (!stampsMount) return;
    if (window.LofStampCard && typeof window.LofStampCard.stampsHTML === "function") {
      stampsMount.innerHTML = window.LofStampCard.stampsHTML(0, 7);
    }
  }

  function openInvite() {
    if (opened || storageGet()) return;
    if (hashIsSellos()) {
      storageSet("already_sellos");
      return;
    }
    if (blockingOverlayOpen()) {
      // Un reintento corto tras cerrar how-to / sheet; si sigue bloqueado, se salta esta visita.
      setTimeout(function () {
        if (opened || storageGet() || hashIsSellos()) return;
        if (blockingOverlayOpen()) return;
        openInvite();
      }, RETRY_MS);
      return;
    }

    opened = true;
    fillStamps();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var list = focusables();
    if (cta && typeof cta.focus === "function") {
      try {
        cta.focus();
      } catch (e) {}
    } else if (list.length) {
      try {
        list[0].focus();
      } catch (e) {}
    } else if (dialog) {
      try {
        dialog.focus();
      } catch (e) {}
    }
  }

  function closeInvite(reason) {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    storageSet(reason || "dismiss");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
    lastFocus = null;
  }

  function goToRegister() {
    storageSet("cta");
    modal.hidden = true;
    document.body.style.overflow = "";
    location.hash = "#/sellos";
    // showClubTab no es global: click en tab Registrarme tras el route
    setTimeout(function () {
      var tab = document.querySelector('[data-club-tab="register"]');
      if (tab) tab.click();
    }, 80);
  }

  modal.querySelectorAll("[data-fid-invite-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      closeInvite("dismiss");
    });
  });

  if (cta) {
    cta.addEventListener("click", function (e) {
      e.preventDefault();
      goToRegister();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeInvite("escape");
      return;
    }
    if (e.key !== "Tab" || !dialog) return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  if (storageGet()) return;

  timer = setTimeout(function () {
    timer = null;
    openInvite();
  }, DELAY_MS);
})();
