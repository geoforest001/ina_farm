(function () {
  'use strict';

  let precipGroup = L.layerGroup();
  let loadedDate  = '';
  let allRows     = []; // [{date, lat, lng, value}]
  let dateList    = []; // ユニーク日付リスト

  // ── 降水量 → 色 ───────────────────────────
  function mmColor(mm) {
    if (mm == null || isNaN(mm)) return { fill: 'rgba(180,180,180,0.3)', stroke: '#999' };
    if (mm <  1)  return { fill: 'rgba(230,245,255,0.5)', stroke: '#bbd' };
    if (mm < 10)  return { fill: 'rgba(100,180,255,0.55)', stroke: '#66b' };
    if (mm < 30)  return { fill: 'rgba(0,120,220,0.60)',   stroke: '#048' };
    if (mm < 60)  return { fill: 'rgba(0,50,180,0.65)',    stroke: '#024' };
    if (mm < 120) return { fill: 'rgba(100,0,180,0.70)',   stroke: '#407' };
    if (mm < 200) return { fill: 'rgba(180,0,0,0.72)',     stroke: '#900' };
    return           { fill: 'rgba(220,50,0,0.80)',        stroke: '#b20' };
  }

  // ── 指定日のメッシュを描画 ────────────────────
  function renderDate(date) {
    precipGroup.clearLayers();
    const rows = allRows.filter(r => r.date === date);
    if (!rows.length) return;

    const STEP = 0.01; // 格子間隔(°)
    rows.forEach(r => {
      const mm = r.value;
      const { fill, stroke } = mmColor(mm);
      const bounds = [
        [r.lat - STEP / 2, r.lng - STEP / 2],
        [r.lat + STEP / 2, r.lng + STEP / 2]
      ];
      L.rectangle(bounds, {
        color: stroke, weight: 0.5,
        fillColor: fill, fillOpacity: 0.7
      })
        .bindTooltip(`<b>${mm != null ? mm.toFixed(1) : '--'} mm</b><br>${date}`, { sticky: true })
        .addTo(precipGroup);
    });

    precipGroup.addTo(map);
    setStatus(`${date} の降水量メッシュを表示中`);
    loadedDate = date;
  }

  // ── CSV パース ────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().replace(/^﻿/, ''));
    const idxDate = header.findIndex(h => h === '日付');
    const idxLat  = header.findIndex(h => h === '緯度');
    const idxLng  = header.findIndex(h => h === '経度');
    const idxVal  = header.findIndex(h => h.includes('降水量'));

    if (idxDate < 0 || idxLat < 0 || idxLng < 0 || idxVal < 0) {
      alert('CSVのヘッダーが正しくありません。\n必要な列: 日付, 緯度, 経度, 日降水量(mm)');
      return [];
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= Math.max(idxDate, idxLat, idxLng, idxVal)) continue;
      const val = parseFloat(cols[idxVal]);
      rows.push({
        date:  cols[idxDate].trim(),
        lat:   parseFloat(cols[idxLat]),
        lng:   parseFloat(cols[idxLng]),
        value: isNaN(val) ? null : val
      });
    }
    return rows;
  }

  // ── CSV 読み込み ──────────────────────────
  function loadCSV(file) {
    const reader = new FileReader();
    reader.onload = e => {
      allRows  = parseCSV(e.target.result);
      dateList = [...new Set(allRows.map(r => r.date))].sort();
      if (!dateList.length) { setStatus('データなし'); return; }

      const sel = document.getElementById('precDateSel');
      sel.innerHTML = '';
      dateList.forEach(d => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = d;
        sel.appendChild(opt);
      });
      sel.value = dateList[dateList.length - 1];
      renderDate(sel.value);
      document.getElementById('precExportBtn').disabled = false;
      setStatus(`${file.name} を読み込みました（${dateList.length} 日分）`);
    };
    reader.readAsText(file, 'utf-8');
  }

  // ── CSV エクスポート ──────────────────────
  function exportCSV() {
    if (!allRows.length) return;
    const header = '日付,緯度,経度,日降水量(mm)';
    const body = allRows.map(r =>
      `${r.date},${r.lat},${r.lng},${r.value != null ? r.value : ''}`
    ).join('\r\n');
    const blob = new Blob(['﻿' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `rain_mesh_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── ステータス表示 ────────────────────────
  function setStatus(msg) {
    const el = document.getElementById('precStatus');
    if (el) el.textContent = msg;
  }

  // ── パネル構築 ───────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'precPanel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div id="precHeader">
        <span>☔ 降水量メッシュ</span>
        <button id="precClose">✕</button>
      </div>
      <div id="precBody">
        <div class="prec-drop-zone" id="precDropZone">
          <div>CSVをここにドロップ</div>
          <div class="prec-drop-sub">またはクリックして選択</div>
          <input type="file" id="precFileInput" accept=".csv" style="display:none">
        </div>
        <div class="prec-row" id="precDateRow" style="display:none">
          <label>日付</label>
          <select id="precDateSel"></select>
        </div>
        <div class="prec-btn-row">
          <button id="precExportBtn" disabled>CSV出力</button>
          <button id="precClearBtn">クリア</button>
        </div>
        <div id="precStatus">Pythonスクリプトで生成したCSVをドロップしてください</div>
        <div id="precLegend">
          <div class="prec-leg-title">日降水量</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(100,180,255,0.85)"></span>&lt; 10 mm</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(0,120,220,0.85)"></span>10 – 30</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(0,50,180,0.85)"></span>30 – 60</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(100,0,180,0.85)"></span>60 – 120</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(180,0,0,0.85)"></span>120 – 200</div>
          <div class="prec-leg-row"><span class="prec-sw" style="background:rgba(220,50,0,0.85)"></span>200 mm 以上</div>
        </div>
        <div class="prec-note">fetch_rain_mesh.py で生成したCSVを読み込みます</div>
      </div>
    `;
    document.body.appendChild(panel);

    // ボタンイベント
    document.getElementById('precClose').addEventListener('click', () => {
      panel.style.display = 'none';
      precipGroup.remove();
    });
    document.getElementById('precExportBtn').addEventListener('click', exportCSV);
    document.getElementById('precClearBtn').addEventListener('click', () => {
      allRows = []; dateList = [];
      precipGroup.clearLayers(); precipGroup.remove();
      document.getElementById('precDateRow').style.display = 'none';
      document.getElementById('precExportBtn').disabled = true;
      setStatus('Pythonスクリプトで生成したCSVをドロップしてください');
    });

    // 日付選択
    document.getElementById('precDateSel').addEventListener('change', e => {
      renderDate(e.target.value);
    });

    // ドロップゾーン
    const zone = document.getElementById('precDropZone');
    const fileInput = document.getElementById('precFileInput');

    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) {
        loadCSV(e.target.files[0]);
        document.getElementById('precDateRow').style.display = 'flex';
      }
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        loadCSV(file);
        document.getElementById('precDateRow').style.display = 'flex';
      } else {
        alert('CSVファイルをドロップしてください');
      }
    });
  }

  // ── 地図ボタン ───────────────────────────
  function addMapButton() {
    const ctrl = L.control({ position: 'topleft' });
    ctrl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.innerHTML = '<button id="precToggle" title="降水量メッシュ" style="width:30px;height:30px;font-size:16px;cursor:pointer;background:#fff;border:none;line-height:30px;">☔</button>';
      L.DomEvent.disableClickPropagation(div);
      div.querySelector('#precToggle').addEventListener('click', () => {
        const panel = document.getElementById('precPanel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'block';
        if (visible) precipGroup.remove();
        else if (loadedDate) precipGroup.addTo(map);
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
