// Pricing rules. The SQL function place_order() mirrors this file exactly;
// the server result is the only amount ever charged.
export const DEFAULT_RATES = { bwSingle: 2, bwDouble: 3, colorSingle: 10, colorDouble: 20, spiral: 30 };

/** Number of pages actually printed from one copy (manual range or whole file). */
export function pagesInRange({ pages, from = null, to = null, ranges = null }) {
  if (ranges?.length) return ranges.reduce((n, r) => n + (r.to - r.from + 1), 0);
  return (to ?? pages) - (from ?? 1) + 1;
}

/** Sheets of paper for one file: copies, then N-in-1 faces, then double-sided pairing. */
export function sheetsForFile({ pages, from = null, to = null, ranges = null, copies = 1, layout = 1, sides = 'single' }) {
  const printed = pagesInRange({ pages, from, to, ranges }) * copies;
  const faces = Math.ceil(printed / layout);
  return sides === 'double' ? Math.ceil(faces / 2) : faces;
}

/** Order total = total B&W sheets x rate + total colour sheets x rate + spiral per file. */
export function calcOrder(files, rates = DEFAULT_RATES) {
  const sheets = { bw: { single: 0, double: 0 }, color: { single: 0, double: 0 } };
  let spiralCount = 0;
  const perFile = files.map((f) => {
    const n = sheetsForFile(f);
    sheets[f.color][f.sides] += n;
    if (f.spiral) spiralCount += 1;
    const rate = rates[(f.color === 'bw' ? 'bw' : 'color') + (f.sides === 'single' ? 'Single' : 'Double')];
    return { name: f.name, sheets: n, cost: n * rate + (f.spiral ? rates.spiral : 0) };
  });
  const bwCost = sheets.bw.single * rates.bwSingle + sheets.bw.double * rates.bwDouble;
  const colorCost = sheets.color.single * rates.colorSingle + sheets.color.double * rates.colorDouble;
  const spiralCost = spiralCount * rates.spiral;
  return { perFile, sheets, bwCost, colorCost, spiralCost, total: bwCost + colorCost + spiralCost };
}
