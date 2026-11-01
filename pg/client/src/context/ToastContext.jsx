import { createContext, useCallback, useContext, useState } from 'react';
const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </Ctx.Provider>
  );
}
