/**
 * Date and Time utilities for UniHub Canteen (Asia/Kolkata IST)
 *
 * Consistent handling of UTC and offset-aware timestamps across UniHub.
 * Stored in UTC on backend / database; converted to Asia/Kolkata for display.
 */

/**
 * Safely parses any timestamp value into a valid JavaScript Date.
 * - Handles strings with explicit timezone offsets ('Z', '+05:30', '-04:00', '+00:00') directly.
 * - Handles naive ISO strings ('2026-11-01T10:15:00') as UTC since database stores UTC.
 * - Never blindly appends 'Z' if a timezone offset is already present.
 * - Never blindly adds 5h 30m.
 *
 * @param {string|Date|number|null|undefined} value
 * @returns {Date|null}
 */
export function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if string contains explicit timezone indicator (Z or +/-HH:MM or +/-HHMM or +/-HH)
  const hasTimezone = /(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmed);

  if (hasTimezone) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // Naive date-time string without timezone indicator (e.g. "2026-11-01T10:15:00"):
  // Stored in UTC by backend; parse explicitly as UTC
  const normalized = trimmed.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats time in Asia/Kolkata (IST), e.g. "3:45 PM".
 */
export function formatTimeIST(dateOrString) {
  const d = parseOrderDate(dateOrString);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Formats month and day in Asia/Kolkata (IST), e.g. "Nov 1".
 */
export function formatDateIST(dateOrString, fallback = '') {
  const d = parseOrderDate(dateOrString);
  if (!d) return fallback || '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats full timestamp in Asia/Kolkata (IST) for order details, e.g. "Nov 1, 2026, 3:45:00 PM".
 */
export function formatDetailsTimestampIST(dateOrString, fallback = '') {
  const d = parseOrderDate(dateOrString);
  if (!d) return fallback || '';
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Formats date and time in Asia/Kolkata (IST) for Student App My Orders, e.g. "1 Nov 2026, 3:45 PM".
 */
export function formatStudentOrderPlacementIST(dateOrString, fallback = '') {
  const d = parseOrderDate(dateOrString);
  if (!d) return fallback || '';

  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const parts = formatter.formatToParts(d);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const day = partMap.day;
  const month = partMap.month;
  const year = partMap.year;
  const hour = partMap.hour;
  const minute = partMap.minute;
  const dayPeriod = (partMap.dayPeriod || '').toUpperCase();

  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}
