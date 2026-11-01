/**
 * Dietary classification helper for UniHub Canteen menu items.
 *
 * Supported dietary options:
 * - 'veg': Vegetarian dishes (dairy and plant products only, no meat/fish/egg)
 * - 'non-veg': Non-vegetarian dishes (chicken, mutton, seafood, egg, omelette, etc.)
 *
 * Multi-layer deterministic resolution:
 * 1. Pure veg canteens (all items marked veg).
 * 2. Explicit dietary_label values from DB or owner updates ('veg', 'non-veg', 'vegetarian', 'non-vegetarian', booleans).
 * 3. Known dedicated Non-Veg categories (Special Omelette, Sandwich Eggterian, Chicken Special Dry, etc.).
 * 4. Known dedicated Vegetarian categories (Morning Breakfast, North Indian Veg, Starters Veg, Breads, Shakes, etc.).
 * 5. Multi-cuisine token and ingredient matching (meat, seafood, egg preparations, omelettes, and explicit 'Non Veg'/'(NV)' markers).
 */
export function getNormalizedDiet(item, canteen = null) {
  if (!item) return 'veg';

  // 1. Pure veg canteen check
  if (
    item.canteen_is_pure_veg === true ||
    (canteen && (canteen.is_pure_veg === true || canteen.pure_veg === true))
  ) {
    return 'veg';
  }

  // 2. Explicit dietary_label check (authoritative source of truth from DB / owner edits)
  const raw = String(item.dietary_label || '').trim().toLowerCase();
  if (raw === 'veg' || raw === 'vegetarian' || raw === 'pure_veg' || raw === 'true') {
    return 'veg';
  }
  if (raw === 'non-veg' || raw === 'nonveg' || raw === 'non-vegetarian' || raw === 'false') {
    return 'non-veg';
  }

  const catLower = String(item.category || '').trim().toLowerCase();
  const nameLower = String(item.name || '').trim().toLowerCase();
  const fullText = `${nameLower} ${catLower} ${item.note || ''} ${item.description || ''}`.toLowerCase();

  // 3. Dedicated Non-Veg Categories
  const dedicatedNonVegCategories = [
    'chicken special dry',
    'chinese gravy & dry non-veg',
    'north indian non-veg',
    'starters non-veg',
    'special omelette',
    'sandwich eggterian',
    'omelette & bread omelette'
  ];
  if (dedicatedNonVegCategories.includes(catLower)) {
    return 'non-veg';
  }

  // 4. Dedicated Vegetarian Categories (unless explicit meat/egg keyword is present)
  const dedicatedVegCategories = [
    'breads',
    'chat',
    'chinese gravy & dry veg',
    'cold beverages',
    'flavoured soda',
    'fresh juice',
    'ice cream',
    'lassi',
    'milkshakes',
    'mojito',
    'morning breakfast',
    'north indian veg',
    'salad',
    'sandwich veg trim',
    'special ice cream',
    'starters veg',
    'baked mac & cheese',
    'cheese items',
    'panner items',
    'stuffed paratha',
    'special foods'
  ];
  if (dedicatedVegCategories.includes(catLower)) {
    const hasMeatOrEgg = /\b(chicken|mutton|fish|prawn|crab|meat|beef|pork|egg|omelette)\b/i.test(fullText);
    if (!hasMeatOrEgg) {
      return 'veg';
    }
  }

  // 5. Explicit Non-Veg Indicators in Name / Text (e.g. 'American Chopsy Non Veg', 'Darling Triple Rice (NV)', 'N/V')
  if (/\bnon[- ]?veg\b/i.test(fullText) || /\(nv\)/i.test(fullText) || /\bn\/v\b/i.test(fullText)) {
    return 'non-veg';
  }

  // 6. Poultry, Red Meat, and Seafood
  const meatRegex = /\b(chicken|mutton|lamb|beef|pork|bacon|meat|keema|kheema|fish|prawns?|shrimps?|crabs?|tuna|salmon)\b/i;
  if (meatRegex.test(fullText)) {
    return 'non-veg';
  }

  // 7. Eggs & Egg preparations (avoid matching 'eggless')
  if (/\b(omelettes?|omlets?|omlettes?)\b/i.test(fullText)) {
    return 'non-veg';
  }
  if (/\b(scrambled|double|six)\s+eggs?\b/i.test(fullText)) {
    return 'non-veg';
  }
  if (/\beggs?\b/i.test(fullText) && !fullText.includes('eggless')) {
    return 'non-veg';
  }

  // 8. Tandoori/Kebab/Wing/Lollipop Meat Specialties
  if (/\b(tangri|lollipops?|wings?)\b/i.test(fullText)) {
    return 'non-veg';
  }
  if (/\b(kebab|kabab)\b/i.test(fullText)) {
    const isVegKebab = /\b(paneer|panner|veg|gobi|mushroom|corn|soya|hara)\b/i.test(fullText);
    if (!isVegKebab) return 'non-veg';
  }
  if (/\btikka\b/i.test(fullText)) {
    const isVegTikka = /\b(paneer|panner|veg|mushroom|aloo|gobi|corn|soya)\b/i.test(fullText);
    if (!isVegTikka) return 'non-veg';
  }

  // 9. Standard plant and dairy dishes fallback
  return 'veg';
}
