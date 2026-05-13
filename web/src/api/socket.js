/**
 * Tiny WebSocket client for backend real-time events.
 *
 * The backend exposes /ws and broadcasts JSON messages of shape
 *   { event: 'sides:updated', data: {...} }
 *
 * Components subscribe with `onEvent(handler)` and receive the parsed payload.
 * Auto-reconnects with exponential backoff if the connection drops.
 */
import { getApiBaseUrl } from './client';

let socket = null;
let listeners = new Set();
let reconnectAttempts = 0;
let reconnectTimer = null;

function wsUrl() {
  const base = getApiBaseUrl();
  return base.replace(/^http/, 'ws') + '/ws';
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    socket = new WebSocket(wsUrl());
  } catch (err) {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectAttempts = 0;
  };

  socket.onmessage = (msg) => {
    let parsed;
    try { parsed = JSON.parse(msg.data); } catch (_) { return; }
    listeners.forEach((fn) => {
      try { fn(parsed); } catch (e) { /* swallow */ }
    });
  };

  socket.onclose = () => { scheduleReconnect(); };
  socket.onerror = () => { try { socket.close(); } catch (_) {} };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts++));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

export function onEvent(handler) {
  listeners.add(handler);
  connect();
  return () => { listeners.delete(handler); };
}
