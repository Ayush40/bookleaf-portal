export const iso = (d) => d.toISOString().slice(0, 10);
export const fmtDate = (s) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
export const inr = (n) => (n == null ? null : `₹${Number(n).toLocaleString('en-IN')}`);
