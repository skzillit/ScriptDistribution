import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Module data encryption for web (simplified - for dev, send plain JSON as moduledata)
// In production, implement AES encryption matching the Android client
let moduleDataConfig = {
  deviceId: localStorage.getItem('deviceId') || generateDeviceId(),
  userId: localStorage.getItem('userId') || null,
};

function generateDeviceId() {
  const id = 'web-' + Math.random().toString(36).slice(2, 14);
  localStorage.setItem('deviceId', id);
  return id;
}

// ── In-flight counter for the global loader ─────────────────────────────────
// Every request bumps `inFlight`; every response (success or error) decrements.
// React UI subscribes via `subscribeApiBusy`; we never use React state inside
// the axios layer to keep this module free of React deps.
let inFlight = 0;
const busyListeners = new Set();
function emitBusy() {
  for (const fn of busyListeners) {
    try { fn(inFlight); } catch (_) { /* listener errors must never break HTTP */ }
  }
}
export function subscribeApiBusy(fn) {
  busyListeners.add(fn);
  fn(inFlight);
  return () => busyListeners.delete(fn);
}

client.interceptors.request.use((config) => {
  inFlight++;
  emitBusy();
  const moduleData = JSON.stringify({
    device_id: moduleDataConfig.deviceId,
    user_id: moduleDataConfig.userId,
    time_stamp: Date.now(),
  });

  // For development: send as base64 (backend should handle both encrypted and plain)
  config.headers['moduledata'] = btoa(moduleData);
  config.headers['Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return config;
});

// Backend wraps every JSON response in:
//   { status, message, messageElements, data }
// Unwrap on the client so existing code that reads `response.data.xxx`
// keeps working unchanged — `response.data` is replaced by the envelope's
// `data` field. If the envelope reports status:0 (server-side failure), we
// reject with an Error so callers' .catch / try-catch keeps working too.
client.interceptors.response.use(
  (response) => {
    inFlight = Math.max(0, inFlight - 1);
    emitBusy();
    const body = response.data;
    const looksEnveloped =
      body && typeof body === 'object' && !Array.isArray(body)
      && 'status' in body && 'data' in body && 'message' in body && 'messageElements' in body;
    if (!looksEnveloped) return response;
    if (body.status === 0) {
      const err = new Error(body.message || 'Request failed');
      err.response = { ...response, data: { error: body.message } };
      return Promise.reject(err);
    }
    response.data = body.data;
    return response;
  },
  (error) => {
    inFlight = Math.max(0, inFlight - 1);
    emitBusy();
    // Server-thrown errors still come through here. Unwrap so callers that
    // read err.response.data.error continue to work.
    const body = error.response && error.response.data;
    const looksEnveloped =
      body && typeof body === 'object' && !Array.isArray(body)
      && 'status' in body && 'data' in body && 'message' in body && 'messageElements' in body;
    if (looksEnveloped) {
      error.response.data = { error: body.message };
    }
    return Promise.reject(error);
  },
);

export function setUserId(userId) {
  moduleDataConfig.userId = userId;
  localStorage.setItem('userId', userId);
}

export function getApiBaseUrl() {
  return API_BASE;
}

export default client;
