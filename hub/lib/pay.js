// Online payment before an order reaches the kitchen or print shop, so nobody queues to pay and nothing is made for no-shows.
// DEMO MODE: no money moves. Any Indian mobile number works and the code is always 123456.
// To go live, replace takePayment() with a real UPI gateway (Razorpay, Cashfree, PhonePe) and verify its signature here.
import crypto from 'node:crypto';
import { HttpError } from './http.js';

export const DEMO_CODE = '123456';

export function takePayment(pay, amount) {
  const phone = String(pay?.phone || '').replace(/[\s-]/g, '').replace(/^(\+?91)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) throw new HttpError(400, 'PAY_PHONE', 'Enter the 10-digit mobile number linked to your UPI.');
  if (String(pay?.otp || '').trim() !== DEMO_CODE) throw new HttpError(402, 'PAY_CODE', 'That code is wrong. Check it and try again.');
  return {
    status: 'PAID', method: 'UPI', phone: `+91 ••••• ${phone.slice(5)}`, amount,
    ref: 'UH' + crypto.randomBytes(5).toString('hex').toUpperCase(), paidAt: new Date().toISOString(), demo: true,
  };
}

export const refund = (p) => (p && p.status === 'PAID' ? { ...p, status: 'REFUNDED', refundedAt: new Date().toISOString() } : p);
