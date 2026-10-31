// Optional, positive-only preference buttons + "top 3 priorities" ranking.
export default function TagPicker({ groups, tags, priorities, onChange }) {
  const labelOf = Object.fromEntries(groups.flatMap((g) => g.tags.map((t) => [t.id, t.label])));
  const toggle = (g, id) => {
    let next = tags.includes(id) ? tags.filter((t) => t !== id) : [...tags, id];
    if (g.exclusive && !tags.includes(id)) next = next.filter((t) => t === id || !g.tags.some((x) => x.id === t));
    onChange(next, priorities.filter((p) => next.includes(p)));
  };
  const rank = (id) => onChange(tags, priorities.includes(id) ? priorities.filter((p) => p !== id) : priorities.length < 3 ? [...priorities, id] : priorities);
  return (
    <div className="tagpicker">
      {groups.map((g) => (
        <fieldset key={g.id}>
          <legend>{g.label}{g.exclusive && <span className="hint"> (pick one)</span>}</legend>
          <div className="chips">
            {g.tags.map((t) => <button type="button" key={t.id} className={`chip ${tags.includes(t.id) ? 'on' : ''}`} aria-pressed={tags.includes(t.id)} onClick={() => toggle(g, t.id)}>{t.label}</button>)}
          </div>
        </fieldset>
      ))}
      {tags.length > 0 && (
        <fieldset>
          <legend>Top 3 priorities <span className="hint">(tap in order of importance)</span></legend>
          <div className="chips">
            {tags.map((id) => { const r = priorities.indexOf(id); return (
              <button type="button" key={id} className={`chip ${r >= 0 ? 'rank' : ''}`} aria-pressed={r >= 0} onClick={() => rank(id)}>
                {r >= 0 && <span className="rank-no">{r + 1}</span>}{labelOf[id]}
              </button>); })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
