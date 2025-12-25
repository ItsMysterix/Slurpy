#!/usr/bin/env node
const http = require('http');

const PORT = process.env.MOCK_BACKEND_PORT ? Number(process.env.MOCK_BACKEND_PORT) : 8000;

function sendJson(res, obj, status = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function streamNDJSON(res, items = []) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
  });
  // send small startup bundle
  const enc = (o) => JSON.stringify(o) + "\n";
  // optionally send a start payload
  res.write(enc({ type: 'start', emotions: ['neutral'], valence: 0, arousal: 0, target: 'self', cause: 'mocked', tone: 'normal', budgetMultiplier: 1.0 }));
  for (const it of items) {
    res.write(enc({ type: 'delta', delta: it }));
  }
  // send a couple of deltas
  // send a couple of deltas that match the test's expected assistant message
  res.write(enc({ type: 'delta', delta: "I'm here to " }));
  res.write(enc({ type: 'delta', delta: 'help!' }));
  // done
  res.write(enc({ type: 'done', done: true }));
  try { res.end(); } catch (e) {}
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (req.method === 'POST' && url === '/mcp/stream') {
    // collect body
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      console.log('/mcp/stream called, body=', body.slice(0,200));
      // simple response: stream ndjson
      streamNDJSON(res, ['x', 'y', 'z']);
    });
    return;
  }
  if (req.method === 'POST' && url === '/cel/reason') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      console.log('/cel/reason called, body=', body.slice(0,200));
      sendJson(res, { causes: [{ reason: 'mocked reason' }], masking: { masking: false }, targets: { other: 'topic' }, adaptation: {}, personalization: {} });
    });
    return;
  }
  if (req.method === 'POST' && url === '/api/nlp/analyze') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      console.log('/api/nlp/analyze called, body=', body.slice(0,200));
      sendJson(res, { emotions: { labels: ['neutral'] }, valence: 0, arousal: 0 });
    });
    return;
  }

  // default
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => console.log(`Mock backend listening on http://localhost:${PORT}`));

// graceful shutdown
process.on('SIGINT', () => { console.log('Shutting down mock backend'); server.close(() => process.exit(0)); });
