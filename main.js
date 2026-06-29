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
        opacity: 0.5,
        stroke: "rgb(0,100,0)",
        width: 1.5
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

const SURVEY_URL = "https://geoforest001.github.io/ina_farm_test/data/%E3%83%9E%E3%83%B3%E3%83%9B%E3%83%BC%E3%83%AB.pmtiles";

const surveyTiles = protomapsL.leafletLayer({
  url: SURVEY_URL,
  maxDataZoom: 15,
  paintRules: [
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["結合用_表示"] === "発見",
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 4, fill: "rgb(240,200,0)", opacity: 1 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["結合用_表示"] === "不明",
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 4, fill: "rgb(220,120,0)", opacity: 1 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["結合用_表示"] === "未",
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 4, fill: "rgb(180,180,180)", opacity: 1 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["結合用_表示"] === "GF",
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 4, fill: "rgb(150,50,180)", opacity: 1 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["結合用_表示"] === "新",
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 4, fill: "rgb(220,20,20)", opacity: 1 })
    }
  ],
  labelRules: []
});
surveyTiles.addTo(map);

const baseLayers = {
  "地理院標準地図": gsiStandard,
  "地理院航空写真": gsiAirPhoto,
  "長野県CS立体図": naganoCsMap
};

const overlays = {
  "農地筆ポリゴン": farmPolygonTiles,
  "パイプライン": pipelineTiles,
  "マンホール": surveyTiles
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
