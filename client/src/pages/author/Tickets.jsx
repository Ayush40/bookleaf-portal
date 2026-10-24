import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { usePoll } from '../../hooks.js';
import { Empty, ErrorBox, Spinner, StatusBadge, fmtDateTime, timeAgo, useToast } from '../../ui.jsx';

const seenStore = {
  get: () => { try { return JSON.parse(localStorage.getItem('bl_seen') || '{}'); } catch { return {}; } },
  set: (id, n) => { const s = seenStore.get(); s[id] = n; localStorage.setItem('bl_seen', JSON.stringify(s)); },
};
const FILTERS = ['All', 'Open', 'In Progress', 'Resolved', 'Closed'];

function Detail({ id, onSeen }) {
  const toast = useToast();
  const { data, error, loading, reload } = usePoll(() => api.get(`/tickets/${id}`), [id], 5000); // near-real-time
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const t = data?.ticket;

  useEffect(() => { if (t) onSeen(t.id, t.adminReplyCount); }, [t?.id, t?.adminReplyCount]); // eslint-disable-line

  async function send(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try { await api.post(`/tickets/${id}/messages`, { body: reply }); setReply(''); await reload(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  if (loading && !t) return <div className="card"><Spinner /></div>;
  if (error && !t) return <div className="card"><ErrorBox error={error} onRetry={reload} /></div>;
  return (
    <div className="card">
      <div className="row between wrap">
        <div><span className="muted small">{t.ticketNo} · {t.bookTitle || 'General / Account Level'}</span><h2>{t.subject}</h2></div>
        <div className="row"><StatusBadge status={t.status} /><span className="live" title="Updates automatically"><i />Live</span></div>
      </div>
      {error && <div className="alert warn" style={{ marginTop: 12 }}>Having trouble refreshing. Showing the last update.</div>}
      <div className="muted small" style={{ margin: '14px 0 6px' }}>Your query · {fmtDateTime(t.createdAt)}</div>
      <div className="original">{t.description}</div>
      {t.attachments.length > 0 && <div style={{ marginTop: 6 }}>{t.attachments.map((a) => <span key={a} className="chip">📎 {a}</span>)}</div>}

      <div className="thread">
        {t.messages.length === 0 && <div className="alert info" style={{ margin: 0 }}>Thanks for reaching out. Our team will reply here, usually within 48 hours. This page updates by itself.</div>}
        {t.messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender}`}>
            <div className="who"><span>{m.sender === 'admin' ? `${m.senderName || 'BookLeaf Support'}` : 'You'}</span><span>{fmtDateTime(m.createdAt)}</span></div>
            {m.body}
          </div>
        ))}
      </div>

      {t.status === 'Closed' ? (
        <div className="alert info">This ticket is closed. <Link to={`/submit${t.bookId ? `?book=${t.bookId}` : ''}`}><b>Open a new ticket</b></Link> if you need more help.</div>
      ) : (
        <form onSubmit={send}>
          <label className="field">{t.status === 'Resolved' ? 'Not fully resolved? Reply to reopen' : 'Add a reply'}
            <textarea style={{ minHeight: 90 }} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} placeholder="Write a follow-up…" />
          </label>
          <button className="btn primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
        </form>
      )}
    </div>
  );
}

export default function Tickets() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = usePoll(() => api.get('/tickets'), [], 8000);
  const [filter, setFilter] = useState('All');
  const [seen, setSeen] = useState(seenStore.get());
  const items = (data?.items || []).filter((t) => filter === 'All' || t.status === filter);

  const markSeen = (tid, n) => { if ((seen[tid] ?? 0) !== n) { seenStore.set(tid, n); setSeen(seenStore.get()); } };
  const unread = (t) => t.adminReplyCount > (seen[t.id] ?? 0) && String(t.id) !== id;

  return (
    <>
      <div className="page-head"><div><h1>My Tickets</h1><p>Replies from the BookLeaf team appear here automatically.</p></div><Link to="/submit" className="btn primary">✉️ New query</Link></div>
      {loading && !data && <Spinner />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <div className="card"><Empty icon="💬" title="No tickets yet" action={<Link className="btn primary" to="/submit">Submit your first query</Link>}>When you raise a query, you can follow it here.</Empty></div>}
      {data && data.items.length > 0 && (
        <div className={`split ${id ? 'has-detail' : ''}`}>
          <div className="card t-list">
            <div className="pills">{FILTERS.map((f) => <button key={f} className={`pill ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
            {items.length === 0 && <p className="muted small" style={{ padding: 12 }}>No {filter.toLowerCase()} tickets.</p>}
            {items.map((t) => (
              <Link key={t.id} to={`/tickets/${t.id}`} className={`t-item ${String(t.id) === id ? 'active' : ''}`}>
                <div className="top"><span>{unread(t) && <span className="dot" title="New reply" />}{t.ticketNo}</span><span>{timeAgo(t.updatedAt)}</span></div>
                <span className="title">{t.subject}</span>
                <div className="row"><StatusBadge status={t.status} /><span className="muted small">{t.bookTitle || 'General'}</span></div>
              </Link>
            ))}
          </div>
          {id ? (
            <div><button className="btn sm" style={{ marginBottom: 12, display: window.innerWidth > 1000 ? 'none' : undefined }} onClick={() => nav('/tickets')}>← All tickets</button><Detail key={id} id={id} onSeen={markSeen} /></div>
          ) : (
            <div className="card" style={{ display: window.innerWidth <= 1000 ? 'none' : undefined }}><Empty icon="👈" title="Select a ticket">Pick a ticket on the left to read the conversation.</Empty></div>
          )}
        </div>
      )}
    </>
  );
}
