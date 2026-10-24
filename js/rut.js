/* Chilean RUT helpers — normalize + validate DV */
(function (global) {
  function clean(rut) {
    return String(rut || "")
      .toUpperCase()
      .replace(/[^0-9K]/g, "");
  }

  function normalize(rut) {
    var c = clean(rut);
    if (c.length < 2) return null;
    var body = c.slice(0, -1);
    var dv = c.slice(-1);
    return body + "-" + dv;
  }

  function computeDV(body) {
    var sum = 0;
    var mul = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body.charAt(i), 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    var mod = 11 - (sum % 11);
    if (mod === 11) return "0";
    if (mod === 10) return "K";
    return String(mod);
  }

  function validate(rut) {
    var c = clean(rut);
    if (c.length < 2) return false;
    var body = c.slice(0, -1);
    var dv = c.slice(-1);
    if (!/^\d+$/.test(body)) return false;
    return computeDV(body) === dv;
  }

  function rutNum(rut) {
    var n = normalize(rut);
    if (!n) return null;
    return parseInt(n.split("-")[0], 10);
  }

  function format(rut) {
    var n = normalize(rut);
    if (!n) return "";
    var parts = n.split("-");
    var body = parts[0];
    var withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return withDots + "-" + parts[1];
  }

  global.LofRut = { clean: clean, normalize: normalize, validate: validate, rutNum: rutNum, format: format, computeDV: computeDV };
})(window);
