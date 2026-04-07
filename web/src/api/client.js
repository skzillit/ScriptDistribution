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

client.interceptors.request.use((config) => {
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

export function setUserId(userId) {
  moduleDataConfig.userId = userId;
  localStorage.setItem('userId', userId);
}

export function getApiBaseUrl() {
  return API_BASE;
}

export default client;
