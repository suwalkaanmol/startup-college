// Shared HTTP helpers: typed errors, async wrapper, friendly JSON error output.
export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.', code: 'TOO_LARGE' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON.', code: 'BAD_JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' });
}
