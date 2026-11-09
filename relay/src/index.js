// Jackers realtime relay — Cloudflare Worker + Durable Object (one object per room).
// The admin's browser is still the game authority; this only fans messages out to
// every socket in the room (sender included) and caches the latest gameState so a
// phone that connects mid-game sees the table instantly.

const ALLOWED_ORIGINS = [
  'https://jackers-solo.vercel.app',
  /^https:\/\/jackers-solo-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
const MAX_MESSAGE_BYTES = 64 * 1024;

function originAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    if (!originAllowed(request.headers.get('Origin'))) {
      return new Response('Forbidden origin', { status: 403 });
    }

    const id = env.ROOMS.idFromName(match[1]);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const last = await this.ctx.storage.get('lastState');
    if (last) server.send(last);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return;
    if (message === 'ping') { ws.send('pong'); return; }

    let parsed;
    try { parsed = JSON.parse(message); } catch { return; }
    if (!parsed || typeof parsed.type !== 'string') return;

    if (parsed.type === 'gameState') {
      await this.ctx.storage.put('lastState', message);
    }

    for (const peer of this.ctx.getWebSockets()) {
      try { peer.send(message); } catch { /* socket already closed */ }
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'closing'); } catch { /* already closed */ }
  }

  async webSocketError(ws) {
    try { ws.close(1011, 'error'); } catch { /* already closed */ }
  }
}
