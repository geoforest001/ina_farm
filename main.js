const tokyoStation = [35.681236, 139.767125];

const map = L.map("map", {
  zoomControl: true
}).setView(tokyoStation, 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

L.marker(tokyoStation)
  .addTo(map)
  .bindPopup("東京駅")
  .openPopup();
