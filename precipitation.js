(function () {
  'use strict';

  // ── 定数 ─────────────────────────────────────
  // 伊那市周辺 1km(0.01°)格子
  const GRID = (function () {
    const pts = [];
    for (let la = 35.66; la <= 35.98; la = +(la + 0.01).toFixed(2)) {
      for (let lo = 137.82; lo <= 138.14; lo = +(lo + 0.01).toFixed(2)) {
        pts.push({ lat: la, lng: lo });
      }
    }
    return pts;
  })();
  const CELL = 0.01; // 格子間隔(°)
  const IDW_P = 2;   // IDWべき乗数
  const MAX_DAYS = 7;

  // AMeDAS対象エリア（広めにとってIDW精度を上げる）
  const AREA = { latMin: 35.3, latMax: 36.3, lngMin: 137.4, lngMax: 138.7 };

  // ── 状態 ─────────────────────────────────────
  let precipLayer = L.layerGroup();
  let stations    = null; // {code, name, lat, lng}[]
  let panelOpen   = false;
  let loading     = false;

  // ── 色スケール ────────────────────────────────
  function color(mm) {
    if (mm == null || isNaN(mm)) return { f: 'rgba(200,200,200,0.25)', s: '#bbb' };
    if (mm <   1)  return { f: 'rgba(220,245,255,0.45)', s: '#aac' };
    if (mm <  10)  return { f: 'rgba(100,185,255,0.55)', s: '#59b' };
    if (mm <  30)  return { f: 'rgba(0,120,220,0.62)',   s: '#048' };
    if (mm <  60)  return { f: 'rgba(0,55,190,0.68)',    s: '#024' };
    if (mm < 120)  return { f: 'rgba(100,0,180,0.72)',   s: '#408' };
    if (mm < 200)  return { f: 'rgba(180,0,0,0.75)',     s: '#900' };
    return              { f: 'rgba(220,60,0,0.82)',      s: '#b20' };
  }

  // ── AMeDAS 観測点取得 ─────────────────────────
  async function loadStations() {
    if (stations) return stations;
    const r = await fetch('https://www.jma.go.jp/bosai/amedas/const/amedastable.json');
    const tbl = await r.json();
    stations = [];
    for (const [code, info] of Object.entries(tbl)) {
      if (!info.rain) continue;
      const lat = info.lat[0] + info.lat[1] / 60;
      const lng = info.lon[0] + info.lon[1] / 60;
      if (lat >= AREA.latMin && lat <= AREA.latMax &&
          lng >= AREA.lngMin && lng <= AREA.lngMax) {
        stations.push({ code, name: info.kjName || code,
                        lat: +lat.toFixed(4), lng: +lng.toFixed(4) });
      }
    }
    return stations;
  }

  // ── 1日分の降水量（mm）を取得 ─────────────────
  async function fetchDayRain(code, dateStr) {
    // 1時間ファイルを並列取得して precipitation1h を合計
    const [y, m, d] = dateStr.split('-');
    const ymd = `${y}${m}${d}`;
    const reqs = [];
    for (let hh = 1; hh <= 24; hh++) {
      const h = String(hh).padStart(2, '0');
      reqs.push(
        fetch(`https://www.jma.go.jp/bosai/amedas/data/point/${code}/${ymd}_${h}0000.json`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
    }
    const results = await Promise.all(reqs);
    let total = 0, found = false;
    for (const data of results) {
      if (!data) continue;
      // 各10分データの precipitation1h（その時刻の正時からの積算値）
      // 最後のキーの値を使用
      const entries = Object.values(data);
      for (const entry of entries) {
        const v = entry?.precipitation1h;
        if (Array.isArray(v) && v[0] != null) {
          total += parseFloat(v[0]);
          found = true;
          break; // 1時間ファイルごとに1値
        }
      }
    }
    return found ? +total.toFixed(1) : null;
  }

  // ── IDW補間 ───────────────────────────────────
  function idw(gridPt, stationsWithVal) {
    const LAT_KM = 111.0;
    const LNG_KM = 111.0 * Math.cos(gridPt.lat * Math.PI / 180);
    let wSum = 0, vSum = 0;
    for (const s of stationsWithVal) {
      const dlat = (s.lat - gridPt.lat) * LAT_KM;
      const dlng = (s.lng - gridPt.lng) * LNG_KM;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < 0.01) return s.value;
      const w = 1 / Math.pow(dist, IDW_P);
      wSum += w; vSum += w * s.value;
    }
    return wSum > 0 ? +(vSum / wSum).toFixed(1) : null;
  }

  // ── メッシュ描画 ──────────────────────────────
  function drawMesh(stationsWithVal, label) {
    precipLayer.clearLayers();
    GRID.forEach(pt => {
      const mm = idw(pt, stationsWithVal);
      const { f, s } = color(mm);
      L.rectangle(
        [[pt.lat - CELL / 2, pt.lng - CELL / 2],
         [pt.lat + CELL / 2, pt.lng + CELL / 2]],
        { color: s, weight: 0.4, fillColor: f, fillOpacity: 0.72 }
      ).bindTooltip(
        `<b>${mm != null ? mm.toFixed(1) : '--'} mm</b><br><small>${label}</small>`,
        { sticky: true }
      ).addTo(precipLayer);
    });
    precipLayer.addTo(map);
  }

  // ── 日付リスト生成（start〜end） ───────────────
  function dateBetween(s, e) {
    const dates = [];
    const cur = new Date(s + 'T00:00:00+09:00');
    const end = new Date(e + 'T00:00:00+09:00');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  // ── メイン処理 ────────────────────────────────
  async function run(startDate, endDate) {
    if (loading) return;
    loading = true;
    setStatus('観測点を取得中...', true);

    try {
      const sts = await loadStations();
      const dates = dateBetween(startDate, endDate);

      setStatus(`データ取得中 (0/${dates.length}日)...`, true);

      // 日付ごとに集計、最終的に合計
      const totals = {}; // code → total mm
      sts.forEach(s => { totals[s.code] = 0; });

      for (let di = 0; di < dates.length; di++) {
        const date = dates[di];
        setStatus(`データ取得中 (${di + 1}/${dates.length}日: ${date})...`, true);

        await Promise.all(sts.map(async s => {
          const v = await fetchDayRain(s.code, date);
          if (v != null) totals[s.code] += v;
        }));
      }

      const stWithVal = sts
        .filter(s => totals[s.code] > 0 || Object.values(totals).some(v => v > 0))
        .map(s => ({ ...s, value: totals[s.code] }));

      if (!stWithVal.length) {
        setStatus('データが取得できませんでした（期間が古すぎる可能性があります）');
        loading = false;
        return;
      }

      const label = startDate === endDate
        ? startDate
        : `${startDate} 〜 ${endDate} 合計`;

      drawMesh(stWithVal, label);
      setStatus(`表示中: ${label}`);
    } catch (e) {
      console.error(e);
      setStatus('エラーが発生しました');
    }
    loading = false;
  }

  // ── UI ───────────────────────────────────────
  function setStatus(msg, spin = false) {
    const el = document.getElementById('precStatus');
    if (el) el.textContent = (spin ? '⏳ ' : '') + msg;
  }

  function maxDate() {
    return new Date().toISOString().slice(0, 10);
  }
  function minDate() {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    return d.toISOString().slice(0, 10);
  }
  function defaultStart() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'precPanel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div id="precTitle">🔬 解析ツール</div>
      <div class="prec-tool-row">
        <label class="prec-chk-label">
          <input type="checkbox" id="precChk"> ☔ 降水量メッシュ
        </label>
      </div>
      <div id="precOptions" style="display:none">
        <div class="prec-date-row">
          <label>開始</label>
          <input type="date" id="precStart" min="${minDate()}" max="${maxDate()}" value="${defaultStart()}">
        </div>
        <div class="prec-date-row">
          <label>終了</label>
          <input type="date" id="precEnd"   min="${minDate()}" max="${maxDate()}" value="${defaultStart()}">
        </div>
        <div class="prec-note-small">※ AMeDAS 直近10日のみ対応</div>
        <button id="precRunBtn">表示</button>
        <div id="precStatus">日付を選んで「表示」を押してください</div>
        <div id="precLegend">
          <div class="plg-title">降水量（期間合計）</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(100,185,255,0.9)"></span>&lt; 10 mm</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(0,120,220,0.9)"></span>10 – 30</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(0,55,190,0.9)"></span>30 – 60</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(100,0,180,0.9)"></span>60 – 120</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(180,0,0,0.9)"></span>120 – 200</div>
          <div class="plg-row"><span class="plg-sw" style="background:rgba(220,60,0,0.9)"></span>200 mm 以上</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // チェックボックス
    document.getElementById('precChk').addEventListener('change', e => {
      const opts = document.getElementById('precOptions');
      opts.style.display = e.target.checked ? 'block' : 'none';
      if (!e.target.checked) {
        precipLayer.clearLayers();
        precipLayer.remove();
        setStatus('日付を選んで「表示」を押してください', false);
      }
    });

    // 日付バリデーション
    function validateDates() {
      const s = document.getElementById('precStart').value;
      const e = document.getElementById('precEnd').value;
      if (!s || !e) return false;
      const days = (new Date(e) - new Date(s)) / 86400000 + 1;
      if (days < 1) { alert('終了日は開始日以降にしてください'); return false; }
      if (days > MAX_DAYS) { alert(`最大${MAX_DAYS}日間まで指定できます`); return false; }
      return true;
    }

    document.getElementById('precRunBtn').addEventListener('click', () => {
      if (!validateDates()) return;
      const s = document.getElementById('precStart').value;
      const e = document.getElementById('precEnd').value;
      run(s, e);
    });
  }

  // 地図ボタン（☔アイコン）
  function addMapButton() {
    const ctrl = L.control({ position: 'topleft' });
    ctrl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.innerHTML = '<button id="precToggle" title="解析ツール" style="width:30px;height:30px;font-size:15px;cursor:pointer;background:#fff;border:none;line-height:30px;">🔬</button>';
      L.DomEvent.disableClickPropagation(div);
      div.querySelector('#precToggle').addEventListener('click', () => {
        const p = document.getElementById('precPanel');
        if (!p) return;
        panelOpen = !panelOpen;
        p.style.display = panelOpen ? 'block' : 'none';
        if (!panelOpen) {
          precipLayer.clearLayers(); precipLayer.remove();
          const chk = document.getElementById('precChk');
          if (chk) chk.checked = false;
          document.getElementById('precOptions').style.display = 'none';
        }
      });
      return div;
    };
    ctrl.addTo(map);
  }

  window.addEventListener('load', () => {
    buildPanel();
    addMapButton();
  });
})();
