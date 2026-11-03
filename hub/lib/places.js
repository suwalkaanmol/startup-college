// One database per canteen and per Xerox shop: each place's menu, orders, files and chats live in
// their own file (data/places/food-kc.json, data/places/xerox-tt.json ...), apart from every other place.
import path from 'node:path';
import { createStore } from './store.js';

export function createPlaces(dir, open = createStore) {
  const cache = new Map();
  const file = (kind, id) => path.join(dir, 'places', `${kind}-${String(id).replace(/[^a-z0-9-]/gi, '_')}.json`);
  return {
    get(kind, id) {
      const k = `${kind}:${id}`;
      if (!cache.has(k)) cache.set(k, open(file(kind, id)));
      return cache.get(k);
    },
    dir: (kind, id) => file(kind, id).replace(/\.json$/, ''),
    flushAll() { for (const s of cache.values()) s.flushNow(); },
  };
}
