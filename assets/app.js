(function () {
  "use strict";

  var IraParse = window.IraParse;
  var MAX_PAGES = 3;

  var el = {
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    fileList: document.getElementById("fileList"),
    emptyState: document.getElementById("emptyState"),
    toolbar: document.getElementById("toolbar"),
    fileCount: document.getElementById("fileCount"),
    readyCount: document.getElementById("readyCount"),
    btnConvertAll: document.getElementById("btnConvertAll"),
    btnClear: document.getElementById("btnClear"),
    modal: document.getElementById("modal"),
    modalList: document.getElementById("modalList"),
    modalClose: document.getElementById("modalClose"),
    btnCancel: document.getElementById("btnCancel"),
    btnPrint: document.getElementById("btnPrint"),
    previewModal: document.getElementById("previewModal"),
    previewFrame: document.getElementById("previewFrame"),
    previewName: document.getElementById("previewName"),
    previewClose: document.getElementById("previewClose"),
    previewCloseBtn: document.getElementById("previewCloseBtn"),
    toast: document.getElementById("toast")
  };

  var cards = [];
  var seq = 0;
  var batch = [];
  var toastTimer = null;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  }

  /* ---------- helpers ---------- */

  function toast(msg, type) {
    el.toast.textContent = msg;
    el.toast.className = "toast" + (type ? " " + type : "");
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.hidden = true;
    }, 2600);
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------- pdf text extraction ---------- */

  async function extractPdfText(file) {
    var buf = await file.arrayBuffer();
    var doc = await window.pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false
    }).promise;

    var out = "";
    var pages = Math.min(doc.numPages, MAX_PAGES);
    for (var p = 1; p <= pages; p++) {
      var page = await doc.getPage(p);
      var content = await page.getTextContent();
      for (var i = 0; i < content.items.length; i++) {
        var item = content.items[i];
        out += item.str;
        if (item.hasEOL) out += "\n";
        else if (item.str && !/\s$/.test(item.str)) out += " ";
      }
      out += "\n";
      page.cleanup();
    }
    await doc.destroy();
    return out;
  }

  /* ---------- card rendering ---------- */

  function ptOptions() {
    return IraParse.PT_LIST.map(function (pt) {
      return '<option value="' + pt.code + '">' + pt.code + " — " + esc(pt.full) + "</option>";
    }).join("");
  }

  function cardTemplate(card) {
    return (
      '<div class="card-head">' +
      '<div class="file-icon" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
      '<div class="card-head-main">' +
      '<div class="fname" title="' + esc(card.file.name) + '">' + esc(card.file.name) + "</div>" +
      '<div class="fmeta">' + fmtSize(card.file.size) + "</div>" +
      "</div>" +
      '<span class="status status-scanning">Memindai…</span>' +
      "</div>" +
      '<div class="detected" hidden></div>' +
      '<div class="dup-warning" hidden>Nama hasil duplikat dengan file lain — ubah salah satu metadata.</div>' +
      '<div class="fields">' +
      '<div class="field"><label for="d' + card.id + '">Tanggal (HH)</label>' +
      '<input id="d' + card.id + '" class="in-day" type="text" inputmode="numeric" maxlength="2" placeholder="08" autocomplete="off"></div>' +
      '<div class="field"><label for="n' + card.id + '">4 Nomor Belakang Faktur</label>' +
      '<input id="n' + card.id + '" class="in-inv" type="text" inputmode="numeric" maxlength="4" placeholder="1426" autocomplete="off"></div>' +
      '<div class="field field-pt"><label for="p' + card.id + '">PT</label>' +
      '<select id="p' + card.id + '" class="in-pt"><option value="">— pilih PT —</option>' +
      ptOptions() +
      "</select></div>" +
      "</div>" +
      '<div class="card-foot">' +
      '<code class="preview-name">—</code>' +
      '<div class="card-actions">' +
      '<button type="button" class="btn btn-ghost btn-remove" hidden>Hapus</button>' +
      '<button type="button" class="btn btn-ghost btn-download" hidden>Download</button>' +
      '<button type="button" class="btn btn-ghost btn-preview"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Preview</button>' +
      '<button type="button" class="btn btn-primary btn-convert" disabled>Konversi</button>' +
      "</div></div>"
    );
  }

  function renderCard(card) {
    var node = document.createElement("article");
    node.className = "card";
    node.dataset.id = String(card.id);
    node.innerHTML = cardTemplate(card);
    card.el = node;

    card.inDay = node.querySelector(".in-day");
    card.inInv = node.querySelector(".in-inv");
    card.inPt = node.querySelector(".in-pt");
    card.badge = node.querySelector(".status");
    card.detectedBox = node.querySelector(".detected");
    card.dupWarn = node.querySelector(".dup-warning");
    card.preview = node.querySelector(".preview-name");
    card.btnConvert = node.querySelector(".btn-convert");
    card.btnDownload = node.querySelector(".btn-download");
    card.btnRemove = node.querySelector(".btn-remove");
    card.btnPreview = node.querySelector(".btn-preview");

    [card.inDay, card.inInv].forEach(function (input) {
      input.addEventListener("input", function () {
        input.value = input.value.replace(/\D/g, "");
        onMetaEdit(card);
      });
    });
    card.inPt.addEventListener("change", function () {
      onMetaEdit(card);
    });
    card.btnPreview.addEventListener("click", function () {
      openPreview(card);
    });
    card.btnConvert.addEventListener("click", function () {
      convertCard(card, true);
    });
    card.btnDownload.addEventListener("click", function () {
      if (card.newName) {
        downloadOne(card.file, card.newName);
        toast("Mengunduh " + card.newName, "ok");
      }
    });
    card.btnRemove.addEventListener("click", function () {
      removeCard(card);
    });

    return node;
  }

  function setStatus(card, kind, label) {
    var map = {
      scanning: ["status-scanning", "Memindai…"],
      ready: ["status-ready", "Siap"],
      warn: ["status-warn", "Periksa manual"],
      done: ["status-done", "Selesai"]
    };
    var conf = map[kind] || map.ready;
    card.badge.className = "status " + conf[0];
    card.badge.textContent = label || conf[1];
  }

  function fillFields(card) {
    card.inDay.value = card.meta.day || "";
    card.inInv.value = card.meta.last4 || "";
    card.inPt.value = card.meta.ptCode || "";

    if (card.meta.detectedName) {
      card.detectedBox.innerHTML = "Terdeteksi: <b>" + esc(card.meta.detectedName) + "</b>";
      card.detectedBox.hidden = false;
    }
    refreshCard(card);
  }

  function readFields(card) {
    return {
      day: card.inDay.value.trim(),
      last4: card.inInv.value.trim(),
      ptCode: card.inPt.value
    };
  }

  function refreshCard(card) {
    var meta = readFields(card);
    card.newName = null;
    card.el.classList.remove("done");
    card.btnDownload.hidden = true;
    card.btnRemove.hidden = true;
    card.btnConvert.hidden = false;

    var name = IraParse.buildFileName(meta);
    card.preview.textContent = name || "—";

    var valid = !!name;
    card.inDay.classList.toggle("invalid", !meta.day);
    card.inInv.classList.toggle("invalid", !meta.last4);
    card.inPt.classList.toggle("invalid", !meta.ptCode);
    card.btnConvert.disabled = !valid || card.status === "scanning";

    checkDuplicates();
    updateToolbar();
  }

  function onMetaEdit(card) {
    if (card.status !== "scanning") {
      setStatus(card, card.meta.day || card.meta.last4 || card.meta.ptCode ? "ready" : "warn", "Siap — diedit");
      if (!card.meta.day && !card.meta.last4 && !card.meta.ptCode) setStatus(card, "warn", "Isi manual");
    }
    refreshCard(card);
  }

  function checkDuplicates() {
    var seen = {};
    var i, card, name;
    for (i = 0; i < cards.length; i++) {
      cards[i].dupWarn.hidden = true;
    }
    for (i = 0; i < cards.length; i++) {
      card = cards[i];
      name = IraParse.buildFileName(readFields(card));
      if (!name) continue;
      if (seen[name]) {
        card.dupWarn.hidden = false;
        seen[name].dupWarn.hidden = false;
      } else {
        seen[name] = card;
      }
    }
  }

  function updateToolbar() {
    var total = cards.length;
    el.toolbar.hidden = total === 0;
    el.emptyState.hidden = total > 0;
    el.fileCount.textContent = total + " file";

    var ready = 0;
    for (var i = 0; i < cards.length; i++) {
      if (IraParse.buildFileName(readFields(cards[i])) && !cards[i].newName) ready++;
    }
    el.readyCount.textContent = ready + " siap dikonversi";
    el.btnConvertAll.disabled = ready === 0;
  }

  /* ---------- scan & convert ---------- */

  async function scanCard(card) {
    card.status = "scanning";
    setStatus(card, "scanning");
    card.btnConvert.disabled = true;

    try {
      var text = await extractPdfText(card.file);
      var meta = IraParse.parseMeta(text);
      card.meta = {
        day: meta.day,
        last4: meta.last4,
        ptCode: meta.ptCode,
        detectedName: meta.detectedName
      };
      fillFields(card);
      card.status = "ready";
      if (meta.day && meta.last4 && meta.ptCode) {
        setStatus(card, "ready", "Terdeteksi otomatis");
      } else {
        setStatus(card, "warn", "Lengkapi metadata");
      }
    } catch (err) {
      console.error("scan gagal:", err);
      card.meta = { day: "", last4: "", ptCode: "", detectedName: "" };
      fillFields(card);
      card.status = "warn";
      setStatus(card, "warn", "PDF tak terbaca — isi manual");
    }
    refreshCard(card);
  }

  function convertCard(card, showModalIfNeeded) {
    var meta = readFields(card);
    var name = IraParse.buildFileName(meta);
    if (!name) {
      toast("Lengkapi tanggal, nomor faktur, dan PT terlebih dahulu", "warn");
      return null;
    }

    card.newName = name;
    card.status = "done";
    card.el.classList.add("done");
    setStatus(card, "done", "Siap diunduh");
    card.preview.textContent = name;
    card.btnConvert.disabled = true;
    card.btnDownload.hidden = false;
    card.btnRemove.hidden = false;
    updateToolbar();

    if (showModalIfNeeded) {
      batch = [card];
      showModal();
    }
    return card;
  }

  async function convertAll() {
    var converted = [];
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].status === "scanning") continue;
      if (cards[i].newName) continue;
      if (!IraParse.buildFileName(readFields(cards[i]))) continue;
      var done = convertCard(cards[i], false);
      if (done) converted.push(done);
    }

    if (!converted.length) {
      toast("Tidak ada file yang siap dikonversi", "warn");
      return;
    }
    batch = converted;
    showModal();
  }

  /* ---------- modal & download ---------- */

  function openPreview(card) {
    if (card.previewUrl) URL.revokeObjectURL(card.previewUrl);
    card.previewUrl = URL.createObjectURL(card.file);
    el.previewFrame.src = card.previewUrl;
    el.previewName.textContent = card.file.name;
    el.previewName.title = card.file.name;
    el.previewModal.hidden = false;
  }

  function closePreview() {
    el.previewModal.hidden = true;
    el.previewFrame.src = "about:blank";
  }

  function showModal() {
    el.modalList.innerHTML = batch
      .map(function (card) {
        return (
          "<li>" +
          '<span class="m-from" title="' + esc(card.file.name) + '">' + esc(card.file.name) + "</span>" +
          '<span class="m-to">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
          esc(card.newName) +
          "</span>" +
          "</li>"
        );
      })
      .join("");
    el.modal.hidden = false;
  }

  function hideModal() {
    el.modal.hidden = true;
  }

  function downloadOne(file, newName) {
    var url = URL.createObjectURL(file);
    var a = document.createElement("a");
    a.href = url;
    a.download = newName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 15000);
  }

  async function printBatch() {
    var list = batch.slice();
    hideModal();
    for (var i = 0; i < list.length; i++) {
      downloadOne(list[i].file, list[i].newName);
      if (i < list.length - 1) await sleep(450);
    }
    toast("Mengunduh " + list.length + " file hasil rename", "ok");
  }

  /* ---------- file handling ---------- */

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    });
    if (!files.length) {
      toast("Hanya file PDF yang diperbolehkan", "warn");
      return;
    }
    files.forEach(function (file) {
      var card = {
        id: ++seq,
        file: file,
        meta: { day: "", last4: "", ptCode: "", detectedName: "" },
        status: "scanning",
        newName: null
      };
      cards.push(card);
      el.fileList.appendChild(renderCard(card));
      scanCard(card);
    });
    updateToolbar();
  }

  function removeCard(card) {
    var idx = cards.indexOf(card);
    if (idx !== -1) cards.splice(idx, 1);
    if (card.previewUrl) URL.revokeObjectURL(card.previewUrl);
    if (el.previewModal.hidden === false && el.previewName.textContent === card.file.name) closePreview();
    card.el.remove();
    checkDuplicates();
    updateToolbar();
  }

  function clearAll() {
    cards.forEach(function (card) {
      if (card.previewUrl) URL.revokeObjectURL(card.previewUrl);
      card.el.remove();
    });
    cards = [];
    batch = [];
    hideModal();
    updateToolbar();
  }

  /* ---------- events ---------- */

  el.dropzone.addEventListener("click", function () {
    el.fileInput.click();
  });
  el.dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.fileInput.click();
    }
  });
  el.fileInput.addEventListener("change", function () {
    addFiles(el.fileInput.files);
    el.fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    el.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      el.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    el.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove("dragover");
    });
  });
  el.dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
  window.addEventListener("dragover", function (e) {
    e.preventDefault();
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
  });

  el.btnConvertAll.addEventListener("click", convertAll);
  el.btnClear.addEventListener("click", clearAll);
  el.btnPrint.addEventListener("click", printBatch);
  el.btnCancel.addEventListener("click", function () {
    hideModal();
    toast("Dibatal — file tetap tersedia untuk diunduh dari daftar");
  });
  el.modalClose.addEventListener("click", hideModal);
  el.modal.addEventListener("click", function (e) {
    if (e.target === el.modal) hideModal();
  });
  el.previewClose.addEventListener("click", closePreview);
  el.previewCloseBtn.addEventListener("click", closePreview);
  el.previewModal.addEventListener("click", function (e) {
    if (e.target === el.previewModal) closePreview();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!el.previewModal.hidden) closePreview();
    else if (!el.modal.hidden) hideModal();
  });

  updateToolbar();
})();
