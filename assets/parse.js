(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IraParse = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PT_LIST = [
    { code: "GATRA", full: "PT GALANGCITRA MAJU MAPAN", tokens: ["GALANGCITRA", "MAJU", "MAPAN"] },
    { code: "ESA", full: "PT ESA KALEN JAYA", tokens: ["ESA", "KALEN", "JAYA"] },
    { code: "KJI", full: "PT KING JIM INDONESIA", tokens: ["KING", "JIM", "INDONESIA"] },
    { code: "MEDHI", full: "PT ABADI JAYA MALANG", tokens: ["ABADI", "JAYA", "MALANG"] },
    { code: "MERTEX", full: "PT MERMAID TEXTILE INDUSTRY INDONESIA", tokens: ["MERMAID", "TEXTILE", "INDUSTRY", "INDONESIA"] },
    { code: "VINS", full: "PT VINS GLOBAL PACK", tokens: ["VINS", "GLOBAL", "PACK"] },
    { code: "ANTOK", full: "PT ANUGRAH JAYA MULTINDO", tokens: ["ANUGRAH", "JAYA", "MULTINDO"] }
  ];

  var MONTH_SRC =
    "Jan(?:uari|uary)?|Feb(?:ruari|ruary)?|Mar(?:et|ch)?|Apr(?:il)?|Me[iy]|Jun(?:i|e)?|Jul(?:i|y)?|" +
    "Agu(?:stus)?|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Des(?:ember)?|Dec(?:ember)?";

  function squash(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function normLine(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? "0" + n : n;
  }

  function last4(digits) {
    digits = String(digits || "").replace(/\D/g, "");
    if (digits.length < 4) return "";
    return digits.slice(-4);
  }

  function parseDate(text) {
    var named = new RegExp(
      "\\b(\\d{1,2})[\\s\\-\\/.]+(" + MONTH_SRC + ")\\.?\\s*,?\\s*(?:TAHUN\\s*)?((?:19|20)\\d{2})\\b",
      "i"
    );
    var m = named.exec(text);
    if (m) {
      var day = parseInt(m[1], 10);
      if (day >= 1 && day <= 31) return pad2(day);
    }

    var numeric = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:19|20)\d{2})\b/;
    m = numeric.exec(text);
    if (m) {
      day = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      if (day >= 1 && day <= 31 && mo >= 1 && mo <= 12) return pad2(day);
    }

    return "";
  }

  function parseInvoice(text) {
    var m =
      /Kode\s*(?:dan|dn)\s*Nomor\s*Seri(?:\s*Faktur(?:\s*Pajak)?)?[:\s#]*([0-9][0-9\s\-]{5,30}[0-9])/i.exec(text);
    if (m) {
      var v = last4(m[1]);
      if (v) return v;
    }

    m =
      /No\.?\s*(?:Seri\s*)?(?:Faktur(?:\s*Pajak)?|Invoice|Inv\.?|Nota|Surat\s*Jalan)[:\s#]*([0-9][0-9\s\-\/.]{2,30})/i.exec(
        text
      );
    if (m) {
      v = last4(m[1]);
      if (v) return v;
    }

    return "";
  }

  function matchPT(str) {
    var sq = squash(str);
    if (sq.length < 4) return null;
    var best = null;
    for (var i = 0; i < PT_LIST.length; i++) {
      var pt = PT_LIST[i];
      var all = true;
      for (var j = 0; j < pt.tokens.length; j++) {
        if (sq.indexOf(squash(pt.tokens[j])) === -1) {
          all = false;
          break;
        }
      }
      if (all && (!best || pt.tokens.length > best.tokens.length)) best = pt;
    }
    return best;
  }

  function parsePT(text) {
    var lines = String(text || "").split(/\r?\n/);
    var i, pt;

    for (i = 0; i < lines.length; i++) {
      if (/\bnama\b/i.test(lines[i]) || /\bpembeli\b/i.test(lines[i]) || /\bpenjual\b/i.test(lines[i])) {
        pt = matchPT(lines[i]);
        if (pt) return { code: pt.code, detected: normLine(lines[i]) };
      }
    }

    for (i = 0; i < lines.length; i++) {
      pt = matchPT(lines[i]);
      if (pt) return { code: pt.code, detected: normLine(lines[i]) };
    }

    return { code: "", detected: "" };
  }

  function parseMeta(text) {
    var pt = parsePT(text);
    return {
      day: parseDate(text),
      last4: parseInvoice(text),
      ptCode: pt.code,
      detectedName: pt.detected
    };
  }

  function sanitizeFileName(name) {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  }

  function buildFileName(meta) {
    var digits = function (s) {
      return String(s || "").replace(/\D/g, "");
    };

    var day = digits(meta.day);
    day = day ? pad2(day.slice(-2)) : "";
    var inv = last4(meta.last4);
    var code = String(meta.ptCode || "").trim().toUpperCase();

    if (!day || !inv || !code) return null;
    return sanitizeFileName(day + " - " + inv + " - " + code + ".pdf");
  }

  return {
    PT_LIST: PT_LIST,
    parseMeta: parseMeta,
    parseDate: parseDate,
    parseInvoice: parseInvoice,
    parsePT: parsePT,
    buildFileName: buildFileName,
    sanitizeFileName: sanitizeFileName
  };
});
