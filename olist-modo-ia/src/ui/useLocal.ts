import { useCallback, useEffect, useState } from 'react';

import { lerLocal, montarUrl, type Local } from '../dashboard/filtros';

/** Página e filtros ficam na URL (/logistica?ano=2018&uf=SP): dá para favoritar e compartilhar. */
export function useLocal(): [Local, (novo: Local, opcoes?: { substituir?: boolean }) => void] {
  const [local, setLocal] = useState(() => lerLocal(window.location.pathname, window.location.search));

  useEffect(() => {
    const aoVoltar = () => setLocal(lerLocal(window.location.pathname, window.location.search));
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const navegar = useCallback((novo: Local, opcoes: { substituir?: boolean } = {}) => {
    const url = montarUrl(novo);
    if (opcoes.substituir) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setLocal(novo);
  }, []);

  return [local, navegar];
}
