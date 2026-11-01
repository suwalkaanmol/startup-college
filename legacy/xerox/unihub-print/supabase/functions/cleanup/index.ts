// Edge Function: deletes files of uncollected orders older than 24h and marks them expired.
// Schedule hourly (Supabase Dashboard > Edge Functions > Schedule). Uses the service key server-side only.
import { createClient } from 'npm:@supabase/supabase-js@2';
Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: old } = await db.from('orders').select('id, order_files(storage_path)').in('status', ['pending_payment', 'preparing', 'ready']).lt('created_at', cutoff);
  for (const o of old ?? []) {
    await db.storage.from('print-files').remove(o.order_files.map((f: { storage_path: string }) => f.storage_path));
    await db.from('orders').update({ status: 'expired' }).eq('id', o.id);
  }
  return new Response(JSON.stringify({ expired: old?.length ?? 0 }));
});
