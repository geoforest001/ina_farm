const fallbackLocation = [35.681236, 139.767125];
const fallbackZoom = 13;
const currentLocationZoom = 15;
const gsiAttribution =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>';

const map = L.map("map", {
  zoomControl: true
}).setView(fallbackLocation, fallbackZoom);

const gsiStandard = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  {
    attribution: gsiAttribution,
    maxZoom: 18
  }
);

const gsiAirPhoto = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  {
    attribution: gsiAttribution,
    maxZoom: 18
  }
);

gsiStandard.addTo(map);

L.control
  .layers(
    {
      "地理院標準地図": gsiStandard,
      "地理院航空写真": gsiAirPhoto
    },
    {},
    {
      position: "topright"
    }
  )
  .addTo(map);

const marker = L.marker(fallbackLocation)
  .addTo(map)
  .bindPopup("東京駅")
  .openPopup();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const currentLocation = [coords.latitude, coords.longitude];

      map.setView(currentLocation, currentLocationZoom);
      marker
        .setLatLng(currentLocation)
        .setPopupContent("現在地")
        .openPopup();
    },
    () => {
      map.setView(fallbackLocation, fallbackZoom);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
}
