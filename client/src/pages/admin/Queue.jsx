import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { usePoll } from '../../hooks.js';
import { CATEGORIES, PRIORITIES, STATUSES } from '../../constants.js';
import { Badge, Empty, ErrorBox, PriorityBadge, Spinner, StatusBadge, ageHours, timeAgo } from '../../ui.jsx';

export const SourceTag = ({ source }) => ({
  ai: <Badge kind="tag-ai" title="Set by AI">AI</Badge>,
  admin: <Badge kind="tag-admin" title="Overridden by an admin">Edited</Badge>,
  rules: <Badge kind="tag-rules" title="Set by keyword rules (AI not used)">Rules</Badge>,
}[source]);

function Age({ t }) {
  if (['Resolved', 'Closed'].includes(t.status)) return <span className="muted small">—</span>;
  const h = ageHours(t.createdAt);
  const cls = h > 72 ? 'late' : h > 48 ? 'warn' : '';
  return <span className={`age ${cls}`} title={new Date(t.createdAt).toLocaleString()}>{timeAgo(t.createdAt).replace(' ago', '')}{h > 48 ? ' ⚠' : ''}</span>;
}

export default function Queue() {
  const nav = useNavigate();
  const [f, setF] = useState({ status: '', category: '', priority: '', assigned: '', q: '', from: '', to: '', sort: 'urgency' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qs = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);

  const list = usePoll(() => api.get(`/admin/tickets?${qs}`), [qs], 8000);
  const stats = usePoll(() => api.get('/admin/stats'), [], 8000);
  const s = stats.data?.tickets;
  const ai = stats.data?.ai;
  const filtered = Object.entries(f).some(([k, v]) => v && k !== 'sort');
  const quick = (patch) => setF({ status: '', category: '', priority: '', assigned: '', q: '', from: '', to: '', sort: 'urgency', ...patch });

  return (
    <>
      <div className="page-head">
        <div><h1>Ticket queue</h1><p>Most urgent and longest-waiting tickets are at the top.</p></div>
        <span className="live"><i />Auto-refreshing</span>
      </div>

      {s && (
        <div className="stats">
          <div className="stat red clickable" onClick={() => quick({ priority: 'Critical' })}><div className="label">Critical open</div><div className="value">{s.criticalOpen}</div></div>
          <div className="stat orange clickable" onClick={() => quick({ assigned: 'unassigned' })}><div className="label">Unassigned</div><div className="value">{s.unassigned}</div></div>
          <div className="stat clickable" onClick={() => quick({ status: 'Open' })}><div className="label">Open</div><div className="value">{s.open}</div></div>
          <div className="stat clickable" onClick={() => quick({ status: 'In Progress' })}><div className="label">In progress</div><div className="value">{s.inProgress}</div></div>
          <div className="stat red"><div className="label">Waiting &gt; 48h</div><div className="value">{s.overdue}</div></div>
          <div className="stat green"><div className="label">AI usage</div><div className="value" style={{ fontSize: 17 }}>{ai.enabled ? `${(ai.promptTokens + ai.outputTokens).toLocaleString()} tokens` : 'Off'}</div><span className="muted small">{ai.enabled ? `${ai.calls} calls, ${ai.failedCalls} failed` : 'No API key set'}</span></div>
        </div>
      )}

      <div className="filters">
        <div className="grow"><label>Search</label><input style={{ width: '100%' }} placeholder="Subject, author, or BL-0001…" value={f.q} onChange={set('q')} /></div>
        <div><label>Status</label><select value={f.status} onChange={set('status')}><option value="">All</option>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Priority</label><select value={f.priority} onChange={set('priority')}><option value="">All</option>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Category</label><select value={f.category} onChange={set('category')}><option value="">All</option>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Assigned</label><select value={f.assigned} onChange={set('assigned')}><option value="">Anyone</option><option value="me">Me</option><option value="unassigned">Unassigned</option></select></div>
        <div><label>From</label><input type="date" value={f.from} onChange={set('from')} /></div>
        <div><label>To</label><input type="date" value={f.to} onChange={set('to')} /></div>
        <div><label>Sort</label><select value={f.sort} onChange={set('sort')}><option value="urgency">Urgency</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></div>
        {filtered && <button className="btn sm" onClick={() => quick({})}>Clear</button>}
      </div>

      {list.loading && !list.data && <Spinner label="Loading tickets…" />}
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && <div className="card"><Empty icon={filtered ? '🔎' : '🎉'} title={filtered ? 'No tickets match these filters' : 'Inbox zero'}>{filtered ? 'Try clearing some filters.' : 'New author queries will appear here.'}</Empty></div>}
      {list.data && list.data.items.length > 0 && (
        <div className="card table-card"><div className="table-scroll">
          <table>
            <thead><tr><th>Priority</th><th>Ticket</th><th>Author</th><th>Category</th><th>Status</th><th>Assignee</th><th>Waiting</th></tr></thead>
            <tbody>
              {list.data.items.map((t) => (
                <tr key={t.id} className={`click ${['Resolved', 'Closed'].includes(t.status) ? 'done' : t.priority === 'Critical' ? 'urgent' : t.priority === 'High' ? 'high' : ''}`} onClick={() => nav(`/admin/tickets/${t.id}`)}>
                  <td><div className="row" style={{ gap: 6 }}><PriorityBadge priority={t.priority} /><SourceTag source={t.prioritySource} /></div></td>
                  <td><div className="subject">{t.subject}</div><span className="muted small">{t.ticketNo} · {t.bookTitle || 'General / Account'}{t.lastSender === 'author' && t.messageCount > 0 ? ' · 💬 author replied' : ''}</span></td>
                  <td>{t.authorName}</td>
                  <td><div className="cat">{t.category}</div><SourceTag source={t.categorySource} />{t.aiStatus === 'failed' && <Badge kind="tag-rules" title="AI classification failed; open the ticket to retry"> AI failed</Badge>}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.assigneeName || <span className="muted">Unassigned</span>}</td>
                  <td><Age t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {list.data && <p className="muted small" style={{ marginTop: 10 }}>Showing {list.data.items.length} of {list.data.total} tickets</p>}
    </>
  );
}
