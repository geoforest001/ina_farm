const fallbackLocation = [35.8294, 137.9536]; // 伊那市
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
    maxZoom: 18,
    className: "grayscale-layer bm-multiply"
  }
);

const gsiAirPhoto = L.tileLayer(
  "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  {
    attribution: gsiAttribution,
    maxZoom: 18,
    className: "bm-multiply"
  }
);

const naganoCsMap = L.tileLayer(
  "https://tile.geospatial.jp/CS/VER2/{z}/{x}/{y}.png",
  {
    attribution:
      '<a href="https://www.geospatial.jp/ckan/dataset/nagano-csmap">長野県CS立体図</a>',
    maxZoom: 18,
    className: "bm-multiply"
  }
);

gsiStandard.addTo(map);
gsiAirPhoto.addTo(map); gsiAirPhoto.setOpacity(0);
naganoCsMap.addTo(map); naganoCsMap.setOpacity(0);

const FARM_POLYGON_URL = "https://geoforest001.github.io/ina_farm/data/farm_polygon.pmtiles";
const PIPELINE_URL = "https://geoforest001.github.io/ina_farm_test/data/%E3%83%91%E3%82%A4%E3%83%97%E3%83%A9%E3%82%A4%E3%83%B3.pmtiles";

const farmPolygonTiles = protomapsL.leafletLayer({
  url: FARM_POLYGON_URL,
  maxDataZoom: 16,
  paintRules: [
    {
      dataLayer: "農地筆ポリゴン",
      symbolizer: new protomapsL.PolygonSymbolizer({
        fill: "rgb(240,210,0)",
        opacity: 0.3,
        stroke: "rgb(160,130,0)",
        width: 1.5
      })
    }
  ],
  labelRules: []
});
farmPolygonTiles.addTo(map);

/* 農地ピン検索用レイヤ（透明・検索専用） */
let farmPinData = null;
let farmPinLayer = null;
fetch('data/farm_pins.json')
  .then(r => r.json())
  .then(data => {
    farmPinData = data;
    farmPinLayer = L.geoJSON(null, { pointToLayer: () => L.circleMarker([0,0], {radius:0, opacity:0, fillOpacity:0}) });
    farmPinLayer.addTo(map);
  });
/* 農地筆ポリゴン クリックで地番ポップアップ */
map.on('click', function(e) {
  if (!farmPinData || map.getZoom() < 15) return;
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  const cosLat = Math.cos(lat * Math.PI / 180);
  let nearest = null, minDist = Infinity;
  for (const d of farmPinData) {
    const dlat = d.y - lat;
    const dlng = (d.x - lng) * cosLat;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) { minDist = dist; nearest = d; }
  }
  /* 約50m以内（0.00045度²）のみ表示 */
  if (nearest && minDist < 0.00045 * 0.00045) {
    L.popup()
      .setLatLng([nearest.y, nearest.x])
      .setContent(`📍 ${nearest.a}`)
      .openOn(map);
  }
});


const pipelineTiles = protomapsL.leafletLayer({
  url: PIPELINE_URL,
  maxDataZoom: 15,
  paintRules: [
    {
      dataLayer: "02パイプライン_Layer",
      symbolizer: new protomapsL.LineSymbolizer({
        color: "rgb(0,80,200)",
        width: 2.5
      })
    }
  ],
  labelRules: []
});
pipelineTiles.addTo(map);

const WATERWAY_URL = "https://geoforest001.github.io/ina_farm/data/suiro.pmtiles";

const waterwayTiles = protomapsL.leafletLayer({
  url: WATERWAY_URL,
  maxDataZoom: 16,
  paintRules: [
    {
      dataLayer: "水路",
      symbolizer: new protomapsL.LineSymbolizer({
        color: "rgb(0,150,255)",
        width: 2
      })
    }
  ],
  labelRules: []
});
waterwayTiles.addTo(map);

const SURVEY_URL = "https://geoforest001.github.io/ina_farm_test/data/%E3%83%9E%E3%83%B3%E3%83%9B%E3%83%BC%E3%83%AB.pmtiles";

class SquareSymbolizer {
  constructor({ fill, stroke = "black", width = 1, size = 4 }) {
    this.fill = fill;
    this.stroke = stroke;
    this.width = width;
    this.size = size;
  }
  draw(ctx, geom, z, feature) {
    for (const ring of geom) {
      for (const pt of ring) {
        const s = this.size;
        ctx.fillStyle = this.fill;
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = this.width;
        ctx.beginPath();
        ctx.rect(pt.x - s, pt.y - s, s * 2, s * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

const surveyTiles = protomapsL.leafletLayer({
  url: SURVEY_URL,
  maxDataZoom: 15,
  paintRules: [
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["種別"]?.startsWith("排泥処理工"),
      symbolizer: new SquareSymbolizer({ fill: "#2196F3", stroke: "black", width: 1, size: 4 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => feature.props["種別"] === "制水弁",
      symbolizer: new SquareSymbolizer({ fill: "#f44336", stroke: "black", width: 1, size: 4 })
    },
    {
      dataLayer: "02調査結果 R6",
      filter: (zoom, feature) => {
        const k = feature.props["種別"];
        return !k?.startsWith("排泥処理工") && k !== "制水弁";
      },
      symbolizer: new protomapsL.CircleSymbolizer({ radius: 1.5, fill: "white", opacity: 1, stroke: "black", width: 0.6 })
    }
  ],
  labelRules: []
});
surveyTiles.addTo(map);

const baseLayers = {};

const overlays = {
  "農地筆ポリゴン": farmPolygonTiles,
  "パイプライン": pipelineTiles,
  "水路": waterwayTiles,
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

/* ─── 現在地ボタン ─────────────────────────────── */
  let currentLocationMarker = null;
