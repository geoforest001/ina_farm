/* ============================================================
   weather.js  — 気象情報ダッシュボード + 気象レイヤ (geoforest001/map)
   気象庁 API + AMeDAS  ©  akahanenoriaki
   ============================================================ */

/* ─── 定数・状態 ─────────────────────────────── */
const PREF_TO_JMA = {
  '01':'016000','02':'020000','03':'030000','04':'040000','05':'050000',
  '06':'060000','07':'070000','08':'080000','09':'090000','10':'100000',
  '11':'110000','12':'120000','13':'130000','14':'140000','15':'150000',
  '16':'160000','17':'170000','18':'180000','19':'190000','20':'200000',
  '21':'210000','22':'220000','23':'230000','24':'240000','25':'250000',
  '26':'260000','27':'270000','28':'280000','29':'290000','30':'300000',
  '31':'310000','32':'320000','33':'330000','34':'340000','35':'350000',
  '36':'360000','37':'370000','38':'380000','39':'390000','40':'400000',
  '41':'410000','42':'420000','43':'430000','44':'440000','45':'450000',
  '46':'460100','47':'471000'
};
const WIND_DIR = ['静穏','北北東','北東','東北東','東','東南東','南東','南南東',
                  '南','南南西','南西','西南西','西','西北西','北西','北北西','北'];
const AM_CHART_VARS = {
  rain1h:  {field:'precipitation10m',agg:'hourly', idx:0,col:'rgba(0,102,255,0.55)',type:'bar', files:8},
  rain10m: {field:'precipitation10m',agg:'raw10m', idx:0,col:'rgba(0,160,200,0.7)', type:'bar', files:2},
  rain24h: {field:'precipitation10m',agg:'cumsum', idx:0,col:'rgba(0,60,180,0.75)', type:'line',files:8},
  temp:    {field:'temp',            agg:'last',   idx:0,col:'rgba(255,100,0,0.8)', type:'line',files:8},
  humid:   {field:'humidity',        agg:'last',   idx:0,col:'rgba(0,160,200,0.8)', type:'line',files:8},
  wind:    {field:'wind',            agg:'avg',    idx:0,col:'rgba(80,180,0,0.8)',  type:'line',files:8},
  winddir: {field:'wind',            agg:'dir_hist',idx:1,col:'rgba(150,100,220,0.7)',type:'bar',files:8},
  snow:    {field:'snow',            agg:'last',   idx:0,col:'rgba(150,200,255,0.7)',type:'bar',files:8},
};

/* 気象レイヤ定義 */
const WX_LAYER_DEFS = {
  rain:  {type:'nowc', zoom:10, tf:['targetTimes_N1.json'], url:(bt,vt)=>`https://www.jma.go.jp/bosai/jmatile/data/nowc/${bt}/none/${vt}/surf/hrpns/{z}/{x}/{y}.png`},
  land:  {type:'risk', zoom:9,  tf:['targetTimes.json'],    url:(bt,vt)=>`https://www.jma.go.jp/bosai/jmatile/data/risk/${bt}/none/${vt}/surf/land/{z}/{x}/{y}.png`},
  flood: {type:'risk', zoom:9,  tf:['targetTimes.json'],    url:(bt,vt)=>`https://www.jma.go.jp/bosai/jmatile/data/risk/${bt}/none/${vt}/surf/inund/{z}/{x}/{y}.png`},
  river: {type:'risk', zoom:9,  tf:['targetTimes.json'],    url:(bt,vt)=>`https://www.jma.go.jp/bosai/jmatile/data/risk/${bt}/none/${vt}/surf/flood/{z}/{x}/{y}.png`},
};
const wxLayerState = {};
Object.keys(WX_LAYER_DEFS).forEach(k => { wxLayerState[k] = {on:false, layer:null, timer:null, errCount:0}; });
const WX_CHK_MAP = {rain:'chkLRain', land:'chkLLand', flood:'chkLFlood', river:'chkLRiver'};
const WX_LBL_MAP = {rain:'lblLRain', land:'lblLLand', flood:'lblLFlood', river:'lblLRiver'};

let _jmaForecast = null;
let _amedasCurrentTemp = null, _amedasCurrentTime = null;
let _amedasTable = null;
let _currentAmedasStation = null;
let wxChart = null;
let wxOpen = false;
let _cwCounter = 0;
const _charts = new Map();
let _activeChartId = null, _sheetChart = null;
let amedasOn = false, amedasMarkers = [], amedasTimer = null;

/* ─── ユーティリティ ─────────────────────────── */
function jmaCodeIcon(code) {
  const n = parseInt(code) || 0;
  if (n >= 100 && n < 200) return '☀️';
  if (n >= 200 && n < 300) return '⛅';
  if (n >= 300 && n < 400) return '🌧';
  if (n >= 400 && n < 500) return '🌧';
  if (n >= 500 && n < 600) return '❄️';
  if (n >= 600 && n < 700) return '🌧';
  if (n >= 700 && n < 800) return '🌨';
  return '🌡';
}

function jmaTime(intervalMin = 5, lagMin = 5) {
  const now = new Date(), jst = new Date(now.getTime() + 9 * 3600000);
  const total = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const floored = Math.floor(total / intervalMin) * intervalMin - lagMin;
  const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 0, floored, 0));
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

async function getJmaValidTime(type, candidates) {
  for (const file of (candidates || ['targetTimes_N1.json'])) {
    try {
      const res = await fetch(`https://www.jma.go.jp/bosai/jmatile/data/${type}/${file}`);
      if (!res.ok) continue;
      const arr = await res.json();
      if (!Array.isArray(arr) || !arr.length) continue;
      const last = arr[arr.length - 1];
      if (typeof last === 'string') return {basetime: last, validtime: last};
      const bt = last.basetime || last.time || '';
      const vt = last.validtime || bt;
      if (bt) return {basetime: bt, validtime: vt};
    } catch(e) {}
  }
  return null;
}

async function getJMAAreaCode(lat, lng) {
  const res = await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`);
  const data = await res.json();
  const muniCd = data.results?.muniCd;
  if (!muniCd) throw new Error('地域コード取得失敗');
  return PREF_TO_JMA[String(muniCd).padStart(5, '0').slice(0, 2)] || '130000';
}

function getFileList(count = 8) {
  const now = new Date(), jst = new Date(now.getTime() + 9 * 3600000);
  const latestH3 = Math.floor(jst.getUTCHours() / 3) * 3, files = [];
  const p = n => String(n).padStart(2, '0');
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), latestH3 - i * 3, 0, 0));
    files.push({ ymd: `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}`, hh: p(d.getUTCHours()) });
  }
  return files;
}

function _jmaTempLabels(timeDefines) {
  const DOW = ['日','月','火','水','木','金','土'];
  return timeDefines.map(t => {
    const jd = new Date(new Date(t).getTime() + 9 * 3600000);
    const h = jd.getUTCHours();
    return `${jd.getUTCMonth()+1}/${jd.getUTCDate()}(${DOW[jd.getUTCDay()]})${h > 0 ? ' ' + h + '時' : ''}`;
  });
}

function _compColors(arr, upCol, downCol, baseCol) {
  return arr.map((v, i) => {
    if (v === null) return 'rgba(200,200,200,0.3)';
    if (i === 0) return baseCol;
    const prev = arr.slice(0, i).reverse().find(x => x !== null);
    return prev === undefined ? baseCol : v > prev ? upCol : v < prev ? downCol : baseCol;
  });
}

function _prependCurrent(labels, data) {
  if (_amedasCurrentTemp === null) return { labels, data };
  const now = _amedasCurrentTime || new Date();
  const p = n => String(n).padStart(2, '0');
  return { labels: [`現在\n${p(now.getHours())}:${p(now.getMinutes())}`, ...labels], data: [_amedasCurrentTemp, ...data] };
}

/* ─── 気象タイルレイヤ ───────────────────────── */
async function wxUpdateLayer(key) {
  const def = WX_LAYER_DEFS[key], st = wxLayerState[key];
  if (!st.on) return;
  try {
    const times = await getJmaValidTime(def.type, def.tf);
    const t = jmaTime(5, 10);
    const urlTpl = times ? def.url(times.basetime, times.validtime) : def.url(t, t);
    console.log(`[wxLayer] ${key} url=${urlTpl.replace('{z}/{x}/{y}.png','...')}`);
    if (st.layer) map.removeLayer(st.layer);
    st.errCount = 0;
    const lbl = document.getElementById(WX_LBL_MAP[key]);
    const lyr = L.tileLayer(urlTpl, {opacity:0.7, maxNativeZoom:def.zoom, maxZoom:22, attribution:'© 気象庁'});
    lyr.on('tileerror', () => {
      st.errCount++;
      console.warn(`[wxLayer] tileerror count=${st.errCount} key=${key}`);
      if (st.errCount === 3 && lbl) lbl.style.borderColor = '#ff3b30';
    });
    lyr.on('tileload', () => { st.errCount = 0; if (lbl) lbl.style.borderColor = ''; });
    st.layer = lyr.addTo(map);
  } catch(e) {
    console.error('[wxUpdateLayer]', key, e);
  }
}

async function wxApplyLayerState(key) {
  try {
    const st = wxLayerState[key];
    const lbl = document.getElementById(WX_LBL_MAP[key]);
    if (lbl) lbl.classList.toggle('active', st.on);
    if (st.on) {
      await wxUpdateLayer(key);
      if (!st.timer) st.timer = setInterval(() => wxUpdateLayer(key), 5 * 60 * 1000);
    } else {
      clearInterval(st.timer); st.timer = null;
      if (st.layer) { map.removeLayer(st.layer); st.layer = null; }
    }
  } catch(e) {
    console.error('[wxApplyLayerState]', key, e);
  }
}

/* ─── AMeDASマーカーレイヤ ──────────────────── */
async function fetchAmedasMarkers() {
  try {
    const timeRes = await fetch('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
    if (!timeRes.ok) throw new Error(`latest_time HTTP ${timeRes.status}`);
    const rawTime = (await timeRes.text()).trim();
    const m = rawTime.match(/(\d{4})\D(\d{2})\D(\d{2})\D(\d{2}):(\d{2}):(\d{2})/);
    if (!m) throw new Error('time parse failed');
    const timeStr = `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`;
    if (!_amedasTable) {
      const tRes = await fetch('https://www.jma.go.jp/bosai/amedas/const/amedastable.json');
      if (!tRes.ok) throw new Error(`amedastable HTTP ${tRes.status}`);
      _amedasTable = await tRes.json();
    }
    const dataRes = await fetch(`https://www.jma.go.jp/bosai/amedas/data/map/${timeStr}.json`);
    if (!dataRes.ok) throw new Error(`map data HTTP ${dataRes.status}`);
    const data = await dataRes.json();
    amedasMarkers.forEach(mk => map.removeLayer(mk)); amedasMarkers = [];
    const center = map.getCenter();
    const stations = Object.entries(data).map(([code, d]) => {
      const info = _amedasTable[code];
      if (!info || !info.lat || !info.lon || !Array.isArray(info.lat)) return null;
      const lat = info.lat[0] + info.lat[1] / 60, lng = info.lon[0] + info.lon[1] / 60;
      if (isNaN(lat) || isNaN(lng)) return null;
      return {code, info, d, lat, lng, dist: map.distance(center, L.latLng(lat, lng))};
    }).filter(s => s && s.dist < 60000).sort((a, b) => a.dist - b.dist).slice(0, 20);
    stations.forEach(s => {
      const tv = s.d.temp ? s.d.temp[0] : null;
      const temp = tv !== null ? `${tv}°C` : '--';
      const rain = s.d.precipitation1h ? `${s.d.precipitation1h[0]}mm/h` : (s.d.precipitation10m ? `${s.d.precipitation10m[0]}mm/10m` : '--');
      const wind = s.d.wind ? `${s.d.wind[0]}m/s` : '--';
      const col = tv === null ? '#888' : tv >= 30 ? '#c62828' : tv >= 25 ? '#e65100' : tv >= 15 ? '#1565c0' : tv >= 5 ? '#0277bd' : '#4a148c';
      const mk = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html: `<div style="background:#fff;color:${col};border:2px solid ${col};border-radius:6px;padding:2px 7px;font-size:13px;font-family:sans-serif;font-weight:bold;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${temp}</div>`,
          className: '', iconAnchor: [22, 12]
        })
      }).addTo(map);
      mk.bindPopup(`<div style="font-size:12px;font-family:sans-serif"><b>📡 ${s.info.kjName || s.code}</b><br>🌡 ${temp}　🌧 ${rain}　💨 ${wind}</div>`);
      amedasMarkers.push(mk);
    });
    document.getElementById('lblLAmedas').style.borderColor = '';
  } catch(e) {
    console.error('[AMeDAS marker]', e);
    document.getElementById('lblLAmedas').style.borderColor = '#ff3b30';
  }
}

/* ─── 予報取得 ───────────────────────────────── */
async function fetchWeather(lat, lng) {
  document.getElementById('wxLoading').style.display = 'block';
  document.getElementById('wxLoading').textContent = '取得中...';
  document.getElementById('wxContent').style.display = 'none';
  try {
    const officeCode = await getJMAAreaCode(lat, lng);
    const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`);
    if (!res.ok) throw new Error(`気象庁API HTTP ${res.status}`);
    const fc = await res.json();
    _jmaForecast = fc;
    const shortTerm = fc[0];
    const ts0 = shortTerm.timeSeries[0], ts1 = shortTerm.timeSeries[1], ts2 = shortTerm.timeSeries[2];
    const area0 = ts0.areas[0];
    const todayCode = area0.weatherCodes?.[0] || '100';
    const _wx = (area0.weathers?.[0] || '').replace(/\s+/g, ' ').trim();
    const todayWeather = _wx.length > 12 ? _wx.slice(0, 12) + '…' : _wx;
    const pops = ts1.areas[0].pops || [];
    const maxPop = pops.filter(p => p !== '').map(Number).reduce((m, v) => Math.max(m, v), -1);
    const tempArea = ts2.areas[0];
    const maxArr = tempArea.tempsMax || tempArea.temps || [], minArr = tempArea.tempsMin || [];
    const todayMax = maxArr.find(v => v !== '') || null, todayMin = minArr.find(v => v !== '') || null;
    document.getElementById('wxIcon').textContent = jmaCodeIcon(todayCode);
    document.getElementById('wxDesc').textContent = todayWeather || '--';
    document.getElementById('wxTemp').textContent = `↑${todayMax || '--'}° / ↓${todayMin || '--'}°`;
    document.getElementById('wxRain').textContent = maxPop >= 0 ? `${maxPop}%` : '--';
    document.getElementById('wxWind').textContent = todayMax ? `${todayMax}°C` : '--';
    document.getElementById('wxHumid').textContent = todayMin ? `${todayMin}°C` : '--';
    /* 3日間カード */
    const dayCards = document.getElementById('wxDayCards'); dayCards.innerHTML = '';
    ['今日', '明日', '明後日'].forEach((name, i) => {
      if (i >= (area0.weatherCodes || []).length) return;
      const code = area0.weatherCodes[i] || '';
      const pop = pops.filter((_, j) => Math.floor(j / 2) === i).filter(p => p !== '').map(Number);
      const dayMaxPop = pop.length ? Math.max(...pop) : -1;
      const dMax = maxArr[i] || '', dMin = minArr[i] || '';
      const card = document.createElement('div'); card.className = 'wx-day-card';
      card.innerHTML = `<div class="dc-day">${name}</div><div class="dc-ico">${jmaCodeIcon(code)}</div>`
        + (dayMaxPop >= 0 ? `<div class="dc-pop">☔${dayMaxPop}%</div>` : '')
        + ((dMax || dMin) ? `<div class="dc-tmp">${dMax ? dMax + '°' : ''} / ${dMin ? dMin + '°' : ''}</div>` : '');
      dayCards.appendChild(card);
    });
    document.getElementById('wxMain').onclick = () => { showJmaMaxTempChart(); showJmaMinTempChart(); };
    document.getElementById('wxCellRain').onclick = () => showJmaPOPChart('降水確率（3日間）');
    document.getElementById('wxCellWind').onclick = () => showJmaMaxTempChart();
    document.getElementById('wxCellHumid').onclick = () => showJmaMinTempChart();
    /* 降水確率ミニチャート */
    const labels = ts1.timeDefines.map(t => {
      const d = new Date(t); return `${String((d.getUTCHours() + 9) % 24).padStart(2, '0')}時`;
    });
    if (wxChart) wxChart.destroy();
    wxChart = new Chart(document.getElementById('wxChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: '降水確率(%)', data: pops.map(p => p === '' ? null : Number(p)), backgroundColor: 'rgba(0,102,255,0.5)', borderColor: 'rgba(0,102,255,0.8)', borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 8 }, maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { font: { size: 9 }, maxTicksLimit: 4, callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,0.06)' } } } }
    });
    const now = new Date(), p = n => String(n).padStart(2, '0');
    document.getElementById('wxUpdated').textContent = `${p(now.getHours())}:${p(now.getMinutes())} 更新`;
    document.getElementById('wxLoading').style.display = 'none';
    document.getElementById('wxContent').style.display = 'flex';
    fetchAmedasForLocation(lat, lng);
  } catch (e) {
    console.error('[fetchWeather]', e);
    document.getElementById('wxLoading').textContent = '取得に失敗しました';
  }
}

/* ─── AMeDAS最寄り ───────────────────────────── */
async function fetchAmedasForLocation(lat, lng) {
  document.getElementById('wxAmedasLoading').style.display = 'block';
  document.getElementById('wxAmedasSection').style.display = 'none';
  try {
    const timeRes = await fetch('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
    if (!timeRes.ok) throw new Error(`latest_time HTTP ${timeRes.status}`);
    const rawTime = (await timeRes.text()).trim();
    const tm = rawTime.match(/(\d{4})\D(\d{2})\D(\d{2})\D(\d{2}):(\d{2}):(\d{2})/);
    if (!tm) throw new Error('time parse failed');
    const timeStr = `${tm[1]}${tm[2]}${tm[3]}${tm[4]}${tm[5]}${tm[6]}`;
    if (!_amedasTable) {
      const tRes = await fetch('https://www.jma.go.jp/bosai/amedas/const/amedastable.json');
      _amedasTable = await tRes.json();
    }
    const dataRes = await fetch(`https://www.jma.go.jp/bosai/amedas/data/map/${timeStr}.json`);
    if (!dataRes.ok) throw new Error(`map data HTTP ${dataRes.status}`);
    const data = await dataRes.json();
    const ref = L.latLng(lat, lng);
    const nearest = Object.entries(data).map(([code, d]) => {
      const info = _amedasTable[code];
      if (!info || !Array.isArray(info.lat)) return null;
      const slat = info.lat[0] + info.lat[1] / 60, slng = info.lon[0] + info.lon[1] / 60;
      if (isNaN(slat) || isNaN(slng)) return null;
      return { code, info, d, lat: slat, lng: slng, dist: map.distance(ref, L.latLng(slat, slng)) };
    }).filter(s => s).sort((a, b) => a.dist - b.dist)[0];
    if (nearest) showAmedasDetail(nearest);
    else throw new Error('観測点が見つかりません');
  } catch (e) {
    console.error('[AMeDAS loc]', e);
    document.getElementById('wxAmedasLoading').textContent = `❌ AMeDAS: ${e.message}`;
  }
}

function showAmedasDetail(s) {
  _currentAmedasStation = s;
  document.getElementById('wxAmedasLoading').style.display = 'none';
  const sec = document.getElementById('wxAmedasSection'); sec.style.display = 'flex';
  document.getElementById('amStationName').textContent = s.info.kjName || s.code;
  const dist = s.dist >= 1000 ? `${(s.dist / 1000).toFixed(1)}km` : `${Math.round(s.dist)}m`;
  document.getElementById('amDistBadge').textContent = `現在地から約 ${dist}`;
  const tv = s.d.temp ? s.d.temp[0] : null;
  _amedasCurrentTemp = tv; _amedasCurrentTime = new Date();
  const tempEl = document.getElementById('amTemp');
  tempEl.textContent = tv !== null ? `${tv}°C` : '--';
  tempEl.className = 'val' + (tv === null ? '' : tv >= 30 ? ' t-hot' : tv >= 25 ? ' t-warm' : tv <= 5 ? ' t-cold' : tv <= 15 ? ' t-cool' : '');
  document.getElementById('amHumid').textContent = s.d.humidity ? `${s.d.humidity[0]}%` : '--';
  const r1h = s.d.precipitation1h ? s.d.precipitation1h[0] : null;
  const rain1El = document.getElementById('amCellRain1h');
  document.getElementById('amRain1h').textContent = r1h !== null ? `${r1h}mm` : '--';
  rain1El.className = 'am-cell' + (r1h !== null && r1h >= 10 ? ' rain-alert' : '');
  document.getElementById('amRain10m').textContent = s.d.precipitation10m ? `${s.d.precipitation10m[0]}mm` : '--';
  document.getElementById('amRain24h').textContent = s.d.precipitation24h ? `${s.d.precipitation24h[0]}mm` : '--';
  document.getElementById('amWind').textContent = s.d.wind ? `${s.d.wind[0]}m/s` : '--';
  document.getElementById('amWindDir').textContent = s.d.wind ? (WIND_DIR[s.d.wind[1]] || '--') : '--';
  document.getElementById('amSnow').textContent = s.d.snow ? `${s.d.snow[0]}cm` : '--';
  document.getElementById('amCellTemp').onclick = () => fetchAmedasChart('temp', '過去24時間の気温');
  document.getElementById('amCellHumid').onclick = () => fetchAmedasChart('humid', '過去24時間の湿度');
  document.getElementById('amCellRain1h').onclick = () => fetchAmedasChart('rain1h', '過去24時間の時間雨量');
  document.getElementById('amCellRain10m').onclick = () => fetchAmedasChart('rain10m', '直近6時間の10分雨量');
  document.getElementById('amCellRain24h').onclick = () => fetchAmedasChart('rain24h', '過去24時間の累積雨量');
  document.getElementById('amCellWind').onclick = () => fetchAmedasChart('wind', '過去24時間の風速');
  document.getElementById('amCellWindDir').onclick = () => fetchAmedasChart('winddir', '過去24時間の風向（頻度）');
  document.getElementById('amCellSnow').onclick = () => fetchAmedasChart('snow', '過去24時間の積雪深');
  (async () => {
    const jst = new Date(new Date().getTime() + 9 * 3600000);
    const p = n => String(n).padStart(2, '0');
    const ymd = `${jst.getUTCFullYear()}${p(jst.getUTCMonth() + 1)}${p(jst.getUTCDate())}`;
    try {
      const r = await fetch(`https://www.jma.go.jp/bosai/amedas/data/point/${s.code}/${ymd}_06.json`);
      if (!r.ok) return;
      const data = await r.json();
      const key = Object.keys(data).sort().find(k => k.slice(8, 10) === '06' && parseInt(k.slice(10, 12)) <= 10);
      const t = key && data[key].temp ? data[key].temp[0] : null;
      if (t === null) return;
      const humEl = document.getElementById('wxHumid');
      if (humEl && humEl.textContent === '--') {
        humEl.textContent = `${t}°C`;
        const lbl = document.getElementById('wxCellHumid').querySelector('.lbl');
        if (lbl) lbl.textContent = '🌅 今朝6時';
      }
    } catch {}
  })();
}

/* ─── AMeDASチャート ─────────────────────────── */
async function fetchAmedasChart(varKey, title) {
  const cfg = AM_CHART_VARS[varKey];
  if (!cfg || !_currentAmedasStation) return;
  const w = openChartWindow(title);
  try {
    const code = _currentAmedasStation.code;
    const results = await Promise.all(getFileList(cfg.files).map(async ({ ymd, hh }) => {
      try { const r = await fetch(`https://www.jma.go.jp/bosai/amedas/data/point/${code}/${ymd}_${hh}.json`); return r.ok ? await r.json() : null; } catch { return null; }
    }));
    if (cfg.agg === 'dir_hist') {
      const freq = new Array(17).fill(0);
      results.forEach(data => { if (!data) return; Object.values(data).forEach(d => { const raw = d[cfg.field]; const v = raw ? raw[cfg.idx] : null; if (v !== null && v !== undefined) freq[v] = (freq[v] || 0) + 1; }); });
      w.setChart(WIND_DIR.slice(1).concat(['静穏']), freq.slice(1).concat([freq[0]]), [{ data: freq.slice(1).concat([freq[0]]), type: 'bar', backgroundColor: cfg.col, borderColor: cfg.col, borderWidth: 1 }], '気象庁 AMeDAS');
      return;
    }
    if (cfg.agg === 'raw10m') {
      const entries = [];
      results.forEach(data => { if (!data) return; Object.entries(data).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ts, d]) => { const raw = d[cfg.field]; const v = raw ? raw[cfg.idx] : null; if (v === null || v === undefined || v < 0) return; entries.push({ label: `${ts.slice(8, 10)}:${ts.slice(10, 12)}`, v: Math.round(v * 10) / 10 }); }); });
      w.setChart(entries.map(e => e.label), [{ data: entries.map(e => e.v), type: 'bar', backgroundColor: cfg.col, borderColor: cfg.col, borderWidth: 1 }], '気象庁 AMeDAS');
      return;
    }
    const hourly = {}, cnt = {};
    results.forEach(data => { if (!data) return; Object.entries(data).forEach(([ts, d]) => { const raw = d[cfg.field]; const v = raw ? raw[cfg.idx] : null; if (v === null || v === undefined || v < 0) return; const hh = ts.slice(8, 10); if (cfg.agg === 'hourly' || cfg.agg === 'cumsum') { hourly[hh] = (hourly[hh] || 0) + v; } else if (cfg.agg === 'avg') { hourly[hh] = (hourly[hh] || 0) + v; cnt[hh] = (cnt[hh] || 0) + 1; } else { hourly[hh] = v; } }); });
    if (cfg.agg === 'avg') Object.keys(hourly).forEach(h => { if (cnt[h]) hourly[h] = Math.round(hourly[h] / cnt[h] * 10) / 10; });
    const jst = new Date(new Date().getTime() + 9 * 3600000), curH = jst.getUTCHours();
    const labels = [], vals = []; let cumul = 0;
    for (let i = 23; i >= 0; i--) {
      const h = ((curH - i) + 24) % 24; labels.push(`${h}時`);
      const v = hourly[String(h).padStart(2, '0')]; const rounded = v !== undefined ? Math.round(v * 10) / 10 : null;
      if (cfg.agg === 'cumsum') { if (rounded !== null) cumul = Math.round((cumul + rounded) * 10) / 10; vals.push(cumul); } else { vals.push(rounded); }
    }
    w.setChart(labels, [{ data: vals, type: cfg.type, backgroundColor: cfg.col, borderColor: cfg.col, borderWidth: 2, fill: cfg.agg === 'cumsum', tension: 0.3, pointRadius: 2, spanGaps: true }], '気象庁 AMeDAS');
  } catch (e) { console.error('[AmedasChart]', e); w.setError(e.message); }
}

/* ─── 予報チャート ───────────────────────────── */
function showJmaPOPChart(title) {
  const w = openChartWindow(title || '降水確率');
  if (!_jmaForecast) { w.setError('データなし'); return; }
  try {
    const ts1 = _jmaForecast[0].timeSeries[1];
    const labels = ts1.timeDefines.map(t => { const d = new Date(t); const jh = d.getUTCHours() + 9; const jd = new Date(d.getTime() + 9 * 3600000); return `${jd.getUTCMonth()+1}/${jd.getUTCDate()} ${String(jh % 24).padStart(2, '0')}時`; });
    w.setChart(labels, [{ data: ts1.areas[0].pops.map(p => p === '' ? null : Number(p)), type: 'bar', backgroundColor: 'rgba(0,102,255,0.55)', borderColor: 'rgba(0,102,255,0.8)', borderWidth: 1 }], '気象庁');
  } catch (e) { w.setError(e.message); }
}

function showJmaMaxTempChart() {
  const w = openChartWindow('最高気温の今後の推移');
  if (!_jmaForecast) { w.setError('データなし'); return; }
  try {
    const ts2 = _jmaForecast[0].timeSeries[2], area = ts2.areas[0];
    const r = _prependCurrent(_jmaTempLabels(ts2.timeDefines), (area.tempsMax || area.temps || []).map(v => v === '' ? null : Number(v)));
    const bg = _compColors(r.data, 'rgba(220,50,0,0.7)', 'rgba(0,80,220,0.7)', 'rgba(180,100,0,0.6)');
    const bd = _compColors(r.data, 'rgba(220,50,0,1)', 'rgba(0,80,220,1)', 'rgba(180,100,0,1)');
    w.setChart(r.labels, [{ label: '最高気温(°C)', data: r.data, type: 'bar', backgroundColor: bg, borderColor: bd, borderWidth: 1 }], '気象庁', { beginAtZero: false });
  } catch (e) { w.setError(e.message); }
}

function showJmaMinTempChart() {
  const hasMin = _jmaForecast && (_jmaForecast[0].timeSeries[2].areas[0].tempsMin || []).some(v => v !== '');
  const w = openChartWindow('最低気温の今後の推移');
  if (!_jmaForecast) { w.setError('データなし'); return; }
  try {
    const ts2 = _jmaForecast[0].timeSeries[2], area = ts2.areas[0];
    const temps = hasMin ? (area.tempsMin || []) : (area.tempsMax || area.temps || []);
    const r = _prependCurrent(_jmaTempLabels(ts2.timeDefines), temps.map(v => v === '' ? null : Number(v)));
    const bg = _compColors(r.data, 'rgba(220,50,0,0.7)', 'rgba(0,80,220,0.7)', 'rgba(0,100,200,0.6)');
    const bd = _compColors(r.data, 'rgba(220,50,0,1)', 'rgba(0,80,220,1)', 'rgba(0,100,200,1)');
    w.setChart(r.labels, [{ label: '最低気温(°C)', data: r.data, type: 'bar', backgroundColor: bg, borderColor: bd, borderWidth: 1 }], '気象庁', { beginAtZero: false });
  } catch (e) { w.setError(e.message); }
}

/* ─── チャートウィンドウ ─────────────────────── */
function openChartWindow(title) {
  return window.innerWidth < 768 ? _openChartSheet(title) : _openChartFloat(title);
}

function _openChartSheet(title) {
  _cwCounter++;
  const id = `c${_cwCounter}`;
  _charts.set(id, { title, labels: null, datasets: null, source: null, error: null });
  const chips = document.getElementById('chartChips');
  const chip = document.createElement('div');
  chip.className = 'chart-chip'; chip.id = `chip-${id}`;
  chip.innerHTML = `<span class="chip-lbl">${title}</span><button class="chip-cls">✕</button>`;
  chip.querySelector('.chip-lbl').onclick = () => activateChart(id);
  chip.querySelector('.chip-cls').onclick = e => { e.stopPropagation(); removeChart(id); };
  chips.appendChild(chip); chips.style.display = 'flex';
  setTimeout(() => chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' }), 50);
  activateChart(id);
  return {
    setChart(labels, datasets, source, yOpts = {}) { const c = _charts.get(id); if (!c) return; Object.assign(c, { labels, datasets, source, yOpts }); if (_activeChartId === id) renderSheet(); },
    setError(msg) { const c = _charts.get(id); if (!c) return; c.error = msg; if (_activeChartId === id) renderSheet(); }
  };
}

function _openChartFloat(title) {
  _cwCounter++;
  const offset = (_cwCounter - 1) % 6;
  const win = document.createElement('div');
  win.className = 'cw-win';
  const wxPanel = document.getElementById('wxPanel');
  const pr = wxPanel.getBoundingClientRect();
  const cx = Math.min(pr.right + 10 + offset * 16, window.innerWidth - 310);
  const cy = Math.max(pr.top + offset * 26, 10);
  win.style.cssText = `top:${cy}px;left:${cx}px;z-index:${9200 + _cwCounter};`;
  win.innerHTML = `<div class="cw-handle"><span class="cw-title">${title}</span><button class="cw-close">✕</button></div>`
    + `<div class="cw-body"><div class="cw-loading">取得中...</div><canvas class="cw-canvas" height="110" style="display:none;"></canvas><div class="cw-source"></div></div>`;
  document.body.appendChild(win);
  win.addEventListener('pointerdown', () => { win.style.zIndex = 9200 + (++_cwCounter); });
  win.querySelector('.cw-close').addEventListener('click', e => { e.stopPropagation(); if (chart) chart.destroy(); win.remove(); });
  let chart = null, drag = null;
  const handle = win.querySelector('.cw-handle');
  handle.addEventListener('mousedown', e => {
    if (e.target === win.querySelector('.cw-close')) return;
    const r = win.getBoundingClientRect(); drag = { ox: e.clientX - r.left, oy: e.clientY - r.top }; handle.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    let x = e.clientX - drag.ox, y = e.clientY - drag.oy;
    x = Math.max(0, Math.min(window.innerWidth - win.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - win.offsetHeight, y));
    win.style.left = x + 'px'; win.style.top = y + 'px';
  });
  document.addEventListener('mouseup', () => { drag = null; handle.style.cursor = ''; });
  const canvas = win.querySelector('.cw-canvas'), loading = win.querySelector('.cw-loading'), src = win.querySelector('.cw-source');
  return {
    setChart(labels, datasets, source, yOpts = {}) {
      loading.style.display = 'none'; canvas.style.display = 'block'; src.textContent = source ? `出典: ${source}` : '';
      if (chart) chart.destroy();
      const type = datasets[0].type || 'bar';
      const yo = yOpts || {}; const yAxis = { beginAtZero: yo.beginAtZero !== false, ticks: { font: { size: 10 }, maxTicksLimit: 5 }, grid: { color: 'rgba(0,0,0,0.06)' } };
      if (yo.min !== undefined) yAxis.min = yo.min; if (yo.max !== undefined) yAxis.max = yo.max;
      chart = new Chart(canvas, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: datasets.length > 1, labels: { font: { size: 10 } } } }, scales: { x: { ticks: { font: { size: 9 }, maxTicksLimit: 12 }, grid: { display: false } }, y: yAxis } } });
    },
    setError(msg) { loading.textContent = `❌ ${msg}`; loading.style.display = 'block'; canvas.style.display = 'none'; }
  };
}

function activateChart(id) {
  _activeChartId = id;
  document.querySelectorAll('.chart-chip').forEach(c => c.classList.remove('active'));
  const chip = document.getElementById(`chip-${id}`); if (chip) chip.classList.add('active');
  document.getElementById('chartSheet').classList.add('open');
  renderSheet();
}

function renderSheet() {
  const c = _charts.get(_activeChartId); if (!c) return;
  document.getElementById('chartSheetTitle').textContent = c.title;
  const loading = document.getElementById('chartSheetLoading'), canvas = document.getElementById('chartSheetCanvas'), src = document.getElementById('chartSheetSrc');
  if (c.error) { loading.textContent = `❌ ${c.error}`; loading.style.display = 'block'; canvas.style.display = 'none'; }
  else if (!c.labels) { loading.textContent = '取得中...'; loading.style.display = 'block'; canvas.style.display = 'none'; }
  else {
    loading.style.display = 'none'; canvas.style.display = 'block';
    src.textContent = c.source ? `出典: ${c.source}` : '';
    if (_sheetChart) { _sheetChart.destroy(); _sheetChart = null; }
    const type = c.datasets[0].type || 'bar';
    const yo = c.yOpts || {}; const yAxis = { beginAtZero: yo.beginAtZero !== false, ticks: { font: { size: 10 }, maxTicksLimit: 5 }, grid: { color: 'rgba(0,0,0,0.06)' } };
    if (yo.min !== undefined) yAxis.min = yo.min; if (yo.max !== undefined) yAxis.max = yo.max;
    _sheetChart = new Chart(canvas, { type, data: { labels: c.labels, datasets: c.datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: c.datasets.length > 1, labels: { font: { size: 10 } } } }, scales: { x: { ticks: { font: { size: 9 }, maxTicksLimit: 12 }, grid: { display: false } }, y: yAxis } } });
  }
}

function removeChart(id) {
  if (_sheetChart && _activeChartId === id) { _sheetChart.destroy(); _sheetChart = null; }
  _charts.delete(id);
  const chip = document.getElementById(`chip-${id}`); if (chip) chip.remove();
  if (_activeChartId === id) {
    const r = [..._charts.keys()];
    if (r.length > 0) activateChart(r[r.length - 1]);
    else { document.getElementById('chartSheet').classList.remove('open'); _activeChartId = null; }
  }
  if (_charts.size === 0) { const ch = document.getElementById('chartChips'); ch.style.display = 'none'; }
}

/* ─── パネル開閉 ─────────────────────────────── */
function openWxPanel() {
  wxOpen = true;
  document.getElementById('wxPanel').style.display = 'flex';
  const chk = document.getElementById('chkWeather');
  if (chk) chk.checked = true;
  const center = map.getCenter();
  fetchWeather(center.lat, center.lng);
}

function closeWxPanel() {
  wxOpen = false;
  document.getElementById('wxPanel').style.display = 'none';
  const chk = document.getElementById('chkWeather');
  if (chk) chk.checked = false;
  /* 気象レイヤは維持（パネルを閉じてもレイヤはONのまま） */
}

/* ─── 初期化 ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const wxPanel = document.getElementById('wxPanel');

  /* 既存のLeafletレイヤコントロールに「天気情報」チェックを注入 */
  function injectWeatherCheckbox() {
    const overlays = document.querySelector('.leaflet-control-layers-overlays');
    if (!overlays) { setTimeout(injectWeatherCheckbox, 150); return; }
    const sep = document.createElement('div');
    sep.className = 'leaflet-control-layers-separator';
    overlays.appendChild(sep);
    const lbl = document.createElement('label');
    lbl.innerHTML = '<input type="checkbox" class="leaflet-control-layers-selector" id="chkWeather"> <span>天気情報</span>';
    overlays.appendChild(lbl);
    document.getElementById('chkWeather').addEventListener('change', function() {
      if (this.checked) openWxPanel(); else closeWxPanel();
    });
  }
  injectWeatherCheckbox();

  document.getElementById('wxClose').onclick = closeWxPanel;
  document.getElementById('wxRefresh').onclick = () => {
    const center = map.getCenter();
    fetchWeather(center.lat, center.lng);
  };
  document.getElementById('wxCollapseBtn').onclick = () => wxPanel.classList.toggle('collapsed');
  document.getElementById('chartSheetClose').onclick = () => {
    document.getElementById('chartSheet').classList.remove('open');
    _activeChartId = null;
  };

  /* 気象レイヤチェックボックス */
  Object.keys(WX_CHK_MAP).forEach(key => {
    document.getElementById(WX_CHK_MAP[key]).addEventListener('change', function() {
      wxLayerState[key].on = this.checked;
      wxApplyLayerState(key);
    });
  });

  /* AMeDASマーカーチェックボックス */
  document.getElementById('chkLAmedas').addEventListener('change', function() {
    amedasOn = this.checked;
    document.getElementById('lblLAmedas').classList.toggle('active', amedasOn);
    if (amedasOn) {
      fetchAmedasMarkers();
      amedasTimer = setInterval(fetchAmedasMarkers, 10 * 60 * 1000);
    } else {
      clearInterval(amedasTimer); amedasTimer = null;
      amedasMarkers.forEach(mk => map.removeLayer(mk)); amedasMarkers = [];
    }
  });

  /* パネルドラッグ */
  const handle = document.getElementById('wxHandle');
  let drag = null;
  function startDrag(cx, cy) { const r = wxPanel.getBoundingClientRect(); drag = { ox: cx - r.left, oy: cy - r.top }; }
  function moveDrag(cx, cy) {
    if (!drag) return;
    let x = cx - drag.ox, y = cy - drag.oy;
    x = Math.max(0, Math.min(window.innerWidth - wxPanel.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - wxPanel.offsetHeight, y));
    wxPanel.style.left = x + 'px'; wxPanel.style.top = y + 'px';
  }
  function endDrag() { drag = null; }
  handle.addEventListener('touchstart', e => { if (e.target.closest('button')) return; startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  handle.addEventListener('touchmove', e => { if (!drag) return; e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  handle.addEventListener('touchend', endDrag, { passive: true });
  handle.addEventListener('mousedown', e => { if (e.target.closest('button')) return; startDrag(e.clientX, e.clientY); handle.style.cursor = 'grabbing'; });
  document.addEventListener('mousemove', e => { if (!drag) return; moveDrag(e.clientX, e.clientY); });
  document.addEventListener('mouseup', () => { if (drag) { drag = null; handle.style.cursor = ''; } });
});
