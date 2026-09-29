import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load data on mount (and whenever `deps` change) with loading / error state.
 * Returns `reload` so callers can refresh after mutations.
 */
export function useAsync(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latest = useRef(0);

  const run = useCallback(
    async ({ silent = false } = {}) => {
      const requestId = ++latest.current;
      if (!silent) setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await fetcher();
        if (requestId === latest.current) setState({ data, loading: false, error: null });
        return data;
      } catch (error) {
        if (requestId === latest.current) setState((current) => ({ data: current.data, loading: false, error }));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run, setData: (updater) => setState((current) => ({ ...current, data: typeof updater === 'function' ? updater(current.data) : updater })) };
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
