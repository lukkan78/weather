'use strict';

// ── DOM ────────────────────────────────────────────────────────────────────
const $              = id => document.getElementById(id);
const searchInput    = $('searchInput');
const searchBtn      = $('searchBtn');
const geolocateBtn   = $('geolocateBtn');
const errorMsg       = $('errorMessage');
const emptyState     = $('emptyState');
const weatherDisplay = $('weatherDisplay');
const loadingOverlay = $('loadingOverlay');
const locationName   = $('locationName');
const locationCoords = $('locationCoords');
const currentIcon    = $('currentIcon');
const currentTemp    = $('currentTemp');
const currentDesc    = $('currentDescription');
const currentWind    = $('currentWind');
const currentHumid   = $('currentHumidity');
const currentPrecip  = $('currentPrecip');
const confValue      = $('confidenceValue');
const confFill       = $('confidenceFill');
const sourcesGrid    = $('sourcesGrid');
const hourlyScroll   = $('hourlyScroll');
const dailyList      = $('dailyList');
const installPrompt  = $('installPrompt');
const installAccept  = $('installAccept');
const installDismiss = $('installDismiss');
const offlineInd     = $('offlineIndicator');

// ── State ──────────────────────────────────────────────────────────────────
let deferredPrompt = null;
let lastLoc        = null;

// ── WMO Weather Codes → [dayIcon, nightIcon, Swedish label] ───────────────
const WMO = {
  0:  ['☀️','🌙','Klart'],
  1:  ['🌤️','🌙','Huvudsakligen klart'],
  2:  ['⛅','☁️','Delvis molnigt'],
  3:  ['☁️','☁️','Molnigt'],
  45: ['🌫️','🌫️','Dimma'],
  48: ['🌫️','🌫️','Rimfrost'],
  51: ['🌦️','🌦️','Drizzle'],
  53: ['🌦️','🌦️','Drizzle'],
  55: ['🌧️','🌧️','Tätt drizzle'],
  61: ['🌧️','🌧️','Lätt regn'],
  63: ['🌧️','🌧️','Regn'],
  65: ['🌧️','🌧️','Tätt regn'],
  66: ['🌧️','🌧️','Frusen regn'],
  67: ['🌧️','🌧️','Tätt frusen regn'],
  71: ['🌨️','🌨️','Lätt snö'],
  73: ['🌨️','🌨️','Snö'],
  75: ['❄️','❄️','Tätt snö'],
  77: ['🌨️','🌨️','Snökorn'],
  80: ['🌦️','🌦️','Regnskur'],
  81: ['🌧️','🌧️','Regnskur'],
  82: ['⛈️','⛈️','Häftig regnskur'],
  85: ['🌨️','🌨️','Snöskur'],
  86: ['❄️','❄️','Täck snöskur'],
  95: ['⛈️','⛈️','Åska'],
  96: ['⛈️','⛈️','Åska med hagel'],
  99: ['⛈️','⛈️','Åska med täck hagel'],
};

function wmo(code, isDay) {
  const r = WMO[code] || ['🌤️','🌤️','Okänt väder'];
  return { icon: isDay ? r[0] : r[1], desc: r[2] };
}

// ── YR Symbol Codes → emoji ───────────────────────────────────────────────
const YR_ICO = {
  clearsky_day:'☀️',  clearsky_night:'🌙',
  fairweather_day:'🌤️', fairweather_night:'🌙',
  partlycloudy_day:'⛅', partlycloudy_night:'🌙',
  cloudy:'☁️', fog:'🌫️',
  lightsun:'🌤️', lightsunshowers:'🌦️', lightsunthunder:'⛈️',
  rain:'🌧️',
  rainshowers:'🌦️', rainshowersday:'🌦️', rainshowersnight:'🌦️',
  snow:'❄️',
  snowshowers:'🌨️', snowshowersday:'🌨️', snowshowersnight:'🌨️',
  sleet:'🌨️',
  sleetshowers:'🌨️', sleetshowersday:'🌨️', sleetshowersnight:'🌨️',
  thunder:'⛈️', thunderrain:'⛈️', thunderrainshowers:'⛈️',
  thundersnow:'⛈️', thundersnowshowers:'⛈️',
  rainandsnow:'🌨️',
};

function yrIco(sym) {
  return YR_ICO[sym] || YR_ICO[sym?.replace(/_day$|_night$/, '')] || '🌤️';
}

// ── Helpers ────────────────────────────────────────────────────────────────
const pad2   = n => String(n).padStart(2, '0');
const round1 = n => Math.round(n * 10) / 10;

// Extract HH:MM straight from the ISO string – avoids JS Date TZ quirks.
// Works for both "2024-01-15T14:00" and "2024-01-15T14:00:00+01:00".
function fmtTime(iso) {
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '--:--';
}

function fmtDay(dateStr) {
  // Append noon so the Date lands on the right calendar day in any TZ
  const d = new Date(dateStr + 'T12:00:00');
  return ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'][d.getDay()];
}

function isToday(dateStr) {
  return dateStr === new Date().toLocaleDateString('en-CA');
}

// ── Geocoding (Open-Meteo – free, no key) ─────────────────────────────────
async function geocode(query) {
  const res = await fetch(
    'https://geocoding-api.open-meteo.com/v1/search?' +
    'name=' + encodeURIComponent(query) + '&count=5&language=sv&format=json'
  );
  if (!res.ok) throw new Error('Geocoding misslyckades');
  const data = await res.json();
  if (!data.results?.length) throw new Error('Plats hittades inte – pröva ett annat ord');
  const loc = data.results[0];
  return {
    lat:  loc.latitude,
    lon:  loc.longitude,
    name: [loc.name, loc.admin1, loc.country].filter(Boolean).join(', '),
  };
}

// ── Reverse Geocoding (Nominatim / OSM) ───────────────────────────────────
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      'https://nominatim.openstreetmap.org/reverse?' +
      'lat=' + lat + '&lon=' + lon + '&format=json&language=sv',
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a     = data.address || {};
    const place = a.city || a.town || a.village || a.municipality || a.county;
    const reg   = a.state || a.country;
    return place ? [place, reg].filter(Boolean).join(', ') : null;
  } catch { return null; }
}

// ── API: Open-Meteo (primary – always CORS-friendly) ──────────────────────
async function fetchOpenMeteo(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    'latitude='  + lat  + '&longitude=' + lon +
    '&current_weather=true' +
    '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,windspeed_10m,weathercode' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,precipitation_probability_max,weathercode' +
    '&timezone=auto&forecast_days=7';

  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo: HTTP ' + res.status);
  const d = await res.json();

  const isDay = d.current_weather.is_day === 1;
  const cur   = d.current_weather;
  const tz    = d.timezone;

  // Locate the "current hour" slot using the location's timezone
  let idx = 0;
  try {
    const nowDate = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const nowHour = pad2(
      Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
    );
    const found = d.hourly.time.indexOf(nowDate + 'T' + nowHour + ':00');
    if (found !== -1) idx = found;
  } catch { /* fallback idx = 0 */ }

  return {
    source: 'Open-Meteo',
    status: 'ok',
    current: {
      temp:     round1(cur.temperature),
      wind:     round1(cur.windspeed),
      humidity: d.hourly.relative_humidity_2m[idx] ?? 0,
      precip:   round1(d.hourly.precipitation[idx] ?? 0),
      icon:     wmo(cur.weathercode, isDay).icon,
      desc:     wmo(cur.weathercode, isDay).desc,
    },
    hourly: d.hourly.time.map((t, i) => {
      const h = Number(t.match(/T(\d{2})/)?.[1] ?? 12);
      return {
        time:   t,
        temp:   round1(d.hourly.temperature_2m[i]),
        icon:   wmo(d.hourly.weathercode?.[i] ?? 0, h >= 6 && h < 20).icon,
        precip: d.hourly.precipitation_probability?.[i] ?? 0,
      };
    }),
    daily: d.daily.time.map((t, i) => ({
      time:       t,
      tempMax:    round1(d.daily.temperature_2m_max[i]),
      tempMin:    round1(d.daily.temperature_2m_min[i]),
      precip:     round1(d.daily.precipitation_sum?.[i] ?? 0),
      precipProb: d.daily.precipitation_probability_max?.[i] ?? 0,
      wind:       round1(d.daily.windspeed_10m_max?.[i] ?? 0),
      icon:       wmo(d.daily.weathercode?.[i] ?? 0, true).icon,
    })),
  };
}

// ── API: YR.no ─────────────────────────────────────────────────────────────
async function fetchYR(lat, lon) {
  // MET.no API - User-Agent kan inte sättas från webbläsare (forbidden header)
  const res = await fetch(
    'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4)
  );
  if (!res.ok) throw new Error('YR: HTTP ' + res.status);
  const data = await res.json();

  const ts = data.properties?.forecast?.timeseries;
  if (!ts?.length) throw new Error('YR: ingen data');

  const inst = ts[0].data?.instant?.details  || {};
  const next = ts[0].data?.next_1hours       || {};
  const sym  = next.summary?.symbol_code     || 'cloudy';

  return {
    source: 'YR',
    status: 'ok',
    current: {
      temp:     round1(inst.air_temperature      ?? 0),
      wind:     round1(inst.wind_speed           ?? 0),
      humidity: inst.relative_humidity           ?? 0,
      precip:   round1(next.details?.precipitation_amount ?? 0),
      icon:     yrIco(sym),
      desc:     sym.replace(/_/g, ' '),
    },
    hourly: ts.slice(0, 48).map(e => {
      const det = e.data?.instant?.details || {};
      const n1  = e.data?.next_1hours      || {};
      return {
        time:   e.time,
        temp:   round1(det.air_temperature ?? 0),
        icon:   yrIco(n1.summary?.symbol_code),
        precip: n1.details?.precipitation_probability ?? 0,
      };
    }),
    daily: [],   // YR has no ready-made daily summary endpoint
  };
}

// ── API: SMHI ──────────────────────────────────────────────────────────────
async function fetchSMHI(lat, lon) {
  // SMHI kräver lon/lat i URL-path, inte query params
  const url = 'https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/' +
    lon.toFixed(6) + '/lat/' + lat.toFixed(6) + '/data.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('SMHI: HTTP ' + res.status);
  const data = await res.json();

  // SMHI returnerar timeSeries array med parameters
  const list = data.timeSeries ?? [];
  if (!list.length) throw new Error('SMHI: ingen data');

  // Första tidpunkten, extrahera parametrar
  const params = list[0].parameters ?? [];
  const get = name => params.find(p => p.name === name)?.values?.[0] ?? 0;
  const c = {
    t: get('t'),           // temperatur
    ws: get('ws'),         // vindhastighet
    r: get('r'),           // relativ luftfuktighet
    pmax: get('pmax'),     // max nederbörd
  };
  return {
    source: 'SMHI',
    status: 'ok',
    current: {
      temp:     round1(c.t),
      wind:     round1(c.ws),
      humidity: Math.round(c.r),
      precip:   round1(c.pmax),
      icon:     '🌤️',
      desc:     'SMHI-prognos',
    },
    hourly: [],
    daily:  [],
  };
}

// ── Ensemble Calculation ───────────────────────────────────────────────────
function calcEnsemble(results) {
  const ok = results.filter(r => r.status === 'ok');
  if (!ok.length) throw new Error('Alla väderservicerna misslyckades');

  const temps  = ok.map(r => r.current.temp);
  const avg    = temps.reduce((a, b) => a + b, 0) / temps.length;
  const stdDev = Math.sqrt(
    temps.reduce((s, t) => s + (t - avg) ** 2, 0) / temps.length
  );

  // Single source → assume medium-high; multiple → derive from std-dev
  const pct   = ok.length === 1
    ? 75
    : Math.max(5, Math.min(100, Math.round(100 - stdDev * 20)));
  const cls   = pct >= 70 ? 'confidence-high'   : pct >= 40 ? 'confidence-medium'   : 'confidence-low';
  const label = pct >= 70 ? 'Hög'               : pct >= 40 ? 'Måttlig'              : 'Låg';

  // Use Open-Meteo as primary for hourly/daily (best coverage)
  const primary = ok.find(r => r.source === 'Open-Meteo') || ok[0];
  const winds   = ok.map(r => r.current.wind);

  return {
    current: {
      temp:     round1(avg),
      wind:     round1(winds.reduce((a, b) => a + b, 0) / winds.length),
      humidity: primary.current.humidity,
      precip:   primary.current.precip,
      icon:     primary.current.icon,
      desc:     primary.current.desc,
    },
    confidence: { pct, cls, label },
    hourly:  primary.hourly,
    daily:   primary.daily,
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderCurrent(ens) {
  currentIcon.textContent   = ens.current.icon;
  currentTemp.textContent   = ens.current.temp;
  currentDesc.textContent   = ens.current.desc;
  currentWind.textContent   = ens.current.wind    + ' m/s';
  currentHumid.textContent  = ens.current.humidity + ' %';
  currentPrecip.textContent = ens.current.precip   + ' mm';

  confValue.textContent     = ens.confidence.label + ' (' + ens.confidence.pct + ' %)';
  confFill.style.width      = ens.confidence.pct + '%';
  confFill.className        = 'confidence-fill ' + ens.confidence.cls;
}

function renderSources(results) {
  sourcesGrid.innerHTML = '';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.innerHTML = r.status === 'ok'
      ? '<div class="source-name">'  + r.source + '</div>'
      + '<div class="source-temp">'  + r.current.temp + '°C</div>'
      + '<div class="source-details">💨 ' + r.current.wind + ' m/s &nbsp; 💧 ' + r.current.humidity + ' %</div>'
      + '<span class="source-status status-ok">OK</span>'
      : '<div class="source-name">'  + r.source + '</div>'
      + '<div class="source-temp" style="color:var(--confidence-low)">–</div>'
      + '<div class="source-details">' + (r.error || 'Misslyckades') + '</div>'
      + '<span class="source-status status-error">Fel</span>';
    sourcesGrid.appendChild(card);
  });
}

function renderHourly(hourly) {
  hourlyScroll.innerHTML = '';
  const now   = Date.now();
  const items = hourly
    .filter(h => new Date(h.time).getTime() >= now - 1800000)  // 30 min grace
    .slice(0, 24);

  items.forEach((h, i) => {
    const el    = document.createElement('div');
    el.className = 'hourly-item';
    const label  = (i === 0 && new Date(h.time).getTime() <= now + 1800000) ? 'Nu' : fmtTime(h.time);
    el.innerHTML =
        '<div class="hourly-time">'   + label      + '</div>'
      + '<div class="hourly-icon">'   + h.icon     + '</div>'
      + '<div class="hourly-temp">'   + h.temp     + '°</div>'
      + '<div class="hourly-precip">💧 ' + h.precip + '%</div>';
    hourlyScroll.appendChild(el);
  });
}

function renderDaily(daily) {
  dailyList.innerHTML = '';
  if (!daily.length) return;

  const allMin = Math.min(...daily.map(d => d.tempMin));
  const allMax = Math.max(...daily.map(d => d.tempMax));
  const range  = allMax - allMin || 1;

  daily.forEach(d => {
    const el       = document.createElement('div');
    el.className   = 'daily-item';
    const dayLabel = isToday(d.time) ? 'Idag' : fmtDay(d.time);
    const leftPct  = ((d.tempMin - allMin) / range) * 100;
    const widthPct = ((d.tempMax - d.tempMin) / range) * 100;
    const spread   = d.tempMax - d.tempMin;
    const dotColor = spread > 10 ? 'var(--confidence-low)'
                   : spread > 6  ? 'var(--confidence-medium)'
                   :               'var(--confidence-high)';

    el.innerHTML =
        '<div class="daily-day">' + dayLabel + '</div>'
      + '<div class="daily-icon">' + (d.icon || '☀️') + '</div>'
      + '<div class="daily-temp-range">'
        + '<span class="temp-low">' + d.tempMin + '°</span>'
        + '<div class="temp-bar-container">'
          + '<div class="temp-bar" style="left:' + leftPct + '%;width:' + widthPct + '%"></div>'
        + '</div>'
        + '<span class="temp-high">' + d.tempMax + '°</span>'
      + '</div>'
      + '<div class="daily-confidence">'
        + '<span class="confidence-dot" style="background:' + dotColor + '"></span>'
        + '<span class="daily-confidence-text">💧 ' + (d.precipProb ?? 0) + '%</span>'
      + '</div>';
    dailyList.appendChild(el);
  });
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function showLoading(on) { loadingOverlay.classList.toggle('active', on); }
function showError(msg)  { errorMsg.textContent = msg; errorMsg.classList.add('active'); }
function hideError()     { errorMsg.classList.remove('active'); }

// ── Main Fetch ─────────────────────────────────────────────────────────────
async function fetchWeather(lat, lon, name) {
  showLoading(true);
  hideError();
  lastLoc = { lat, lon, name };

  try {
    const settled = await Promise.allSettled([
      fetchOpenMeteo(lat, lon),
      fetchYR(lat, lon),
      fetchSMHI(lat, lon),
    ]);

    const names   = ['Open-Meteo', 'YR', 'SMHI'];
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { source: names[i], status: 'error', error: r.reason?.message || 'Okänt fel' }
    );

    const ens = calcEnsemble(results);

    locationName.textContent   = name;
    locationCoords.textContent = lat.toFixed(4) + '°, ' + lon.toFixed(4) + '°';

    renderCurrent(ens);
    renderSources(results);
    renderHourly(ens.hourly);
    renderDaily(ens.daily);

    emptyState.style.display = 'none';
    weatherDisplay.classList.add('active');

    // Persist for offline
    try {
      localStorage.setItem('väder_cache', JSON.stringify({
        loc: lastLoc, results, ens, ts: Date.now()
      }));
    } catch { /* localStorage full */ }

  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// ── Offline Cache Restore ──────────────────────────────────────────────────
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem('väder_cache'));
    if (!c || Date.now() - c.ts > 7200000) return;   // max 2 h stale

    lastLoc = c.loc;
    locationName.textContent   = c.loc.name;
    locationCoords.textContent = c.loc.lat.toFixed(4) + '°, ' + c.loc.lon.toFixed(4) + '°';
    renderCurrent(c.ens);
    renderSources(c.results);
    renderHourly(c.ens.hourly);
    renderDaily(c.ens.daily);

    emptyState.style.display = 'none';
    weatherDisplay.classList.add('active');
  } catch { /* ignore */ }
}

// ── Search & Geolocation ───────────────────────────────────────────────────
async function handleSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  showLoading(true);
  hideError();
  try {
    const loc = await geocode(q);
    await fetchWeather(loc.lat, loc.lon, loc.name);
  } catch (err) {
    showError(err.message);
    showLoading(false);
  }
}

function handleGeolocate() {
  if (!navigator.geolocation) return showError('Geolocation stöds inte');
  showLoading(true);
  hideError();
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const name = (await reverseGeocode(lat, lon))
        || (lat.toFixed(3) + '°, ' + lon.toFixed(3) + '°');
      await fetchWeather(lat, lon, name);
    },
    () => { showLoading(false); showError('Platsbestämning misslyckades'); }
  );
}

// ── PWA Install Prompt ─────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installPrompt.classList.add('active');
});

installAccept.addEventListener('click', async () => {
  installPrompt.classList.remove('active');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});

installDismiss.addEventListener('click', () => installPrompt.classList.remove('active'));

// ── Online / Offline ───────────────────────────────────────────────────────
window.addEventListener('online',  () => {
  offlineInd.classList.remove('active');
  if (lastLoc) fetchWeather(lastLoc.lat, lastLoc.lon, lastLoc.name);
});
window.addEventListener('offline', () => {
  offlineInd.classList.add('active');
  loadCache();
});

// ── Service Worker Registration ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Event Listeners ────────────────────────────────────────────────────────
searchBtn.addEventListener('click',  handleSearch);
searchInput.addEventListener('keydown', e => e.key === 'Enter' && handleSearch());
geolocateBtn.addEventListener('click', handleGeolocate);

// ── Init ───────────────────────────────────────────────────────────────────
if (!navigator.onLine) {
  offlineInd.classList.add('active');
  loadCache();
}
