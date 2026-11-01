import { useEffect, useState, useCallback } from 'react';
import { GRID, formatDateTime } from '@unihub/shared';
import { supabase } from './supabase.js';

/** Small diagram of how N pages sit on one sheet face. Decorative; the text label carries the meaning. */
export function ArrangementPreview({ layout, arrangement }) {
  const [c, r] = GRID[arrangement][layout];
  return <div aria-hidden="true" className="prev" style={{ gridTemplateColumns: `repeat(${c},1fr)`, aspectRatio: c > r ? '1.4' : '0.75' }}>
    {Array.from({ length: layout }, (_, i) => <span key={i}>{i + 1}</span>)}</div>;
}

const LABEL = { pending_payment: 'Awaiting payment', preparing: 'Preparing', ready: 'Ready, please collect', completed: 'Completed', expired: 'Expired' };
export function MyOrders({ uid }) {
  const [orders, setOrders] = useState(null), [err, setErr] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('orders').select('id,token,total,status,created_at,shop_id,shops(name)').neq('status', 'pending_payment').order('created_at', { ascending: false });
    if (error) setErr('Could not load your orders.'); else setOrders(data);
  }, []);
  useEffect(() => { if (!uid) return; load(); const ch = supabase.channel('mine').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `student_id=eq.${uid}` }, load).subscribe(); return () => supabase.removeChannel(ch); }, [uid, load]);
  return <section className="card"><h2>📦 My orders</h2>{err && <p role="alert" className="err">{err}</p>}
    {orders?.length === 0 && <p className="sub">No orders yet.</p>}
    {orders?.map((o) => <div className="file" key={o.id}><strong>Token {o.token}</strong> · {o.shops.name}<p className="sub" aria-live="polite">{LABEL[o.status]} · ₹{o.total} · {formatDateTime(o.created_at)}</p></div>)}</section>;
}

export function Chat({ uid, shops }) {
  const [shopId, setShopId] = useState(''), [msgs, setMsgs] = useState([]), [text, setText] = useState(''), [err, setErr] = useState('');
  const [name, setName] = useState(() => localStorage.getItem('chat-name') || '');
  const load = useCallback(async () => { if (!shopId) return; const { data } = await supabase.from('messages').select('*').eq('shop_id', shopId).order('created_at'); setMsgs(data || []); }, [shopId]);
  useEffect(() => {
    load(); if (!shopId) return;
    const ch = supabase.channel('c' + shopId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `shop_id=eq.${shopId}` }, load).subscribe();
    const t = setInterval(load, 5000); // backup in case a live update is missed
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [shopId, load]);
  const rename = (e) => { const v = e.target.value.slice(0, 20); setName(v); localStorage.setItem('chat-name', v); };
  async function send(e) {
    e.preventDefault(); if (!text.trim()) return; setErr('');
    const { error } = await supabase.from('messages').insert({ shop_id: shopId, student_id: uid, sender: 'student', body: text.trim(), sender_name: name.trim() || null });
    if (error) setErr('Message not sent. Try again.'); else { setText(''); load(); }
  }
  return <section className="card"><h2>💬 Chat with the shop</h2><p className="sub">Only you and the shop can see this chat.</p>
    <label className="field"><span className="lbl"><i aria-hidden="true" />Shop</span><select value={shopId} onChange={(e) => setShopId(e.target.value)}><option value="">Choose a shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="field"><span className="lbl"><i aria-hidden="true" />Your chat name (optional)</span><input value={name} onChange={rename} maxLength={20} placeholder="For example: sup" autoComplete="off" /></label>
    {shopId && <><div className="bubbles" aria-live="polite">{msgs.map((m) => <p key={m.id} className={m.sender === 'student' ? 'bub me' : 'bub them'}>{m.body}</p>)}</div>
      <form onSubmit={send}><label className="field"><span className="lbl"><i aria-hidden="true" />Your message</span><input value={text} maxLength={1000} placeholder="Type your message" onChange={(e) => setText(e.target.value)} /></label>
        {err && <p role="alert" className="err">{err}</p>}<button className="primary">Send message</button></form></>}</section>;
}
