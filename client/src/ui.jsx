import { createContext, useCallback, useContext, useState } from 'react';

export const rupees = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
export const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (s) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function timeAgo(s) {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(s).getTime()) / 1000));
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}
export const ageHours = (s) => (Date.now() - new Date(s).getTime()) / 36e5;

const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-');
export const Badge = ({ kind, children, title }) => <span className={`badge ${kind}`} title={title}>{children}</span>;
export const StatusBadge = ({ status }) => <Badge kind={`st-${slug(status)}`}>{status}</Badge>;
export const PriorityBadge = ({ priority }) => <Badge kind={`pr-${slug(priority)}`}>{priority}</Badge>;

export const Spinner = ({ label }) => <div className="center-pad"><div className="spinner" />{label && <p className="muted">{label}</p>}</div>;
export const Empty = ({ icon = '📭', title, children, action }) => (
  <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p className="muted">{children}</p>{action}</div>
);
export const ErrorBox = ({ error, onRetry }) => (
  <div className="alert error"><span>{error?.message || 'Something went wrong.'}</span>{onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}</div>
);

// ---- toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}</div>
    </ToastCtx.Provider>
  );
}
