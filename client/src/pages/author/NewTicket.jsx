import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { usePoll } from '../../hooks.js';
import { Spinner, ErrorBox, useToast } from '../../ui.jsx';

const MAX_FILE = 5 * 1024 * 1024;

export default function NewTicket() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const books = usePoll(() => api.get('/books'), []);
  const [form, setForm] = useState({ bookId: params.get('book') || 'general', subject: '', description: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); };

  function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      if (f.size > MAX_FILE) { toast(`${f.name} is larger than 5 MB`, 'error'); continue; }
      if (next.length >= 5) { toast('You can attach up to 5 files', 'error'); break; }
      if (!next.some((x) => x.name === f.name)) next.push(f);
    }
    setFiles(next);
  }

  function validate() {
    const e = {};
    if (form.subject.trim().length < 5) e.subject = 'Please add a short subject (at least 5 characters).';
    if (form.description.trim().length < 20) e.description = 'Please describe the issue in a bit more detail (at least 20 characters).';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setBusy(true);
    try {
      // Per the brief, attachments are UI-only: we send file names so the team knows photos were mentioned.
      const { ticket } = await api.post('/tickets', { ...form, attachments: files.map((f) => f.name) });
      toast(`Ticket ${ticket.ticketNo} submitted. We'll reply here.`);
      nav(`/tickets/${ticket.id}`);
    } catch (err) {
      if (err.details?.length) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      setFormError(err.message);
      setBusy(false);
    }
  }

  const selected = books.data?.items.find((b) => b.bookId === form.bookId);

  return (
    <>
      <div className="page-head"><div><h1>Submit a Support Query</h1><p>Tell us what's going on. The more detail, the faster we can help.</p></div></div>
      {books.loading && <Spinner />}
      {books.error && !books.data && <ErrorBox error={books.error} onRetry={books.reload} />}
      {books.data && (
        <form className="card" style={{ maxWidth: 760 }} onSubmit={submit} noValidate>
          {formError && <div className="alert error">{formError}</div>}
          <label className="field">Which book is this about?
            <select value={form.bookId} onChange={set('bookId')}>
              <option value="general">General / Account Level</option>
              {books.data.items.map((b) => <option key={b.bookId} value={b.bookId}>{b.title}{b.isLive ? '' : ' (in production)'}</option>)}
            </select>
          </label>
          {selected && !selected.isLive && <div className="alert info">This book is still in production ({selected.productionStage || selected.status}). Production questions are welcome!</div>}
          <label className="field">Subject
            <input value={form.subject} onChange={set('subject')} maxLength={150} placeholder="e.g. I haven't received my royalty payout" />
            {errors.subject && <div className="field-error">{errors.subject}</div>}
          </label>
          <label className="field">Description
            <textarea value={form.description} onChange={set('description')} maxLength={5000} placeholder="Include dates, amounts, platform names or anything else that helps us look into it." />
            <div className="counter">{form.description.length} / 5000</div>
            {errors.description && <div className="field-error">{errors.description}</div>}
          </label>
          <div className="field">Attachments <span className="hint">(optional, e.g. photos of a print defect · up to 5 files, 5 MB each)</span>
            <label className="dropzone">📎 Click to choose files
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
            </label>
            {files.map((f) => <span className="chip" key={f.name}>{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))}>✕</button></span>)}
          </div>
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit query'}</button><span className="muted small">We aim to reply within 48 hours.</span></div>
        </form>
      )}
    </>
  );
}
