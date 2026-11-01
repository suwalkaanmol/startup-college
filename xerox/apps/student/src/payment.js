// Payment seam. Today: test-mode RPC. Later: swap for Razorpay/PhonePe checkout, with the
// order confirmed by a server-side webhook instead of this client call.
import { supabase } from './supabase.js';
export async function payTest(orderId, password) {
  const { data, error } = await supabase.rpc('pay_order_test', { p_order: orderId, p_password: password });
  if (error) throw new Error(error.message);
  return data; // token
}
