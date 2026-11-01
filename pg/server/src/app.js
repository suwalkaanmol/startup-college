// Builds the Express app (no listen) so tests can import it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler, HttpError } from './lib/http.js';
import meta from './routes/meta.js';
import auth from './routes/auth.js';
import profile from './routes/profile.js';
import matches from './routes/matches.js';
import requests from './routes/requests.js';
import groups from './routes/groups.js';
import safety from './routes/safety.js';
import pgs from './routes/pgs.js';
import bookings from './routes/bookings.js';
import account from './routes/account.js';
import { sseHandler } from './events.js';

export function createApp(extraRoutes = []) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'"],
    fontSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"] } } }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  const api = express.Router();
  // CSRF guard: browsers can't add this header cross-site without a CORS preflight we never allow.
  api.use((req, _res, next) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-Requested-With') === 'PlaceMate'
    ? next() : next(new HttpError(403, 'CSRF', 'Request blocked.'))));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/meta', meta);
  api.use('/auth', auth);
  api.use('/profile', profile);
  api.use('/matches', matches);
  api.use('/requests', requests);
  api.use('/groups', groups);
  api.use('/safety', safety);
  api.use('/pgs', pgs);
  api.use('/bookings', bookings);
  api.use('/account', account);
  api.get('/events', ...sseHandler);
  for (const [p, router] of extraRoutes) api.use(p, router);
  api.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Not found.')));
  app.use('/api', api);

  // Serve the built React app with SPA fallback (when it exists).
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
