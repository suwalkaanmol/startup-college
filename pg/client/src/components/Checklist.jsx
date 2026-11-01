// Shared roommate checklist. Each person ticks what they agree to; an item is settled when both have.
import { useCallback, useEffect, useState } from 'react';
import { api, useLive } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Pill, Spinner } from './ui.jsx';

export default function Checklist({ groupId, onClose }) {
  const toast = useToast(), [d, setD] = useState(null);
  const load = useCallback(() => api.get(`/groups/${groupId}/agreements`).then(setD).catch((e) => { toast(e.message, 'err'); onClose(); }), [groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useLive(load);
  const toggle = async (item, on) => {
    setD((x) => ({ ...x, items: x.items.map((i) => (i.id === item ? { ...i, mine: on } : i)) })); // instant feedback
    try { await api.post(`/groups/${groupId}/agreements`, { item, on }); } catch (e) { toast(e.message, 'err'); }
    load();
  };
  const settled = d ? d.items.filter((i) => i.mine && i.theirs).length : 0;

  return (
    <Modal title="Roommate checklist" onClose={onClose}>
      {!d ? <Spinner /> : (<>
        <p className="hint">Tick what you agree to. {d.otherName} can see your ticks and you can see theirs, so you can talk through anything that is not matched yet. {settled} of {d.items.length} settled.</p>
        {d.items.map((i) => (
          <label key={i.id} className="checkbox check-item">
            <input type="checkbox" checked={i.mine} onChange={(e) => toggle(i.id, e.target.checked)} />
            <span className="grow">{i.label}<br />
              {i.mine && i.theirs ? <Pill tone="ok">Both agree</Pill> : i.theirs ? <Pill tone="warn">{d.otherName} agrees. Waiting for you</Pill> : i.mine ? <span className="hint">Waiting for {d.otherName}</span> : null}</span>
          </label>))}
      </>)}
    </Modal>
  );
}
