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
const PIPELINE_URL = "https://geoforest001.github.io/ina_farm/data/pipeline.pmtiles";

// 選択中フィーチャのハイライト状態
var _selFarmObjId = null;
var _selOverlay = null;  // 点・線レイヤ用 Leaflet オーバーレイ

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
    },
    {
      dataLayer: "農地筆ポリゴン",
      filter: (zoom, feature) => feature.props.OBJECTID === _selFarmObjId,
      symbolizer: new protomapsL.PolygonSymbolizer({
        fill: "rgba(255,220,0,0.45)",
        opacity: 1,
        stroke: "#FFD700",
        width: 5
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
/* 農地筆ポリゴン クリック: ハイライト＋地番ポップアップ */
map.on('click', function(e) {
  if (!farmPinData || map.getZoom() < 15) return;
  if (!map.hasLayer(farmPolygonTiles)) return;
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
  if (nearest && minDist < 0.00045 * 0.00045) {
    e._featureHandled = true;
    if (_selOverlay) { map.removeLayer(_selOverlay); _selOverlay = null; }
    _selFarmObjId = nearest.id || null;
    farmPolygonTiles.redraw();
    L.popup()
      .setLatLng([nearest.y, nearest.x])
      .setContent(`📍 ${nearest.a}`)
      .openOn(map);
  }
});


const pipelineTiles = protomapsL.leafletLayer({
  url: PIPELINE_URL,
  maxDataZoom: 20,
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
pipelineTiles.addTo(map);
waterwayTiles.addTo(map);

const SURVEY_URL = "https://geoforest001.github.io/ina_farm/data/manhole.pmtiles";

// ポイント系レイヤを線レイヤの上に表示するカスタムペイン
map.createPane('pointPane');
map.getPane('pointPane').style.zIndex = 450;

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
  pane: 'pointPane',
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

const SHISETSU_URL = "https://geoforest001.github.io/ina_farm/data/shisetsu.pmtiles";

class DoubleCircleSymbolizer {
  constructor({ fill, stroke, outerRadius, innerRadius, strokeWidth }) {
    this.fill = fill;
    this.stroke = stroke;
    this.outerRadius = outerRadius;
    this.innerRadius = innerRadius;
    this.strokeWidth = strokeWidth;
  }
  draw(ctx, geom, z, feature) {
    for (const ring of geom) {
      for (const pt of ring) {
        // 外側の円
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, this.outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.fill;
        ctx.fill();
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = this.strokeWidth;
        ctx.stroke();
        // 内側の円（白抜き）
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, this.innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = this.strokeWidth;
        ctx.stroke();
        // 中心点
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, this.strokeWidth, 0, Math.PI * 2);
        ctx.fillStyle = this.fill;
        ctx.fill();
      }
    }
  }
}

const shisetsuTiles = protomapsL.leafletLayer({
  url: SHISETSU_URL,
  maxDataZoom: 16,
  pane: 'pointPane',
  paintRules: [
    {
      dataLayer: "shisetsu",
      symbolizer: new DoubleCircleSymbolizer({
        fill: '#e00',
        stroke: '#e00',
        outerRadius: 7,
        innerRadius: 5.5,
        strokeWidth: 1.5
      })
    }
  ],
  labelRules: []
});
shisetsuTiles.addTo(map);

/* マンホールクリックポップアップ */
let manholePinData = null;
fetch('data/manhole_pins.json')
  .then(r => r.json())
  .then(data => { manholePinData = data; });

map.on('click', function(e) {
  if (!manholePinData || !map.hasLayer(surveyTiles)) return;
  const lat = e.latlng.lat, lng = e.latlng.lng;
  const cosLat = Math.cos(lat * Math.PI / 180);
  let nearest = null, minDist = Infinity;
  for (const d of manholePinData) {
    const dl = d.y - lat, dn = (d.x - lng) * cosLat;
    const dist = dl * dl + dn * dn;
    if (dist < minDist) { minDist = dist; nearest = d; }
  }
  if (!nearest || minDist > 0.00045 * 0.00045) return;
  e._featureHandled = true;
  _selFarmObjId = null; farmPolygonTiles.redraw();
  if (_selOverlay) { map.removeLayer(_selOverlay); _selOverlay = null; }
  _selOverlay = L.circleMarker([nearest.y, nearest.x], {
    radius: 12, color: '#FFD700', weight: 4, fillOpacity: 0
  }).addTo(map);
  const rows = [
    nearest.h ? `<tr><th>配管名</th><td>${nearest.h}</td></tr>` : '',
    nearest.k ? `<tr><th>種別</th><td>${nearest.k}</td></tr>` : ''
  ].filter(Boolean).join('');
  L.popup({ maxWidth: 200 })
    .setLatLng([nearest.y, nearest.x])
    .setContent(`<table class="shisetsu-popup">${rows}</table>`)
    .openOn(map);
});

/* 点施設クリックポップアップ */
let shisetsuPinData = null;
fetch('data/shisetsu_pins.json')
  .then(r => r.json())
  .then(data => { shisetsuPinData = data; });

map.on('click', function(e) {
  if (!shisetsuPinData || !map.hasLayer(shisetsuTiles)) return;
  const lat = e.latlng.lat, lng = e.latlng.lng;
  const cosLat = Math.cos(lat * Math.PI / 180);
  let nearest = null, minDist = Infinity;
  for (const d of shisetsuPinData) {
    const dl = d.y - lat, dn = (d.x - lng) * cosLat;
    const dist = dl * dl + dn * dn;
    if (dist < minDist) { minDist = dist; nearest = d; }
  }
  if (!nearest || minDist > 0.0007 * 0.0007) return;
  e._featureHandled = true;
  _selFarmObjId = null; farmPolygonTiles.redraw();
  if (_selOverlay) { map.removeLayer(_selOverlay); _selOverlay = null; }
  _selOverlay = L.circleMarker([nearest.y, nearest.x], {
    radius: 16, color: '#FFD700', weight: 4, fillOpacity: 0
  }).addTo(map);
  const rows = [
    nearest.n ? `<tr><th>施設名</th><td>${nearest.n}</td></tr>` : '',
    nearest.k ? `<tr><th>施設区分</th><td>${nearest.k}</td></tr>` : '',
    nearest.m ? `<tr><th>管理団体名</th><td>${nearest.m}</td></tr>` : '',
    nearest.u ? `<tr><th>用排区分</th><td>${nearest.u}</td></tr>` : '',
    nearest.b && nearest.b.trim() ? `<tr><th>区間部位</th><td>${nearest.b}</td></tr>` : ''
  ].filter(Boolean).join('');
  L.popup({ maxWidth: 240 })
    .setLatLng([nearest.y, nearest.x])
    .setContent(`<table class="shisetsu-popup">${rows}</table>`)
    .openOn(map);
});

/* マップ空白クリック時に全ハイライトをクリア */
map.on('click', function(e) {
  if (e._featureHandled) return;
  if (_selOverlay)      { map.removeLayer(_selOverlay); _selOverlay = null; }
  if (_selFarmObjId !== null) { _selFarmObjId = null; farmPolygonTiles.redraw(); }
});

const baseLayers = {};

const overlays = {
  "農地筆ポリゴン": farmPolygonTiles,
  "農業施設": shisetsuTiles,
  "開水路": waterwayTiles,
  "パイプライン": pipelineTiles,
  "マンホール": surveyTiles
};

let layerControl;

function renderLayerControl() {
  if (layerControl) map.removeControl(layerControl);

  layerControl = L.control.layers(baseLayers, overlays, {
    position: "topright",
    collapsed: false
  });
  layerControl.addTo(map);

  // 農地レイヤ凡例の注入（checkbox + span をlgnd-rowでラップ＋凡例div追加）
  var LGND_DEFS = {
    '農地筆ポリゴン': '<span class="lgnd-swatch lgnd-poly" style="background:rgba(240,210,0,0.35);border:1.5px solid rgb(160,130,0)"></span><span class="lgnd-text">農地の区画ポリゴン</span>',
    '農業施設':       '<span class="lgnd-swatch lgnd-dblcircle" style="color:#e00"></span><span class="lgnd-text">農業施設（ポンプ場・水門等）</span>',
    '開水路':         '<span class="lgnd-swatch lgnd-line" style="background:rgb(0,150,255)"></span><span class="lgnd-text">開水路</span>',
    'パイプライン':   '<span class="lgnd-swatch lgnd-line" style="background:rgb(0,80,200)"></span><span class="lgnd-text">パイプライン</span>',
    'マンホール':     '<span class="lgnd-swatch lgnd-sq" style="background:#2196F3"></span><span class="lgnd-text">排泥処理工</span><span class="lgnd-swatch lgnd-sq" style="background:#f44336"></span><span class="lgnd-text">制水弁</span><span class="lgnd-swatch lgnd-circle-sm" style="background:white"></span><span class="lgnd-text">その他</span>'
  };
  document.querySelectorAll('.leaflet-control-layers-overlays label').forEach(function(label) {
    var span = label.querySelector('span');
    if (!span) return;
    var name = span.textContent.trim();
    if (!LGND_DEFS[name]) return;
    var row = document.createElement('div');
    row.className = 'lgnd-row';
    Array.from(label.childNodes).forEach(function(n) { row.appendChild(n); });
    label.appendChild(row);
    var lgnd = document.createElement('div');
    lgnd.className = 'layer-legend';
    lgnd.innerHTML = LGND_DEFS[name];
    label.appendChild(lgnd);
  });

  var panel = document.querySelector('.leaflet-control-layers');
  if (!panel) return;

  // ✕ 閉じるボタン（パネル内）
  var closeBtn = document.createElement('button');
  closeBtn.className = 'lc-close-btn';
  closeBtn.textContent = '✕';
  panel.insertBefore(closeBtn, panel.firstChild);

  // 「メニュー」開くボタン（body直下・fixed配置）
  var openBtn = document.createElement('button');
  openBtn.className = 'lc-open-btn';
  openBtn.textContent = 'メニュー';
  document.body.appendChild(openBtn);

  function openPanel()  { panel.classList.remove('lc-hidden'); openBtn.style.display = 'none'; }
  function closePanel() { panel.classList.add('lc-hidden');    openBtn.style.display = 'block'; }

  closeBtn.addEventListener('click', closePanel);
  openBtn.addEventListener('click', openPanel);

  if (window.innerWidth < 768) closePanel(); // モバイルは起動時に閉じた状態
}

renderLayerControl();

/* ─── ブランディング表示 ─────────────────────────── */
const brandingControl = L.control({ position: 'bottomright' });
brandingControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'gf-branding');
  div.innerHTML = 'Powered by Geo･Forest Co.,Ltd.';
  return div;
};
brandingControl.addTo(map);

/* ─── 現在地ボタン ─────────────────────────────── */
  let currentLocationMarker = null;

