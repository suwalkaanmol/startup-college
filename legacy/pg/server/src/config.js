// Central configuration. Reads env once and refuses to start in production
// when security-critical settings are missing.
import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/placemate',
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-not-for-production-use-1234',
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'PlaceMate <no-reply@example.com>',
  appOrigin: env.APP_ORIGIN || 'http://localhost:5173',
  emailDomain: (env.ALLOWED_EMAIL_DOMAIN || 'vitstudent.ac.in').toLowerCase(),
  creditsPerBooking: Number(env.CREDITS_PER_BOOKING || 100),
  ssoSecret: env.UNIHUB_SSO_SECRET || '',
  // Test-student picker: on in development and tests; in production only if ALLOW_DEV_LOGIN=true (for demos).
  devLogin: !isProd || env.ALLOW_DEV_LOGIN === 'true',
  termsVersion: env.TERMS_VERSION || '2026-10',
};

if (isProd) {
  if (!config.ssoSecret && !config.devLogin) throw new Error('Set UNIHUB_SSO_SECRET (UniHub sign-in) or ALLOW_DEV_LOGIN=true in production');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production');
  }
}
