// Display helpers: 12-hour times with AM/PM and correct singular/plural.
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const formatDate = (d) => new Date(d).toLocaleDateString('en-IN');
export const formatTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
export const formatDateTime = (d) => `${formatDate(d)}, ${formatTime(d)}`;
