'use strict';

// ── CRASH REPORTER - Visar fel på skärmen ─────────────────────────────────
window.onerror = function(msg, url, line, col, error) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:20px;z-index:99999;font-family:monospace;font-size:14px;white-space:pre-wrap;';
  el.textContent = 'JAVASCRIPT FEL:\n' + msg + '\n\nFil: ' + url + '\nRad: ' + line + ', Kolumn: ' + col + '\n\n' + (error ? error.stack : '');
  document.body.appendChild(el);
  return false;
};

window.addEventListener('unhandledrejection', function(e) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:orange;color:black;padding:20px;z-index:99999;font-family:monospace;font-size:14px;white-space:pre-wrap;';
  el.textContent = 'PROMISE FEL:\n' + (e.reason ? (e.reason.message || e.reason) : 'Okänt fel');
  document.body.appendChild(el);
});

// ── Nödreset av Service Worker via URL-parameter ─────────────────────────
// Besök sidan med ?reset för att tvinga bort gammal SW
(function() {
  if (window.location.search.includes('reset') && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      for (var i = 0; i < regs.length; i++) {
        regs[i].unregister();
      }
    });
    if (window.caches) {
      caches.keys().then(function(keys) {
        for (var i = 0; i < keys.length; i++) {
          caches.delete(keys[i]);
        }
      });
    }
    try { localStorage.clear(); } catch(e) {}
    // Redirect utan ?reset efter kort delay
    setTimeout(function() {
      window.location.href = window.location.pathname;
    }, 500);
  }
})();

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
const searchSuggest  = $('searchSuggestions');
const dayModal       = $('dayDetailModal');
const dayTitle       = $('dayDetailTitle');
const daySummary     = $('dayDetailSummary');
const dayHourly      = $('dayDetailHourly');
const dayClose       = $('dayDetailClose');
const hourModal      = $('hourDetailModal');
const hourTitle      = $('hourDetailTitle');
const hourBody       = $('hourDetailBody');
const hourClose      = $('hourDetailClose');
const recentLoc      = $('recentLocation');
const recentBtn      = $('recentBtn');
const sourcesSection = $('sourcesSection');
const sourcesToggle  = $('sourcesToggle');
const refreshBtn     = $('refreshBtn');
const currentFeels   = $('currentFeelsLike');
const currentPressure= $('currentPressure');
const currentUV      = $('currentUV');
const currentGust    = $('currentGust');
const warningsSection= $('warningsSection');
const airQualitySection = $('airQualitySection');
const uvSection      = $('uvSection');
const nowcastSection = $('nowcastSection');
const forecastText   = $('forecastText');
const forecastSummary= $('forecastSummary');
const searchClear    = $('searchClear');
const updateBanner   = $('updateBanner');
const updateBtn      = $('updateBtn');

// ── State ──────────────────────────────────────────────────────────────────
let deferredPrompt   = null;
let lastLoc          = null;
let selectedSuggest  = -1;
let suggestions      = [];
let cachedHourly     = [];
let cachedDaily      = [];
let cachedIconEuEns  = null;  // ICON-EU ensemble data för dagsdetaljer
let cachedResults    = [];  // För jämförelse-modal

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

// ── Ikonrankning (optimistisk) - lägre = bättre väder ─────────────────────
const ICON_RANK = {
  '☀️': 1,                     // Klart (dag)
  '🌤️': 2,                    // Mestadels klart
  '⛅': 3,                     // Delvis molnigt
  '🌙': 4,                     // Klart (natt) - lägre prio för dagsprognos
  '☁️': 5,                     // Molnigt
  '🌫️': 6,                    // Dimma
  '🌦️': 7,                    // Lätt regn
  '🌧️': 8,                    // Regn
  '🌨️': 9,                    // Snö/slask
  '❄️': 10,                    // Kraftig snö
  '⛈️': 11,                    // Åska
};

function pickBestIcon(icons, preferDay = true) {
  if (!icons?.length) return '🌤️';
  if (icons.length === 1) return icons[0];

  // Filtrera bort nattikoner om vi föredrar dag (för dagsprognos)
  const dayIcons = preferDay ? icons.filter(i => i !== '🌙') : icons;
  const useIcons = dayIcons.length ? dayIcons : icons;

  // Returnera ikonen med lägst rank (bäst väder)
  return useIcons.reduce((best, icon) => {
    const bestRank = ICON_RANK[best] ?? 6;
    const iconRank = ICON_RANK[icon] ?? 6;
    return iconRank < bestRank ? icon : best;
  }, useIcons[0]);
}

// ── Helpers ────────────────────────────────────────────────────────────────
const pad2   = n => String(n).padStart(2, '0');
const round1 = n => Math.round(n * 10) / 10;

// Konvertera grader till kompassriktning
function degToDir(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NÖ', 'Ö', 'SÖ', 'S', 'SV', 'V', 'NV'];
  return dirs[Math.round(deg / 45) % 8];
}

// UV-index nivå och färg (WHO-standard)
function getUVLevel(uv) {
  if (uv <= 0) return { level: '-', color: 'var(--text-muted)', cls: 'uv-none' };
  if (uv < 3)  return { level: 'Låg', color: '#4ade80', cls: 'uv-low' };
  if (uv < 6)  return { level: 'Måttlig', color: '#fbbf24', cls: 'uv-moderate' };
  if (uv < 8)  return { level: 'Hög', color: '#f97316', cls: 'uv-high' };
  if (uv < 11) return { level: 'Mycket hög', color: '#ef4444', cls: 'uv-very-high' };
  return { level: 'Extrem', color: '#a855f7', cls: 'uv-extreme' };
}

// Cirkulärt medelvärde för vinklar (grader) – hanterar 0°/360° wrap-around
function circularMean(angles) {
  const valid = angles.filter(a => a != null && !isNaN(a));
  if (!valid.length) return null;
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const sumSin = valid.reduce((s, a) => s + Math.sin(toRad(a)), 0);
  const sumCos = valid.reduce((s, a) => s + Math.cos(toRad(a)), 0);
  let mean = toDeg(Math.atan2(sumSin / valid.length, sumCos / valid.length));
  if (mean < 0) mean += 360;
  return Math.round(mean);
}

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

// ── Autocomplete ───────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function fetchSuggestions(query) {
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  try {
    const res = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?' +
      'name=' + encodeURIComponent(query) + '&count=5&language=sv&format=json'
    );
    if (!res.ok) return;
    const data = await res.json();
    suggestions = data.results || [];
    renderSuggestions();
  } catch { /* ignore */ }
}

function renderSuggestions() {
  if (!suggestions.length) {
    hideSuggestions();
    return;
  }
  searchSuggest.innerHTML = suggestions.map((s, i) =>
    '<div class="suggestion-item' + (i === selectedSuggest ? ' selected' : '') + '" data-index="' + i + '">' +
    '<div class="suggestion-name">' + s.name + '</div>' +
    '<div class="suggestion-region">' + [s.admin1, s.country].filter(Boolean).join(', ') + '</div>' +
    '</div>'
  ).join('');
  searchSuggest.classList.add('active');
}

function hideSuggestions() {
  searchSuggest.classList.remove('active');
  selectedSuggest = -1;
  suggestions = [];
}

function selectSuggestion(index) {
  const s = suggestions[index];
  if (!s) return;
  searchInput.value = s.name;
  hideSuggestions();
  fetchWeather(s.latitude, s.longitude, [s.name, s.admin1, s.country].filter(Boolean).join(', '));
}

const debouncedFetch = debounce(fetchSuggestions, 300);

// ── API: Open-Meteo (primary – always CORS-friendly) ──────────────────────
async function fetchOpenMeteo(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    'latitude='  + lat  + '&longitude=' + lon +
    '&current_weather=true' +
    '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,windspeed_10m,winddirection_10m,windgusts_10m,pressure_msl,weathercode,uv_index' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,windgusts_10m_max,precipitation_probability_max,weathercode,uv_index_max' +
    '&timezone=auto&forecast_days=16' +
    '&wind_speed_unit=ms';  // Vindhastighet i m/s istället för km/h

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
      windDeg:  cur.winddirection,
      windDir:  degToDir(cur.winddirection),
      windGust: round1(d.hourly.windgusts_10m?.[idx] ?? 0),
      humidity: d.hourly.relative_humidity_2m[idx] ?? 0,
      pressure: Math.round(d.hourly.pressure_msl?.[idx] ?? 0),
      precip:   round1(d.hourly.precipitation[idx] ?? 0),
      uv:       round1(d.hourly.uv_index?.[idx] ?? 0),
      icon:     wmo(cur.weathercode, isDay).icon,
      desc:     wmo(cur.weathercode, isDay).desc,
      isDay:    isDay,
    },
    hourly: d.hourly.time.map((t, i) => {
      const h = Number(t.match(/T(\d{2})/)?.[1] ?? 12);
      return {
        time:       t,
        temp:       round1(d.hourly.temperature_2m[i]),
        icon:       wmo(d.hourly.weathercode?.[i] ?? 0, h >= 6 && h < 20).icon,
        desc:       wmo(d.hourly.weathercode?.[i] ?? 0, h >= 6 && h < 20).desc,
        precip:     d.hourly.precipitation_probability?.[i] ?? 0,
        precipMm:   round1(d.hourly.precipitation?.[i] ?? 0),
        wind:       round1(d.hourly.windspeed_10m?.[i] ?? 0),
        windGust:   round1(d.hourly.windgusts_10m?.[i] ?? 0),
        windDir:    degToDir(d.hourly.winddirection_10m?.[i]),
        humidity:   d.hourly.relative_humidity_2m?.[i] ?? 0,
        pressure:   Math.round(d.hourly.pressure_msl?.[i] ?? 0),
        uv:         round1(d.hourly.uv_index?.[i] ?? 0),
      };
    }),
    daily: d.daily.time.map((t, i) => ({
      time:       t,
      tempMax:    round1(d.daily.temperature_2m_max[i]),
      tempMin:    round1(d.daily.temperature_2m_min[i]),
      precip:     round1(d.daily.precipitation_sum?.[i] ?? 0),
      precipProb: d.daily.precipitation_probability_max?.[i] ?? 0,
      wind:       round1(d.daily.windspeed_10m_max?.[i] ?? 0),
      windGust:   round1(d.daily.windgusts_10m_max?.[i] ?? 0),
      uvMax:      round1(d.daily.uv_index_max?.[i] ?? 0),
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

  // MET.no har timeseries direkt under properties
  const ts = data.properties?.timeseries;
  if (!ts?.length) {
    // Debug: visa vad vi faktiskt fick
    const keys = Object.keys(data || {}).join(', ') || 'empty';
    throw new Error('YR: ingen data (keys: ' + keys + ')');
  }

  const inst = ts[0].data?.instant?.details  || {};
  const next = ts[0].data?.next_1hours       || {};
  const sym  = next.summary?.symbol_code     || 'cloudy';

  return {
    source: 'YR',
    status: 'ok',
    current: {
      temp:     round1(inst.air_temperature      ?? 0),
      wind:     round1(inst.wind_speed           ?? 0),
      windDeg:  inst.wind_from_direction         ?? null,
      windDir:  degToDir(inst.wind_from_direction),
      windGust: round1(inst.wind_speed_of_gust   ?? 0),
      humidity: inst.relative_humidity           ?? 0,
      pressure: Math.round(inst.air_pressure_at_sea_level ?? 0),
      precip:   round1(next.details?.precipitation_amount ?? 0),
      icon:     yrIco(sym),
      desc:     sym.replace(/_/g, ' '),
    },
    hourly: ts.slice(0, 216).map(e => {  // ~9 dagar timdata
      const det = e.data?.instant?.details || {};
      const n1  = e.data?.next_1hours      || {};
      return {
        time:     e.time,
        temp:     round1(det.air_temperature ?? 0),
        icon:     yrIco(n1.summary?.symbol_code),
        precip:   n1.details?.precipitation_probability ?? 0,
        precipMm: round1(n1.details?.precipitation_amount ?? 0),
        wind:     round1(det.wind_speed ?? 0),
        windGust: round1(det.wind_speed_of_gust ?? 0),
        windDir:  degToDir(det.wind_from_direction),
        humidity: det.relative_humidity ?? 0,
        pressure: Math.round(det.air_pressure_at_sea_level ?? 0),
      };
    }),
    daily: [],   // YR has no ready-made daily summary endpoint
  };
}

// ── API: SMHI ──────────────────────────────────────────────────────────────
async function fetchSMHI(lat, lon) {
  // SMHI SNOW1gv1 API (ersatte pmp3g 2026-03-31)
  const url = 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/' +
    lon.toFixed(6) + '/lat/' + lat.toFixed(6) + '/data.json';

  // Retry-logik för tillfälliga fel (503, 502, 504)
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url);
    if (res.ok || (res.status !== 503 && res.status !== 502 && res.status !== 504)) break;
    if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  if (!res.ok) throw new Error('SMHI: HTTP ' + res.status);
  const data = await res.json();

  // SNOW1gv1 returnerar timeSeries med flat data-objekt istället för parameters-array
  const list = data.timeSeries ?? [];
  if (!list.length) throw new Error('SMHI: ingen data');

  // Hjälpfunktion för att hämta värde (9999 = saknas)
  const getVal = (d, key) => {
    const v = d?.[key];
    return (v != null && v !== 9999) ? v : 0;
  };

  // Första tidpunkten för current
  const d0 = list[0].data ?? {};
  const c = {
    t:    getVal(d0, 'air_temperature'),
    ws:   getVal(d0, 'wind_speed'),
    gust: getVal(d0, 'wind_speed_of_gust'),
    wd:   getVal(d0, 'wind_from_direction'),
    r:    getVal(d0, 'relative_humidity'),
    msl:  getVal(d0, 'air_pressure_at_mean_sea_level'),
    pmax: getVal(d0, 'precipitation_amount_max'),
    sym:  getVal(d0, 'symbol_code'),
  };

  // Extrahera timdata
  const hourly = list.map(entry => {
    const d = entry.data ?? {};
    return {
      time:     entry.time,
      temp:     round1(getVal(d, 'air_temperature')),
      wind:     round1(getVal(d, 'wind_speed')),
      windGust: round1(getVal(d, 'wind_speed_of_gust')),
      windDir:  degToDir(getVal(d, 'wind_from_direction')),
      humidity: Math.round(getVal(d, 'relative_humidity')),
      pressure: Math.round(getVal(d, 'air_pressure_at_mean_sea_level')),
      precipMm: round1(getVal(d, 'precipitation_amount_max')),
      precip:   Math.round(getVal(d, 'precipitation_amount_max') > 0 ? 70 : 10),
      icon:     '🌤️',
    };
  });

  return {
    source: 'SMHI',
    status: 'ok',
    current: {
      temp:     round1(c.t),
      wind:     round1(c.ws),
      windGust: round1(c.gust),
      windDeg:  c.wd,
      windDir:  degToDir(c.wd),
      humidity: Math.round(c.r),
      pressure: Math.round(c.msl),
      precip:   round1(c.pmax),
      icon:     '🌤️',
      desc:     'SMHI-prognos',
    },
    hourly: hourly,
    daily:  [],
  };
}

// ── API: SMHI Vädervarningar ────────────────────────────────────────────────

// Kontrollera om en punkt ligger inuti en polygon (ray casting algorithm)
function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lon;
    const yj = polygon[j].lat;
    const xj = polygon[j].lon;

    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Parsa SMHI polygon-sträng till array av {lat, lon}
function parsePolygon(polygonStr) {
  if (!polygonStr) return null;
  try {
    const points = polygonStr.trim().split(/\s+/).map(pair => {
      const [lat, lon] = pair.split(',').map(Number);
      return { lat, lon };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
    return points.length >= 3 ? points : null;
  } catch {
    return null;
  }
}

async function fetchSMHIWarnings(lat, lon) {
  try {
    // Hämta alla aktiva varningar
    const res = await fetch('https://opendata-download-warnings.smhi.se/api/version/2/alerts.json');
    if (!res.ok) return [];
    const data = await res.json();

    // Filtrera varningar som gäller för denna position
    const warnings = (data.alert || []).filter(alert => {
      const info = alert.info?.[0];
      if (!info) return false;

      // Kolla geografisk närhet - gå igenom alla områden
      const areas = info.area || [];

      // Om inga områden specificerats, anta att det gäller hela Sverige
      if (areas.length === 0) return true;

      // Kontrollera varje område
      for (const area of areas) {
        if (area.polygon) {
          const polygon = parsePolygon(area.polygon);
          if (polygon && pointInPolygon(lat, lon, polygon)) {
            return true;
          }
        } else if (area.geocode) {
          // Om inget polygon men geocode finns, returnera true som fallback
          // (kan vara länskod eller liknande)
          return true;
        }
      }

      return false;
    }).map(alert => {
      const info = alert.info?.[0] || {};
      const severity = info.severity || 'Unknown';
      const event = info.event || 'Vädervarning';
      const headline = info.headline || event;
      const description = info.description || '';
      const onset = info.onset ? new Date(info.onset) : null;
      const expires = info.expires ? new Date(info.expires) : null;

      // Mappa severity till färg
      const colorMap = {
        'Extreme': 'red',
        'Severe': 'orange',
        'Moderate': 'yellow',
        'Minor': 'green',
      };

      return {
        event,
        headline,
        description,
        severity,
        color: colorMap[severity] || 'yellow',
        onset,
        expires,
        areaDesc: info.area?.[0]?.areaDesc || 'Sverige',
      };
    }).slice(0, 5); // Max 5 varningar

    return warnings;
  } catch {
    return [];
  }
}

// ── API: ICON-EU Ensemble (40 medlemmar, 13km, 5 dagar) ─────────────────────
async function fetchIconEuEnsemble(lat, lon) {
  try {
    const url =
      'https://ensemble-api.open-meteo.com/v1/ensemble?' +
      'latitude=' + lat + '&longitude=' + lon +
      '&models=icon_eu' +
      '&current=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max' +
      '&wind_speed_unit=ms' +
      '&timezone=auto';

    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();

    // Beräkna statistik från ensemble-medlemmar
    const calcStats = (values) => {
      if (!values || !values.length) return null;
      const valid = values.filter(v => v != null && !isNaN(v));
      if (!valid.length) return null;
      valid.sort((a, b) => a - b);
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const min = valid[0];
      const max = valid[valid.length - 1];
      const p10 = valid[Math.floor(valid.length * 0.1)] ?? min;
      const p90 = valid[Math.floor(valid.length * 0.9)] ?? max;
      return { mean: round1(mean), min: round1(min), max: round1(max), p10: round1(p10), p90: round1(p90) };
    };

    // Current - samla alla medlemmars värden
    const currentTemp = [];
    const currentPrecip = [];
    const currentWind = [];
    const currentGust = [];

    // Hämta alla medlemmars current-värden
    for (let m = 0; m < 40; m++) {
      const suffix = m === 0 ? '' : '_member' + pad2(m);
      if (d.current?.['temperature_2m' + suffix] != null) {
        currentTemp.push(d.current['temperature_2m' + suffix]);
      }
      if (d.current?.['precipitation' + suffix] != null) {
        currentPrecip.push(d.current['precipitation' + suffix]);
      }
      if (d.current?.['wind_speed_10m' + suffix] != null) {
        currentWind.push(d.current['wind_speed_10m' + suffix]);
      }
      if (d.current?.['wind_gusts_10m' + suffix] != null) {
        currentGust.push(d.current['wind_gusts_10m' + suffix]);
      }
    }

    // Hourly ensemble per timme
    const hourlyEns = [];
    if (d.hourly?.time) {
      for (let i = 0; i < d.hourly.time.length; i++) {
        const tempVals = [];
        const precipVals = [];
        const windVals = [];
        const gustVals = [];

        for (let m = 0; m < 40; m++) {
          const suffix = m === 0 ? '' : '_member' + pad2(m);
          const tKey = 'temperature_2m' + suffix;
          const pKey = 'precipitation' + suffix;
          const wKey = 'wind_speed_10m' + suffix;
          const gKey = 'wind_gusts_10m' + suffix;

          if (d.hourly[tKey]?.[i] != null) tempVals.push(d.hourly[tKey][i]);
          if (d.hourly[pKey]?.[i] != null) precipVals.push(d.hourly[pKey][i]);
          if (d.hourly[wKey]?.[i] != null) windVals.push(d.hourly[wKey][i]);
          if (d.hourly[gKey]?.[i] != null) gustVals.push(d.hourly[gKey][i]);
        }

        hourlyEns.push({
          time: d.hourly.time[i],
          temp: calcStats(tempVals),
          precip: calcStats(precipVals),
          wind: calcStats(windVals),
          gust: calcStats(gustVals),
        });
      }
    }

    // Daily ensemble
    const dailyEns = [];
    if (d.daily?.time) {
      for (let i = 0; i < d.daily.time.length; i++) {
        const tempMaxVals = [];
        const tempMinVals = [];
        const precipVals = [];
        const windVals = [];
        const gustVals = [];

        for (let m = 0; m < 40; m++) {
          const suffix = m === 0 ? '' : '_member' + pad2(m);
          const tMaxKey = 'temperature_2m_max' + suffix;
          const tMinKey = 'temperature_2m_min' + suffix;
          const pKey = 'precipitation_sum' + suffix;
          const wKey = 'wind_speed_10m_max' + suffix;
          const gKey = 'wind_gusts_10m_max' + suffix;

          if (d.daily[tMaxKey]?.[i] != null) tempMaxVals.push(d.daily[tMaxKey][i]);
          if (d.daily[tMinKey]?.[i] != null) tempMinVals.push(d.daily[tMinKey][i]);
          if (d.daily[pKey]?.[i] != null) precipVals.push(d.daily[pKey][i]);
          if (d.daily[wKey]?.[i] != null) windVals.push(d.daily[wKey][i]);
          if (d.daily[gKey]?.[i] != null) gustVals.push(d.daily[gKey][i]);
        }

        // Beräkna sannolikhet för nederbörd (% av medlemmar med > 0.1mm)
        const precipProb = precipVals.length
          ? Math.round((precipVals.filter(v => v > 0.1).length / precipVals.length) * 100)
          : null;

        dailyEns.push({
          time: d.daily.time[i],
          tempMax: calcStats(tempMaxVals),
          tempMin: calcStats(tempMinVals),
          precip: calcStats(precipVals),
          precipProb,
          wind: calcStats(windVals),
          gust: calcStats(gustVals),
        });
      }
    }

    // Beräkna current precip probability
    const currentPrecipProb = currentPrecip.length
      ? Math.round((currentPrecip.filter(v => v > 0.1).length / currentPrecip.length) * 100)
      : null;

    return {
      source: 'ICON-EU Ensemble',
      members: 40,
      current: {
        temp: calcStats(currentTemp),
        precip: calcStats(currentPrecip),
        precipProb: currentPrecipProb,
        wind: calcStats(currentWind),
        gust: calcStats(currentGust),
      },
      hourly: hourlyEns,
      daily: dailyEns,
    };
  } catch (e) {
    console.warn('ICON-EU Ensemble fel:', e);
    return null;
  }
}

// ── API: Luftkvalitet med Copernicus CAMS Ensemble ──────────────────────────

// Hämta från CAMS Europe (Copernicus regional modell, hög upplösning för Europa)
async function fetchCAMSEurope(lat, lon) {
  try {
    const url =
      'https://air-quality-api.open-meteo.com/v1/air-quality?' +
      'latitude=' + lat + '&longitude=' + lon +
      '&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide' +
      '&hourly=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone' +
      '&domains=cams_europe' +
      '&forecast_days=2';

    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const c = d.current || {};

    return {
      source: 'CAMS Europe',
      aqi: c.european_aqi ?? null,
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      no2: c.nitrogen_dioxide ?? null,
      o3: c.ozone ?? null,
      so2: c.sulphur_dioxide ?? null,
      co: c.carbon_monoxide ?? null,
      hourly: d.hourly,
    };
  } catch {
    return null;
  }
}

// Hämta från CAMS Global (Copernicus global modell)
async function fetchCAMSGlobal(lat, lon) {
  try {
    const url =
      'https://air-quality-api.open-meteo.com/v1/air-quality?' +
      'latitude=' + lat + '&longitude=' + lon +
      '&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide' +
      '&hourly=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone' +
      '&domains=cams_global' +
      '&forecast_days=2';

    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const c = d.current || {};

    return {
      source: 'CAMS Global',
      aqi: c.european_aqi ?? null,
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      no2: c.nitrogen_dioxide ?? null,
      o3: c.ozone ?? null,
      so2: c.sulphur_dioxide ?? null,
      co: c.carbon_monoxide ?? null,
      hourly: d.hourly,
    };
  } catch {
    return null;
  }
}

// Beräkna ensemble från CAMS Europe och CAMS Global
function calcAirQualityEnsemble(results) {
  const valid = results.filter(r => r && r.aqi != null);
  if (!valid.length) return null;

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const stdDev = arr => {
    if (arr.length < 2) return 0;
    const mean = avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  };

  // Samla alla värden
  const aqis = valid.map(r => r.aqi).filter(v => v != null);
  const pm25s = valid.map(r => r.pm25).filter(v => v != null);
  const pm10s = valid.map(r => r.pm10).filter(v => v != null);
  const no2s = valid.map(r => r.no2).filter(v => v != null);
  const o3s = valid.map(r => r.o3).filter(v => v != null);
  const so2s = valid.map(r => r.so2).filter(v => v != null);
  const cos = valid.map(r => r.co).filter(v => v != null);

  // Ensemble medelvärden
  const ensAqi = Math.round(avg(aqis));
  const ensPm25 = round1(avg(pm25s));
  const ensPm10 = round1(avg(pm10s));
  const ensNo2 = round1(avg(no2s));
  const ensO3 = round1(avg(o3s));
  const ensSo2 = so2s.length ? round1(avg(so2s)) : null;
  const ensCo = cos.length ? round1(avg(cos)) : null;

  // Beräkna spridning (osäkerhet)
  const aqiSpread = stdDev(aqis);
  const pm25Spread = stdDev(pm25s);

  // Konfidens baserat på antalet källor och spridning
  let confidence;
  if (valid.length === 1) {
    confidence = 70;
  } else {
    // Lägre spridning = högre konfidens
    const spreadPenalty = Math.min(aqiSpread * 2, 30);
    confidence = Math.max(40, Math.min(95, Math.round(90 - spreadPenalty + (valid.length - 1) * 5)));
  }

  // AQI kategorier (European AQI)
  let category, color;
  if (ensAqi <= 20) { category = 'Utmärkt'; color = 'var(--confidence-high)'; }
  else if (ensAqi <= 40) { category = 'Bra'; color = 'var(--confidence-high)'; }
  else if (ensAqi <= 60) { category = 'Måttlig'; color = 'var(--confidence-medium)'; }
  else if (ensAqi <= 80) { category = 'Dålig'; color = 'var(--confidence-low)'; }
  else if (ensAqi <= 100) { category = 'Mycket dålig'; color = 'var(--confidence-low)'; }
  else { category = 'Extremt dålig'; color = 'var(--confidence-low)'; }

  // Beräkna ensemble för timprognos
  const hourlyEnsemble = calcAQHourlyEnsemble(valid);

  return {
    aqi: ensAqi,
    category,
    color,
    pm25: ensPm25,
    pm10: ensPm10,
    no2: ensNo2,
    o3: ensO3,
    so2: ensSo2,
    co: ensCo,
    spread: round1(aqiSpread),
    pm25Spread: round1(pm25Spread),
    confidence,
    sourceCount: valid.length,
    sources: valid.map(r => r.source),
    hourly: hourlyEnsemble,
  };
}

// Ensemble för timvis luftkvalitetsprognos
function calcAQHourlyEnsemble(results) {
  const hourlyByTime = new Map();

  results.forEach(r => {
    if (!r.hourly?.time) return;
    r.hourly.time.forEach((t, i) => {
      const key = t.slice(0, 13);
      if (!hourlyByTime.has(key)) {
        hourlyByTime.set(key, { aqis: [], pm25s: [], pm10s: [], no2s: [], o3s: [] });
      }
      const entry = hourlyByTime.get(key);
      if (r.hourly.european_aqi?.[i] != null) entry.aqis.push(r.hourly.european_aqi[i]);
      if (r.hourly.pm2_5?.[i] != null) entry.pm25s.push(r.hourly.pm2_5[i]);
      if (r.hourly.pm10?.[i] != null) entry.pm10s.push(r.hourly.pm10[i]);
      if (r.hourly.nitrogen_dioxide?.[i] != null) entry.no2s.push(r.hourly.nitrogen_dioxide[i]);
      if (r.hourly.ozone?.[i] != null) entry.o3s.push(r.hourly.ozone[i]);
    });
  });

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return Array.from(hourlyByTime.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 48)  // 48 timmar framåt
    .map(([time, data]) => ({
      time: time + ':00',
      aqi: data.aqis.length ? Math.round(avg(data.aqis)) : null,
      pm25: data.pm25s.length ? round1(avg(data.pm25s)) : null,
      pm10: data.pm10s.length ? round1(avg(data.pm10s)) : null,
      sources: data.aqis.length,
    }));
}

// Wrapper för att hämta luftkvalitet med ensemble
async function fetchAirQualityEnsemble(lat, lon) {
  const [camsEurope, camsGlobal] = await Promise.all([
    fetchCAMSEurope(lat, lon),
    fetchCAMSGlobal(lat, lon),
  ]);

  return calcAirQualityEnsemble([camsEurope, camsGlobal]);
}

// ── API: Open-Meteo Pollen ──────────────────────────────────────────────────
async function fetchPollen(lat, lon) {
  try {
    const url =
      'https://air-quality-api.open-meteo.com/v1/air-quality?' +
      'latitude=' + lat + '&longitude=' + lon +
      '&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen' +
      '&forecast_days=1';

    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();

    const c = d.current || {};

    // Pollen nivåer: 0-10 låg, 10-50 måttlig, 50-100 hög, 100+ mycket hög
    const getLevel = (val) => {
      if (val == null || val < 10) return { level: 'Låg', color: 'var(--confidence-high)' };
      if (val < 50) return { level: 'Måttlig', color: 'var(--confidence-medium)' };
      if (val < 100) return { level: 'Hög', color: 'var(--confidence-low)' };
      return { level: 'Mycket hög', color: 'var(--confidence-low)' };
    };

    const types = [];
    if (c.birch_pollen > 5) types.push({ name: 'Björk', value: c.birch_pollen, ...getLevel(c.birch_pollen) });
    if (c.grass_pollen > 5) types.push({ name: 'Gräs', value: c.grass_pollen, ...getLevel(c.grass_pollen) });
    if (c.alder_pollen > 5) types.push({ name: 'Al', value: c.alder_pollen, ...getLevel(c.alder_pollen) });
    if (c.mugwort_pollen > 5) types.push({ name: 'Gråbo', value: c.mugwort_pollen, ...getLevel(c.mugwort_pollen) });

    return types;
  } catch {
    return null;
  }
}

// ── API: YR Nowcast (radar-baserad 0-2h) ────────────────────────────────────
async function fetchYRNowcast(lat, lon) {
  try {
    const res = await fetch(
      'https://api.met.no/weatherapi/nowcast/2.0/complete?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4)
    );
    if (!res.ok) return null;
    const data = await res.json();

    const ts = data.properties?.timeseries;
    if (!ts?.length) return null;

    // Radar-uppdaterad tid
    const radarTime = data.properties?.meta?.radar_coverage;

    // Konvertera till enkel struktur med 5-min intervall
    return {
      source: 'YR Nowcast',
      radarCoverage: radarTime,
      updated: data.properties?.meta?.updated_at,
      data: ts.map(e => ({
        time: e.time,
        precipRate: e.data?.instant?.details?.precipitation_rate ?? 0,  // mm/h
        precipAmount: e.data?.next_1_hours?.details?.precipitation_amount ?? null
      }))
    };
  } catch {
    return null;
  }
}

// ── API: Open-Meteo Minutely (15-min intervall, 2-6h) ───────────────────────
async function fetchOpenMeteoMinutely(lat, lon) {
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast?' +
      'latitude=' + lat + '&longitude=' + lon +
      '&minutely_15=precipitation,precipitation_probability' +
      '&forecast_days=1' +
      '&timezone=auto';

    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();

    if (!d.minutely_15?.time?.length) return null;

    const times = d.minutely_15.time;
    const precip = d.minutely_15.precipitation || [];
    const prob = d.minutely_15.precipitation_probability || [];

    return {
      source: 'Open-Meteo',
      data: times.map((t, i) => ({
        time: t,
        precipMm: precip[i] ?? 0,
        precipProb: prob[i] ?? 0
      }))
    };
  } catch {
    return null;
  }
}

// ── API: MET Oceanforecast (havsvind för kustnära platser) ──────────────────
async function fetchOceanForecast(lat, lon) {
  try {
    // Testa havspunkt ~5km ut från kusten (rakt västerut för svenska västkusten)
    // För östkusten skulle vi behöva en smartare lösning
    const oceanPoints = [
      { lat: lat, lon: lon - 0.05 },      // ~4km väster
      { lat: lat, lon: lon + 0.05 },      // ~4km öster
      { lat: lat - 0.02, lon: lon },      // ~2km söder
    ];

    for (const pt of oceanPoints) {
      try {
        const res = await fetch(
          'https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=' + pt.lat.toFixed(4) + '&lon=' + pt.lon.toFixed(4)
        );
        if (!res.ok) continue;
        const data = await res.json();

        const ts = data.properties?.timeseries;
        if (!ts?.length) continue;

        // Beräkna distans till havspunkten (ungefärligt)
        const distKm = Math.sqrt(
          Math.pow((pt.lat - lat) * 111, 2) +
          Math.pow((pt.lon - lon) * 111 * Math.cos(lat * Math.PI / 180), 2)
        );

        return {
          source: 'MET Ocean',
          oceanPoint: pt,
          distanceKm: Math.round(distKm * 10) / 10,
          updated: data.properties?.meta?.updated_at,
          current: {
            windSpeed: ts[0]?.data?.instant?.details?.wind_from_direction != null ? {
              speed: ts[0].data.instant.details.wind_speed,
              direction: ts[0].data.instant.details.wind_from_direction,
              dirText: degToDir(ts[0].data.instant.details.wind_from_direction)
            } : null,
            waveHeight: ts[0]?.data?.instant?.details?.sea_surface_wave_height ?? null,
            waterTemp: ts[0]?.data?.instant?.details?.sea_water_temperature ?? null,
          },
          hourly: ts.slice(0, 48).map(e => ({
            time: e.time,
            windSpeed: e.data?.instant?.details?.wind_speed ?? null,
            windDir: e.data?.instant?.details?.wind_from_direction ?? null,
            waveHeight: e.data?.instant?.details?.sea_surface_wave_height ?? null,
            waterTemp: e.data?.instant?.details?.sea_water_temperature ?? null,
          }))
        };
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── API: RainViewer Radar (Global, SMHI-data för Sverige) ───────────────────
async function fetchRainViewerRadar() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!res.ok) {
      console.log('RainViewer API error:', res.status);
      return null;
    }

    const data = await res.json();
    console.log('RainViewer API response:', data);

    if (!data.radar?.past?.length) {
      console.log('RainViewer: No radar frames');
      return null;
    }

    // Bygg frames från past (historik) och nowcast (prognos)
    const host = data.host;
    const frames = [];

    // Historiska frames
    data.radar.past.forEach(f => {
      frames.push({
        time: new Date(f.time * 1000).toISOString(),
        path: f.path,
        url: host + f.path + '/512/{z}/{x}/{y}/2/1_1.png'
      });
    });

    // Prognos-frames (nowcast) om tillgängliga
    if (data.radar.nowcast?.length) {
      data.radar.nowcast.forEach(f => {
        frames.push({
          time: new Date(f.time * 1000).toISOString(),
          path: f.path,
          url: host + f.path + '/512/{z}/{x}/{y}/2/1_1.png',
          forecast: true
        });
      });
    }

    return {
      source: 'RainViewer',
      updated: new Date(data.generated * 1000).toISOString(),
      host: host,
      frames: frames
    };
  } catch (err) {
    console.log('RainViewer error:', err);
    return null;
  }
}


// ── "Känns som" beräkning (Wind Chill / Heat Index) ─────────────────────────
function calcFeelsLike(temp, wind, humidity) {
  // Wind Chill (när det är kallt och blåsigt)
  if (temp <= 10 && wind >= 1.3) {
    // Wind chill formel (Celsius, m/s)
    const windKmh = wind * 3.6;
    const wc = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
    return round1(wc);
  }

  // Heat Index (när det är varmt och fuktigt)
  if (temp >= 27 && humidity >= 40) {
    // Förenklad heat index formel
    const hi = temp + 0.33 * (humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp))) - 4;
    return round1(hi);
  }

  return round1(temp);
}

// ── Generera beskrivande prognos ────────────────────────────────────────────
function generateForecastText(ens, daily, warnings) {
  const temp = ens.current.temp;
  const wind = ens.current.wind;
  const humidity = ens.current.humidity;
  const desc = ens.current.desc.toLowerCase();
  const today = daily[0];
  const tomorrow = daily[1];

  // Dag/natt från API (korrekt baserat på soluppgång/solnedgång)
  const isDay = ens.current.isDay ?? true;
  const isNight = !isDay;

  // Tid på dygnet för tidsangivelse i texten
  const hour = new Date().getHours();
  const isMorning = hour >= 6 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 18;
  const isEvening = hour >= 18 && hour < 22;

  // Temperaturkänsla
  let tempFeel = '';
  if (temp < -10) tempFeel = 'mycket kallt';
  else if (temp < 0) tempFeel = 'kallt';
  else if (temp < 10) tempFeel = 'svalt';
  else if (temp < 18) tempFeel = 'behagligt';
  else if (temp < 25) tempFeel = 'varmt';
  else tempFeel = 'mycket varmt';

  // Bygg huvudbeskrivning
  let main = '';
  if (desc.includes('regn') && desc.includes('lätt')) {
    main = 'Lätt regn och ' + tempFeel;
  } else if (desc.includes('regn')) {
    main = 'Regnigt och ' + tempFeel;
  } else if (desc.includes('snö')) {
    main = 'Snöfall och ' + tempFeel;
  } else if (desc.includes('dimma')) {
    main = 'Dimmigt och ' + tempFeel;
  } else if (desc.includes('molnigt') || desc.includes('mulet')) {
    main = 'Molnigt och ' + tempFeel;
  } else if (desc.includes('delvis')) {
    main = 'Växlande molnighet, ' + tempFeel;
  } else if (desc.includes('klart') || desc.includes('sol')) {
    if (isNight) {
      main = 'Klar himmel och ' + tempFeel;
    } else {
      main = 'Soligt och ' + tempFeel;
    }
  } else {
    main = ens.current.desc + ', ' + tempFeel;
  }

  // Lägg till tid
  if (isMorning) main += ' under morgonen';
  else if (isAfternoon) main += ' under eftermiddagen';
  else if (isEvening) main += ' ikväll';
  else if (hour < 6) main += ' under natten';
  main += '.';

  // Vindkommentar
  if (wind > 10) {
    main += ' Kraftig vind.';
  } else if (wind > 6) {
    main += ' Blåsigt.';
  }

  // Jämförelse med imorgon
  if (tomorrow && today) {
    const tempDiff = tomorrow.tempMax - today.tempMax;
    if (tempDiff <= -5) {
      main += ' Betydligt kallare imorgon.';
    } else if (tempDiff <= -3) {
      main += ' Kallare imorgon – ta med extra lager.';
    } else if (tempDiff >= 5) {
      main += ' Betydligt varmare imorgon.';
    } else if (tempDiff >= 3) {
      main += ' Varmare imorgon.';
    }

    // Nederbörd imorgon
    if (tomorrow.precipProb > 70) {
      main += ' Trolig nederbörd imorgon.';
    } else if (tomorrow.precipProb > 50) {
      main += ' Risk för nederbörd imorgon.';
    }
  }

  return main;
}

// ── Ensemble Calculation ───────────────────────────────────────────────────
function calcEnsemble(results) {
  const ok = results.filter(r => r.status === 'ok');
  if (!ok.length) throw new Error('Alla väderservicerna misslyckades');

  // Hjälpfunktion för standardavvikelse
  const calcStdDev = (values) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  };

  // Hjälpfunktion för medelvärde
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Extrahera alla parametrar
  const temps     = ok.map(r => r.current.temp);
  const winds     = ok.map(r => r.current.wind);
  const windGusts = ok.map(r => r.current.windGust).filter(g => g > 0);
  const windDegs  = ok.map(r => r.current.windDeg).filter(d => d != null);
  const humidities= ok.map(r => r.current.humidity);
  const pressures = ok.map(r => r.current.pressure).filter(p => p > 0);
  const precips   = ok.map(r => r.current.precip);

  // Beräkna medelvärden
  const avgTemp   = avg(temps);
  const avgWind   = avg(winds);
  const avgGust   = windGusts.length ? avg(windGusts) : 0;
  const avgWindDeg= circularMean(windDegs);
  const avgHumid  = avg(humidities);
  const avgPressure = pressures.length ? Math.round(avg(pressures)) : 0;
  const avgPrecip = avg(precips);

  // Beräkna standardavvikelser för konfidensberäkning
  const tempStdDev  = calcStdDev(temps);
  const windStdDev  = calcStdDev(winds);
  const humidStdDev = calcStdDev(humidities);

  // Kombinerad konfidensberäkning baserad på flera parametrar
  let pct;
  if (ok.length === 1) {
    pct = 75; // En källa → medelhög konfidens
  } else {
    const tempPenalty  = Math.min(tempStdDev * 15, 40);
    const windPenalty  = Math.min(windStdDev * 8, 25);
    const humidPenalty = Math.min(humidStdDev * 0.5, 15);
    const sourceBonus = (ok.length - 2) * 5;
    pct = Math.max(5, Math.min(100, Math.round(
      100 - tempPenalty - windPenalty - humidPenalty + sourceBonus
    )));
  }

  const cls   = pct >= 70 ? 'confidence-high'   : pct >= 40 ? 'confidence-medium'   : 'confidence-low';
  const label = pct >= 70 ? 'Hög'               : pct >= 40 ? 'Måttlig'              : 'Låg';

  // Use Open-Meteo as primary for hourly/daily (best coverage) and icon/desc
  const primary = ok.find(r => r.source === 'Open-Meteo') || ok[0];

  // ── Ensemble för timprognos ─────────────────────────────────────────────
  // Slå ihop Open-Meteo och YR:s timdata där tidsstämplar matchar
  const hourlyByTime = new Map();
  ok.forEach(r => {
    if (!r.hourly?.length) return;
    r.hourly.forEach(h => {
      // Normalisera tidsstämpel till timme (ta bort minuter/sekunder)
      const key = h.time.slice(0, 13); // "2024-01-15T14"
      if (!hourlyByTime.has(key)) {
        hourlyByTime.set(key, {
          temps: [], winds: [], humids: [], precips: [], precipMms: [],
          icons: [], descs: [], primary: null,
          sourceData: []  // Detaljerad data per källa för jämförelse
        });
      }
      const entry = hourlyByTime.get(key);
      entry.temps.push(h.temp);
      if (h.wind != null) entry.winds.push(h.wind);
      if (h.humidity != null) entry.humids.push(h.humidity);
      if (h.precip != null) entry.precips.push(h.precip);
      if (h.precipMm != null) entry.precipMms.push(h.precipMm);
      if (h.icon) entry.icons.push(h.icon);
      if (h.desc) entry.descs.push(h.desc);
      // Spara källdata för jämförelsevy
      entry.sourceData.push({
        source: r.source,
        temp: h.temp,
        icon: h.icon,
        desc: h.desc,
        wind: h.wind,
        precip: h.precip,
        precipMm: h.precipMm,
        humidity: h.humidity
      });
      // Spara primary (Open-Meteo) för fallback
      if (r.source === 'Open-Meteo' || !entry.primary) {
        entry.primary = h;
      }
    });
  });

  // Bygg ensemble timprognos
  const ensembleHourly = Array.from(hourlyByTime.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, data]) => {
      const p = data.primary;
      const sourceCount = data.temps.length;
      const precipArr = data.precipMms.filter(v => v != null);
      const windArr = data.winds.filter(v => v != null);
      const tempArr = data.temps.filter(v => v != null);
      return {
        time:       p.time,
        temp:       tempArr.length ? round1(avg(tempArr)) : (p.temp ?? 0),
        tempMin:    tempArr.length ? round1(Math.min(...tempArr)) : null,
        tempMax:    tempArr.length ? round1(Math.max(...tempArr)) : null,
        icon:       pickBestIcon(data.icons, false),  // Optimistisk ikon, behåll nattikoner för timprognos
        desc:       p.desc,
        precip:     data.precips.length ? Math.round(avg(data.precips)) : (p.precip ?? 0),
        precipMm:   precipArr.length ? round1(avg(precipArr)) : (p.precipMm ?? 0),
        precipMin:  precipArr.length ? round1(Math.min(...precipArr)) : 0,
        precipMax:  precipArr.length ? round1(Math.max(...precipArr)) : 0,
        wind:       windArr.length ? round1(avg(windArr)) : (p.wind ?? 0),
        windMin:    windArr.length ? round1(Math.min(...windArr)) : null,
        windMax:    windArr.length ? round1(Math.max(...windArr)) : null,
        windDir:    p.windDir,
        humidity:   data.humids.length ? Math.round(avg(data.humids)) : (p.humidity ?? 0),
        uv:         p.uv ?? 0,
        sources:    sourceCount,
        sourceData: data.sourceData,  // Detaljerad data per källa
      };
    });

  // ── Ensemble för dagsprognos ──────────────────────────────────────────────
  // Aggregera timdata per dag och källa för att få ensemble på dagsnivå
  const dailyByDateSource = new Map();  // date -> source -> hourly data
  ok.forEach(r => {
    if (!r.hourly?.length) return;
    r.hourly.forEach(h => {
      const date = h.time.slice(0, 10);
      if (!dailyByDateSource.has(date)) {
        dailyByDateSource.set(date, new Map());
      }
      const dayData = dailyByDateSource.get(date);
      if (!dayData.has(r.source)) {
        dayData.set(r.source, { temps: [], winds: [], precips: [] });
      }
      const entry = dayData.get(r.source);
      entry.temps.push(h.temp);
      if (h.wind != null) entry.winds.push(h.wind);
      if (h.precipMm != null) entry.precips.push(h.precipMm);
    });
  });

  // Aggregera också från ensembleHourly för bakåtkompatibilitet
  const dailyByDate = new Map();
  ensembleHourly.forEach(h => {
    const date = h.time.slice(0, 10);
    if (!dailyByDate.has(date)) {
      dailyByDate.set(date, { temps: [], winds: [], precips: [], humids: [], icons: [], sourceCount: 0 });
    }
    const entry = dailyByDate.get(date);
    entry.temps.push(h.temp);
    entry.winds.push(h.wind);
    entry.precips.push(h.precipMm);
    entry.humids.push(h.humidity);
    if (h.icon) entry.icons.push(h.icon);
    entry.sourceCount = Math.max(entry.sourceCount, h.sources || 1);
  });

  // Slå ihop med Open-Meteo:s dagsprognos (som har icon och precipProb)
  const ensembleDaily = (primary.daily || []).map(d => {
    const hourlyData = dailyByDate.get(d.time);
    const sourceData = dailyByDateSource.get(d.time);
    const sourceCount = sourceData ? sourceData.size : 1;

    if (hourlyData && hourlyData.temps.length >= 4) {
      // Har tillräckligt med timdata för att ensembla
      const allTemps = hourlyData.temps;
      const avgTempMin = round1(Math.min(...allTemps));
      const avgTempMax = round1(Math.max(...allTemps));
      const avgWind = round1(avg(hourlyData.winds));
      const totalPrecip = round1(hourlyData.precips.reduce((a, b) => a + b, 0));

      // Vikta baserat på antal källor
      const weight = sourceCount > 1 ? 0.5 : 0.3;
      // Välj optimistisk ikon från dagens timdata
      const bestIcon = hourlyData.icons.length ? pickBestIcon(hourlyData.icons) : d.icon;
      return {
        ...d,
        tempMin: round1(d.tempMin * (1 - weight) + avgTempMin * weight),
        tempMax: round1(d.tempMax * (1 - weight) + avgTempMax * weight),
        wind:    round1(d.wind * (1 - weight) + avgWind * weight),
        precip:  round1(d.precip * (1 - weight) + totalPrecip * weight),
        icon:    bestIcon,
        uvMax:   d.uvMax ?? 0,
        sources: sourceCount,
      };
    }
    return { ...d, uvMax: d.uvMax ?? 0, sources: sourceCount };
  });

  // Beräkna "känns som" temperatur
  const feelsLike = calcFeelsLike(avgTemp, avgWind, avgHumid);

  return {
    current: {
      temp:     round1(avgTemp),
      feelsLike: feelsLike,
      wind:     round1(avgWind),
      windGust: round1(avgGust),
      windDir:  avgWindDeg != null ? degToDir(avgWindDeg) : primary.current.windDir,
      humidity: Math.round(avgHumid),
      pressure: avgPressure,
      precip:   round1(avgPrecip),
      uv:       primary.current.uv ?? 0,  // UV endast från Open-Meteo
      icon:     primary.current.icon,
      desc:     primary.current.desc,
      isDay:    primary.current.isDay ?? true,  // Dag/natt från Open-Meteo
    },
    confidence: { pct, cls, label },
    hourly:  ensembleHourly.length ? ensembleHourly : primary.hourly,
    daily:   ensembleDaily.length ? ensembleDaily : primary.daily,
    sources: ok.length,
    stdDevs: { temp: round1(tempStdDev), wind: round1(windStdDev), humid: round1(humidStdDev) },
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────
// ── Analysera nowcast-risk (kombinerar radar + modelldata) ──────────────────
function analyzeNowcastRisk(yrNowcast, omMinutely, currentTemp, radarData) {
  const now = new Date();
  let precipData = [];
  let hasRadarNowcast = false;

  // Samla data från YR Nowcast (0-2h, radar-baserad)
  if (yrNowcast?.data?.length) {
    yrNowcast.data.forEach(d => {
      const t = new Date(d.time);
      const minsAhead = (t - now) / (1000 * 60);
      if (minsAhead >= -5 && minsAhead <= 120) {
        precipData.push({
          time: t,
          minsAhead: Math.round(minsAhead),
          precipRate: d.precipRate || 0,  // mm/h
          source: 'yr-radar'
        });
      }
    });
    hasRadarNowcast = true;
  }

  // Lägg till Open-Meteo minutely (0-2h)
  if (omMinutely?.data?.length) {
    omMinutely.data.forEach(d => {
      const t = new Date(d.time);
      const minsAhead = (t - now) / (1000 * 60);
      if (minsAhead >= -5 && minsAhead <= 120) {
        precipData.push({
          time: t,
          minsAhead: Math.round(minsAhead),
          precipRate: (d.precipMm || 0) * 4,  // 15-min -> mm/h approximation
          source: 'om-model'
        });
      }
    });
  }

  // Kolla om RainViewer har nowcast-frames (radar-prognos)
  let hasRainViewerNowcast = false;
  if (radarData?.frames?.length) {
    const forecastFrames = radarData.frames.filter(f => f.forecast);
    if (forecastFrames.length > 0) {
      hasRainViewerNowcast = true;
    }
  }

  if (precipData.length < 2) return null;

  // Sortera efter tid
  precipData.sort((a, b) => a.minsAhead - b.minsAhead);

  // Analysera kommande nederbörd
  const next15min = precipData.filter(d => d.minsAhead >= 0 && d.minsAhead <= 15);
  const next30min = precipData.filter(d => d.minsAhead >= 0 && d.minsAhead <= 30);
  const next60min = precipData.filter(d => d.minsAhead >= 0 && d.minsAhead <= 60);
  const next120min = precipData.filter(d => d.minsAhead >= 0 && d.minsAhead <= 120);

  const maxRate15 = Math.max(...next15min.map(d => d.precipRate), 0);
  const maxRate30 = Math.max(...next30min.map(d => d.precipRate), 0);
  const maxRate60 = Math.max(...next60min.map(d => d.precipRate), 0);
  const maxRate120 = Math.max(...next120min.map(d => d.precipRate), 0);

  // Hitta när nederbörden börjar
  const firstPrecip = precipData.find(d => d.minsAhead > 0 && d.precipRate >= 0.5);
  const precipStartsIn = firstPrecip ? firstPrecip.minsAhead : null;

  // Avgör nederbördstyp baserat på temperatur
  const temp = currentTemp ?? 5;
  let precipType = 'regn';
  let precipTypeIcon = '🌧️';
  if (temp <= -1) {
    precipType = 'snö';
    precipTypeIcon = '🌨️';
  } else if (temp <= 2) {
    precipType = 'snöblandat regn';
    precipTypeIcon = '🌨️';
  }

  // Beräkna varaktighet - hur länge pågår nederbörden
  function calcDuration(startIdx) {
    if (startIdx < 0) return null;
    let endIdx = startIdx;
    for (let i = startIdx; i < precipData.length; i++) {
      if (precipData[i].precipRate >= 0.3) {
        endIdx = i;
      } else {
        break;
      }
    }
    const startMins = precipData[startIdx].minsAhead;
    const endMins = precipData[endIdx].minsAhead;
    return endMins - startMins;
  }

  // Intensitetsbeskrivning
  function intensityText(rate) {
    if (rate >= 10) return 'kraftigt';
    if (rate >= 4) return 'måttligt';
    if (rate >= 1) return 'lätt';
    return 'mycket lätt';
  }

  // Kolla om det regnar nu
  const currentPrecip = precipData.filter(d => d.minsAhead >= -5 && d.minsAhead <= 5);
  const isRainingNow = currentPrecip.some(d => d.precipRate >= 0.5);
  const currentRate = Math.max(...currentPrecip.map(d => d.precipRate), 0);

  let risk = null;
  let icon = '';
  let text = '';
  let subtext = '';
  let color = '';

  if (isRainingNow) {
    // Det regnar just nu - visa när det slutar
    const endIdx = precipData.findIndex(d => d.minsAhead > 5 && d.precipRate < 0.2);
    const endsIn = endIdx >= 0 ? precipData[endIdx].minsAhead : null;

    if (maxRate30 >= 10) {
      risk = 'high';
      icon = '⛈️';
      text = precipType === 'snö' ? 'Ymnigt snöfall pågår' : 'Skyfall pågår';
      color = 'var(--confidence-low)';
    } else if (endsIn && endsIn <= 30) {
      risk = 'ending';
      icon = '🌤️';
      text = 'Uppehåll om ~' + endsIn + ' min';
      subtext = intensityText(currentRate) + ' ' + precipType + ' just nu';
      color = 'var(--confidence-high)';
    } else if (endsIn && endsIn <= 60) {
      risk = 'ongoing';
      icon = precipTypeIcon;
      const intens = intensityText(currentRate);
      text = intens.charAt(0).toUpperCase() + intens.slice(1) + ' ' + precipType;
      subtext = 'slutar om ~' + endsIn + ' min';
      color = 'var(--accent-rain)';
    } else {
      risk = 'ongoing';
      icon = precipTypeIcon;
      const intens = intensityText(currentRate);
      text = intens.charAt(0).toUpperCase() + intens.slice(1) + ' ' + precipType + ' pågår';
      color = 'var(--accent-rain)';
    }
  } else if (precipStartsIn !== null) {
    // Nederbörd på väg
    const startIdx = precipData.findIndex(d => d.minsAhead > 0 && d.precipRate >= 0.5);
    const duration = calcDuration(startIdx);
    const peakRate = Math.max(maxRate30, maxRate60);
    const intens = intensityText(peakRate);

    if (maxRate30 >= 10 || maxRate60 >= 15) {
      risk = 'high';
      icon = '⛈️';
      if (precipType === 'snö') {
        text = 'Ymnigt snöfall om ~' + precipStartsIn + ' min';
      } else {
        text = 'Skyfall om ~' + precipStartsIn + ' min';
      }
      if (duration && duration > 10) {
        subtext = 'varar i ~' + duration + ' min';
      }
      color = 'var(--confidence-low)';
    } else if (maxRate30 >= 4 || maxRate60 >= 6) {
      risk = 'medium';
      icon = precipTypeIcon;
      text = 'Kraftigt ' + precipType + ' om ~' + precipStartsIn + ' min';
      if (duration && duration > 10) {
        subtext = 'varar i ~' + duration + ' min';
      }
      color = 'var(--confidence-medium)';
    } else if (precipStartsIn <= 15 && maxRate15 >= 0.5) {
      risk = 'imminent';
      icon = precipTypeIcon;
      const capType = precipType.charAt(0).toUpperCase() + precipType.slice(1);
      text = capType + ' inom kort';
      if (duration && duration >= 15) {
        subtext = intens + ', varar i ~' + duration + ' min';
      } else {
        subtext = intens + ' ' + precipType;
      }
      color = 'var(--accent-rain)';
    } else if (precipStartsIn <= 30) {
      risk = 'low';
      icon = precipTypeIcon;
      const capType = precipType.charAt(0).toUpperCase() + precipType.slice(1);
      text = capType + ' om ~' + precipStartsIn + ' min';
      if (duration && duration >= 15) {
        subtext = intens + ', varar i ~' + duration + ' min';
      }
      color = 'var(--accent-rain)';
    } else if (precipStartsIn <= 60) {
      risk = 'info';
      icon = '🌦️';
      text = precipType.charAt(0).toUpperCase() + precipType.slice(1) + ' om ~' + Math.round(precipStartsIn / 5) * 5 + ' min';
      color = 'var(--text-secondary)';
    } else if (maxRate120 >= 0.5) {
      risk = 'info';
      icon = '🌦️';
      text = precipType.charAt(0).toUpperCase() + precipType.slice(1) + ' om ~' + Math.round(precipStartsIn / 10) * 10 + ' min';
      color = 'var(--text-secondary)';
    }
  }

  if (!risk) return null;

  // Bestäm datakälla-indikator
  const hasRadar = hasRadarNowcast || hasRainViewerNowcast;
  let sourceIndicator = hasRadar ? '📡' : '🔮';

  return {
    risk,
    icon,
    text,
    subtext,
    color,
    hasRadar,
    hasRainViewerNowcast,
    sourceIndicator,
    maxRate: Math.max(maxRate30, maxRate60),
    isRainingNow,
    precipStartsIn
  };
}

function renderCurrent(ens, iconEuEns, nowcastRisk, oceanForecast) {
  currentIcon.textContent   = ens.current.icon;
  currentTemp.textContent   = ens.current.temp;
  currentDesc.textContent   = ens.current.desc;

  // Nowcast-risk indikator (regn/snö på väg)
  let riskEl = document.getElementById('nowcastRiskIndicator');
  if (!riskEl) {
    riskEl = document.createElement('div');
    riskEl.id = 'nowcastRiskIndicator';
    riskEl.className = 'nowcast-risk-indicator';
    currentDesc.parentElement.insertBefore(riskEl, currentDesc.nextSibling);
  }

  if (nowcastRisk) {
    let riskHtml = '<span class="risk-icon">' + nowcastRisk.icon + '</span>' +
      '<span class="risk-text" style="color:' + nowcastRisk.color + '">' + nowcastRisk.text + '</span>';
    if (nowcastRisk.subtext) {
      riskHtml += '<span class="risk-subtext">' + nowcastRisk.subtext + '</span>';
    }
    riskHtml += '<span class="risk-source">' + nowcastRisk.sourceIndicator + '</span>';
    riskEl.innerHTML = riskHtml;
    riskEl.style.display = 'flex';
  } else {
    riskEl.style.display = 'none';
  }

  // Havsvind-indikator för kustnära platser
  let oceanWindEl = document.getElementById('oceanWindIndicator');
  if (!oceanWindEl) {
    oceanWindEl = document.createElement('div');
    oceanWindEl.id = 'oceanWindIndicator';
    oceanWindEl.className = 'ocean-wind-indicator';
    // Lägg till efter risk-indikatorn eller efter desc
    const insertAfter = riskEl || currentDesc;
    insertAfter.parentElement.insertBefore(oceanWindEl, insertAfter.nextSibling);
  }

  if (oceanForecast?.current?.windSpeed) {
    const ow = oceanForecast.current.windSpeed;
    oceanWindEl.innerHTML = '<span class="ocean-icon">🌊</span>' +
      '<span class="ocean-text">Havsvind ' + Math.round(ow.speed) + ' m/s ' + ow.dirText + '</span>' +
      '<span class="ocean-dist">(' + oceanForecast.distanceKm + ' km)</span>';
    oceanWindEl.style.display = 'flex';
  } else {
    oceanWindEl.style.display = 'none';
  }

  // Känns som (visa bara om skillnad > 1 grad)
  const feelsDiff = Math.abs(ens.current.feelsLike - ens.current.temp);
  if (currentFeels) {
    if (feelsDiff >= 1) {
      currentFeels.textContent = 'Känns som ' + ens.current.feelsLike + '°';
      currentFeels.style.display = 'block';
    } else {
      currentFeels.style.display = 'none';
    }
  }

  // Vind med byvind - använd ICON-EU ensemble + havsvind om tillgängligt
  let windValues = [ens.current.wind];
  let windDir = ens.current.windDir || '';

  // Lägg till ICON-EU ensemble
  if (iconEuEns?.current?.wind) {
    const w = iconEuEns.current.wind;
    windValues.push(w.min, w.max);
  }

  // Lägg till havsvind för kustnära platser (viktat lägre)
  if (oceanForecast?.current?.windSpeed) {
    const oceanWind = oceanForecast.current.windSpeed.speed;
    // Havsvind påverkar ensemble men viktas baserat på avstånd
    const weight = Math.max(0.3, 1 - (oceanForecast.distanceKm / 15));
    const blendedOcean = ens.current.wind * (1 - weight) + oceanWind * weight;
    windValues.push(Math.round(blendedOcean));
  }

  const minWind = Math.min(...windValues);
  const maxWind = Math.max(...windValues);
  let windText = minWind !== maxWind ? minWind + '-' + maxWind + ' m/s' : minWind + ' m/s';

  // Lägg till havsvind-ikon om det påverkar
  if (oceanForecast?.current?.windSpeed && oceanForecast.distanceKm < 10) {
    windText += ' 🌊';
  }

  const gustText = ens.current.windGust > maxWind
    ? ' (' + ens.current.windGust + ')'
    : '';
  currentWind.textContent = windText + gustText + ' ' + windDir;

  currentHumid.textContent  = ens.current.humidity + ' %';

  // Nederbörd - använd ICON-EU ensemble om tillgängligt
  let precipText = ens.current.precip + ' mm';
  if (iconEuEns?.current?.precip) {
    const p = iconEuEns.current.precip;
    if (p.max > 0 && p.min !== p.max) {
      precipText = p.min + '-' + p.max + ' mm';
    } else if (p.mean > 0) {
      precipText = p.mean + ' mm';
    }
    // Lägg till sannolikhet om relevant
    if (iconEuEns.current.precipProb != null && iconEuEns.current.precipProb > 0 && iconEuEns.current.precipProb < 100) {
      precipText += ' (' + iconEuEns.current.precipProb + '%)';
    }
  }
  currentPrecip.textContent = precipText;

  // Lufttryck
  if (currentPressure && ens.current.pressure > 0) {
    currentPressure.textContent = ens.current.pressure + ' hPa';
  }

  // UV-index (visa endast dagtid när UV > 0)
  if (currentUV) {
    const uv = ens.current.uv ?? 0;
    if (uv > 0) {
      const uvInfo = getUVLevel(uv);
      currentUV.innerHTML = '<span style="color:' + uvInfo.color + '">UV ' + uv + '</span>';
      currentUV.parentElement.style.display = '';
    } else {
      currentUV.parentElement.style.display = 'none';
    }
  }

  confValue.textContent     = ens.confidence.label + ' (' + ens.confidence.pct + ' %)';
  confFill.style.width      = ens.confidence.pct + '%';
  confFill.className        = 'confidence-fill ' + ens.confidence.cls;
}

// ── Render Varningar ────────────────────────────────────────────────────────
function renderWarnings(warnings) {
  if (!warningsSection) return;
  if (!warnings || warnings.length === 0) {
    warningsSection.style.display = 'none';
    return;
  }

  warningsSection.style.display = 'block';
  const colorEmoji = { red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢' };

  warningsSection.innerHTML =
    '<h3 class="section-title">⚠️ Vädervarningar</h3>' +
    '<div class="warnings-list">' +
    warnings.map(w =>
      '<div class="warning-item warning-' + w.color + '">' +
      '<span class="warning-icon">' + (colorEmoji[w.color] || '🟡') + '</span>' +
      '<div class="warning-content">' +
      '<div class="warning-headline">' + w.headline + '</div>' +
      '<div class="warning-area">' + w.areaDesc + '</div>' +
      '</div>' +
      '</div>'
    ).join('') +
    '</div>';
}

// ── Render Luftkvalitet ─────────────────────────────────────────────────────
function renderAirQuality(aq, pollen) {
  if (!airQualitySection) return;
  if (!aq && (!pollen || pollen.length === 0)) {
    airQualitySection.style.display = 'none';
    return;
  }

  airQualitySection.style.display = 'block';

  // Collapsible header med AQI-värde i färg (samma stil som Datakällor)
  const aqiPreview = aq ? ' · <span style="color:' + aq.color + '">AQI ' + aq.aqi + '</span>' : '';
  let html = '<h3 class="section-title section-toggle" id="airQualityToggle">Luftkvalitet' + aqiPreview + ' <span class="toggle-icon">▼</span></h3>';
  html += '<div class="air-quality-content">';

  if (aq) {
    const barWidth = Math.min(aq.aqi, 100);

    // Ensemble info (Copernicus CAMS) - kompakt en rad
    const ensembleInfo = aq.sourceCount > 1
      ? '<div class="aqi-ensemble">' +
        '<span class="ensemble-badge">Copernicus CAMS Ensemble</span>' +
        '<span class="ensemble-sources">' + aq.sources.join(' + ') + '</span>' +
        (aq.spread > 0 ? '<span class="ensemble-spread">±' + aq.spread + '</span>' : '') +
        '</div>'
      : '<div class="aqi-ensemble"><span class="ensemble-badge">' + (aq.sources?.[0] || 'CAMS') + '</span></div>';

    html += ensembleInfo +
      '<div class="aqi-main">' +
      '<div class="aqi-value" style="color:' + aq.color + '">AQI ' + aq.aqi + '</div>' +
      '<div class="aqi-label">' + aq.category + '</div>' +
      '<div class="aqi-bar"><div class="aqi-fill" style="width:' + barWidth + '%;background:' + aq.color + '"></div></div>' +
      '</div>' +
      '<div class="aqi-details">' +
      '<span>PM2.5: ' + aq.pm25 + ' µg/m³</span>' +
      '<span>PM10: ' + aq.pm10 + ' µg/m³</span>' +
      '<span>O₃: ' + aq.o3 + ' µg/m³</span>' +
      '<span>NO₂: ' + aq.no2 + ' µg/m³</span>' +
      (aq.so2 != null ? '<span>SO₂: ' + aq.so2 + ' µg/m³</span>' : '') +
      (aq.co != null ? '<span>CO: ' + aq.co + ' µg/m³</span>' : '') +
      '</div>';
  }

  if (pollen && pollen.length > 0) {
    html += '<div class="pollen-section">' +
      '<div class="pollen-title">🌸 Pollen</div>' +
      '<div class="pollen-list">' +
      pollen.map(p =>
        '<span class="pollen-item" style="color:' + p.color + '">' + p.name + ': ' + p.level + '</span>'
      ).join('') +
      '</div></div>';
  }

  html += '</div>';
  airQualitySection.innerHTML = html;

  // Add toggle listener
  const toggle = document.getElementById('airQualityToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      airQualitySection.classList.toggle('open');
    });
  }
}

// ── Render UV-index sektion ─────────────────────────────────────────────────
function renderUV(hourly) {
  if (!uvSection) return;

  // Filtrera ut timmar med UV > 0 (dagtid) för de närmaste 24 timmarna
  const now = new Date();
  const uvHours = (hourly || [])
    .filter(h => {
      const hTime = new Date(h.time);
      const hoursAhead = (hTime - now) / (1000 * 60 * 60);
      return hoursAhead >= -1 && hoursAhead <= 24 && (h.uv ?? 0) > 0;
    })
    .slice(0, 14);

  // Om inga UV-värden > 0, dölj sektionen
  if (!uvHours.length) {
    uvSection.style.display = 'none';
    return;
  }

  uvSection.style.display = 'block';

  // Hitta max UV för skalning (minst 3 för bättre visualisering)
  const maxUV = Math.max(...uvHours.map(h => h.uv), 3);
  const currentUVVal = uvHours[0]?.uv ?? 0;
  const uvInfo = getUVLevel(currentUVVal);

  // Bygg HTML
  let html = '<h3 class="section-title section-toggle" id="uvToggle">' +
    'UV-index · <span style="color:' + uvInfo.color + '">' + currentUVVal + ' ' + uvInfo.level + '</span>' +
    ' <span class="toggle-icon">▼</span></h3>';

  html += '<div class="uv-content">';

  // SVG linjediagram
  const width = 100;
  const height = 50;
  const padding = 2;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const stepX = graphWidth / (uvHours.length - 1 || 1);

  // Skapa punkter för linjen
  const points = uvHours.map((h, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (h.uv / maxUV) * graphHeight;
    return { x, y, uv: h.uv, time: h.time.match(/T(\d{2})/)?.[1] ?? '', idx: i };
  });

  // Skapa path för linjen
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  // Skapa gradient fill path
  const fillPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (height - padding) +
    ' L' + padding + ',' + (height - padding) + ' Z';

  html += '<div class="uv-chart-container" id="uvChartContainer">';

  // Tooltip för interaktivitet
  html += '<div class="uv-tooltip" id="uvTooltip" style="display:none">' +
    '<span class="uv-tooltip-value" id="uvTooltipValue">0</span>' +
    '<span class="uv-tooltip-time" id="uvTooltipTime">00:00</span>' +
    '</div>';

  // Vertikal indikatorlinje
  html += '<div class="uv-indicator" id="uvIndicator" style="display:none"></div>';

  html += '<svg class="uv-line-chart" id="uvLineChart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">';

  // Gradient definition
  html += '<defs><linearGradient id="uvGradient" x1="0%" y1="0%" x2="0%" y2="100%">' +
    '<stop offset="0%" style="stop-color:' + uvInfo.color + ';stop-opacity:0.4"/>' +
    '<stop offset="100%" style="stop-color:' + uvInfo.color + ';stop-opacity:0.05"/>' +
    '</linearGradient></defs>';

  // Horisontella linjer för nivåer
  [3, 6, 8, 11].forEach(level => {
    if (level <= maxUV) {
      const y = height - padding - (level / maxUV) * graphHeight;
      const color = getUVLevel(level).color;
      html += '<line x1="' + padding + '" y1="' + y.toFixed(1) + '" x2="' + (width - padding) + '" y2="' + y.toFixed(1) +
        '" stroke="' + color + '" stroke-width="0.3" stroke-dasharray="1,1" opacity="0.5"/>';
    }
  });

  // Fyllning under linjen
  html += '<path d="' + fillPath + '" fill="url(#uvGradient)"/>';

  // Linjen
  html += '<path d="' + linePath + '" fill="none" stroke="' + uvInfo.color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

  // Punkter med färg baserat på UV-nivå
  points.forEach((p, i) => {
    const lvl = getUVLevel(p.uv);
    html += '<circle class="uv-point" data-idx="' + i + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="' + lvl.color + '" stroke="var(--bg-deep)" stroke-width="1"/>';
  });

  html += '</svg>';

  // Tidsetiketter under grafen
  html += '<div class="uv-time-labels">';
  points.forEach((p, i) => {
    // Visa färre etiketter för tydlighet
    const showLabel = i === 0 || i === points.length - 1 ||
      (points.length <= 7) ||
      (points.length <= 10 && i % 2 === 0) ||
      (points.length > 10 && i % 3 === 0);
    if (showLabel) {
      const leftPercent = (p.x / width) * 100;
      html += '<span class="uv-time-label" style="left:' + leftPercent.toFixed(1) + '%">' + p.time + '</span>';
    }
  });
  html += '</div>';

  html += '</div>'; // uv-chart-container

  // Färgkodning/legend under diagrammet
  html += '<div class="uv-legend">' +
    '<span class="uv-legend-item" style="background:#4ade80">1-2 Låg</span>' +
    '<span class="uv-legend-item" style="background:#fbbf24">3-5 Måttlig</span>' +
    '<span class="uv-legend-item" style="background:#f97316">6-7 Hög</span>' +
    '<span class="uv-legend-item" style="background:#ef4444">8-10 Mkt hög</span>' +
    '<span class="uv-legend-item" style="background:#a855f7">11+ Extrem</span>' +
    '</div>';

  // Skyddstips baserat på max UV under dagen
  const maxUVToday = Math.max(...uvHours.map(h => h.uv));
  const tips = maxUVToday >= 8 ? 'Undvik solen mitt på dagen. Använd solskydd, kläder och solglasögon.'
    : maxUVToday >= 6 ? 'Skydda dig med solkräm, hatt och solglasögon.'
    : maxUVToday >= 3 ? 'Använd solskydd vid längre utevistelse.'
    : 'Låg UV-strålning, minimalt solskydd behövs.';

  html += '<div class="uv-tip">' + tips + '</div>';
  html += '</div>';

  uvSection.innerHTML = html;

  // Add toggle listener
  const toggle = document.getElementById('uvToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      uvSection.classList.toggle('open');
    });
  }

  // Touch/mouse interaktion för diagrammet
  const container = document.getElementById('uvChartContainer');
  const tooltip = document.getElementById('uvTooltip');
  const tooltipValue = document.getElementById('uvTooltipValue');
  const tooltipTime = document.getElementById('uvTooltipTime');
  const indicator = document.getElementById('uvIndicator');

  if (container && tooltip && indicator) {
    const updateTooltip = (clientX) => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const idx = Math.round(percent * (points.length - 1));
      const point = points[idx];

      if (point) {
        const lvl = getUVLevel(point.uv);
        tooltipValue.textContent = 'UV ' + point.uv;
        tooltipValue.style.color = lvl.color;
        tooltipTime.textContent = point.time + ':00';

        // Positionera tooltip
        const leftPercent = (point.x / width) * 100;
        tooltip.style.left = leftPercent + '%';
        tooltip.style.display = 'flex';

        // Positionera indikator
        indicator.style.left = leftPercent + '%';
        indicator.style.display = 'block';
        indicator.style.background = lvl.color;
      }
    };

    const hideTooltip = () => {
      tooltip.style.display = 'none';
      indicator.style.display = 'none';
    };

    // Touch events
    container.addEventListener('touchstart', (e) => {
      e.preventDefault();
      updateTooltip(e.touches[0].clientX);
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      e.preventDefault();
      updateTooltip(e.touches[0].clientX);
    }, { passive: false });

    container.addEventListener('touchend', hideTooltip);

    // Mouse events
    container.addEventListener('mouseenter', (e) => updateTooltip(e.clientX));
    container.addEventListener('mousemove', (e) => updateTooltip(e.clientX));
    container.addEventListener('mouseleave', hideTooltip);
  }
}

// ── Render Nowcast (Nederbördsanalys) ───────────────────────────────────────
function renderNowcast(yrNowcast, omMinutely) {
  if (!nowcastSection) return;

  const now = new Date();
  let combinedData = [];

  // Kombinera YR Nowcast (0-2h, högre upplösning) med Open-Meteo (2-6h)
  if (yrNowcast?.data?.length) {
    // YR ger precipitation_rate i mm/h, konvertera till mm per 5-min intervall
    yrNowcast.data.forEach(d => {
      const t = new Date(d.time);
      const hoursAhead = (t - now) / (1000 * 60 * 60);
      if (hoursAhead >= -0.1 && hoursAhead <= 2) {
        combinedData.push({
          time: t,
          precipMm: (d.precipRate / 12) || 0,  // mm/h -> mm per 5 min
          interval: 5,  // 5-minuters intervall
          source: 'radar'
        });
      }
    });
  }

  // Open-Meteo för 2-6h (15-min intervall)
  if (omMinutely?.data?.length) {
    omMinutely.data.forEach(d => {
      const t = new Date(d.time);
      const hoursAhead = (t - now) / (1000 * 60 * 60);
      if (hoursAhead > 2 && hoursAhead <= 6) {
        combinedData.push({
          time: t,
          precipMm: d.precipMm || 0,
          precipProb: d.precipProb || 0,
          interval: 15,  // 15-minuters intervall från Open-Meteo
          source: 'model'
        });
      }
    });
  }

  // Sortera efter tid
  combinedData.sort((a, b) => a.time - b.time);

  // Om ingen data, dölj sektionen
  if (combinedData.length < 3) {
    nowcastSection.style.display = 'none';
    return;
  }

  nowcastSection.style.display = 'block';

  // Beräkna statistik
  const totalPrecip = combinedData.reduce((sum, d) => sum + d.precipMm, 0);
  const actualMaxPrecip = Math.max(...combinedData.map(d => d.precipMm));
  const maxPrecip = Math.max(actualMaxPrecip, 0.1); // För bar-höjder, minimum 0.1
  const hasRadar = combinedData.some(d => d.source === 'radar');

  // Hitta datapunkten med högst intensitet (för korrekt mm/h-konvertering)
  const maxPrecipPoint = combinedData.reduce((max, d) =>
    d.precipMm > max.precipMm ? d : max, combinedData[0]);

  // Hitta torra perioder (minst 30 min utan nederbörd)
  const dryPeriods = [];
  let dryStart = null;

  combinedData.forEach((d, i) => {
    if (d.precipMm < 0.05) {
      if (!dryStart) dryStart = { idx: i, time: d.time };
    } else {
      if (dryStart) {
        const duration = (d.time - dryStart.time) / (1000 * 60);
        if (duration >= 30) {
          dryPeriods.push({
            start: dryStart.time,
            end: combinedData[i - 1]?.time || d.time,
            duration: Math.round(duration)
          });
        }
        dryStart = null;
      }
    }
  });

  // Avsluta sista torra perioden
  if (dryStart) {
    const lastTime = combinedData[combinedData.length - 1].time;
    const duration = (lastTime - dryStart.time) / (1000 * 60);
    if (duration >= 30) {
      dryPeriods.push({
        start: dryStart.time,
        end: lastTime,
        duration: Math.round(duration)
      });
    }
  }

  // Avgör om det är torrt just nu
  const nextHourData = combinedData.filter(d => (d.time - now) < 60 * 60 * 1000);
  const nextHourPrecip = nextHourData.reduce((sum, d) => sum + d.precipMm, 0);
  const isDryNow = nextHourPrecip < 0.1;

  // Formattera tid
  const fmtTime = (date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  };

  // Skapa titeln (kort för mobil)
  let titleText = 'Nederbörd 6h';
  let titleIcon = '🌧️';
  if (isDryNow && totalPrecip < 0.5) {
    titleText = 'Uppehåll 6h';
    titleIcon = '☀️';
  } else if (totalPrecip > 5) {
    titleIcon = '⛈️';
  }

  // Bygg HTML
  let html = '<h3 class="section-title section-toggle" id="nowcastToggle">' +
    titleIcon + ' ' + titleText +
    ' <span class="toggle-icon">▼</span></h3>';

  html += '<div class="nowcast-content">';

  // Tidslinjevisualisering
  html += '<div class="nowcast-timeline">';
  html += '<div class="nowcast-bars">';

  // SMHI-liknande färgkodning för nederbördsintensitet
  const getPrecipColor = (precipMm, interval) => {
    const mmH = precipMm * (60 / (interval || 5)); // Konvertera till mm/h
    if (mmH < 0.5) return 'var(--accent-rain)';      // Lätt - ljusblå
    if (mmH < 4) return 'var(--confidence-high)';     // Måttlig - grön
    if (mmH < 10) return 'var(--confidence-medium)';  // Kraftig - gul/orange
    return 'var(--confidence-low)';                   // Skyfall - röd
  };

  combinedData.forEach((d, i) => {
    const heightPct = Math.max(2, (d.precipMm / maxPrecip) * 100);
    const isDry = d.precipMm < 0.05;
    const isRadar = d.source === 'radar';
    const opacity = isRadar ? 1 : 0.7;
    const barColor = isDry ? '' : 'background:' + getPrecipColor(d.precipMm, d.interval) + ';';
    html += '<div class="nowcast-bar' + (isDry ? ' dry' : '') +
      '" style="height:' + heightPct + '%;opacity:' + opacity + ';' + barColor + '" ' +
      'title="' + fmtTime(d.time) + ': ' + round1(d.precipMm) + ' mm"></div>';
  });

  html += '</div>';

  // Tidsetiketter
  html += '<div class="nowcast-time-labels">';
  html += '<span>Nu</span>';
  html += '<span>+2h</span>';
  html += '<span>+4h</span>';
  html += '<span>+6h</span>';
  html += '</div>';
  html += '</div>';

  // Statistik-kort
  html += '<div class="nowcast-stats">';

  // Ackumulerad nederbörd
  html += '<div class="nowcast-stat">' +
    '<div class="nowcast-stat-label">Totalt (6h)</div>' +
    '<div class="nowcast-stat-value">' + round1(totalPrecip) + ' mm</div>' +
    '</div>';

  // Närmaste timmen
  html += '<div class="nowcast-stat">' +
    '<div class="nowcast-stat-label">Nästa timme</div>' +
    '<div class="nowcast-stat-value">' + round1(nextHourPrecip) + ' mm</div>' +
    '<div class="nowcast-stat-sub">' + (isDryNow ? '☀️ Uppehåll' : '🌧️ Nederbörd') + '</div>' +
    '</div>';

  // Intensitet - använd rätt konverteringsfaktor baserat på intervall
  // 5-min data: * 12 för mm/h, 15-min data: * 4 för mm/h
  const maxInterval = maxPrecipPoint?.interval || 5;
  const maxPrecipMmH = actualMaxPrecip * (60 / maxInterval); // Konvertera till mm/h
  const intensity = actualMaxPrecip < 0.02 ? 'Ingen' :
    maxPrecipMmH < 0.5 ? 'Lätt' :
    maxPrecipMmH < 4 ? 'Måttlig' :
    maxPrecipMmH < 10 ? 'Kraftig' : 'Skyfall';
  const intensitySub = actualMaxPrecip < 0.02 ? '☀️ Uppehåll' : round1(maxPrecipMmH) + ' mm/h';
  html += '<div class="nowcast-stat">' +
    '<div class="nowcast-stat-label">Max intensitet</div>' +
    '<div class="nowcast-stat-value">' + intensity + '</div>' +
    '<div class="nowcast-stat-sub">' + intensitySub + '</div>' +
    '</div>';

  // Konfidens - baserat på radardata (YR Nowcast 0-2h)
  const radarCount = combinedData.filter(d => d.source === 'radar').length;
  const radarPct = Math.round((radarCount / combinedData.length) * 100);
  // Radar täcker alltid 0-2h, resten är modelldata
  const hasRadarData = radarCount > 0;
  const confLevel = hasRadarData ? 'Hög' : 'Medel';
  const confColor = hasRadarData ? 'var(--confidence-high)' : 'var(--confidence-medium)';
  const confSub = hasRadarData ? '📡 Radar 0-2h' : '📊 Modelldata';
  html += '<div class="nowcast-stat">' +
    '<div class="nowcast-stat-label">Konfidens</div>' +
    '<div class="nowcast-stat-value" style="color:' + confColor + '">' + confLevel + '</div>' +
    '<div class="nowcast-stat-sub">' + confSub + '</div>' +
    '</div>';

  html += '</div>';

  // Torra perioder
  if (dryPeriods.length > 0) {
    html += '<div class="dry-periods">';
    html += '<div class="dry-periods-title">☀️ Bästa fönster för utevistelse</div>';
    html += '<div class="dry-period-list">';

    dryPeriods.slice(0, 3).forEach(p => {
      const durationText = p.duration >= 60 ?
        Math.floor(p.duration / 60) + 'h ' + (p.duration % 60) + 'min' :
        p.duration + ' min';
      html += '<div class="dry-period-item">' +
        '<span class="dry-period-icon">🌤️</span>' +
        '<span class="dry-period-text">' + fmtTime(p.start) + ' – ' + fmtTime(p.end) + '</span>' +
        '<span class="dry-period-duration">' + durationText + '</span>' +
        '</div>';
    });

    html += '</div>';
    html += '</div>';
  }

  // Källinfo
  html += '<div class="nowcast-sources">';
  if (hasRadar) {
    html += '<span class="ensemble-badge">📡 Radar</span> YR Nowcast (0-2h)';
  }
  html += ' + Open-Meteo (2-6h)';
  html += '</div>';

  html += '</div>';

  nowcastSection.innerHTML = html;

  // Toggle-lyssnare
  const toggle = document.getElementById('nowcastToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      nowcastSection.classList.toggle('open');
    });
  }
}

// ── Render Radar-sektion med animerade bilder ───────────────────────────────
let radarAnimationTimer = null;
let radarFrameIndex = 0;
let radarFrames = [];

let radarMap = null;
let radarOverlay = null;
let radarOverlays = []; // Array med alla förladddade overlays för smidig animation
let radarPositionMarker = null;
let radarRefreshTimer = null; // Timer för automatisk uppdatering var 5:e minut
let lastRadarLat = null;
let lastRadarLon = null;

// Automatisk radaruppdatering var 10:e minut (RainViewer uppdateras var 10:e min)
async function refreshRadarData() {
  if (!lastRadarLat || !lastRadarLon) return;

  try {
    const radarData = await fetchRainViewerRadar();
    if (radarData?.frames?.length) {
      renderRadar(radarData, lastRadarLat, lastRadarLon);
      console.log('Radar auto-uppdaterad:', new Date().toLocaleTimeString('sv-SE'));
    }
  } catch (err) {
    console.log('Radar auto-uppdatering misslyckades:', err);
  }
}

function startRadarRefreshTimer() {
  // Rensa eventuell tidigare timer
  if (radarRefreshTimer) {
    clearInterval(radarRefreshTimer);
  }
  // Uppdatera var 5:e minut (300000 ms)
  radarRefreshTimer = setInterval(refreshRadarData, 10 * 60 * 1000); // RainViewer uppdateras var 10:e min
}

function stopRadarRefreshTimer() {
  if (radarRefreshTimer) {
    clearInterval(radarRefreshTimer);
    radarRefreshTimer = null;
  }
}

// Spara nuvarande radarData globalt för att kunna byta källa
let currentRadarBounds = null;

function renderRadar(radarData, lat, lon) {
  const radarSection = document.getElementById('radarSection');
  if (!radarSection) return;

  // Rensa eventuell pågående animation
  if (radarAnimationTimer) {
    cancelAnimationFrame(radarAnimationTimer);
    radarAnimationTimer = null;
  }

  // Rensa tidigare karta
  if (radarMap) {
    radarMap.remove();
    radarMap = null;
  }

  if (!radarData?.frames?.length) {
    radarSection.style.display = 'none';
    stopRadarRefreshTimer();
    return;
  }

  radarSection.style.display = 'block';
  radarFrames = radarData.frames;

  // Hitta index för senaste historiska frame (inte prognos)
  const lastPastIndex = radarFrames.findIndex(f => f.forecast) - 1;
  radarFrameIndex = lastPastIndex >= 0 ? lastPastIndex : radarFrames.length - 1;

  // Spara position och starta automatisk uppdatering
  lastRadarLat = lat;
  lastRadarLon = lon;
  startRadarRefreshTimer();

  const latestTime = new Date(radarFrames[radarFrameIndex].time);
  const fmtRadarTime = latestTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  // Räkna antal historik vs prognos
  const pastCount = radarFrames.filter(f => !f.forecast).length;
  const forecastCount = radarFrames.filter(f => f.forecast).length;

  let html = '<h3 class="section-title section-toggle" id="radarToggle">' +
    '📡 Radar · ' + fmtRadarTime +
    ' <span class="toggle-icon">▼</span></h3>';

  html += '<div class="radar-content">';

  // Radar kart-container med Leaflet
  html += '<div class="radar-map-container" id="radarMapContainer">';
  html += '<div id="radarMap" style="width:100%;height:100%;border-radius:var(--radius-md);"></div>';
  html += '<div class="radar-time-display" id="radarTimeDisplay">' + fmtRadarTime + '</div>';
  html += '</div>';

  // Animationskontroller
  html += '<div class="radar-controls">';
  html += '<button id="radarPlayBtn" class="radar-btn">▶ Spela</button>';
  html += '<div class="radar-timeline">';
  html += '<input type="range" id="radarSlider" min="0" max="' + (radarFrames.length - 1) + '" value="' + radarFrameIndex + '">';
  html += '<div class="radar-time-labels">';

  // Tidsetiketter
  const labelCount = Math.min(5, radarFrames.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (radarFrames.length - 1) / (labelCount - 1));
    const t = new Date(radarFrames[idx].time);
    const pct = (idx / (radarFrames.length - 1)) * 100;
    const isForecast = radarFrames[idx].forecast;
    html += '<span style="left:' + pct + '%;' + (isForecast ? 'color:var(--accent-cool)' : '') + '">' +
      t.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) + '</span>';
  }

  html += '</div></div></div>';

  // Legend - RainViewer färgskala
  html += '<div class="radar-legend">';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#88c8f7"></span>Lätt</span>';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#3498db"></span>Måttlig</span>';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#2ecc71"></span>Kraftig</span>';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#f1c40f"></span>Stark</span>';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#e74c3c"></span>Mycket stark</span>';
  html += '<span class="radar-legend-item"><span class="radar-color" style="background:#9b59b6"></span>Extrem</span>';
  html += '</div>';

  // Info
  html += '<div class="radar-info">';
  html += '<span class="ensemble-badge">RainViewer</span> ' + pastCount + ' historik + ' + forecastCount + ' prognos';
  html += '</div>';

  html += '</div>';

  radarSection.innerHTML = html;

  // Öppna sektionen så kartan får rätt storlek vid initiering
  radarSection.classList.add('open');

  // Initiera Leaflet-karta med RainViewer tiles
  initRadarMapRainViewer(lat, lon, radarData.host);

  // Säkerställ att kartan får rätt storlek efter CSS-transition
  setTimeout(() => {
    if (radarMap) radarMap.invalidateSize();
  }, 100);

  // Initiera animation
  initRadarAnimation();

  // Toggle-lyssnare
  const toggle = document.getElementById('radarToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      radarSection.classList.toggle('open');
      setTimeout(() => {
        if (radarMap) radarMap.invalidateSize();
      }, 450);
    });
  }
}

// Initiera Leaflet-karta för RainViewer radar
function initRadarMapRainViewer(lat, lon, host) {
  const mapContainer = document.getElementById('radarMap');
  if (!mapContainer || typeof L === 'undefined') {
    console.warn('Leaflet eller kart-container saknas');
    return;
  }

  // Skapa karta centrerad på användarens position
  radarMap = L.map('radarMap', {
    center: [lat, lon],
    zoom: 7,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: true
  });

  // Lägg till mörk bakgrundskarta (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.rainviewer.com/">RainViewer</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(radarMap);

  // Rensa gamla tile layers
  radarOverlays = [];

  // Skapa tile layers för varje frame
  radarFrames.forEach((frame, i) => {
    const tileLayer = L.tileLayer(frame.url, {
      opacity: 0,
      tileSize: 512,
      zoomOffset: -1
    });
    tileLayer.addTo(radarMap);
    radarOverlays.push(tileLayer);
    frame.overlayIndex = i;
    frame.loaded = true; // Markera som laddad (tiles laddas on-demand av Leaflet)
  });

  // Visa aktuell frame
  if (radarOverlays[radarFrameIndex]) {
    radarOverlays[radarFrameIndex].setOpacity(0.7);
  }

  // Lägg till positionsmarkör
  const positionIcon = L.divIcon({
    className: 'radar-position-marker',
    html: '📍',
    iconSize: [24, 24],
    iconAnchor: [12, 24]
  });

  radarPositionMarker = L.marker([lat, lon], { icon: positionIcon })
    .addTo(radarMap)
    .bindPopup('Din position<br><small>Klicka för att centrera</small>');

  radarPositionMarker.on('click', () => {
    radarMap.setView([lat, lon], 8, { animate: true });
  });
}

// Initiera radar-animation med requestAnimationFrame för smidig mobilprestanda
function initRadarAnimation() {
  const playBtn = document.getElementById('radarPlayBtn');
  const slider = document.getElementById('radarSlider');
  const timeDisplay = document.getElementById('radarTimeDisplay');

  if (!playBtn || !slider) return;

  let isPlaying = false;
  let lastFrameTime = 0;
  const frameInterval = 800; // ms mellan frames (något snabbare för smidigare känsla)
  let previousFrameIndex = -1;

  function updateFrame(index) {
    if (!radarFrames[index] || !radarOverlays.length) return;

    // Hoppa över frames med laddningsfel
    if (radarFrames[index].loadError && isPlaying) {
      let nextValid = index + 1;
      while (nextValid < radarFrames.length && radarFrames[nextValid].loadError) {
        nextValid++;
      }
      if (nextValid < radarFrames.length) {
        radarFrameIndex = nextValid;
        updateFrame(nextValid);
        return;
      }
    }

    radarFrameIndex = index;
    const frame = radarFrames[index];

    // OPTIMERAD ANIMERING: Byt bara opacity mellan förskapade overlays
    // Detta är MYCKET snabbare på mobil än att använda setUrl()
    if (radarOverlays.length > 0 && radarMap) {
      // Dölj tidigare frame
      if (previousFrameIndex >= 0 && previousFrameIndex !== index && radarOverlays[previousFrameIndex]) {
        radarOverlays[previousFrameIndex].setOpacity(0);
      }

      // Visa ny frame om den är laddad
      if (radarOverlays[index] && frame.loaded) {
        radarOverlays[index].setOpacity(0.7);
        radarOverlay = radarOverlays[index];
      }

      previousFrameIndex = index;
    }

    slider.value = index;
    if (timeDisplay) {
      const t = new Date(radarFrames[index].time);
      timeDisplay.textContent = t.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    }
  }

  // Använd requestAnimationFrame för smidigare animation på mobil
  function animationLoop(timestamp) {
    if (!isPlaying) return;

    if (timestamp - lastFrameTime >= frameInterval) {
      lastFrameTime = timestamp;

      radarFrameIndex++;
      if (radarFrameIndex >= radarFrames.length) {
        radarFrameIndex = radarFrames.length - 1;
        isPlaying = false;
        playBtn.textContent = '▶ Spela';
        return;
      }
      updateFrame(radarFrameIndex);
    }

    radarAnimationTimer = requestAnimationFrame(animationLoop);
  }

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '⏸ Pausa' : '▶ Spela';

    if (isPlaying) {
      // Starta från början om vi är på slutet
      if (radarFrameIndex >= radarFrames.length - 1) {
        radarFrameIndex = 0;
        previousFrameIndex = -1;
        // Dölj alla frames först
        radarOverlays.forEach(o => o.setOpacity(0));
        updateFrame(0);
      }
      lastFrameTime = performance.now();
      radarAnimationTimer = requestAnimationFrame(animationLoop);
    } else {
      if (radarAnimationTimer) {
        cancelAnimationFrame(radarAnimationTimer);
      }
    }
  });

  slider.addEventListener('input', (e) => {
    if (isPlaying) {
      isPlaying = false;
      playBtn.textContent = '▶ Spela';
      if (radarAnimationTimer) {
        cancelAnimationFrame(radarAnimationTimer);
      }
    }
    updateFrame(parseInt(e.target.value));
  });
}

// ── Render Prognos-text ─────────────────────────────────────────────────────
function renderForecastText(text) {
  if (!forecastSummary) return;
  if (text) {
    forecastSummary.textContent = text;
    forecastSummary.style.display = 'block';
  } else {
    forecastSummary.style.display = 'none';
  }
}

function renderSources(results, oceanForecast) {
  sourcesGrid.innerHTML = '';

  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'source-card';

    if (r.status === 'ok') {
      card.innerHTML =
          '<div class="source-name">' + r.source + '</div>'
        + '<div class="source-icon">' + r.current.icon + '</div>'
        + '<div class="source-temp">' + r.current.temp + '°C</div>'
        + '<div class="source-details">'
        + '<div>💨 ' + r.current.wind + ' m/s ' + (r.current.windDir || '') + '</div>'
        + '<div>💦 ' + r.current.humidity + '%</div>'
        + '<div>🌧️ ' + r.current.precip + ' mm</div>'
        + '</div>'
        + '<span class="source-status status-ok">OK</span>';
    } else {
      card.innerHTML =
          '<div class="source-name">' + r.source + '</div>'
        + '<div class="source-temp" style="color:var(--confidence-low)">–</div>'
        + '<div class="source-details">' + (r.error || 'Misslyckades') + '</div>'
        + '<span class="source-status status-error">Fel</span>';
    }

    sourcesGrid.appendChild(card);
  });

  // Lägg till havsvind som källa om tillgänglig
  if (oceanForecast?.current?.windSpeed) {
    const card = document.createElement('div');
    card.className = 'source-card ocean-source';
    const ow = oceanForecast.current.windSpeed;
    card.innerHTML =
        '<div class="source-name">🌊 MET Ocean</div>'
      + '<div class="source-icon">🌊</div>'
      + '<div class="source-temp">' + Math.round(ow.speed) + ' m/s</div>'
      + '<div class="source-details">'
      + '<div>💨 Havsvind ' + ow.dirText + '</div>'
      + (oceanForecast.current.waveHeight != null ? '<div>🌊 Våghöjd ' + oceanForecast.current.waveHeight + ' m</div>' : '')
      + (oceanForecast.current.waterTemp != null ? '<div>🌡️ Vatten ' + Math.round(oceanForecast.current.waterTemp) + '°C</div>' : '')
      + '<div>📍 ' + oceanForecast.distanceKm + ' km</div>'
      + '</div>'
      + '<span class="source-status status-ok">Kust</span>';
    sourcesGrid.appendChild(card);
  }
}

function renderHourly(hourly, iconEuEns, oceanForecast) {
  hourlyScroll.innerHTML = '';
  cachedHourly = hourly;
  const now   = Date.now();
  const items = hourly
    .filter(h => new Date(h.time).getTime() >= now - 1800000)  // 30 min grace
    .slice(0, 24);

  // Bygg map för havsvind per timme (om kustnära)
  const oceanWindMap = new Map();
  if (oceanForecast?.hourly) {
    oceanForecast.hourly.forEach(o => {
      const key = o.time.slice(0, 13);  // "2024-01-15T14"
      oceanWindMap.set(key, o);
    });
  }

  // Bygg en map för snabb uppslagning av ICON-EU ensemble-data
  const ensMap = new Map();
  if (iconEuEns?.hourly) {
    iconEuEns.hourly.forEach(e => {
      const key = e.time.slice(0, 13);  // "2024-01-15T14"
      ensMap.set(key, e);
    });
  }

  items.forEach((h, i) => {
    const el    = document.createElement('div');
    el.className = 'hourly-item';
    const label  = (i === 0 && new Date(h.time).getTime() <= now + 1800000) ? 'Nu' : fmtTime(h.time);

    // Kolla om vi har ensemble-data för denna timme
    const ensKey = h.time.slice(0, 13);
    const ens = ensMap.get(ensKey);

    // Visa nederbördsrisk % och mm
    let precipHtml = h.precip + '%';
    if (h.precipMm > 0) {
      precipHtml += ' ' + h.precipMm + 'mm';
    }

    // Vind med riktning (kompakt)
    const windHtml = h.wind + (h.windDir ? ' ' + h.windDir : '');

    el.innerHTML =
        '<div class="hourly-time">'   + label      + '</div>'
      + '<div class="hourly-icon">'   + h.icon     + '</div>'
      + '<div class="hourly-temp">'   + h.temp     + '°</div>'
      + '<div class="hourly-details">'
      + '<span>💨' + windHtml + '</span>'
      + '<span>💧' + precipHtml + '</span>'
      + '</div>';

    // Klicka för källjämförelse
    el.addEventListener('click', () => showHourDetail(h));
    hourlyScroll.appendChild(el);
  });
}

function renderDaily(daily, iconEuEns) {
  dailyList.innerHTML = '';
  cachedDaily = daily;
  cachedIconEuEns = iconEuEns;  // Spara för dagsdetaljer
  if (!daily.length) return;

  // Bygg en map för snabb uppslagning av ICON-EU ensemble-data
  const ensMap = new Map();
  if (iconEuEns?.daily) {
    iconEuEns.daily.forEach(e => {
      ensMap.set(e.time, e);
    });
  }

  const allMin = Math.min(...daily.map(d => d.tempMin));
  const allMax = Math.max(...daily.map(d => d.tempMax));
  const range  = allMax - allMin || 1;

  daily.forEach((d, index) => {
    const el       = document.createElement('div');
    el.className   = 'daily-item';
    el.dataset.index = index;
    el.style.cursor = 'pointer';
    const dayLabel = isToday(d.time) ? 'Idag' : fmtDay(d.time);

    // Hämta ICON-EU ensemble-data för dagen (om inom 5-dagars räckvidden)
    const ens = ensMap.get(d.time);

    // === KOMBINERA TEMPERATUR ===
    // Multi-source (YR, SMHI, Open-Meteo) tempMin/tempMax
    const tempValues = [d.tempMin, d.tempMax];
    // ICON-EU ensemble tempMin/tempMax
    if (ens?.tempMin?.min != null) tempValues.push(ens.tempMin.min);
    if (ens?.tempMax?.max != null) tempValues.push(ens.tempMax.max);
    const combinedTempMin = round1(Math.min(...tempValues));
    const combinedTempMax = round1(Math.max(...tempValues));

    const leftPct  = ((combinedTempMin - allMin) / range) * 100;
    const widthPct = ((combinedTempMax - combinedTempMin) / range) * 100;
    const spread   = combinedTempMax - combinedTempMin;
    const dotColor = spread > 10 ? 'var(--confidence-low)'
                   : spread > 6  ? 'var(--confidence-medium)'
                   :               'var(--confidence-high)';

    // === KOMBINERA NEDERBÖRD ===
    // Multi-source värde
    const msPrecip = d.precip ?? 0;
    // ICON-EU ensemble min/max
    const iconPrecipMin = ens?.precip?.min ?? null;
    const iconPrecipMax = ens?.precip?.max ?? null;

    let precipHtml;
    if (iconPrecipMin != null && iconPrecipMax != null) {
      // Kombinera multi-source med ICON-EU
      const allPrecip = [msPrecip, iconPrecipMin, iconPrecipMax];
      const pMin = round1(Math.min(...allPrecip));
      const pMax = round1(Math.max(...allPrecip));
      if (pMax > 0 && pMin !== pMax) {
        precipHtml = pMin + '-' + pMax + ' mm';
      } else if (pMax > 0) {
        precipHtml = pMax + ' mm';
      } else {
        precipHtml = (ens?.precipProb ?? d.precipProb ?? 0) + '%';
      }
      if (pMax > 0 && ens?.precipProb != null && ens.precipProb < 100) {
        precipHtml += ' (' + ens.precipProb + '%)';
      }
    } else {
      precipHtml = msPrecip > 0 ? msPrecip + ' mm' : (d.precipProb ?? 0) + '%';
    }

    el.innerHTML =
        '<div class="daily-day">' + dayLabel + '</div>'
      + '<div class="daily-icon">' + (d.icon || '☀️') + '</div>'
      + '<div class="daily-temp-range">'
        + '<span class="temp-low">' + combinedTempMin + '°</span>'
        + '<div class="temp-bar-container">'
          + '<div class="temp-bar" style="left:' + leftPct + '%;width:' + widthPct + '%"></div>'
        + '</div>'
        + '<span class="temp-high">' + combinedTempMax + '°</span>'
      + '</div>'
      + '<div class="daily-confidence">'
        + '<span class="confidence-dot" style="background:' + dotColor + '"></span>'
        + '<span class="daily-confidence-text">💧 ' + precipHtml + '</span>'
      + '</div>';

    el.addEventListener('click', () => showDayDetail(index));
    dailyList.appendChild(el);
  });
}

// ── Day Detail Modal ────────────────────────────────────────────────────────
function showDayDetail(index) {
  const day = cachedDaily[index];
  if (!day) return;

  // Format date nicely
  const date = new Date(day.time + 'T12:00:00');
  const dateStr = date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  dayTitle.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Filter hourly data for this day
  const dayHours = cachedHourly.filter(h => h.time.startsWith(day.time));

  // Bygg ensemble-map för denna dag
  const ensHourlyMap = new Map();
  if (cachedIconEuEns?.hourly) {
    cachedIconEuEns.hourly
      .filter(e => e.time.startsWith(day.time))
      .forEach(e => {
        const key = e.time.slice(0, 13);
        ensHourlyMap.set(key, e);
      });
  }

  // Hämta daglig ensemble-data
  const ensDailyData = cachedIconEuEns?.daily?.find(e => e.time === day.time);

  // Summary stats - kombinera multi-source med ICON-EU ensemble
  const avgHumidity = dayHours.length ? Math.round(dayHours.reduce((s, h) => s + h.humidity, 0) / dayHours.length) : 0;
  const mainWindDir = dayHours.length ? dayHours[Math.floor(dayHours.length / 2)].windDir : '';

  // === TEMPERATUR ===
  // Multi-source min/max från timdata
  const msTemps = dayHours.flatMap(h => [h.tempMin, h.tempMax, h.temp].filter(v => v != null));
  // ICON-EU temperatur
  const iconTempMin = ensDailyData?.tempMin?.min ?? null;
  const iconTempMax = ensDailyData?.tempMax?.max ?? null;
  // Kombinera
  const allTempValues = [...msTemps];
  if (iconTempMin != null) allTempValues.push(iconTempMin);
  if (iconTempMax != null) allTempValues.push(iconTempMax);
  const tempMin = allTempValues.length ? round1(Math.min(...allTempValues)) : day.tempMin;
  const tempMax = allTempValues.length ? round1(Math.max(...allTempValues)) : day.tempMax;

  // === VIND ===
  // Multi-source vind
  const msWinds = dayHours.flatMap(h => [h.windMin, h.windMax, h.wind].filter(v => v != null));
  // ICON-EU vind
  const iconWindMin = ensDailyData?.wind?.min ?? null;
  const iconWindMax = ensDailyData?.wind?.max ?? null;
  // Kombinera
  const allWindValues = [...msWinds];
  if (iconWindMin != null) allWindValues.push(iconWindMin);
  if (iconWindMax != null) allWindValues.push(iconWindMax);
  const windMin = allWindValues.length ? round1(Math.min(...allWindValues)) : day.wind;
  const windMax = allWindValues.length ? round1(Math.max(...allWindValues)) : day.wind;

  // === NEDERBÖRD ===
  // Multi-source: summa av timvärden per källa
  const msTotal = dayHours.length ? round1(dayHours.reduce((s, h) => s + h.precipMm, 0)) : day.precip;
  const msTotals = dayHours.length
    ? [round1(dayHours.reduce((s, h) => s + (h.precipMin ?? h.precipMm), 0)),
       round1(dayHours.reduce((s, h) => s + (h.precipMax ?? h.precipMm), 0))]
    : [day.precip, day.precip];
  // ICON-EU ensemble: min/max för dagen
  const iconPrecipMin = ensDailyData?.precip?.min ?? null;
  const iconPrecipMax = ensDailyData?.precip?.max ?? null;
  // Kombinera alla värden för totalt intervall
  const allPrecipValues = [msTotals[0], msTotals[1]];
  if (iconPrecipMin != null) allPrecipValues.push(iconPrecipMin);
  if (iconPrecipMax != null) allPrecipValues.push(iconPrecipMax);
  const combinedMin = round1(Math.min(...allPrecipValues));
  const combinedMax = round1(Math.max(...allPrecipValues));

  let precipText;
  if (combinedMax > 0 && combinedMin !== combinedMax) {
    precipText = combinedMin + '-' + combinedMax + ' mm';
  } else {
    precipText = msTotal + ' mm';
  }
  if (ensDailyData?.precipProb != null) {
    precipText += ' (' + ensDailyData.precipProb + '%)';
  } else if (day.precipProb) {
    precipText += ' (' + day.precipProb + '%)';
  }

  // Formatera temperatur och vind med intervall
  const tempText = (tempMin !== tempMax) ? tempMin + '° / ' + tempMax + '°' : day.tempMin + '° / ' + day.tempMax + '°';
  const windText = (windMin !== windMax) ? windMin + '-' + windMax + ' m/s ' + mainWindDir : windMin + ' m/s ' + mainWindDir;

  daySummary.innerHTML =
      '<div class="day-detail-stat"><div class="day-detail-stat-label">🌡️ Temperatur</div><div class="day-detail-stat-value">' + tempText + '</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💨 Vind</div><div class="day-detail-stat-value">' + windText + '</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💧 Nederbörd</div><div class="day-detail-stat-value">' + precipText + '</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💦 Luftfuktighet</div><div class="day-detail-stat-value">' + avgHumidity + '%</div></div>';

  // Hourly breakdown med kombinerad ensemble-data
  if (dayHours.length) {
    dayHourly.innerHTML =
        '<div class="day-detail-hourly-title">Timprognos (YR + SMHI + Open-Meteo + ICON-EU)</div>'
      + '<div class="day-detail-hourly-grid">'
      + dayHours.map(h => {
          const ensKey = h.time.slice(0, 13);
          const iconEns = ensHourlyMap.get(ensKey);

          // === TEMPERATUR ===
          const tempVals = [h.tempMin, h.tempMax, h.temp].filter(v => v != null);
          if (iconEns?.temp?.min != null) tempVals.push(iconEns.temp.min);
          if (iconEns?.temp?.max != null) tempVals.push(iconEns.temp.max);
          const tMin = tempVals.length ? round1(Math.min(...tempVals)) : h.temp;
          const tMax = tempVals.length ? round1(Math.max(...tempVals)) : h.temp;
          const tempHtml = (tMin !== tMax) ? tMin + '-' + tMax + '°' : h.temp + '°';

          // === VIND ===
          const windVals = [h.windMin, h.windMax, h.wind].filter(v => v != null);
          if (iconEns?.wind?.min != null) windVals.push(iconEns.wind.min);
          if (iconEns?.wind?.max != null) windVals.push(iconEns.wind.max);
          const wMin = windVals.length ? round1(Math.min(...windVals)) : h.wind;
          const wMax = windVals.length ? round1(Math.max(...windVals)) : h.wind;
          const windHtml = (wMin !== wMax) ? wMin + '-' + wMax : h.wind;

          // === NEDERBÖRD ===
          const precipVals = [h.precipMin, h.precipMax, h.precipMm].filter(v => v != null);
          if (iconEns?.precip?.min != null) precipVals.push(iconEns.precip.min);
          if (iconEns?.precip?.max != null) precipVals.push(iconEns.precip.max);
          const pMin = precipVals.length ? round1(Math.min(...precipVals)) : 0;
          const pMax = precipVals.length ? round1(Math.max(...precipVals)) : 0;
          const precipMmHtml = (pMax > 0 && pMin !== pMax) ? pMin + '-' + pMax + 'mm' : (h.precipMm || 0) + 'mm';
          const precipHtml = h.precip + '% · ' + precipMmHtml;

          return '<div class="day-detail-hour" data-time="' + h.time + '">'
            + '<div class="day-detail-hour-time">' + fmtTime(h.time) + '</div>'
            + '<div class="day-detail-hour-icon">' + h.icon + '</div>'
            + '<div class="day-detail-hour-temp">' + tempHtml + '</div>'
            + '<div class="day-detail-hour-detail">💨 ' + windHtml + '</div>'
            + '<div class="day-detail-hour-detail">💧 ' + precipHtml + '</div>'
            + '</div>';
        }).join('')
      + '</div>';

    // Lägg till klickhanterare för källjämförelse
    setTimeout(() => {
      dayHourly.querySelectorAll('.day-detail-hour').forEach(el => {
        el.addEventListener('click', () => {
          const time = el.dataset.time;
          const hourData = dayHours.find(h => h.time === time);
          if (hourData) showHourDetail(hourData);
        });
      });
    }, 0);
  } else {
    dayHourly.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Ingen timdata tillgänglig</div>';
  }

  dayModal.classList.add('active');
}

function hideDayDetail() {
  dayModal.classList.remove('active');
}

// ── Timdetalj (källjämförelse) ────────────────────────────────────────────
function showHourDetail(hourData) {
  if (!hourData) return;

  const time = new Date(hourData.time);
  const timeStr = time.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' kl ' + time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  hourTitle.textContent = timeStr;

  // Bygg källjämförelse
  let html = '<div class="hour-source-grid">';

  // Ensemble (huvudresultat)
  html += '<div class="hour-source-card ensemble">'
    + '<div class="hour-source-name">Ensemble</div>'
    + '<div class="hour-source-icon">' + (hourData.icon || '🌤️') + '</div>'
    + '<div class="hour-source-temp">' + hourData.temp + '°</div>'
    + '<div class="hour-source-details">'
    + '💨 ' + hourData.wind + ' m/s<br>'
    + '💧 ' + hourData.precip + '% · ' + (hourData.precipMm || 0) + 'mm<br>'
    + '💦 ' + hourData.humidity + '%'
    + '</div></div>';

  // Individuella källor
  if (hourData.sourceData?.length) {
    hourData.sourceData.forEach(src => {
      html += '<div class="hour-source-card">'
        + '<div class="hour-source-name">' + src.source + '</div>'
        + '<div class="hour-source-icon">' + (src.icon || '🌤️') + '</div>'
        + '<div class="hour-source-temp">' + (src.temp ?? '-') + '°</div>'
        + '<div class="hour-source-details">'
        + '💨 ' + (src.wind ?? '-') + ' m/s<br>'
        + '💧 ' + (src.precip ?? '-') + '% · ' + (src.precipMm ?? 0) + 'mm<br>'
        + '💦 ' + (src.humidity ?? '-') + '%'
        + '</div></div>';
    });
  }

  html += '</div>';
  hourBody.innerHTML = html;
  hourModal.classList.add('active');
}

function hideHourDetail() {
  hourModal.classList.remove('active');
}

// ── Recent Location ────────────────────────────────────────────────────────
function updateRecentLocation() {
  try {
    const recent = JSON.parse(localStorage.getItem('väder_recent'));
    if (recent && recent.name) {
      // Visa bara om det inte redan är aktuell plats
      if (!lastLoc || recent.name !== lastLoc.name) {
        recentBtn.textContent = recent.name.split(',')[0]; // Första delen av namnet
        recentLoc.style.display = 'flex';
      } else {
        recentLoc.style.display = 'none';
      }
    }
  } catch { /* ignore */ }
}

function loadRecentLocation() {
  try {
    const recent = JSON.parse(localStorage.getItem('väder_recent'));
    if (recent) {
      fetchWeather(recent.lat, recent.lon, recent.name);
    }
  } catch { /* ignore */ }
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
    // Hämta väderdata från alla källor parallellt
    const [weatherSettled, warnings, airQuality, pollen, iconEuEns, yrNowcast, omMinutely, oceanForecast, radarData] = await Promise.all([
      Promise.allSettled([
        fetchOpenMeteo(lat, lon),
        fetchYR(lat, lon),
        fetchSMHI(lat, lon),
      ]),
      fetchSMHIWarnings(lat, lon),
      fetchAirQualityEnsemble(lat, lon),  // Copernicus CAMS ensemble
      fetchPollen(lat, lon),
      fetchIconEuEnsemble(lat, lon),  // ICON-EU ensemble för nederbörd/vind
      fetchYRNowcast(lat, lon),       // Radar-baserad nowcast 0-2h
      fetchOpenMeteoMinutely(lat, lon), // 15-min data 2-6h
      fetchOceanForecast(lat, lon),   // Havsvind för kustnära platser
      fetchRainViewerRadar(),         // RainViewer global radar
    ]);

    const names   = ['Open-Meteo', 'YR', 'SMHI'];
    const results = weatherSettled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { source: names[i], status: 'error', error: r.reason?.message || 'Okänt fel' }
    );

    const ens = calcEnsemble(results);

    // Lägg till ICON-EU ensemble-data till ens-objektet
    if (iconEuEns) {
      ens.iconEuEns = iconEuEns;
    }

    locationName.textContent   = name;
    locationCoords.textContent = lat.toFixed(4) + '°, ' + lon.toFixed(4) + '°';

    cachedResults = results;  // Spara för jämförelse-modal

    // Analysera nowcast-risk för "just nu"-visning (kombinerar radar + modelldata)
    const nowcastRisk = analyzeNowcastRisk(yrNowcast, omMinutely, ens.current.temp, radarData);

    renderCurrent(ens, iconEuEns, nowcastRisk, oceanForecast);
    renderSources(results, oceanForecast);
    renderHourly(ens.hourly, iconEuEns, oceanForecast);
    renderDaily(ens.daily, iconEuEns);

    // Nya funktioner
    renderWarnings(warnings);
    renderAirQuality(airQuality, pollen);
    renderUV(ens.hourly);
    renderNowcast(yrNowcast, omMinutely);
    renderRadar(radarData, lat, lon);

    // Generera och visa beskrivande text
    const forecastTextStr = generateForecastText(ens, ens.daily, warnings);
    renderForecastText(forecastTextStr);

    emptyState.style.display = 'none';
    weatherDisplay.classList.add('active');

    // Persist for offline + recent location
    try {
      localStorage.setItem('väder_cache', JSON.stringify({
        loc: lastLoc, results, ens, warnings, airQuality, pollen, iconEuEns, yrNowcast, omMinutely, oceanForecast, radarData, ts: Date.now()
      }));
      // Spara senaste plats separat (för snabbval)
      localStorage.setItem('väder_recent', JSON.stringify(lastLoc));
    } catch { /* localStorage full */ }

    // Uppdatera senaste plats-knappen
    updateRecentLocation();

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
    cachedResults = c.results;  // Återställ för jämförelse-modal
    locationName.textContent   = c.loc.name;
    locationCoords.textContent = c.loc.lat.toFixed(4) + '°, ' + c.loc.lon.toFixed(4) + '°';

    // Analysera nowcast-risk från cachad data (inkl. radar)
    const nowcastRisk = analyzeNowcastRisk(c.yrNowcast, c.omMinutely, c.ens?.current?.temp, c.radarData);

    renderCurrent(c.ens, c.iconEuEns, nowcastRisk, c.oceanForecast);
    renderSources(c.results, c.oceanForecast);
    renderHourly(c.ens.hourly, c.iconEuEns, c.oceanForecast);
    renderDaily(c.ens.daily, c.iconEuEns);
    renderWarnings(c.warnings);
    renderAirQuality(c.airQuality, c.pollen);
    renderUV(c.ens.hourly);
    renderNowcast(c.yrNowcast, c.omMinutely);
    renderRadar(c.radarData, c.loc.lat, c.loc.lon);

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

if (installAccept) {
  installAccept.addEventListener('click', async () => {
    if (installPrompt) installPrompt.classList.remove('active');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
  });
}

if (installDismiss) {
  installDismiss.addEventListener('click', () => {
    if (installPrompt) installPrompt.classList.remove('active');
  });
}

// ── Online / Offline ───────────────────────────────────────────────────────
window.addEventListener('online',  () => {
  offlineInd.classList.remove('active');
  if (lastLoc) fetchWeather(lastLoc.lat, lastLoc.lon, lastLoc.name);
});
window.addEventListener('offline', () => {
  offlineInd.classList.add('active');
  loadCache();
});

// ── Service Worker Registration (förenklad) ────────────────────────────────
var newWorker = null;
var userClickedUpdate = false;

if ('serviceWorker' in navigator) {
  // Enkel registrering utan auto-reset
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    // Kolla efter uppdateringar var 5:e minut
    setInterval(function() { reg.update(); }, 5 * 60 * 1000);

    reg.addEventListener('updatefound', function() {
      newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            if (updateBanner) updateBanner.classList.add('active');
          }
        });
      }
    });
  }).catch(function(err) {
    console.log('SW registration failed:', err);
  });

  // Ladda om sidan ENDAST när användaren explicit klickat på uppdatera
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (userClickedUpdate) {
      window.location.reload();
    }
  });
}

// Uppdatera-knappen
if (updateBtn) {
  updateBtn.addEventListener('click', function() {
    if (newWorker) {
      userClickedUpdate = true;
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}
if (updateBanner) {
  updateBanner.addEventListener('click', function(e) {
    if (e.target !== updateBtn && newWorker) {
      userClickedUpdate = true;
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

// ── Event Listeners ────────────────────────────────────────────────────────
if (searchBtn) {
  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSearch();
  }, { passive: false });
}

if (geolocateBtn) {
  geolocateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleGeolocate();
  }, { passive: false });
}

// Autocomplete event listeners
if (searchInput) {
  searchInput.addEventListener('input', e => {
    const val = e.target.value.trim();
    debouncedFetch(val);
    // Visa/dölj rensa-knappen
    if (searchClear) {
      searchClear.style.display = val.length > 0 ? 'block' : 'none';
    }
  });
}

// Rensa sökfältet
if (searchClear) {
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    hideSuggestions();
    searchInput.focus();
  });
}

if (searchInput) {
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggest = Math.min(selectedSuggest + 1, suggestions.length - 1);
      renderSuggestions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggest = Math.max(selectedSuggest - 1, -1);
      renderSuggestions();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggest >= 0) {
        selectSuggestion(selectedSuggest);
      } else {
        hideSuggestions();
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });
}

if (searchSuggest) {
  searchSuggest.addEventListener('click', e => {
    const item = e.target.closest('.suggestion-item');
    if (item) selectSuggestion(Number(item.dataset.index));
  });
}

document.addEventListener('click', e => {
  if (searchInput && searchSuggest && !searchInput.contains(e.target) && !searchSuggest.contains(e.target)) {
    hideSuggestions();
  }
});

// Day detail modal event listeners
if (dayClose) dayClose.addEventListener('click', hideDayDetail);
if (dayModal) dayModal.addEventListener('click', e => {
  if (e.target === dayModal) hideDayDetail();
});

// Hour detail modal
if (hourClose) hourClose.addEventListener('click', hideHourDetail);
if (hourModal) hourModal.addEventListener('click', e => {
  if (e.target === hourModal) hideHourDetail();
});

// Recent location event listener
if (recentBtn) recentBtn.addEventListener('click', loadRecentLocation);

// Sources section toggle (collapsible)
if (sourcesToggle && sourcesSection) {
  sourcesToggle.addEventListener('click', () => {
    sourcesSection.classList.toggle('open');
  });
}

// Refresh button
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    if (lastLoc) fetchWeather(lastLoc.lat, lastLoc.lon, lastLoc.name);
  });
}

// Pausa/återuppta radaruppdatering när fliken döljs/visas
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRadarRefreshTimer();
  } else if (lastRadarLat && lastRadarLon) {
    // Uppdatera direkt när användaren kommer tillbaka, sen starta timer igen
    refreshRadarData();
    startRadarRefreshTimer();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
if (!navigator.onLine) {
  offlineInd.classList.add('active');
  loadCache();
}

// Visa senaste plats vid start
updateRecentLocation();
