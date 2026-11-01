// Small shared UI pieces: spinner, avatar, pill, modal (focus trap + Escape), empty state, field.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;
export const Avatar = ({ name }) => <span className="avatar" aria-hidden="true">{(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>;
export const Pill = ({ children, tone = 'info' }) => <span className={`pill ${tone}`}>{children}</span>;

export function Empty({ title, text, action }) {
  return <div className="empty"><h2>{title}</h2><p>{text}</p>{action}</div>;
}

export function Field({ label, hint, error, children }) {
  return <label className="field"><span className="label">{label}</span>{children}{hint && <span className="hint">{hint}</span>}{error && <span className="error" role="alert">{error}</span>}</label>;
}

export function Modal({ title, onClose, children }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
    box.current?.querySelector(sel)?.focus();
    const key = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const els = [...box.current.querySelectorAll(sel)].filter((x) => !x.disabled);
      if (!els.length) return;
      const [first, last] = [els[0], els[els.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}
