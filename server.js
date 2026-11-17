'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getLiveSnapshot, fetchLiveHistory } = require('./live-market-service.js');

const PORT = Number(process.env.PORT) || 4173;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const sseClients = new Set();
let broadcastTimer = null;

function ensureBroadcastLoop() {
  if (broadcastTimer) return;
  broadcastTimer = setInterval(async () => {
    if (sseClients.size === 0) {
      clearInterval(broadcastTimer);
      broadcastTimer = null;
      return;
    }
    try {
      const snapshot = await getLiveSnapshot(true);
      const payload = `data: ${JSON.stringify({ ...snapshot, sseSupported: true })}\n\n`;
      for (const res of sseClients) {
        res.write(payload);
      }
    } catch (_) {
      // ignore transient broadcast error
    }
  }, 5000);
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/live/all') {
    const force = urlObj.searchParams.get('force') === '1';
    try {
      const snapshot = await getLiveSnapshot(force);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...snapshot, sseSupported: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/live/history') {
    const kind = urlObj.searchParams.get('kind') || 'nasdaq';
    const symbol = urlObj.searchParams.get('symbol') || '^NDX';
    const range = urlObj.searchParams.get('range') || '1y';
    try {
      const hist = await fetchLiveHistory(kind, symbol, range);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(hist));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/live/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    res.write('retry: 4000\n\n');
    sseClients.add(res);
    ensureBroadcastLoop();

    try {
      const initial = await getLiveSnapshot(false);
      res.write(`data: ${JSON.stringify({ ...initial, sseSupported: true })}\n\n`);
    } catch (_) {
      // ignore
    }

    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Static serving (supports both /psx.html and clean URL /psx just like Vercel)
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let resolved = path.resolve(ROOT_DIR, relPath);
  if (!resolved.startsWith(ROOT_DIR + path.sep) && resolved !== path.join(ROOT_DIR, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(resolved) && !path.extname(resolved) && fs.existsSync(resolved + '.html')) {
    resolved = resolved + '.html';
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Investing Graph Studio running at http://localhost:${PORT}`);
});
