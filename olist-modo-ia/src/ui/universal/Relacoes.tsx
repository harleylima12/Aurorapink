import { useState } from 'react';

import { formatar } from '../../format/numeros';
import type { LeituraPlanilha } from '../../universal/carregar';
import { setorProvavel, type Ligacao } from '../../universal/relacoes';

interface Props {
  leituras: LeituraPlanilha[];
  ligacoes: Ligacao[];
  aoConfirmar: (principal: number, escolhidas: Ligacao[]) => void;
  aoVoltar: () => void;
}

/** Várias planilhas: mostra como elas se ligam (com % de ids que batem) e pede confirmação. */
export function Relacoes({ leituras, ligacoes, aoConfirmar, aoVoltar }: Props) {
  // Principal sugerida: o lado "muitos" da melhor ligação; sem ligação, a maior planilha.
  const sugerida = ligacoes[0]?.de.planilha ?? leituras.reduce((m, l, i, a) => (l.linhas > (a[m]?.linhas ?? 0) ? i : m), 0);
  const [principal, setPrincipal] = useState(sugerida);
  const daPrincipal = ligacoes.filter((l) => l.de.planilha === principal);
  // Uma ligação por planilha "um": a de maior cobertura.
  const melhores = daPrincipal.filter((l, i) => daPrincipal.findIndex((x) => x.para.planilha === l.para.planilha) === i);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(melhores.filter((l) => l.paraUnico && l.cobertura >= 0.8).map(chave)));
  const semRelacao = leituras.map((_, i) => i).filter((i) => !ligacoes.some((l) => l.de.planilha === i || l.para.planilha === i));

  return (
    <div className="relacoes">
      <header className="topo">
        <div>
          <h1>Como as planilhas se ligam</h1>
          <p>Encontrei {ligacoes.length === 1 ? '1 ligação possível' : `${ligacoes.length} ligações possíveis`} pelos nomes das colunas e pelos valores em comum.</p>
        </div>
        <button type="button" className="botao-secundario" onClick={aoVoltar}>
          Trocar planilhas
        </button>
      </header>

      <section className="painel" aria-label="Planilhas">
        <h2>Planilha principal (uma linha = um registro do dashboard)</h2>
        <ul className="lista-planilhas">
          {leituras.map((l, i) => (
            <li key={l.prefixo}>
              <label>
                <input
                  type="radio"
                  name="principal"
                  checked={principal === i}
                  onChange={() => {
                    setPrincipal(i);
                    setMarcadas(new Set());
                  }}
                />
                <strong>{l.nome}</strong> · {formatar(l.linhas, 'int')} linhas · setor provável: {setorProvavel(l.perfis)}
              </label>
              {semRelacao.includes(i) && (
                <p className="aviso-planilha" role="alert">
                  ⚠ Esta planilha não tem relação com as outras (nenhuma coluna em comum com valores que batem). Ela fica fora deste dashboard; abra-a sozinha depois.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="painel" aria-label="Ligações sugeridas">
        <h2>Ligações sugeridas</h2>
        {melhores.length === 0 && <p className="nota">Nenhuma planilha se liga à principal escolhida.</p>}
        <ul className="lista-ligacoes">
          {melhores.map((l) => {
            const um = leituras[l.para.planilha];
            return (
              <li key={chave(l)} data-cobertura={Math.round(l.cobertura * 100)}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!l.paraUnico}
                    checked={marcadas.has(chave(l))}
                    onChange={(e) => {
                      const novo = new Set(marcadas);
                      if (e.target.checked) novo.add(chave(l));
                      else novo.delete(chave(l));
                      setMarcadas(novo);
                    }}
                  />
                  <span>
                    <strong>{leituras[principal]?.nome}</strong> “{l.de.original}” → <strong>{um?.nome}</strong> “{l.para.original}”
                  </span>
                </label>
                <p className="nota">
                  {formatar(l.cobertura, 'pct')} dos valores batem · {l.motivo}
                  {l.exemplosSemPar.length ? ` · sem par, por exemplo: ${l.exemplosSemPar.join(', ')}` : ''}
                </p>
                {!l.paraUnico && (
                  <p className="aviso-planilha" role="alert">
                    ⚠ “{l.para.original}” se repete em {um?.nome}: juntar duplicaria linhas da principal (risco de grão). Não dá para ligar assim.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="entendi-rodape">
        <span className="nota">As colunas das planilhas ligadas entram como dimensões (ex.: segmento do cliente). Métricas delas ficam de fora para não somar em dobro.</span>
        <button type="button" className="botao-primario" onClick={() => aoConfirmar(principal, melhores.filter((l) => marcadas.has(chave(l))))}>
          Continuar
        </button>
      </footer>
    </div>
  );
}

function chave(l: Ligacao): string {
  return `${l.de.planilha}:${l.de.coluna}>${l.para.planilha}:${l.para.coluna}`;
}
