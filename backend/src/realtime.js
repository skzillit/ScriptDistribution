/**
 * Lightweight WebSocket broadcaster for real-time sides events.
 *
 * Backend calls `broadcast('sides:updated', payload)` after a sides record
 * changes status (generating → ready / error). Every connected web, Android,
 * and iOS client receives the JSON message and refreshes its list.
 *
 * Protocol: plain JSON-over-WebSocket. Each message looks like:
 *   { "event": "sides:updated", "data": { "id": "...", "status": "ready", ... } }
 *
 * Path: ws(s)://<host>/ws
 */

const WebSocket = require('ws');

let wss = null;

function init(httpServer) {
  wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket, req) => {
    console.log(`[ws] client connected (${wss.clients.size} total) from ${req.socket.remoteAddress}`);

    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('close', () => {
      console.log(`[ws] client disconnected (${wss.clients.size} remaining)`);
    });

    // Send a hello so clients can confirm the channel is up.
    safeSend(socket, { event: 'hello', data: { ts: Date.now() } });
  });

  // Heartbeat: drop dead sockets every 30s so the count stays accurate.
  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) return socket.terminate();
      socket.isAlive = false;
      try { socket.ping(); } catch (_) {}
    });
  }, 30000);

  console.log('[ws] WebSocket server attached at /ws');
}

function safeSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.error('[ws] send failed:', err.message);
  }
}

/**
 * Broadcast an event to every connected client.
 * @param {string} event  Event name, e.g. 'sides:updated'
 * @param {object} data   JSON-serialisable payload
 */
function broadcast(event, data) {
  if (!wss) return;
  const payload = { event, data };
  wss.clients.forEach((socket) => safeSend(socket, payload));
}

module.exports = { init, broadcast };
