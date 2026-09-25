import type { MouseEvent } from 'react';

import { montarUrl, SEM_FILTROS, type Local } from '../dashboard/filtros';
import { PAGINAS, type IdPagina } from '../dashboard/paginas';
import { useDados } from './contexto';

interface Props {
  local: Local;
  navegar: (novo: Local, opcoes?: { substituir?: boolean }) => void;
  irPlanilha?: () => void;
}

function Navegacao({ local, navegar }: Props) {
  const irPara = (pagina: IdPagina) => (evento: MouseEvent<HTMLAnchorElement>) => {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    navegar({ ...local, pagina });
  };
  return (
    <nav aria-label="Páginas do dashboard">
      <ul className="navegacao">
        {PAGINAS.map((p) => (
          <li key={p.id}>
            <a href={montarUrl({ ...local, pagina: p.id })} onClick={irPara(p.id)} aria-current={p.id === local.pagina ? 'page' : undefined}>
              <span>{p.titulo}</span>
              <small>{p.descricao}</small>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PainelFiltros({ local, navegar }: Props) {
  const { meta } = useDados();
  const { filtros } = local;
  const temFiltro = filtros.ano !== null || filtros.uf !== null;
  return (
    <form className="filtros" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
      <h2>Filtros</h2>
      <label>
        Ano
        <select
          value={filtros.ano ?? ''}
          onChange={(e) => navegar({ ...local, filtros: { ...filtros, ano: e.target.value ? Number(e.target.value) : null } }, { substituir: true })}
        >
          <option value="">Todos</option>
          {meta.anos.map((ano) => (
            <option key={ano} value={ano}>
              {ano}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estado do cliente
        <select
          value={filtros.uf ?? ''}
          onChange={(e) => navegar({ ...local, filtros: { ...filtros, uf: e.target.value || null } }, { substituir: true })}
        >
          <option value="">Todos</option>
          {meta.ufs.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="botao-secundario" disabled={!temFiltro} onClick={() => navegar({ ...local, filtros: SEM_FILTROS }, { substituir: true })}>
        Limpar filtros
      </button>
    </form>
  );
}

export function BarraLateral(props: Props) {
  return (
    <aside className="lateral">
      <div className="marca">
        <img src="/icone.svg" alt="" width={32} height={32} />
        <div>
          <strong>Olist</strong>
          <span>Modo IA local</span>
        </div>
      </div>
      <Navegacao {...props} />
      <PainelFiltros {...props} />
      <a
        className="link-planilha"
        href="/planilha"
        onClick={(e) => {
          if (!props.irPlanilha || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          props.irPlanilha();
        }}
      >
        <span>📂 Sua planilha</span>
        <small>Modo Universal: CSV ou Excel</small>
      </a>
    </aside>
  );
}
