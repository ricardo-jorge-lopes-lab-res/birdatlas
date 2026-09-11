(function () {
  "use strict";

  const MUSEUM_COLORS = {
    MCUC: "#1c6e68",
    MHNCUP: "#97553a",
    MUHNAC: "#3e5f8a",
  };
  const DEFAULT_COLOR = "#4a5c60";
  const PAGE_SIZE = 100;

  let allFeatures = [];
  let map = null;
  let markersLayer = null;
  let yearSlider = null;
  let currentBounds = null;
  let mapInitialised = false;

  const filters = {
    museums: new Set(),
    order: "",
    family: "",
    genus: "",
    species: "",
    yearMin: null,
    yearMax: null,
  };

  const table = {
    rows: [],
    sortKey: "scientificName",
    sortDir: "asc",
    page: 0,
    query: "",
  };

  init();

  /* ───────────────────────── startup ───────────────────────── */

  async function init() {
    setupTabs();

    let geojson;
    try {
      const resp = await fetch("points.geojson");
      if (!resp.ok) {
        throw new Error(
          "The server returned " + resp.status + " for points.geojson."
        );
      }
      geojson = await resp.json();
    } catch (err) {
      showLoadError(err);
      return;
    }

    allFeatures = geojson.features;

    const museums = uniqueSorted(allFeatures, "museum");
    filters.museums = new Set(museums);
    buildMuseumChecks(museums);

    const years = allFeatures
      .map((f) => f.properties.year)
      .filter((y) => typeof y === "number");
    filters.yearMin = Math.min(...years);
    filters.yearMax = Math.max(...years);
    buildYearSlider(filters.yearMin, filters.yearMax);

    populateCascadingSelects();
    ["order", "family", "genus", "species"].forEach(bindSelect);
    document.getElementById("reset-btn").addEventListener("click", resetFilters);

    setupTable();

    initMap();
    applyFilters();
  }

  function showLoadError(err) {
    const box = document.getElementById("load-error");
    const detail = document.getElementById("load-error-detail");
    box.hidden = false;
    detail.textContent =
      " " +
      err.message +
      " Check that points.geojson sits in the same folder as index.html, and that the page is served over http:// rather than opened as a file.";
    document.getElementById("count-display").textContent = "No records loaded.";
  }

  /* ───────────────────────── tabs ───────────────────────── */

  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        document.querySelectorAll(".panel").forEach((p) => {
          p.classList.toggle("is-active", p.id === tab.dataset.panel);
        });
        // Leaflet needs a nudge when its container becomes visible
        if (tab.dataset.panel === "panel-map" && map) {
          setTimeout(() => map.invalidateSize(), 0);
        }
      });
    });
  }

  /* ───────────────────────── map ───────────────────────── */

  // Mainland Portugal. The archipelagos sit far to the west, so fitting every
  // record on load would push the mainland into a corner; the extent button
  // brings Madeira, the Azores and the Selvagens into view on demand.
  const MAINLAND = L.latLngBounds([36.8, -9.7], [42.2, -6.1]);

  function initMap() {
    map = L.map("map", { zoomControl: true });
    map.fitBounds(MAINLAND);
    mapInitialised = true;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    const ZoomToExtent = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        const btn = L.DomUtil.create("button", "zoom-extent-btn");
        btn.innerHTML = "&#9974;";
        btn.title = "Zoom to full extent of visible records";
        btn.setAttribute("aria-label", "Zoom to full extent of visible records");
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, "click", zoomToExtent);
        return btn;
      },
    });
    map.addControl(new ZoomToExtent());
  }

  function renderMarkers(features) {
    markersLayer.clearLayers();
    const pts = [];
    features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lon], {
        radius: 5,
        color: "#16262a",
        weight: 1,
        fillColor: MUSEUM_COLORS[f.properties.museum] || DEFAULT_COLOR,
        fillOpacity: 0.85,
      })
        .bindPopup(popupHtml(f.properties))
        .addTo(markersLayer);
      pts.push([lat, lon]);
    });
    currentBounds = pts.length ? L.latLngBounds(pts) : null;
  }

  function zoomToExtent() {
    if (map && currentBounds) map.fitBounds(currentBounds, { padding: [30, 30] });
  }

  function popupHtml(p) {
    const rows = [
      ["Museum", p.museum],
      ["Occurrence ID", p.occurrenceID],
      ["Order", p.order],
      ["Family", p.family],
      ["Locality", p.locality],
      ["County", p.county],
      ["Year", p.year == null ? "unknown" : p.year],
      ["Coordinate uncertainty", p.coordUncertaintyM ? p.coordUncertaintyM + " m" : "—"],
    ];
    let html =
      '<div class="popup-title">' + esc(p.scientificName || "") + "</div>";
    rows.forEach(([k, v]) => {
      html +=
        '<div class="popup-row"><b>' +
        k +
        ":</b> " +
        esc(String(v == null ? "" : v)) +
        "</div>";
    });
    return html;
  }

  /* ───────────────────────── filters ───────────────────────── */

  function uniqueSorted(features, prop) {
    const set = new Set();
    features.forEach((f) => {
      const v = f.properties[prop];
      if (v !== null && v !== undefined && v !== "") set.add(v);
    });
    return Array.from(set).sort((a, b) =>
      String(a).localeCompare(String(b), "pt")
    );
  }

  function buildMuseumChecks(museums) {
    const box = document.getElementById("museum-checks");
    box.innerHTML = "";
    museums.forEach((m) => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.value = m;
      cb.addEventListener("change", () => {
        if (cb.checked) filters.museums.add(m);
        else filters.museums.delete(m);
        populateCascadingSelects();
        applyFilters();
      });
      const dot = document.createElement("span");
      dot.className = "swatch";
      dot.style.background = MUSEUM_COLORS[m] || DEFAULT_COLOR;
      label.append(cb, dot, document.createTextNode(" " + m));
      box.appendChild(label);
    });
  }

  function buildYearSlider(min, max) {
    yearSlider = noUiSlider.create(document.getElementById("year-slider"), {
      start: [min, max],
      connect: true,
      step: 1,
      range: { min: min, max: max },
      format: { to: (v) => Math.round(v), from: (v) => Number(v) },
    });
    updateYearLabel(min, max);
    yearSlider.on("update", (values) => {
      filters.yearMin = parseInt(values[0], 10);
      filters.yearMax = parseInt(values[1], 10);
      updateYearLabel(filters.yearMin, filters.yearMax);
      applyFilters();
    });
  }

  function updateYearLabel(a, b) {
    document.getElementById("year-range-label").textContent = a + "–" + b;
  }

  function bindSelect(key) {
    const el = document.getElementById(key + "-select");
    el.addEventListener("change", () => {
      filters[key] = el.value;
      if (key === "order") { filters.family = ""; filters.genus = ""; filters.species = ""; }
      if (key === "family") { filters.genus = ""; filters.species = ""; }
      if (key === "genus") { filters.species = ""; }
      populateCascadingSelects();
      applyFilters();
    });
  }

  function matching(exclude) {
    exclude = exclude || [];
    return allFeatures.filter((f) => {
      const p = f.properties;
      if (!exclude.includes("museum") && !filters.museums.has(p.museum)) return false;
      if (!exclude.includes("order") && filters.order && p.order !== filters.order) return false;
      if (!exclude.includes("family") && filters.family && p.family !== filters.family) return false;
      if (!exclude.includes("genus") && filters.genus && p.genus !== filters.genus) return false;
      if (!exclude.includes("species") && filters.species && p.scientificName !== filters.species) return false;
      return true;
    });
  }

  function populateCascadingSelects() {
    fillSelect("order-select", "order", filters.order, matching(["order", "family", "genus", "species"]));
    fillSelect("family-select", "family", filters.family, matching(["family", "genus", "species"]));
    fillSelect("genus-select", "genus", filters.genus, matching(["genus", "species"]));
    fillSelect("species-select", "scientificName", filters.species, matching(["species"]));
  }

  function fillSelect(selectId, prop, currentValue, source) {
    const el = document.getElementById(selectId);
    const options = uniqueSorted(source, prop);
    const placeholder = el.options[0];
    el.innerHTML = "";
    el.appendChild(placeholder);
    options.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      el.appendChild(opt);
    });
    if (currentValue && options.includes(currentValue)) {
      el.value = currentValue;
    } else {
      el.value = "";
      const key = selectId.replace("-select", "");
      filters[key] = "";
    }
  }

  function applyFilters() {
    const filtered = allFeatures.filter((f) => {
      const p = f.properties;
      if (!filters.museums.has(p.museum)) return false;
      if (filters.order && p.order !== filters.order) return false;
      if (filters.family && p.family !== filters.family) return false;
      if (filters.genus && p.genus !== filters.genus) return false;
      if (filters.species && p.scientificName !== filters.species) return false;
      if (typeof p.year === "number" && (p.year < filters.yearMin || p.year > filters.yearMax)) return false;
      return true;
    });

    if (mapInitialised) renderMarkers(filtered);

    document.getElementById("count-display").innerHTML =
      "<strong>" + filtered.length.toLocaleString("en") + "</strong> of " +
      allFeatures.length.toLocaleString("en") + " records shown";

    table.rows = filtered.map((f) =>
      Object.assign({}, f.properties, {
        decimalLatitude: f.geometry.coordinates[1],
        decimalLongitude: f.geometry.coordinates[0],
      })
    );
    table.page = 0;
    renderTable();
  }

  function resetFilters() {
    filters.order = filters.family = filters.genus = filters.species = "";
    document.querySelectorAll('#museum-checks input').forEach((cb) => {
      cb.checked = true;
      filters.museums.add(cb.value);
    });
    const years = allFeatures.map((f) => f.properties.year).filter((y) => typeof y === "number");
    yearSlider.set([Math.min(...years), Math.max(...years)]);
    populateCascadingSelects();
    applyFilters();
  }

  /* ───────────────────────── records table ───────────────────────── */

  function setupTable() {
    document.querySelectorAll("#records-table th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (table.sortKey === key) {
          table.sortDir = table.sortDir === "asc" ? "desc" : "asc";
        } else {
          table.sortKey = key;
          table.sortDir = "asc";
        }
        table.page = 0;
        renderTable();
      });
    });

    const search = document.getElementById("table-search");
    search.addEventListener("input", () => {
      table.query = search.value.trim().toLowerCase();
      table.page = 0;
      renderTable();
    });

    document.getElementById("prev-page").addEventListener("click", () => {
      if (table.page > 0) { table.page--; renderTable(); scrollTableTop(); }
    });
    document.getElementById("next-page").addEventListener("click", () => {
      if ((table.page + 1) * PAGE_SIZE < visibleRows().length) {
        table.page++; renderTable(); scrollTableTop();
      }
    });

    document.getElementById("csv-btn").addEventListener("click", downloadCsv);
  }

  function scrollTableTop() {
    document.querySelector(".table-scroll").scrollTop = 0;
  }

  function visibleRows() {
    let rows = table.rows;
    if (table.query) {
      const q = table.query;
      rows = rows.filter((r) =>
        [r.museum, r.occurrenceID, r.scientificName, r.order, r.family, r.locality, r.county, r.year]
          .some((v) => v != null && String(v).toLowerCase().includes(q))
      );
    }
    const key = table.sortKey;
    const dir = table.sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "pt") * dir;
    });
  }

  function renderTable() {
    const rows = visibleRows();
    const start = table.page * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);
    const tbody = document.querySelector("#records-table tbody");

    tbody.innerHTML = slice
      .map((r) => {
        const color = MUSEUM_COLORS[r.museum] || DEFAULT_COLOR;
        return (
          "<tr>" +
          '<td><span class="museum-tag" style="--dot:' + color + '">' + esc(r.museum || "") + "</span></td>" +
          "<td>" + esc(r.occurrenceID || "") + "</td>" +
          '<td class="sci-name">' + esc(r.scientificName || "") + "</td>" +
          "<td>" + esc(r.order || "") + "</td>" +
          "<td>" + esc(r.family || "") + "</td>" +
          "<td>" + esc(r.locality || "") + "</td>" +
          "<td>" + esc(r.county || "") + "</td>" +
          '<td class="num">' + (r.year == null ? "—" : r.year) + "</td>" +
          '<td class="num">' + (r.coordUncertaintyM == null ? "—" : r.coordUncertaintyM) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    if (!slice.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="padding:26px 12px;color:#4a5c60">' +
        "No records match the current filters and search. Clear the search box, or reset the filters on the Map tab." +
        "</td></tr>";
    }

    document.getElementById("table-tally").textContent =
      rows.length.toLocaleString("en") + " records match the current filters";

    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    document.getElementById("page-label").textContent =
      "Page " + (table.page + 1) + " of " + pages;
    document.getElementById("prev-page").disabled = table.page === 0;
    document.getElementById("next-page").disabled = table.page >= pages - 1;

    document.querySelectorAll("#records-table th").forEach((th) => {
      if (th.dataset.key === table.sortKey) th.dataset.sort = table.sortDir;
      else th.removeAttribute("data-sort");
    });
  }

  function downloadCsv() {
    const rows = visibleRows();
    const cols = ["museum", "occurrenceID", "scientificName", "genus", "family", "order",
      "locality", "county", "decimalLatitude", "decimalLongitude",
      "coordUncertaintyM", "year"];
    const lines = [cols.join(",")];
    rows.forEach((r) => {
      lines.push(cols.map((c) => csvCell(r[c])).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "museum_bird_records.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(v) {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ───────────────────────── util ───────────────────────── */

  function esc(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
