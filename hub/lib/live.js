// Live updates with Server-Sent Events. Clients subscribe to topics they are allowed to see;
// routes call publish(topic, data) after a change and the page refetches or patches itself.
export function createLive() {
  const subs = new Map(); // topic -> Set(res)
  let seq = 0;
  const ping = setInterval(() => { for (const set of subs.values()) for (const res of set) res.write(': ping\n\n'); }, 25000);
  ping.unref();
  return {
    open(req, res, topics) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      for (const t of topics) { if (!subs.has(t)) subs.set(t, new Set()); subs.get(t).add(res); }
      req.on('close', () => { for (const t of topics) { const s = subs.get(t); if (s) { s.delete(res); if (!s.size) subs.delete(t); } } });
    },
    publish(topic, data = {}) {
      const set = subs.get(topic); if (!set) return;
      const msg = `id: ${++seq}\nevent: update\ndata: ${JSON.stringify({ topic, ...data })}\n\n`;
      for (const res of set) res.write(msg);
    },
    count() { let n = 0; for (const s of subs.values()) n += s.size; return n; },
  };
}
