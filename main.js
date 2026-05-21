const fallbackLocation = [36.648526, 138.194243];
const fallbackZoom = 11;
const currentLocationZoom = 15;
const gsiAttribution =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>';
const geotiffInput = document.getElementById("geotiff-file");
const clearGeotiffButton = document.getElementById("clear-geotiff");
const geotiffStatus = document.getElementById("geotiff-status");

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

const baseLayers = {
  "地理院標準地図": gsiStandard,
  "地理院航空写真": gsiAirPhoto,
  "長野県CS立体図": naganoCsMap
};

const overlays = {};
let layerControl;
let geotiffLayer;
let geotiffLayerName;

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

function setStatus(message) {
  geotiffStatus.textContent = message;
}

function setGeotiffButtonState() {
  clearGeotiffButton.disabled = !geotiffLayer;
}

function clearGeotiffLayer() {
  if (geotiffLayer) {
    map.removeLayer(geotiffLayer);
    geotiffLayer = undefined;
  }

  if (geotiffLayerName) {
    delete overlays[geotiffLayerName];
    geotiffLayerName = undefined;
  }

  if (geotiffInput) {
    geotiffInput.value = "";
  }

  renderLayerControl();
  setGeotiffButtonState();
  setStatus("GeoTIFFを選ぶと、このブラウザ内だけで地図に重ねて表示します。");
}

renderLayerControl();
setGeotiffButtonState();

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

if (geotiffInput) {
  geotiffInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;

    if (!file) {
      return;
    }

    setStatus(`${file.name} を読み込み中です...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);

      if (geotiffLayer) {
        clearGeotiffLayer();
      }

      geotiffLayer = new GeoRasterLayer({
        georaster,
        opacity: 0.72,
        resolution: 256
      });

      geotiffLayerName = `GeoTIFF: ${file.name}`;
      overlays[geotiffLayerName] = geotiffLayer;

      geotiffLayer.addTo(map);
      renderLayerControl();
      setGeotiffButtonState();

      const bounds = geotiffLayer.getBounds();

      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [24, 24]
        });
      }

      setStatus(`${file.name} を読み込みました。右上のパネルから表示のON/OFFも切り替えられます。`);
    } catch (error) {
      console.error(error);
      clearGeotiffLayer();
      setStatus("GeoTIFFの読み込みに失敗しました。GeoTIFF形式と座標系を確認してください。");
    }
  });
}

if (clearGeotiffButton) {
  clearGeotiffButton.addEventListener("click", () => {
    clearGeotiffLayer();
  });
}
