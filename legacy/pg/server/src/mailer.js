// Sends mail through SMTP_URL; without it (development only) logs to the console.
import nodemailer from 'nodemailer';
import { config } from './config.js';

const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

export async function sendMail({ to, subject, text }) {
  if (!transport) return console.log(`[mail:dev] to=${to} | ${subject} | ${text}`);
  await transport.sendMail({ from: config.mailFrom, to, subject, text });
}
export const mailIsLive = Boolean(transport);
