import React, { useState, useCallback } from 'react';

let toastId = 0;

export function Toast({ toasts, setToasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
          <span>{t.msg}</span>
          <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
            style={{marginLeft:'auto',background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:16}}>×</button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = 'info') => {
    const id = ++toastId;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, setToasts, show };
}
