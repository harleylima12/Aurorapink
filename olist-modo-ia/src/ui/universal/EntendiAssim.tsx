import { useState } from 'react';

import { formatar } from '../../format/numeros';
import type { Formato } from '../../semantic/schema';
import type { LeituraPlanilha } from '../../universal/carregar';
import type { Grupo, ParteGrupo } from '../../universal/montar';
import { ROTULO_TIPO, TIPOS_COLUNA, type Agregacao, type ColunaConfig, type Papel, type TipoColuna } from '../../universal/perfil';
import { setorProvavel } from '../../universal/relacoes';

export interface KpiPrevia {
  rotulo: string;
  valor: number | null;
  formato: Formato;
}

interface Props {
  grupo: Grupo;
  aoMudar: (parte: 'principal' | number, config: ColunaConfig[]) => void;
  aoMudarSensivel: (minGroupSize: number | undefined) => void;
  aoGerar: (lembrarLayout: boolean) => void;
  aoVoltar: () => void;
  previa: KpiPrevia[] | 'calculando' | { erro: string };
  gerando: boolean;
}

const PAPEIS: Record<Papel, string> = { metrica: 'Métrica', dimensao: 'Dimensão', tempo: 'Eixo do tempo', ignorar: 'Ignorar' };
const AGREGACOES: Record<Agregacao, string> = { soma: 'Soma', media: 'Média', contagem_distinta: 'Contagem distinta' };

const AVISOS: Record<string, string> = {
  varias_tabelas:
    'Parece que há mais de uma tabela nesta aba (coluna vazia no meio do cabeçalho). O app leu tudo como uma tabela só: confira as colunas abaixo ou separe as tabelas em arquivos diferentes.',
  sem_cabecalho: 'Não achei uma linha de cabeçalho clara: usei a primeira linha. Confira os nomes das colunas.',
  poucas_linhas: 'A planilha tem menos de 2 linhas de dados.',
};

/** Papel e agregação padrão quando a pessoa troca o tipo de uma coluna. */
export function padraoDoTipo(c: ColunaConfig, tipo: TipoColuna): ColunaConfig {
  const papel: Papel =
    tipo === 'data' ? 'tempo' : ['dinheiro', 'numero', 'porcentagem'].includes(tipo) ? 'metrica' : ['categoria', 'uf', 'cidade', 'booleano'].includes(tipo) ? 'dimensao' : tipo === 'id' ? 'metrica' : 'ignorar';
  const agregacao: Agregacao | undefined = papel !== 'metrica' ? undefined : tipo === 'id' ? 'contagem_distinta' : tipo === 'porcentagem' ? 'media' : 'soma';
  return { ...c, tipo, papel, agregacao };
}

function exemplos(leitura: LeituraPlanilha, id: string, tipo: TipoColuna): string {
  const valores = leitura.previa.map((l) => l[id]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 3).map(String);
  if (tipo === 'pessoal') return valores.length ? '(dado pessoal: aparece mascarado)' : '—';
  return valores.map((v) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)).join(' · ') || '—';
}

function TabelaColunas({ parte, aoMudar }: { parte: ParteGrupo; aoMudar: (c: ColunaConfig[]) => void }) {
  const { leitura, config } = parte;
  const motivo = (id: string) => leitura.perfis.find((p) => p.id === id)?.motivo ?? '';
  const trocar = (id: string, f: (c: ColunaConfig) => ColunaConfig) => {
    let novo = config.map((c) => (c.id === id ? f(c) : c));
    const tempo = novo.find((c) => c.id === id && c.papel === 'tempo');
    // Só uma coluna é o eixo do tempo.
    if (tempo) novo = novo.map((c) => (c.id !== id && c.papel === 'tempo' ? { ...c, papel: 'ignorar' as const } : c));
    aoMudar(novo);
  };
  return (
    <div className="tabela-rolagem">
      <table className="tabela-colunas">
        <thead>
          <tr>
            <th scope="col">Coluna</th>
            <th scope="col">Tipo</th>
            <th scope="col">Papel</th>
            <th scope="col">Agregação</th>
            <th scope="col">Rótulo</th>
          </tr>
        </thead>
        <tbody>
          {config.map((c) => (
            <tr key={c.id} data-coluna={c.original} data-tipo={c.tipo} data-papel={c.papel}>
              <th scope="row">
                <span className="coluna-nome">{c.original}</span>
                <small>{exemplos(leitura, c.id, c.tipo)}</small>
                <small className="motivo">por quê: {motivo(c.id)}</small>
              </th>
              <td>
                <select aria-label={`Tipo de ${c.original}`} value={c.tipo} onChange={(e) => trocar(c.id, (x) => padraoDoTipo(x, e.target.value as TipoColuna))}>
                  {TIPOS_COLUNA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO[t]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select aria-label={`Papel de ${c.original}`} value={c.papel} onChange={(e) => trocar(c.id, (x) => ({ ...x, papel: e.target.value as Papel, agregacao: e.target.value === 'metrica' ? (x.agregacao ?? 'soma') : x.agregacao }))}>
                  {(Object.keys(PAPEIS) as Papel[])
                    .filter((p) => p !== 'tempo' || c.tipo === 'data')
                    // Dado pessoal nunca vira métrica nem dimensão (fica fora do catálogo da IA); texto livre, só dimensão.
                    .filter((p) => (c.tipo === 'pessoal' ? p === 'ignorar' : c.tipo === 'texto' ? p === 'ignorar' || p === 'dimensao' : true))
                    .map((p) => (
                      <option key={p} value={p}>
                        {PAPEIS[p]}
                      </option>
                    ))}
                </select>
              </td>
              <td>
                <select
                  aria-label={`Agregação de ${c.original}`}
                  value={c.agregacao ?? 'soma'}
                  disabled={c.papel !== 'metrica'}
                  onChange={(e) => trocar(c.id, (x) => ({ ...x, agregacao: e.target.value as Agregacao }))}
                >
                  {(Object.keys(AGREGACOES) as Agregacao[])
                    .filter((a) => (['id', 'categoria', 'uf', 'cidade', 'booleano'].includes(c.tipo) ? a === 'contagem_distinta' : a !== 'contagem_distinta' || c.tipo === 'numero'))
                    .map((a) => (
                      <option key={a} value={a}>
                        {AGREGACOES[a]}
                      </option>
                    ))}
                </select>
              </td>
              <td>
                <input aria-label={`Rótulo de ${c.original}`} value={c.rotulo} maxLength={80} onChange={(e) => trocar(c.id, (x) => ({ ...x, rotulo: e.target.value || x.original }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cabecalho({ parte, papel }: { parte: ParteGrupo; papel: string }) {
  const { leitura } = parte;
  return (
    <header className="parte-cabecalho">
      <h2>
        {leitura.nome} <small>{papel}</small>
      </h2>
      <p className="nota">
        {formatar(leitura.linhas, 'int')} linhas · {leitura.colunas.length} colunas · lido em {formatar(leitura.ms, 'int')} ms · setor provável: {setorProvavel(leitura.perfis)}
        {leitura.aba ? ` · aba "${leitura.aba}"` : ''}
      </p>
      {leitura.avisos.map((a) => (
        <p key={a} className="aviso-planilha" role="alert" data-aviso={a}>
          ⚠ {AVISOS[a] ?? a}
        </p>
      ))}
      <ul className="relatorio-limpeza" aria-label="O que foi corrigido">
        {leitura.resumo.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </header>
  );
}

/** Tela "Entendi assim" (seção 7A item 6): revisão de 1 minuto, tudo editável, com prévia dos KPIs. */
export function EntendiAssim({ grupo, aoMudar, aoMudarSensivel, aoGerar, aoVoltar, previa, gerando }: Props) {
  const [lembrar, setLembrar] = useState(true);
  return (
    <div className="entendi-assim">
      <header className="topo">
        <div>
          <h1>Entendi assim</h1>
          <p>Confira em 1 minuto: tipo, papel e rótulo de cada coluna. Dados pessoais e texto livre ficam fora da IA.</p>
        </div>
        <div className="zona-botoes">
          <button type="button" className="botao-secundario" onClick={aoVoltar}>
            Trocar planilha
          </button>
        </div>
      </header>

      <section className="previa-kpis" aria-label="Prévia dos KPIs" aria-live="polite">
        {previa === 'calculando' ? (
          <p className="nota">Calculando a prévia…</p>
        ) : 'erro' in previa ? (
          <p className="erro">{previa.erro}</p>
        ) : (
          previa.map((k) => (
            <div key={k.rotulo} className="kpi kpi-previa">
              <h2 className="kpi-rotulo">{k.rotulo}</h2>
              <p className="kpi-valor">{formatar(k.valor, k.formato, { compacto: k.formato === 'brl' && Math.abs(k.valor ?? 0) >= 1_000_000 })}</p>
            </div>
          ))
        )}
      </section>

      <section className="painel parte" aria-label={`Colunas de ${grupo.principal.leitura.nome}`}>
        <Cabecalho parte={grupo.principal} papel="(principal)" />
        <TabelaColunas parte={grupo.principal} aoMudar={(c) => aoMudar('principal', c)} />
      </section>
      {grupo.juntas.map((j, i) => (
        <section key={j.leitura.prefixo} className="painel parte" aria-label={`Colunas de ${j.leitura.nome}`}>
          <Cabecalho parte={j} papel={j.ligacao ? `(ligada por "${j.ligacao.para.original}")` : ''} />
          <TabelaColunas parte={j} aoMudar={(c) => aoMudar(i, c)} />
        </section>
      ))}

      <footer className="entendi-rodape">
        <label className="alternar" data-testid="dados-sensiveis">
          <input type="checkbox" checked={grupo.minGroupSize !== undefined} onChange={(e) => aoMudarSensivel(e.target.checked ? 5 : undefined)} />
          Dados sensíveis: esconder grupos com menos de 5 registros (e a tabela de detalhe){grupo.minGroupSize !== undefined ? ' · ligado porque a planilha tem dados pessoais ou de RH' : ''}
        </label>
        <label className="alternar">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          Lembrar este layout (a próxima planilha igual abre direto no dashboard)
        </label>
        <button type="button" className="botao-primario" disabled={gerando} onClick={() => aoGerar(lembrar)}>
          {gerando ? 'Gerando…' : 'Gerar dashboard'}
        </button>
      </footer>
    </div>
  );
}
