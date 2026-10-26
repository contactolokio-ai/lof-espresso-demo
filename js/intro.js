/**
 * Lof Espresso — hero entrance (wipe up + letter stagger).
 * Replays on every full page load. Skips deep hashes + reduced-motion.
 */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("is-intro")) return;

  var timers = [];
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function finish() {
    timers.forEach(clearTimeout);
    timers = [];
    root.classList.add("intro-done");
    root.classList.remove("is-intro", "is-intro-wipe", "is-intro-letters");
    document.body.style.overflow = "";
  }

  var hero = document.querySelector(".hero--photo");
  var h1 = hero && hero.querySelector("h1");
  if (!h1) {
    finish();
    return;
  }

  // Split headline into per-letter spans (keep accessible name)
  var text = h1.textContent || "";
  h1.setAttribute("aria-label", text.trim());
  var html = "";
  var i = 0;
  for (var n = 0; n < text.length; n++) {
    var ch = text.charAt(n);
    if (ch === " ") {
      html += '<span class="intro-space"> </span>';
    } else if (ch === "\n" || ch === "\r" || ch === "\t") {
      continue;
    } else {
      html +=
        '<span class="intro-char" aria-hidden="true" style="--i:' +
        i +
        '">' +
        ch +
        "</span>";
      i++;
    }
  }
  h1.innerHTML = html;

  // Sequence ~2s: paper beat → wipe → letters → unlock
  later(function () {
    root.classList.add("is-intro-wipe");
  }, 180);

  later(function () {
    root.classList.add("is-intro-letters");
  }, 520);

  later(finish, 2200);

  // Safety: never leave scroll locked
  later(finish, 4000);

  // If user navigates away mid-intro, release
  window.addEventListener(
    "hashchange",
    function () {
      finish();
    },
    { once: true }
  );
})();
