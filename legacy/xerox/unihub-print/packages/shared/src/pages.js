// Page-range validation and the daily token letter.

/** Returns an error message, or null when the range is valid for a file of `pages` pages. */
export function validateRange(from, to, pages) {
  if (![from, to, pages].every(Number.isInteger)) return 'Enter whole page numbers.';
  if (from < 1 || to > pages) return `Pages must be between 1 and ${pages}.`;
  if (from > to) return '"From" page cannot be after "To" page.';
  return null;
}

const DAY_MS = 86400000;

/** Letter for a given IST calendar day (YYYY-MM-DD): A on launch day, B next, ... wraps after Z. */
export function tokenLetter(dayISO, launchISO) {
  const days = Math.round((Date.parse(dayISO) - Date.parse(launchISO)) / DAY_MS);
  return String.fromCharCode(65 + (((days % 26) + 26) % 26));
}

export const formatToken = (letter, seq) => `${letter}${seq}`;
