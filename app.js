/* ============================================================
   TraffiVerse AI — Landing Page Application Logic (app.js)
   Handles: simulation, signal logic, ambulance detection,
            map, alerts, theme toggle, real-time display
   ============================================================ */

'use strict';

/* ── State ─────────────────────────────────────────────────── */
const State = {
  theme:        'light',          // 'light' | 'dark'
  signal:       null,             // 'RED' | 'YELLOW' | 'GREEN'
  vehicleCount: 0,
  isAmbulance:  false,
  isSimulating: false,
  map:          null,
  markers:      {},
  ambulanceLine: null,
  alertQueue:   [],
  alertShowing: false,
  autoTimer:    null,
};

/* ── DOM Helpers ────────────────────────────────────────────── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ── Theme Toggle ───────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('tv_theme') || 'light';
  setTheme(saved);

  $$('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(State.theme === 'light' ? 'dark' : 'light');
    });
  });
}

function setTheme(theme) {
  State.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tv_theme', theme);
  $$('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
  // Update Leaflet tiles if map is ready
  if (State.map && window._mapTileLayer) {
    try { State.map.removeLayer(window._mapTileLayer); } catch {}
    window._mapTileLayer = buildTileLayer().addTo(State.map);
  }
}

/* ── Map Initialization (Leaflet.js) ────────────────────────── */
function initMap() {
  if (!window.L) { console.warn('Leaflet not loaded'); return; }

  // Center: a demo city intersection
  const center = [19.0760, 72.8777]; // Mumbai, India

  State.map = L.map('map', {
    center,
    zoom: 14,
    zoomControl: true,
    attributionControl: false,
  });

  window._mapTileLayer = buildTileLayer().addTo(State.map);

  // ── Static Markers ──────────────────────────────────────────
  const locations = [
    { pos: [19.0760, 72.8777], type: 'signal',  label: 'Main Signal — Junction A', icon: '🚦' },
    { pos: [19.0790, 72.8810], type: 'signal',  label: 'Signal — Westbound',        icon: '🚦' },
    { pos: [19.0820, 72.8740], type: 'hospital', label: 'City General Hospital',    icon: '🏥' },
    { pos: [19.0730, 72.8750], type: 'police',   label: 'Police Station — Sector 5',icon: '🚔' },
  ];

  locations.forEach(loc => {
    const marker = L.marker(loc.pos, {
      icon: L.divIcon({
        html: `<div class="map-marker map-marker-${loc.type}">${loc.icon}</div>`,
        className: '',
        iconSize:  [42, 42],
        iconAnchor:[21, 21],
      })
    }).addTo(State.map)
      .bindPopup(`<strong>${loc.label}</strong><br><small>${loc.type.toUpperCase()}</small>`);

    State.markers[loc.type] = State.markers[loc.type] || [];
    State.markers[loc.type].push(marker);
  });
}

function buildTileLayer() {
  // Use a clean, neutral tile style
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  });
}

/* ── Signal Logic ───────────────────────────────────────────── */
/**
 * Determine signal color from vehicle count.
 * GREEN:  0–14  vehicles
 * YELLOW: 15–29 vehicles
 * RED:    30+   vehicles
 */
function getSignal(count) {
  if (count <  15) return 'GREEN';
  if (count <  30) return 'YELLOW';
  return 'RED';
}

function getCongestionLevel(count) {
  if (count <  15) return { label: 'Low',      score: Math.round((count / 14) * 30) };
  if (count <  30) return { label: 'Moderate', score: Math.round(30 + ((count - 15) / 14) * 35) };
  return               { label: 'High',      score: Math.min(100, Math.round(65 + ((count - 30) / 20) * 35)) };
}

/* ── Update Signal Display ──────────────────────────────────── */
function updateSignalDisplay(signal, vehicleCount, isAmbulance = false) {
  const housing = $('#signalHousing');
  const label   = $('#signalLabel');
  const desc    = $('#signalDesc');
  const congBar = $('#congestionBar');
  const congPct = $('#congestionPct');
  const congLbl = $('#congestionLabel');
  const resultBox = $('#resultBox');

  if (!housing) return;

  // Update lights
  ['red', 'yellow', 'green'].forEach(color => {
    const el = $(`#light-${color}`);
    if (el) el.className = 'signal-light' + (signal.toLowerCase() === color ? ` active-${color}` : '');
  });

  // Update label
  const labelMap = { GREEN: '🟢 GO', YELLOW: '🟡 SLOW', RED: '🔴 STOP' };
  const colorMap = { GREEN: '#00C853', YELLOW: '#D49900', RED: '#FF2D2D' };
  if (label) { label.textContent = isAmbulance ? '🚑 EMERGENCY CLEAR' : labelMap[signal]; label.style.color = isAmbulance ? '#FF2D2D' : colorMap[signal]; }

  const descMap = {
    GREEN:  `Low traffic detected. ${vehicleCount} vehicle(s) in zone.`,
    YELLOW: `Moderate congestion. ${vehicleCount} vehicle(s) — proceed with caution.`,
    RED:    `Heavy congestion! ${vehicleCount} vehicle(s) — signal is RED.`,
  };
  if (desc) desc.textContent = isAmbulance ? 'Emergency vehicle detected! All lanes cleared.' : descMap[signal];

  // Congestion bar
  const { label: cLabel, score } = getCongestionLevel(vehicleCount);
  if (congBar) {
    const barColor = signal === 'GREEN' ? '#00C853' : signal === 'YELLOW' ? '#FFB800' : '#FF2D2D';
    congBar.style.width = score + '%';
    congBar.style.background = `linear-gradient(90deg, ${barColor}, ${barColor}88)`;
  }
  if (congPct) congPct.textContent = score + '%';
  if (congLbl) congLbl.textContent = cLabel;

  // Result box highlight
  if (resultBox) {
    resultBox.className = 'result-box animate-scale-in';
    resultBox.setAttribute('data-signal', signal);
  }

  State.signal = signal;
}

/* ── Simulate Traffic ───────────────────────────────────────── */
async function simulateTraffic() {
  if (State.isSimulating) return;

  const input    = $('#vehicleInput');
  const ambCheck = $('#ambulanceCheck');
  const btn      = $('#simulateBtn');

  const rawValue     = input?.value?.trim();
  const vehicleCount = parseInt(rawValue, 10);

  // Validation
  if (!rawValue || isNaN(vehicleCount) || vehicleCount < 0) {
    showAlert('warning', '⚠️ Invalid Input', 'Please enter a valid number of vehicles (0 or more).'); return;
  }
  if (vehicleCount > 9999) {
    showAlert('warning', '⚠️ Too Many Vehicles', 'Please enter a count under 10,000.'); return;
  }

  const isAmbulance = ambCheck?.checked || false;

  // UI: loading state
  State.isSimulating = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Simulating…'; }

  // Simulate processing delay
  await sleep(900);

  // Determine signal
  let signal = getSignal(vehicleCount);
  if (isAmbulance) signal = 'GREEN'; // Always clear for ambulance

  State.vehicleCount = vehicleCount;
  State.isAmbulance  = isAmbulance;

  // Update display
  updateSignalDisplay(signal, vehicleCount, isAmbulance);

  // Show relevant alerts
  if (isAmbulance) {
    triggerAmbulanceProtocol(vehicleCount);
  } else {
    if (signal === 'RED') {
      showAlert('emergency', '🚨 Heavy Traffic Alert', `${vehicleCount} vehicles detected — signal forced RED. Avoid this zone.`);
    } else if (signal === 'YELLOW') {
      showAlert('warning', '⚠️ Moderate Congestion', `${vehicleCount} vehicles in zone. Signal is YELLOW — drive carefully.`);
    } else {
      showAlert('success', '✅ Clear Roads', `Only ${vehicleCount} vehicle(s) — roads are clear. Signal is GREEN.`);
    }
  }

  // Save to Firebase / demo store
  try {
    await saveTrafficData({
      vehicleCount,
      signal,
      isAmbulance,
      congestionLevel: getCongestionLevel(vehicleCount).label,
      location: 'Junction A — Mumbai Demo'
    });
    console.log('[TraffiVerse] Event saved.');
  } catch (err) {
    console.warn('[TraffiVerse] Could not save event:', err.message);
  }

  // Update vehicle count ticker
  animateCounter('#vehicleTicker', vehicleCount);

  // Restore button
  State.isSimulating = false;
  if (btn) { btn.disabled = false; btn.innerHTML = '▶ Simulate Traffic'; }
}

/* ── Ambulance Emergency Protocol ──────────────────────────── */
function triggerAmbulanceProtocol(vehicleCount) {
  // Alert sequence
  const alerts = [
    { type: 'emergency', icon: '🚑', title: 'Ambulance Detected!', msg: 'Emergency vehicle approaching — Clear the road immediately!' },
    { type: 'info',      icon: '🏥', title: 'Notifying Hospital',   msg: 'City General Hospital has been alerted. ER team on standby.' },
    { type: 'info',      icon: '🚔', title: 'Notifying Police',     msg: 'Police Station Sector 5 dispatched for escort.' },
  ];

  alerts.forEach((a, i) => {
    setTimeout(() => showAlert(a.type, `${a.icon} ${a.title}`, a.msg), i * 1800);
  });

  // Animate ambulance on map
  setTimeout(animateAmbulanceRoute, 400);

  // Flash the signal housing
  const housing = $('#signalHousing');
  if (housing) {
    housing.classList.add('emergency-flash');
    setTimeout(() => housing.classList.remove('emergency-flash'), 3000);
  }

  // Add ambulance route overlay
  addAmbulanceRoute();
}

/* ── Ambulance Map Animation ────────────────────────────────── */
function addAmbulanceRoute() {
  if (!State.map || !window.L) return;

  // Remove previous ambulance layer
  if (State.ambulanceLine) {
    try { State.map.removeLayer(State.ambulanceLine); } catch {}
  }

  const routeCoords = [
    [19.0680, 72.8820],
    [19.0720, 72.8800],
    [19.0760, 72.8777],
    [19.0790, 72.8750],
    [19.0820, 72.8740],
  ];

  State.ambulanceLine = L.polyline(routeCoords, {
    color: '#FF2D2D',
    weight: 5,
    opacity: 0.85,
    dashArray: '10, 8',
    dashOffset: '0',
    className: 'ambulance-route'
  }).addTo(State.map);

  // Animate dash offset
  let offset = 0;
  const animRoute = setInterval(() => {
    offset -= 2;
    const el = document.querySelector('.ambulance-route');
    if (el) el.style.strokeDashoffset = offset;
  }, 50);
  setTimeout(() => clearInterval(animRoute), 8000);

  // Add moving ambulance marker
  let step = 0;
  const ambMarker = L.marker(routeCoords[0], {
    icon: L.divIcon({ html: '<div style="font-size:2rem;filter:drop-shadow(0 2px 6px rgba(255,45,45,0.7))">🚑</div>', className: '', iconSize:[40,40], iconAnchor:[20,20] })
  }).addTo(State.map);

  const moveAmb = setInterval(() => {
    step++;
    if (step >= routeCoords.length) { clearInterval(moveAmb); State.map.removeLayer(ambMarker); return; }
    ambMarker.setLatLng(routeCoords[step]);
  }, 800);
}

function animateAmbulanceRoute() {
  const strip = $('#ambulanceStrip');
  if (!strip) return;
  strip.style.display = 'flex';
  strip.innerHTML = '<span style="font-size:2rem;animation:ambulance-move 3s linear forwards;position:absolute;top:50%;transform:translateY(-50%)">🚑</span>';
  setTimeout(() => { strip.style.display = 'none'; }, 3500);
}

/* ── Alert System ───────────────────────────────────────────── */
function showAlert(type, title, msg, duration = 5000) {
  const typeMap = {
    emergency: 'alert-emergency',
    warning:   'alert-warning',
    success:   'alert-success',
    info:      'alert-info',
  };
  const banner = $('#alertBanner');
  if (!banner) return;

  banner.className = `alert-banner ${typeMap[type] || typeMap.info}`;
  $('#alertTitle').textContent = title;
  $('#alertMsg').textContent   = msg;

  banner.classList.add('show');
  clearTimeout(window._alertTimer);
  window._alertTimer = setTimeout(() => banner.classList.remove('show'), duration);
}

function closeAlert() {
  $('#alertBanner')?.classList.remove('show');
}

/* ── Counter Animation ──────────────────────────────────────── */
function animateCounter(selector, targetValue, duration = 800) {
  const el = $(selector);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff  = targetValue - start;
  const steps = 30;
  const step  = diff / steps;
  let current = start;
  let count   = 0;

  const interval = setInterval(() => {
    count++;
    current += step;
    el.textContent = Math.round(count >= steps ? targetValue : current);
    if (count >= steps) clearInterval(interval);
  }, duration / steps);
}

/* ── Auto-Simulation (real-time demo) ──────────────────────── */
let autoSimInterval = null;

function startAutoSim() {
  if (autoSimInterval) return;
  const btn = $('#autoSimBtn');
  if (btn) { btn.textContent = '⏹ Stop Auto-Sim'; btn.classList.add('btn-outline'); }

  autoSimInterval = setInterval(async () => {
    if (State.isSimulating) return;
    const randomCount = Math.floor(Math.random() * 55);
    const input = $('#vehicleInput');
    if (input) input.value = randomCount;
    // Uncheck ambulance for auto-sim
    const ambCheck = $('#ambulanceCheck');
    if (ambCheck) ambCheck.checked = false;
    await simulateTraffic();
  }, 6000);
}

function stopAutoSim() {
  clearInterval(autoSimInterval);
  autoSimInterval = null;
  const btn = $('#autoSimBtn');
  if (btn) { btn.textContent = '⚡ Auto-Simulate'; btn.classList.remove('btn-outline'); }
}

function toggleAutoSim() {
  autoSimInterval ? stopAutoSim() : startAutoSim();
}

/* ── Utility ────────────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Recent Events Feed ─────────────────────────────────────── */
async function loadRecentFeed() {
  const feed = $('#recentFeed');
  if (!feed) return;

  try {
    const events = await fetchTrafficData();
    renderFeed(feed, events.slice(0, 5));
  } catch { /* silent */ }

  // Live subscription
  subscribeToTraffic(events => renderFeed(feed, events.slice(0, 5)));
}

function renderFeed(container, events) {
  if (!container) return;
  if (!events.length) {
    container.innerHTML = '<p class="empty-feed">No events yet. Run a simulation!</p>';
    return;
  }
  container.innerHTML = events.map(e => `
    <div class="feed-item animate-fade-in">
      <span class="feed-signal" data-signal="${e.signal}">${e.signal}</span>
      <span class="feed-count">${e.vehicleCount} vehicles</span>
      ${e.isAmbulance ? '<span class="badge badge-red">🚑 EMR</span>' : ''}
      <span class="feed-time">${formatTime(e.timestamp)}</span>
    </div>
  `).join('');
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch { return '—'; }
}

/* ── Range slider sync ──────────────────────────────────────── */
function initRangeSlider() {
  const slider = $('#vehicleSlider');
  const input  = $('#vehicleInput');
  if (!slider || !input) return;

  slider.addEventListener('input', () => {
    input.value = slider.value;
    // live preview signal
    const count  = parseInt(slider.value);
    const signal = getSignal(count);
    updateSignalDisplay(signal, count, false);
  });

  input.addEventListener('input', () => {
    const val = parseInt(input.value);
    if (!isNaN(val) && val >= 0 && val <= 100) slider.value = val;
  });
}

/* ── Vehicle Type Buttons ───────────────────────────────────── */
function addVehicles(count) {
  const input = $('#vehicleInput');
  if (!input) return;
  const current = parseInt(input.value) || 0;
  input.value = Math.min(9999, current + count);
  const slider = $('#vehicleSlider');
  if (slider) slider.value = Math.min(100, input.value);
  input.classList.add('input-pulse');
  setTimeout(() => input.classList.remove('input-pulse'), 400);
}

function resetVehicles() {
  const input = $('#vehicleInput');
  if (input) input.value = '';
  const slider = $('#vehicleSlider');
  if (slider) slider.value = 0;
}

/* ── Init ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Theme
  initTheme();

  // Map
  if (document.getElementById('map')) {
    setTimeout(initMap, 200); // wait for CSS render
  }

  // Wire up buttons
  $('#simulateBtn')?.addEventListener('click', simulateTraffic);
  $('#autoSimBtn')?.addEventListener('click', toggleAutoSim);
  $('#alertClose')?.addEventListener('click', closeAlert);

  // Ambulance quick-trigger
  $('#ambulanceBtn')?.addEventListener('click', () => {
    const ambCheck = $('#ambulanceCheck');
    if (ambCheck) ambCheck.checked = true;
    const input = $('#vehicleInput');
    if (input && !input.value) input.value = '5';
    simulateTraffic();
  });

  // Range & inputs
  initRangeSlider();

  // Enter key submits form
  $('#vehicleInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') simulateTraffic();
  });

  // Load recent events
  await loadRecentFeed();

  // Init default signal display
  updateSignalDisplay('GREEN', 0, false);

  // Animate hero elements on load
  $$('.animate-fade-up').forEach((el, i) => {
    el.style.animationDelay = (i * 0.1) + 's';
  });
});
