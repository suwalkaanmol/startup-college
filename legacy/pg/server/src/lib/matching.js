// Roommate compatibility score (0-100). Viewer's top-3 priorities weigh 3/2/1.
const WEIGHTS = [3, 2, 1];

export function matchScore(viewer, cand) {
  if (!viewer.tags.length) return null; // nothing to compare; caller sorts by distance
  const c = new Set(cand.tags);
  const v = new Set(viewer.tags);
  const inter = [...v].filter((t) => c.has(t)).length;
  const union = new Set([...v, ...c]).size;
  const overlap = union ? inter / union : 0;
  if (!viewer.priorities.length) return Math.round(overlap * 100);
  const total = viewer.priorities.reduce((s, _, i) => s + WEIGHTS[i], 0);
  const got = viewer.priorities.reduce((s, t, i) => s + (c.has(t) ? WEIGHTS[i] : 0), 0);
  return Math.round((0.7 * (got / total) + 0.3 * overlap) * 100);
}
