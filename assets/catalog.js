/* Project Passport — public catalogue (PASSPORT-DES-003 §4).
   Searches ONLY the exported public catalogue (/public-data/1EG/catalog.json). No login, no
   SharePoint, no third-party request. Data is written with textContent only (never innerHTML). */
(function () {
  "use strict";
  var ID_SHAPE = /^1EG-(C-)?\d{4}$/;
  var input = document.getElementById("q");
  var results = document.getElementById("results");
  var status = document.getElementById("status");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var records = [];
  var kind = "all";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function card(r) {
    var a = el("a", "manifest-card"); a.href = "/1EG/" + encodeURIComponent(r.recordId);
    if (r.thumb) { var img = el("img"); img.src = r.thumb; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; a.appendChild(img); }
    else a.appendChild(el("span", "manifest-blank"));
    var meta = el("span", "manifest-meta");
    meta.appendChild(el("span", "manifest-id", r.recordId));
    meta.appendChild(el("span", "manifest-name", r.title || ""));
    meta.appendChild(el("span", "manifest-kind", r.kind === "container" ? "Container" : "Item"));
    a.appendChild(meta);
    return a;
  }

  function render() {
    var q = (input.value || "").trim().toUpperCase();
    var shown = records.filter(function (r) {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return r.recordId.toUpperCase().indexOf(q) !== -1 || (r.title || "").toUpperCase().indexOf(q) !== -1;
    });
    results.textContent = "";
    shown.forEach(function (r) { results.appendChild(card(r)); });
    // An exact Record ID that is not in the published catalogue may still be an issued tag:
    // offer to open it; the Passport route decides (not yet active / not found).
    if (ID_SHAPE.test(q) && !records.some(function (r) { return r.recordId === q; })) {
      var a = el("a", "manifest-card"); a.href = "/1EG/" + encodeURIComponent(q);
      a.appendChild(el("span", "manifest-blank"));
      var m = el("span", "manifest-meta"); m.appendChild(el("span", "manifest-id", q)); m.appendChild(el("span", "manifest-name", "Open this Passport"));
      a.appendChild(m); results.appendChild(a);
    }
    status.textContent = shown.length ? "" : (q ? "No published Passport matches that search." : "No published Passports yet.");
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      kind = t.getAttribute("data-kind");
      tabs.forEach(function (x) { var on = x === t; x.classList.toggle("is-active", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
      render();
    });
  });
  input.addEventListener("input", render);
  // Enter on an exact Record ID opens that Passport; otherwise it just filters (no form post).
  document.querySelector(".search").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = (input.value || "").trim().toUpperCase();
    if (ID_SHAPE.test(q)) window.location.assign("/1EG/" + encodeURIComponent(q));
  });

  fetch("/public-data/1EG/catalog.json", { credentials: "omit" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (c) { records = (c && c.records) || []; render(); })
    .catch(function () { status.textContent = "The Passport catalogue could not be loaded. You can still open a Passport directly by scanning its tag."; });
})();
