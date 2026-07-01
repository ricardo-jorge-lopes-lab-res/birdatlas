document.addEventListener("DOMContentLoaded", function () {
  var map = L.map('map').setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var markersLayer = L.layerGroup().addTo(map);

  function renderMarkers(data) {
    markersLayer.clearLayers();
    var bounds = [];

    data.forEach(function (loc) {
      if (typeof loc.lat !== "number" || typeof loc.lng !== "number") {
        return;
      }
      var marker = L.marker([loc.lat, loc.lng]);
      var popupHtml = "<strong>" + loc.name + "</strong><br>" +
        (loc.date ? loc.date + "<br>" : "") +
        (loc.description || "");
      marker.bindPopup(popupHtml);
      markersLayer.addLayer(marker);
      bounds.push([loc.lat, loc.lng]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([20, 0], 2);
    }

    var countEl = document.getElementById("result-count");
    if (countEl) {
      countEl.textContent = data.length + " location(s) shown";
    }
  }

  function parseDate(str) {
    if (!str) return null;
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function filterByDate() {
    var startVal = document.getElementById("start-date").value;
    var endVal = document.getElementById("end-date").value;

    var start = startVal ? new Date(startVal) : null;
    var end = endVal ? new Date(endVal) : null;

    var filtered = locations.filter(function (loc) {
      var locDate = parseDate(loc.date);
      if (!locDate) return true;
      if (start && locDate < start) return false;
      if (end && locDate > end) return false;
      return true;
    });

    renderMarkers(filtered);
  }

  document.getElementById("filter-btn").addEventListener("click", filterByDate);
  document.getElementById("reset-btn").addEventListener("click", function () {
    document.getElementById("start-date").value = "";
    document.getElementById("end-date").value = "";
    renderMarkers(locations);
  });

  renderMarkers(locations);
});
