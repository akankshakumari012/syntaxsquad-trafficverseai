/* ============================================================
   TraffiVerse AI — Firebase Configuration & Firestore Helpers
   NOTE: Replace firebaseConfig with your actual Firebase project
         credentials from https://console.firebase.google.com
   ============================================================ */

// ── Firebase SDK (v9 compat) loaded via CDN in HTML ──
// This file uses the compat (global) API for simplicity.

/* ── Firebase Config ──────────────────────────────────────────
   Replace the values below with your actual Firebase project config.
   Go to Firebase Console → Project Settings → Your Apps → Web App
   ─────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyDEMO_REPLACE_WITH_YOUR_KEY",
  authDomain:        "traffiverse-ai.firebaseapp.com",
  projectId:         "traffiverse-ai",
  storageBucket:     "traffiverse-ai.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef1234567890abcdef"
};

/* ── Initialize Firebase ── */
let db = null;
let firebaseReady = false;

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('[TraffiVerse] Firebase SDK not loaded. Running in demo mode.');
      return false;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    firebaseReady = true;
    console.log('[TraffiVerse] Firebase initialized ✓');
    return true;
  } catch (err) {
    console.warn('[TraffiVerse] Firebase init failed. Demo mode active.', err.message);
    return false;
  }
}

/* ============================================================
   LOCAL DEMO STORE — used when Firebase is unavailable
   Simulates Firestore with localStorage + in-memory array
   ============================================================ */
const DemoStore = {
  _key: 'traffiverse_data',

  // Get all records
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this._key) || '[]');
    } catch { return []; }
  },

  // Save a new record
  save(record) {
    const all = this.getAll();
    record.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    all.unshift(record);
    // Keep last 200 records
    if (all.length > 200) all.splice(200);
    localStorage.setItem(this._key, JSON.stringify(all));
    return record;
  },

  // Clear all records
  clear() {
    localStorage.removeItem(this._key);
  }
};

/* ============================================================
   PUBLIC API — used throughout the app
   ============================================================ */

/**
 * Save a traffic event to Firestore (or demo store).
 * @param {Object} data - { vehicleCount, signal, isAmbulance, congestionLevel, location }
 * @returns {Promise<string>} Document ID
 */
async function saveTrafficData(data) {
  const record = {
    ...data,
    timestamp: new Date().toISOString(),
    createdAt: Date.now()
  };

  if (firebaseReady && db) {
    try {
      const docRef = await db.collection('traffic_events').add({
        ...record,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log('[Firestore] Saved event:', docRef.id);
      return docRef.id;
    } catch (err) {
      console.warn('[Firestore] Write failed, using demo store:', err.message);
    }
  }

  // Fallback: demo store
  const saved = DemoStore.save(record);
  return saved.id;
}

/**
 * Fetch recent traffic events (newest first, limit 100).
 * @returns {Promise<Array>} Array of traffic event objects
 */
async function fetchTrafficData() {
  if (firebaseReady && db) {
    try {
      const snap = await db.collection('traffic_events')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Normalize timestamp to ISO string
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || doc.data().timestamp
      }));
    } catch (err) {
      console.warn('[Firestore] Read failed, using demo store:', err.message);
    }
  }

  return DemoStore.getAll();
}

/**
 * Subscribe to real-time traffic updates.
 * @param {Function} callback - called with array of events on each update
 * @returns {Function} Unsubscribe function
 */
function subscribeToTraffic(callback) {
  if (firebaseReady && db) {
    try {
      return db.collection('traffic_events')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snap => {
          const data = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || doc.data().timestamp
          }));
          callback(data);
        }, err => {
          console.warn('[Firestore] Subscription error:', err.message);
        });
    } catch (err) {
      console.warn('[Firestore] Could not subscribe:', err.message);
    }
  }

  // Demo: poll localStorage every 3 seconds
  const interval = setInterval(() => {
    callback(DemoStore.getAll());
  }, 3000);

  return () => clearInterval(interval);
}

/**
 * Compute analytics from an array of traffic events.
 * @param {Array} events
 * @returns {Object} Analytics summary
 */
function computeAnalytics(events) {
  if (!events || events.length === 0) {
    return {
      total: 0,
      avgVehicles: 0,
      maxVehicles: 0,
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
      ambulanceCount: 0,
      congestionScore: 0,
      congestionLabel: 'No Data'
    };
  }

  const total = events.length;
  const totalVehicles = events.reduce((s, e) => s + (e.vehicleCount || 0), 0);
  const maxVehicles   = Math.max(...events.map(e => e.vehicleCount || 0));
  const avgVehicles   = Math.round(totalVehicles / total);

  const greenCount    = events.filter(e => e.signal === 'GREEN').length;
  const yellowCount   = events.filter(e => e.signal === 'YELLOW').length;
  const redCount      = events.filter(e => e.signal === 'RED').length;
  const ambulanceCount= events.filter(e => e.isAmbulance).length;

  // Congestion score: weighted average of recent vehicle counts
  const recent = events.slice(0, 10);
  const recentAvg = recent.reduce((s, e) => s + (e.vehicleCount || 0), 0) / (recent.length || 1);
  const congestionScore = Math.min(100, Math.round((recentAvg / 50) * 100));

  let congestionLabel = 'Low';
  if (congestionScore >= 70) congestionLabel = 'Critical';
  else if (congestionScore >= 50) congestionLabel = 'High';
  else if (congestionScore >= 30) congestionLabel = 'Moderate';

  return { total, avgVehicles, maxVehicles, greenCount, yellowCount, redCount, ambulanceCount, congestionScore, congestionLabel };
}

// ── Auto-initialize ──
document.addEventListener('DOMContentLoaded', initFirebase);
