// Loads /api/meta once and shares it (tag labels, hubs, settings).
import { useEffect, useState } from 'react';
import { api } from './api.js';

let cache = null;
export function useMeta() {
  const [meta, setMeta] = useState(cache);
  useEffect(() => { if (!cache) api.get('/meta').then((m) => { cache = m; setMeta(m); }).catch(() => {}); }, []);
  const labels = meta ? Object.fromEntries(meta.tagGroups.flatMap((g) => g.tags.map((t) => [t.id, t.label]))) : {};
  return { meta, labels };
}
