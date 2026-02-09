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
const searchSuggest  = $('searchSuggestions');
const dayModal       = $('dayDetailModal');
const dayTitle       = $('dayDetailTitle');
const daySummary     = $('dayDetailSummary');
const dayHourly      = $('dayDetailHourly');
const dayClose       = $('dayDetailClose');
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
  // SMHI kräver lon/lat i URL-path, inte query params
  const url = 'https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/' +
    lon.toFixed(6) + '/lat/' + lat.toFixed(6) + '/data.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('SMHI: HTTP ' + res.status);
  const data = await res.json();

  // SMHI returnerar timeSeries array med parameters
  const list = data.timeSeries ?? [];
  if (!list.length) throw new Error('SMHI: ingen data');

  // Hjälpfunktion för att extrahera parameter från en tidpunkt
  const getParam = (params, name) => params.find(p => p.name === name)?.values?.[0] ?? 0;

  // Första tidpunkten för current
  const params = list[0].parameters ?? [];
  const c = {
    t:    getParam(params, 't'),        // temperatur
    ws:   getParam(params, 'ws'),       // vindhastighet
    gust: getParam(params, 'gust'),     // byvind
    wd:   getParam(params, 'wd'),       // vindriktning (grader)
    r:    getParam(params, 'r'),        // relativ luftfuktighet
    msl:  getParam(params, 'msl'),      // lufttryck (havsnivå)
    pmax: getParam(params, 'pmax'),     // max nederbörd
  };

  // Extrahera timdata (SMHI har ~10 dagars data)
  const hourly = list.map(entry => {  // Använd all tillgänglig data
    const p = entry.parameters ?? [];
    return {
      time:     entry.validTime,
      temp:     round1(getParam(p, 't')),
      wind:     round1(getParam(p, 'ws')),
      windGust: round1(getParam(p, 'gust')),
      windDir:  degToDir(getParam(p, 'wd')),
      humidity: Math.round(getParam(p, 'r')),
      pressure: Math.round(getParam(p, 'msl')),
      precipMm: round1(getParam(p, 'pmax')),
      precip:   Math.round(getParam(p, 'pmax') > 0 ? 70 : 10), // Uppskattad sannolikhet
      icon:     '🌤️',  // SMHI har inte lika bra ikoner
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
async function fetchSMHIWarnings(lat, lon) {
  try {
    // Hämta alla aktiva varningar
    const res = await fetch('https://opendata-download-warnings.smhi.se/api/version/2/alerts.json');
    if (!res.ok) return [];
    const data = await res.json();

    // Filtrera varningar som gäller för denna position (inom ~100km)
    const warnings = (data.alert || []).filter(alert => {
      // Kolla om varningen gäller hela Sverige eller specifik region
      const info = alert.info?.[0];
      if (!info) return false;

      // Kolla geografisk närhet om koordinater finns
      const area = info.area?.[0];
      if (area?.polygon) {
        // Förenklad check - returnera alla för nu
        return true;
      }
      return true;
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
      '&current=precipitation,wind_speed_10m,wind_gusts_10m' +
      '&hourly=precipitation,wind_speed_10m,wind_gusts_10m' +
      '&daily=precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max' +
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
    const currentPrecip = [];
    const currentWind = [];
    const currentGust = [];

    // Hämta alla medlemmars current-värden
    for (let m = 0; m < 40; m++) {
      const suffix = m === 0 ? '' : '_member' + pad2(m);
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
        const precipVals = [];
        const windVals = [];
        const gustVals = [];

        for (let m = 0; m < 40; m++) {
          const suffix = m === 0 ? '' : '_member' + pad2(m);
          const pKey = 'precipitation' + suffix;
          const wKey = 'wind_speed_10m' + suffix;
          const gKey = 'wind_gusts_10m' + suffix;

          if (d.hourly[pKey]?.[i] != null) precipVals.push(d.hourly[pKey][i]);
          if (d.hourly[wKey]?.[i] != null) windVals.push(d.hourly[wKey][i]);
          if (d.hourly[gKey]?.[i] != null) gustVals.push(d.hourly[gKey][i]);
        }

        hourlyEns.push({
          time: d.hourly.time[i],
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
        const precipVals = [];
        const windVals = [];
        const gustVals = [];

        for (let m = 0; m < 40; m++) {
          const suffix = m === 0 ? '' : '_member' + pad2(m);
          const pKey = 'precipitation_sum' + suffix;
          const wKey = 'wind_speed_10m_max' + suffix;
          const gKey = 'wind_gusts_10m_max' + suffix;

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

  // Tid på dygnet
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 21;
  const isMorning = hour >= 6 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 18;

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
  else if (isNight) main += ' ikväll';
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
        hourlyByTime.set(key, { temps: [], winds: [], humids: [], precips: [], precipMms: [], primary: null });
      }
      const entry = hourlyByTime.get(key);
      entry.temps.push(h.temp);
      if (h.wind != null) entry.winds.push(h.wind);
      if (h.humidity != null) entry.humids.push(h.humidity);
      if (h.precip != null) entry.precips.push(h.precip);
      if (h.precipMm != null) entry.precipMms.push(h.precipMm);
      // Spara primary (Open-Meteo) för icon/desc
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
      return {
        time:       p.time,
        temp:       round1(avg(data.temps)),
        icon:       p.icon,
        desc:       p.desc,
        precip:     data.precips.length ? Math.round(avg(data.precips)) : (p.precip ?? 0),
        precipMm:   data.precipMms.length ? round1(avg(data.precipMms)) : (p.precipMm ?? 0),
        wind:       data.winds.length ? round1(avg(data.winds)) : (p.wind ?? 0),
        windDir:    p.windDir,
        humidity:   data.humids.length ? Math.round(avg(data.humids)) : (p.humidity ?? 0),
        uv:         p.uv ?? 0,  // UV endast från Open-Meteo
        sources:    sourceCount,  // Antal källor för denna timme
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
      dailyByDate.set(date, { temps: [], winds: [], precips: [], humids: [], sourceCount: 0 });
    }
    const entry = dailyByDate.get(date);
    entry.temps.push(h.temp);
    entry.winds.push(h.wind);
    entry.precips.push(h.precipMm);
    entry.humids.push(h.humidity);
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
      return {
        ...d,
        tempMin: round1(d.tempMin * (1 - weight) + avgTempMin * weight),
        tempMax: round1(d.tempMax * (1 - weight) + avgTempMax * weight),
        wind:    round1(d.wind * (1 - weight) + avgWind * weight),
        precip:  round1(d.precip * (1 - weight) + totalPrecip * weight),
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
    },
    confidence: { pct, cls, label },
    hourly:  ensembleHourly.length ? ensembleHourly : primary.hourly,
    daily:   ensembleDaily.length ? ensembleDaily : primary.daily,
    sources: ok.length,
    stdDevs: { temp: round1(tempStdDev), wind: round1(windStdDev), humid: round1(humidStdDev) },
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderCurrent(ens, iconEuEns) {
  currentIcon.textContent   = ens.current.icon;
  currentTemp.textContent   = ens.current.temp;
  currentDesc.textContent   = ens.current.desc;

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

  // Vind med byvind - använd ICON-EU ensemble om tillgängligt
  let windText = ens.current.wind + ' m/s';
  if (iconEuEns?.current?.wind) {
    const w = iconEuEns.current.wind;
    if (w.min !== w.max) {
      windText = w.min + '-' + w.max + ' m/s';
    }
  }
  const gustText = ens.current.windGust > ens.current.wind
    ? ' (' + ens.current.windGust + ')'
    : '';
  currentWind.textContent = windText + gustText + ' ' + (ens.current.windDir || '');

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
  const aqiPreview = aq ? ' — <span style="color:' + aq.color + '">AQI ' + aq.aqi + '</span>' : '';
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
    'UV-index — <span style="color:' + uvInfo.color + '">UV ' + currentUVVal + ' (' + uvInfo.level + ')</span>' +
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

function renderSources(results) {
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
}

function renderHourly(hourly, iconEuEns) {
  hourlyScroll.innerHTML = '';
  cachedHourly = hourly;
  const now   = Date.now();
  const items = hourly
    .filter(h => new Date(h.time).getTime() >= now - 1800000)  // 30 min grace
    .slice(0, 24);

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

    // Visa nederbördsintervall om ensemble finns
    let precipHtml = h.precip + '%';
    if (ens?.precip && ens.precip.max > 0) {
      precipHtml = ens.precip.min + '-' + ens.precip.max + ' mm';
    }

    el.innerHTML =
        '<div class="hourly-time">'   + label      + '</div>'
      + '<div class="hourly-icon">'   + h.icon     + '</div>'
      + '<div class="hourly-temp">'   + h.temp     + '°</div>'
      + '<div class="hourly-precip">💧 ' + precipHtml + '</div>';
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
    const leftPct  = ((d.tempMin - allMin) / range) * 100;
    const widthPct = ((d.tempMax - d.tempMin) / range) * 100;
    const spread   = d.tempMax - d.tempMin;
    const dotColor = spread > 10 ? 'var(--confidence-low)'
                   : spread > 6  ? 'var(--confidence-medium)'
                   :               'var(--confidence-high)';

    // Hämta ensemble-data för dagen (om inom 5-dagars räckvidden)
    const ens = ensMap.get(d.time);

    // Visa nederbördsinfo - använd ensemble om tillgängligt
    let precipHtml;
    if (ens?.precip && ens.precip.max > 0) {
      // Visa intervall + sannolikhet från ensemble
      precipHtml = ens.precip.min + '-' + ens.precip.max + ' mm';
      if (ens.precipProb != null && ens.precipProb < 100) {
        precipHtml += ' (' + ens.precipProb + '%)';
      }
    } else if (ens?.precipProb != null) {
      precipHtml = ens.precipProb + '%';
    } else {
      precipHtml = (d.precipProb ?? 0) + '%';
    }

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

  // Summary stats
  const avgWind = dayHours.length ? round1(dayHours.reduce((s, h) => s + h.wind, 0) / dayHours.length) : day.wind;
  const avgHumidity = dayHours.length ? Math.round(dayHours.reduce((s, h) => s + h.humidity, 0) / dayHours.length) : 0;
  const mainWindDir = dayHours.length ? dayHours[Math.floor(dayHours.length / 2)].windDir : '';

  // Använd ensemble för nederbörd om tillgängligt
  let precipText;
  if (ensDailyData?.precip && ensDailyData.precip.max > 0) {
    precipText = ensDailyData.precip.min + '-' + ensDailyData.precip.max + ' mm';
    if (ensDailyData.precipProb != null) {
      precipText += ' (' + ensDailyData.precipProb + '%)';
    }
  } else {
    const totalPrecip = dayHours.length ? round1(dayHours.reduce((s, h) => s + h.precipMm, 0)) : day.precip;
    precipText = totalPrecip + ' mm (' + day.precipProb + '%)';
  }

  daySummary.innerHTML =
      '<div class="day-detail-stat"><div class="day-detail-stat-label">🌡️ Temperatur</div><div class="day-detail-stat-value">' + day.tempMin + '° / ' + day.tempMax + '°</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💨 Vind</div><div class="day-detail-stat-value">' + avgWind + ' m/s ' + mainWindDir + '</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💧 Nederbörd</div><div class="day-detail-stat-value">' + precipText + '</div></div>'
    + '<div class="day-detail-stat"><div class="day-detail-stat-label">💦 Luftfuktighet</div><div class="day-detail-stat-value">' + avgHumidity + '%</div></div>';

  // Hourly breakdown med ensemble-data
  if (dayHours.length) {
    dayHourly.innerHTML =
        '<div class="day-detail-hourly-title">Timprognos</div>'
      + '<div class="day-detail-hourly-grid">'
      + dayHours.map(h => {
          const ensKey = h.time.slice(0, 13);
          const ens = ensHourlyMap.get(ensKey);

          // Använd ensemble för nederbörd om tillgängligt
          let precipHtml;
          if (ens?.precip && ens.precip.max > 0) {
            precipHtml = ens.precip.min + '-' + ens.precip.max + 'mm';
          } else {
            precipHtml = h.precipMm + 'mm';
          }

          return '<div class="day-detail-hour">'
            + '<div class="day-detail-hour-time">' + fmtTime(h.time) + '</div>'
            + '<div class="day-detail-hour-icon">' + h.icon + '</div>'
            + '<div class="day-detail-hour-temp">' + h.temp + '°</div>'
            + '<div class="day-detail-hour-detail">💨 ' + h.wind + '</div>'
            + '<div class="day-detail-hour-detail">💧 ' + precipHtml + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  } else {
    dayHourly.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Ingen timdata tillgänglig</div>';
  }

  dayModal.classList.add('active');
}

function hideDayDetail() {
  dayModal.classList.remove('active');
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
    const [weatherSettled, warnings, airQuality, pollen, iconEuEns] = await Promise.all([
      Promise.allSettled([
        fetchOpenMeteo(lat, lon),
        fetchYR(lat, lon),
        fetchSMHI(lat, lon),
      ]),
      fetchSMHIWarnings(lat, lon),
      fetchAirQualityEnsemble(lat, lon),  // Copernicus CAMS ensemble
      fetchPollen(lat, lon),
      fetchIconEuEnsemble(lat, lon),  // ICON-EU ensemble för nederbörd/vind
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

    renderCurrent(ens, iconEuEns);
    renderSources(results);
    renderHourly(ens.hourly, iconEuEns);
    renderDaily(ens.daily, iconEuEns);

    // Nya funktioner
    renderWarnings(warnings);
    renderAirQuality(airQuality, pollen);
    renderUV(ens.hourly);

    // Generera och visa beskrivande text
    const forecastTextStr = generateForecastText(ens, ens.daily, warnings);
    renderForecastText(forecastTextStr);

    emptyState.style.display = 'none';
    weatherDisplay.classList.add('active');

    // Persist for offline + recent location
    try {
      localStorage.setItem('väder_cache', JSON.stringify({
        loc: lastLoc, results, ens, warnings, airQuality, pollen, iconEuEns, ts: Date.now()
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
    renderCurrent(c.ens, c.iconEuEns);
    renderSources(c.results);
    renderHourly(c.ens.hourly, c.iconEuEns);
    renderDaily(c.ens.daily, c.iconEuEns);
    renderWarnings(c.warnings);
    renderAirQuality(c.airQuality, c.pollen);
    renderUV(c.ens.hourly);

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

// ── Service Worker Registration + Update Notification ──────────────────────
let newWorker = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Kolla efter uppdateringar direkt och sedan var 5:e minut
    reg.update();
    setInterval(() => reg.update(), 5 * 60 * 1000);

    reg.addEventListener('updatefound', () => {
      newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Ny version finns tillgänglig
          if (updateBanner) updateBanner.classList.add('active');
        }
      });
    });
  }).catch(() => {});

  // Ladda om sidan när ny SW tar över
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Uppdatera-knappen
if (updateBtn) {
  updateBtn.addEventListener('click', () => {
    if (newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}
if (updateBanner) {
  updateBanner.addEventListener('click', e => {
    if (e.target !== updateBtn && newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

// ── Event Listeners ────────────────────────────────────────────────────────
searchBtn.addEventListener('click', handleSearch);
geolocateBtn.addEventListener('click', handleGeolocate);

// Autocomplete event listeners
searchInput.addEventListener('input', e => {
  const val = e.target.value.trim();
  debouncedFetch(val);
  // Visa/dölj rensa-knappen
  if (searchClear) {
    searchClear.style.display = val.length > 0 ? 'block' : 'none';
  }
});

// Rensa sökfältet
if (searchClear) {
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    hideSuggestions();
    searchInput.focus();
  });
}

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

searchSuggest.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (item) selectSuggestion(Number(item.dataset.index));
});

document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !searchSuggest.contains(e.target)) {
    hideSuggestions();
  }
});

// Day detail modal event listeners
dayClose.addEventListener('click', hideDayDetail);
dayModal.addEventListener('click', e => {
  if (e.target === dayModal) hideDayDetail();
});

// Recent location event listener
recentBtn.addEventListener('click', loadRecentLocation);

// Sources section toggle (collapsible)
sourcesToggle.addEventListener('click', () => {
  sourcesSection.classList.toggle('open');
});

// Refresh button
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    if (lastLoc) fetchWeather(lastLoc.lat, lastLoc.lon, lastLoc.name);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
if (!navigator.onLine) {
  offlineInd.classList.add('active');
  loadCache();
}

// Visa senaste plats vid start
updateRecentLocation();
