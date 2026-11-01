// Single source of truth for roommate preference tags (served by GET /api/meta).
// All tags are positive-only and optional; `exclusive` groups allow one pick.
export const TAG_GROUPS = [
  { id: 'food', label: 'Food', exclusive: true, tags: [
    { id: 'vegetarian', label: 'Vegetarian' },
    { id: 'eggetarian', label: 'Eggetarian' },
    { id: 'non_veg', label: 'Non-vegetarian' } ] },
  { id: 'habits', label: 'Habits', exclusive: false, tags: [
    { id: 'non_smoker', label: 'Non-smoker' },
    { id: 'non_drinker', label: 'Non-drinker' },
    { id: 'neat', label: 'Neat and hygienic' },
    { id: 'cooks', label: 'Likes to cook' } ] },
  { id: 'routine', label: 'Daily routine', exclusive: true, tags: [
    { id: 'early_sleeper', label: 'Early sleeper' },
    { id: 'night_owl', label: 'Night owl' } ] },
  { id: 'home', label: 'At home', exclusive: false, tags: [
    { id: 'quiet', label: 'Quiet room' },
    { id: 'friends_rare', label: 'Friends visit rarely' },
    { id: 'friends_welcome', label: 'Friends welcome' },
    { id: 'office_work', label: 'Works from office' } ] },
  { id: 'interests', label: 'Interests', exclusive: false, tags: [
    { id: 'gym', label: 'Gym and fitness' },
    { id: 'sports', label: 'Sports' },
    { id: 'music', label: 'Music' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'reading', label: 'Reading' },
    { id: 'upskilling', label: 'Upskilling / exams' },
    { id: 'trips', label: 'Weekend trips' } ] },
];

const groupOf = new Map();
for (const g of TAG_GROUPS) for (const t of g.tags) groupOf.set(t.id, g);

/**
 * Clean user input: drop unknown tags, keep one per exclusive group (first wins),
 * and keep only priorities that are selected tags (max 3, no duplicates).
 */
export function sanitizeTags(rawTags = [], rawPriorities = []) {
  const seenGroups = new Set();
  const tags = [];
  for (const id of Array.isArray(rawTags) ? rawTags : []) {
    const g = groupOf.get(id);
    if (!g || tags.includes(id)) continue;
    if (g.exclusive) {
      if (seenGroups.has(g.id)) continue;
      seenGroups.add(g.id);
    }
    tags.push(id);
  }
  const priorities = [];
  for (const id of Array.isArray(rawPriorities) ? rawPriorities : []) {
    if (tags.includes(id) && !priorities.includes(id) && priorities.length < 3) priorities.push(id);
  }
  return { tags, priorities };
}
