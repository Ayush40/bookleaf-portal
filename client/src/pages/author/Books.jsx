import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { usePoll } from '../../hooks.js';
import { Badge, Empty, ErrorBox, Spinner, fmtDate, rupees } from '../../ui.jsx';
import { PRODUCTION_STAGES } from '../../constants.js';

const NA = () => <b className="na">—</b>;

function Stepper({ index }) {
  return (
    <div className="stepper" aria-label="Production progress">
      {PRODUCTION_STAGES.map((s, i) => (
        <div key={s} className={`step ${i < index ? 'done' : i === index ? 'now' : ''}`}><div className="bar" />{i === index || window.innerWidth > 900 ? s : ''}</div>
      ))}
    </div>
  );
}

function RoyaltyBlock({ b }) {
  const total = b.royaltyPaid + b.royaltyPending;
  const warn = b.royalty.state === 'overdue_review';
  return (
    <div>
      <div className="kv">
        <div><span>Total royalty earned</span><b>{rupees(b.royaltyEarned)}</b></div>
        <div><span>Royalty paid</span><b>{rupees(b.royaltyPaid)}</b></div>
        <div><span>Royalty pending</span><b>{rupees(b.royaltyPending)}</b></div>
        <div><span>Last payout</span>{b.lastPayoutDate ? <b>{fmtDate(b.lastPayoutDate)}</b> : <b className="na">No payout yet</b>}</div>
      </div>
      {total > 0 && (
        <>
          <div className="royalty-bar" title={`${rupees(b.royaltyPaid)} paid, ${rupees(b.royaltyPending)} pending`}>
            <i className="paid" style={{ width: `${(b.royaltyPaid / total) * 100}%` }} /><i className="pend" style={{ width: `${(b.royaltyPending / total) * 100}%` }} />
          </div>
          <div className="legend"><span><i style={{ background: 'var(--leaf)' }} />Paid</span><span><i style={{ background: 'var(--orange)' }} />Pending</span></div>
        </>
      )}
      <div className={`note ${warn ? 'warn' : b.royalty.state === 'settled' ? 'good' : ''}`} style={{ marginTop: 12 }}>
        {b.royalty.note}{' '}
        {warn && <Link to={`/submit?book=${b.bookId}`}><b>Raise a ticket →</b></Link>}
      </div>
    </div>
  );
}

function BookCard({ b }) {
  return (
    <article className="card book">
      <div className="book-head">
        <div><h2>{b.title}</h2><div className="genre">{b.genre} · ISBN {b.isbn || '—'}</div></div>
        <div className="row"><Badge kind={b.isLive ? 'st-resolved' : 'st-in-progress'}>{b.status}</Badge><Link className="btn sm" to={`/submit?book=${b.bookId}`}>Ask about this book</Link></div>
      </div>
      <div className="kv">
        <div><span>Publication date</span>{b.publicationDate ? <b>{fmtDate(b.publicationDate)}</b> : <b className="na">Not yet published</b>}</div>
        <div><span>MRP</span>{b.mrp != null ? <b>{rupees(b.mrp)}</b> : <b className="na">Set at publication</b>}</div>
        <div><span>Copies sold</span>{b.isLive ? <b>{b.copiesSold.toLocaleString('en-IN')}</b> : <NA />}</div>
        <div><span>Royalty per copy</span>{b.royaltyPerCopy != null ? <b>{rupees(b.royaltyPerCopy)}</b> : <NA />}</div>
      </div>
      {b.isLive ? <RoyaltyBlock b={b} /> : (
        <div>
          {b.productionStageIndex >= 0 && <Stepper index={b.productionStageIndex} />}
          <div className="note" style={{ marginTop: 10 }}>
            {b.productionStage ? <>Your book is at the <b>{b.productionStage}</b> stage. </> : null}We email you at every stage. {b.royalty.note}
          </div>
        </div>
      )}
      {b.isLive && b.availableOn.length > 0 && <div className="platforms">{b.availableOn.map((p) => <span key={p}>{p}</span>)}</div>}
    </article>
  );
}

export default function Books() {
  const { data, error, loading, reload } = usePoll(() => api.get('/books'), []);
  const books = data?.items || [];
  const live = books.filter((b) => b.isLive);
  const sum = (k) => live.reduce((a, b) => a + b[k], 0);

  return (
    <>
      <div className="page-head"><div><h1>My Books</h1><p>Your titles, sales and royalties in one place.</p></div><Link to="/submit" className="btn primary">✉️ Submit a query</Link></div>
      {loading && <Spinner label="Loading your books…" />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && books.length === 0 && <div className="card"><Empty icon="📚" title="No books yet">Once you start publishing with BookLeaf, your books will show up here.</Empty></div>}
      {data && books.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><div className="label">Books</div><div className="value">{books.length}</div></div>
            <div className="stat"><div className="label">Copies sold</div><div className="value">{sum('copiesSold').toLocaleString('en-IN')}</div></div>
            <div className="stat green"><div className="label">Royalty paid</div><div className="value">{rupees(sum('royaltyPaid'))}</div></div>
            <div className="stat orange"><div className="label">Royalty pending</div><div className="value">{rupees(sum('royaltyPending'))}</div></div>
          </div>
          {books.map((b) => <BookCard key={b.bookId} b={b} />)}
        </>
      )}
    </>
  );
}
