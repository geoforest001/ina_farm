const fallbackLocation = [36.648526, 138.194243];
const fallbackZoom = 11;
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

const naganoCsMap = L.tileLayer(
  "https://tile.geospatial.jp/CS/VER2/{z}/{x}/{y}.png",
  {
    attribution:
      '<a href="https://www.geospatial.jp/ckan/dataset/nagano-csmap">長野県CS立体図</a>',
    maxZoom: 18
  }
);

gsiStandard.addTo(map);

const FARM_POLYGON_URL = "https://geoforest001.github.io/ina_farm_test/data/%E8%BE%B2%E5%9C%B0%E7%AD%86%E3%83%9D%E3%83%AA%E3%82%B4%E3%83%B3.pmtiles";
const PIPELINE_URL = "https://geoforest001.github.io/ina_farm_test/data/%E3%83%91%E3%82%A4%E3%83%97%E3%83%A9%E3%82%A4%E3%83%B3.pmtiles";

const farmPolygonTiles = protomapsL.leafletLayer({
  url: FARM_POLYGON_URL,
  maxDataZoom: 13,
  paintRules: [
    {
      dataLayer: "農地筆ポリゴン2025",
      symbolizer: new protomapsL.PolygonSymbolizer({
        fill: "rgb(0,180,0)",
        opacity: 0.5
      })
    }
  ],
  labelRules: []
});
farmPolygonTiles.addTo(map);

const pipelineTiles = protomapsL.leafletLayer({
  url: PIPELINE_URL,
  maxDataZoom: 15,
  paintRules: [
    {
      dataLayer: "02パイプライン_Layer",
      symbolizer: new protomapsL.LineSymbolizer({
        color: "rgb(0,80,200)",
        width: 2
      })
    }
  ],
  labelRules: []
});
pipelineTiles.addTo(map);

const baseLayers = {
  "地理院標準地図": gsiStandard,
  "地理院航空写真": gsiAirPhoto,
  "長野県CS立体図": naganoCsMap
};

const overlays = {
  "農地筆ポリゴン": farmPolygonTiles,
  "パイプライン": pipelineTiles
};

let layerControl;

function renderLayerControl() {
  if (layerControl) {
    map.removeControl(layerControl);
  }

  layerControl = L.control.layers(baseLayers, overlays, {
    position: "topright",
    collapsed: false
  });

  layerControl.addTo(map);
}

renderLayerControl();

const marker = L.marker(fallbackLocation)
  .addTo(map)
  .bindPopup("長野市")
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
