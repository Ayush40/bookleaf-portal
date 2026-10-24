import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch + optional polling (near-real-time updates without page refresh).
 * Polling pauses while the tab is hidden. A failed background refresh keeps the old data and exposes `error`.
 */
export function usePoll(fetcher, deps = [], intervalMs = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const ref = useRef(fetcher);
  ref.current = fetcher;
  const load = useCallback(async () => {
    try {
      const data = await ref.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    load();
    if (!intervalMs) return undefined;
    const t = setInterval(() => { if (!document.hidden) load(); }, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: load };
}
