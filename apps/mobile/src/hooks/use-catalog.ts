import { useCallback, useEffect, useState } from 'react';

import { fetchCatalog, type CatalogResponse } from '@/lib/api';

type State = {
  data: CatalogResponse | null;
  loading: boolean;
  error: string | null;
};

/** Loads the AYVANA catalog, optionally filtered by category slug. */
export function useCatalog(category?: string) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchCatalog(category);
      setState({ data, loading: false, error: null });
    } catch {
      setState({ data: null, loading: false, error: 'Could not reach the AYVANA store.' });
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
