// Thin fetch wrapper. The X-Requested-With header is the server's CSRF guard.
import { useEffect, useRef } from 'react';

export async function api(method, path, body) {
  const res = await fetch('/api' + path, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PlaceMate' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { code: data.code, status: res.status, data });
  return data;
}
api.get = (p) => api('GET', p);
api.post = (p, b = {}) => api('POST', p, b);
api.put = (p, b) => api('PUT', p, b);
api.patch = (p, b) => api('PATCH', p, b);
api.del = (p, b) => api('DELETE', p, b);

/** Calls onEvent whenever the server says something changed (live updates over SSE). */
export function useLive(onEvent) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (m) => { try { ref.current(JSON.parse(m.data)); } catch { ref.current({}); } };
    return () => es.close();
  }, []);
}
