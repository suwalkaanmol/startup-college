// Validate req.body with a zod schema; replaces it with the parsed (clean) value.
import { HttpError } from '../lib/http.js';

export const validate = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) return next(new HttpError(400, 'VALIDATION', r.error.issues[0]?.message || 'Invalid input.'));
  req.body = r.data;
  next();
};
