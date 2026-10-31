// Groups list + live chat. Two panes on desktop; one pane with a Back button on phones.
// A group has 2 to 6 people. Each person picks who they want as roommate; two people are roommates when both picked each other.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { api, useLive } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Empty, Modal, Pill, Spinner } from '../components/ui.jsx';
import Checklist from '../components/Checklist.jsx';
import SafetyActions from '../components/SafetyActions.jsx';

const first = (name) => name.split(' ')[0];
const seatText = (n) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;
const titleOf = (g) => g.members.filter((m) => !m.isMe).map((m) => first(m.name)).join(', ');

export default function Groups() {
  const { groupId } = useParams(), { refreshBadges } = useOutletContext();
  const [groups, setGroups] = useState(null);
  const load = useCallback(() => api.get('/groups').then((d) => setGroups(d.groups)).catch(() => setGroups([])), []);
  useEffect(() => { load(); }, [load, groupId]);
  useLive(load);
  const reload = useCallback(() => { load(); refreshBadges(); }, [load, refreshBadges]);
  if (!groups) return <Spinner />;
  const current = groups.find((g) => g.id === groupId);

  return (
    <div className={`split ${groupId ? 'chat-open' : ''}`}>
      <div className="split-list">
        {groups.length === 0 ? <Empty title="No groups yet" text="Send a roommate request. When it is accepted, a private chat opens here." action={<Link className="btn" to="/matches">Find roommates</Link>} />
          : groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className={`row ${g.id === groupId ? 'sel' : ''}`}>
              <span className="avatars" aria-hidden="true">{g.members.filter((m) => !m.isMe).slice(0, 2).map((m) => <Avatar key={m.id} name={m.name} />)}</span>
              <span className="grow"><strong>{titleOf(g)}</strong><br /><span className="meta">{g.seatsLeft > 0 ? `${g.members.length} of ${g.capacity} · ${seatText(g.seatsLeft)}` : (g.lastMessage?.slice(0, 40) || `${g.members.length} of ${g.capacity}`)}</span></span>
              {g.roommates && <Pill tone="ok">Roommates</Pill>}{g.unread > 0 && <span className="badge static">{g.unread}</span>}
            </Link>))}
      </div>
      <div className="split-chat">
        {current ? <Chat key={current.id} group={current} reload={reload} /> : <div className="empty desk-only">Choose a group to start chatting.</div>}
      </div>
    </div>
  );
}

const ICEBREAKERS = ['What time do you usually wake up?', 'Do you cook, or order in?', 'Which area near the office are you looking at?', 'What rent per month feels comfortable for you?'];

function Chat({ group, reload }) {
  const { user } = useAuth(), toast = useToast(), nav = useNavigate();
  const [msgs, setMsgs] = useState([]), [text, setText] = useState(''), [confirmLeave, setConfirmLeave] = useState(false), [loaded, setLoaded] = useState(false), [list, setList] = useState(false), [safety, setSafety] = useState(null), [showMembers, setShowMembers] = useState(!group.roommates); // open until you have a roommate
  const last = useRef(0), end = useRef(null), leaving = useRef(false);
  const others = group.members.filter((m) => !m.isMe);

  const fetchMsgs = useCallback(async () => {
    if (leaving.current) return; // we are leaving: the server would answer 404 from now on
    try {
      const d = await api.get(`/groups/${group.id}/messages?after=${last.current}`);
      if (d.messages.length) {
        last.current = d.messages[d.messages.length - 1].id;
        // Two fetches can overlap (send + live event), so skip messages we already have.
        setMsgs((m) => { const seen = new Set(m.map((x) => x.id)); return [...m, ...d.messages.filter((x) => !seen.has(x.id))]; });
        reload();
      }
    } catch { /* group may have been deleted */ }
    setLoaded(true);
  }, [group.id, reload]);
  useEffect(() => { fetchMsgs(); }, [fetchMsgs]);
  useLive(fetchMsgs);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setText('');
    try { await api.post(`/groups/${group.id}/messages`, { body }); fetchMsgs(); } catch (err) { setText(body); toast(err.message, 'err'); }
  };
  const pick = async (m, on) => { try { await api.post(`/groups/${group.id}/pick`, { userId: m.id, on }); fetchMsgs(); reload(); } catch (e) { toast(e.message, 'err'); } };
  const leave = async () => {
    leaving.current = true;
    try { const r = await api.del(`/groups/${group.id}`); toast(r.deleted ? 'You left. The group was deleted because fewer than 2 people were left.' : 'You left the group.'); reload(); nav('/groups'); }
    catch (e) { leaving.current = false; toast(e.message, 'err'); setConfirmLeave(false); }
  };

  const PickControl = ({ m }) => m.roommate ? (<><Pill tone="ok">Roommates</Pill><button className="btn secondary small" onClick={() => pick(m, false)} aria-label={`Stop being roommates with ${first(m.name)}`}>Undo</button></>)
    : m.pickedByMe ? <button className="btn secondary small" onClick={() => pick(m, false)} aria-label={`Take back your pick of ${first(m.name)}`}>Picked. Waiting for {first(m.name)}</button>
    : (<>{m.pickedMe && <Pill tone="warn">Picked you</Pill>}<button className="btn small" onClick={() => pick(m, true)}>{m.pickedMe ? 'Pick back' : 'Pick as roommate'}</button></>);

  return (
    <div className="chat">
      <div className="chat-head">
        <Link to="/groups" className="icon-btn mobile-only" aria-label="Back to groups"><ArrowLeft size={20} /></Link>
        <span className="avatars" aria-hidden="true">{others.slice(0, 3).map((m) => <Avatar key={m.id} name={m.name} />)}</span>
        <span className="grow"><strong>{titleOf(group)}</strong><br /><span className="meta">{group.members.length} of {group.capacity} people{group.seatsLeft > 0 ? ` · ${seatText(group.seatsLeft)}` : ' · full'}</span></span>
        {group.roommates && <Pill tone="ok">Roommates</Pill>}
      </div>
      <button className="members-toggle" aria-expanded={showMembers} onClick={() => setShowMembers((v) => !v)}>
        <span>People and roommate picks ({group.members.length})</span><span aria-hidden="true">{showMembers ? '▲' : '▼'}</span></button>
      {showMembers && <div className="members" aria-label="Group members">
        {others.map((m) => (
          <div className="member" key={m.id}>
            <Avatar name={m.name} /><span className="grow"><strong>{m.name}</strong>{m.isOwner ? ' · Owner' : ''}<br /><span className="meta">{m.company}</span></span>
            <PickControl m={m} />
            <button className="link-btn" onClick={() => setSafety(m)} aria-label={`Report or block ${first(m.name)}`}>⋯</button>
          </div>))}
        <p className="hint">Pick the people you want as roommates. You become roommates when you both pick each other, so it can be just 2 of the {group.members.length}.{group.seatsLeft > 0 ? ` ${seatText(group.seatsLeft)}: other students can ask to join${group.isOwner ? ', and you decide' : ''}.` : ''}</p>
      </div>}
      <div className="msgs" role="log" aria-live="polite">
        {msgs.map((m) => <div key={m.id} className={m.system ? 'sys' : `bubble ${m.senderId === user.id ? 'mine' : ''}`}>{!m.system && m.senderId !== user.id && <small className="sender">{m.senderName}</small>}{m.body}</div>)}
        <div ref={end} />
      </div>
      <div className="chat-actions">
        {group.roommates && <><Link className="btn" to={`/pgs?with=${group.id}`}>Book a PG together</Link><button className="btn secondary" onClick={() => setList(true)}>Roommate checklist</button></>}
        <button className="btn secondary" onClick={() => setConfirmLeave(true)}>Leave group</button>
      </div>
      {loaded && !msgs.some((m) => !m.system) && (
        <div className="icebreakers"><span className="hint">Not sure what to say? Tap to start:</span>
          <div className="chips">{ICEBREAKERS.map((q) => <button type="button" key={q} className="chip" onClick={() => setText(q)}>{q}</button>)}</div></div>)}
      <form className="composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Type a message" aria-label="Message" />
        <button className="btn" aria-label="Send message"><Send size={18} /></button>
      </form>
      {list && <Checklist groupId={group.id} onClose={() => setList(false)} />}
      {confirmLeave && (
        <Modal title="Leave this group?" onClose={() => setConfirmLeave(false)}>
          <p>Your seat opens for other students and one of your group slots is freed. The chat stays for the others.{group.members.length <= 2 ? ' You are one of only 2 people here, so the group and its chat will be deleted for good.' : ''}</p>
          <div className="chips"><button className="btn danger" onClick={leave}>Leave group</button><button className="btn secondary" onClick={() => setConfirmLeave(false)}>Stay</button></div>
        </Modal>)}
      {safety && (
        <Modal title={`${safety.name}`} onClose={() => setSafety(null)}>
          <p className="hint">If someone makes you uncomfortable, report them or block them. Blocking removes you from any group you share.</p>
          <SafetyActions userId={safety.id} name={safety.name} onBlocked={() => { setSafety(null); reload(); nav('/groups'); }} />
        </Modal>)}
    </div>
  );
}
