import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { usePoll } from '../../hooks.js';
import { CATEGORIES, PRIORITIES, STATUSES } from '../../constants.js';
import { Badge, ErrorBox, PriorityBadge, Spinner, StatusBadge, fmtDate, fmtDateTime, rupees, useToast } from '../../ui.jsx';
import { SourceTag } from './Queue.jsx';
import { useAuth } from '../../auth.jsx';

function BookContext({ book }) {
  if (!book) return <p className="muted small">General / account-level ticket, no specific book.</p>;
  return (
    <div className="small stack" style={{ lineHeight: 1.6 }}>
      <div><b>{book.title}</b><br /><span className="muted">{book.status}</span></div>
      {book.isLive ? (
        <>
          <div>Published {fmtDate(book.publicationDate)} · MRP {rupees(book.mrp)} · {book.copiesSold} sold</div>
          <div>Earned <b>{rupees(book.royaltyEarned)}</b> · Paid <b>{rupees(book.royaltyPaid)}</b> · Pending <b>{rupees(book.royaltyPending)}</b></div>
          <div>Last payout: {book.lastPayoutDate ? fmtDate(book.lastPayoutDate) : <b>none yet</b>} · Print: {book.printPartner}</div>
          <div className={`note ${book.royalty.state === 'overdue_review' ? 'warn' : ''}`}>{book.royalty.note}</div>
        </>
      ) : <div>In production{book.productionStage ? `: ${book.productionStage}` : ''}. No sales or royalties yet.</div>}
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, loading, reload } = usePoll(() => api.get(`/admin/tickets/${id}`), [id], 10000);
  const admins = usePoll(() => api.get('/admin/admins'), []);
  const t = data?.ticket;

  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState(null); // { source, warning }
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const loadedFor = useRef(null);

  async function generate(force) {
    if (force && draft.trim() && !window.confirm('Replace the current draft with a new AI draft?')) return;
    setDrafting(true);
    try {
      const r = await api.post(`/admin/tickets/${id}/draft`);
      setDraft(r.draft); setMeta({ source: r.source, warning: r.warning });
    } catch (err) { toast(err.message, 'error'); }
    finally { setDrafting(false); }
  }

  // When a ticket is first opened: show the cached draft, or generate one (once).
  useEffect(() => {
    if (!t || loadedFor.current === t.id) return;
    loadedFor.current = t.id;
    setDraft(''); setMeta(null);
    if (t.draft) { setDraft(t.draft.text); setMeta({ source: t.draft.source, warning: t.draft.source === 'template' ? 'This is a rule-based template (AI was unavailable). Edit before sending, or regenerate.' : null }); }
    else if (t.status !== 'Closed') generate(false);
  }, [t?.id]); // eslint-disable-line

  async function patch(body, okMsg) {
    try { await api.patch(`/admin/tickets/${id}`, body); await reload(); if (okMsg) toast(okMsg); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function send(status) {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/tickets/${id}/reply`, { body: draft, ...(status && { status }) });
      setDraft(''); setMeta(null); loadedFor.current = t.id; await reload();
      toast('Reply sent. The author sees it right away.');
    } catch (err) { toast(err.message, 'error'); }
    finally { setSending(false); }
  }
  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try { await api.post(`/admin/tickets/${id}/notes`, { body: note }); setNote(''); await reload(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function retryAi() {
    try { await api.post(`/admin/tickets/${id}/reclassify`); await reload(); toast('AI classification re-run'); }
    catch (err) { toast(err.message, 'error'); }
  }

  if (loading && !t) return <Spinner label="Loading ticket…" />;
  if (error && !t) return <><Link to="/admin">← Back to queue</Link><div style={{ marginTop: 14 }}><ErrorBox error={error} onRetry={reload} /></div></>;

  const closed = t.status === 'Closed';
  const lastIsAuthor = t.messages.length > 0 && t.messages[t.messages.length - 1].sender === 'author';

  return (
    <>
      <Link to="/admin" className="small">← Back to queue</Link>
      <div className="page-head" style={{ marginTop: 10 }}>
        <div>
          <span className="muted small">{t.ticketNo} · from {t.author.name} · {fmtDateTime(t.createdAt)}</span>
          <h1>{t.subject}</h1>
        </div>
        <div className="row"><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></div>
      </div>

      <div className="detail">
        <div>
          <div className="card">
            <h3 className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '.5px' }}>Author's query</h3>
            <div className="original" style={{ marginTop: 8 }}>{t.description}</div>
            {t.attachments.length > 0 && <div style={{ marginTop: 6 }}>{t.attachments.map((a) => <span key={a} className="chip">📎 {a}</span>)}</div>}
            {t.messages.length > 0 && (
              <div className="thread">
                {t.messages.map((m) => (
                  <div key={m.id} className={`msg ${m.sender === 'admin' ? 'admin' : 'author'}`} style={m.sender === 'admin' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }}>
                    <div className="who"><span>{m.sender === 'admin' ? m.senderName : t.author.name}</span><span>{fmtDateTime(m.createdAt)}</span></div>{m.body}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between wrap">
              <h2>Reply to author</h2>
              {!closed && <button className="btn sm" disabled={drafting} onClick={() => generate(true)}>{drafting ? 'Drafting…' : '✨ Regenerate draft'}</button>}
            </div>
            {lastIsAuthor && <div className="alert info" style={{ marginTop: 12 }}>The author replied after the last message. Regenerate the draft to take their follow-up into account.</div>}
            {closed ? (
              <div className="alert info" style={{ marginTop: 12 }}>This ticket is closed. Change the status to reopen it before replying.</div>
            ) : (
              <div className={`composer ${meta?.source === 'template' ? 'template' : ''}`}>
                <div className="row between wrap" style={{ marginBottom: 8 }}>
                  <span className="ai-chip">{meta?.source === 'template' ? '📝 Template draft (AI unavailable)' : '✨ AI draft, review and edit before sending'}</span>
                  <span className="muted small">{draft.length} chars</span>
                </div>
                {meta?.warning && <div className="alert warn">{meta.warning}</div>}
                {drafting ? <div className="skeleton">Drafting a reply with your knowledge base…</div> : (
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write your reply to the author…" />
                )}
                <div className="row wrap" style={{ marginTop: 12 }}>
                  <button className="btn primary" disabled={sending || drafting || !draft.trim()} onClick={() => send()}>Send reply</button>
                  <button className="btn green" disabled={sending || drafting || !draft.trim()} onClick={() => send('Resolved')}>Send &amp; mark resolved</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="card">
          <div className="side-block">
            <h3>Ticket</h3>
            <label className="field" style={{ marginBottom: 10 }}>Status
              <select value={t.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            <label className="field" style={{ marginBottom: 10 }}>Assigned to
              <select value={t.assignedTo ?? ''} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null }, 'Assignment updated')}>
                <option value="">Unassigned</option>
                {(admins.data?.items || []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.id === user.id ? ' (me)' : ''}</option>)}
              </select>
            </label>
            {t.assignedTo !== user.id && <button className="btn sm" onClick={() => patch({ assignedTo: 'me' }, 'Assigned to you')}>Assign to me</button>}
          </div>

          <div className="side-block">
            <h3>Classification</h3>
            <label className="field" style={{ marginBottom: 10 }}><span className="row between">Category <SourceTag source={t.categorySource} /></span>
              <select value={t.category} onChange={(e) => patch({ category: e.target.value }, 'Category updated')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field" style={{ marginBottom: 10 }}><span className="row between">Priority <SourceTag source={t.prioritySource} /></span>
              <select value={t.priority} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated')}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
            </label>
            {t.aiReason && <p className="muted small" style={{ margin: '0 0 8px' }}>🤖 {t.aiReason}</p>}
            {(t.aiStatus === 'failed' || t.aiStatus === 'pending') && (
              <div className="alert warn" style={{ display: 'block' }}>{t.aiStatus === 'pending' ? 'AI is still classifying…' : 'AI classification failed; keyword rules were used.'} <button className="btn sm" style={{ marginTop: 6 }} onClick={retryAi}>Retry AI</button></div>
            )}
          </div>

          <div className="side-block">
            <h3>Author</h3>
            <div className="small" style={{ lineHeight: 1.6 }}><b>{t.author.name}</b> · {t.author.city}<br />{t.author.email}<br />{t.author.phone}</div>
          </div>
          <div className="side-block"><h3>Book context</h3><BookContext book={t.book} /></div>

          <div className="side-block">
            <h3>Internal notes <Badge kind="">not visible to author</Badge></h3>
            {t.notes.map((n) => <div className="notebox" key={n.id}>{n.body}<small>{n.adminName} · {fmtDateTime(n.createdAt)}</small></div>)}
            <form onSubmit={addNote}>
              <textarea style={{ minHeight: 70 }} placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              <button className="btn sm" style={{ marginTop: 8 }} disabled={!note.trim()}>Add note</button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
