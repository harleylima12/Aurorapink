import { useEffect, useMemo, useState } from 'react';

import type { PerguntaAvaliacao } from '../../avaliacao/comparar';
import { rodarSuite, type Relatorio } from '../../avaliacao/rodar';
import type { Motor } from '../../data/duckdb';
import { formatar } from '../../format/numeros';
import type { ContextoResposta } from '../../modo-ia/responder';
import { iaFoiAtivada } from '../../modo-ia/armazenamento';
import { useIALocal } from '../../modo-ia/useIALocal';
import { carregarValores } from '../../modo-ia/useModoIA';
import { criarRoteador, type Valores } from '../../router/layer0';
import { semanticaOlist } from '../../semantic';
import suite from '../../../evals/perguntas.json';
import perfil from '../../../evals/resultados/perfil-planilhas.json';
import temas from '../../../evals/resultados/temas.json';
import type { Metadados } from '../contexto';

const perguntas = suite.perguntas as PerguntaAvaliacao[];
const ROTULO_CATEGORIA: Record<string, string> = {
  facil: 'Fáceis',
  media: 'Médias',
  dificil: 'Difíceis',
  followup: 'Follow-ups',
  ambigua: 'Ambíguas',
  fora: 'Fora de escopo',
  digitacao: 'Digitação e gíria',
};

const taxa = (a: number, t: number) => (t ? formatar(a / t, 'pct') : '—');

function exportar(relatorio: Relatorio) {
  const blob = new Blob([JSON.stringify(relatorio, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avaliacao-${relatorio.modo}-${relatorio.geradoEm.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Resultado({ r }: { r: Relatorio }) {
  const erros = r.resultados.filter((x) => !x.ok);
  return (
    <section className="painel largo avaliacao-resultado" data-modo={r.modo} aria-label={`Resultado ${r.modo === 'camada0' ? 'Camada 0' : 'Camada 0 + IA'}`}>
      <header className="painel-cabecalho">
        <h2>{r.modo === 'camada0' ? 'Camada 0 (sem IA)' : `Camada 0 + IA local (${r.modelo ?? 'modelo'})`}</h2>
        <p>
          {r.geral.total} perguntas pelo caminho real (roteamento, SQL no DuckDB, insights e texto), neste navegador ·{' '}
          {new Date(r.geradoEm).toLocaleString('pt-BR')}
        </p>
      </header>
      <div className="kpis avaliacao-kpis">
        <div className="kpi" data-testid="avaliacao-geral">
          <h3 className="kpi-rotulo">Acerto geral</h3>
          <p className="kpi-valor">{taxa(r.geral.acertos, r.geral.total)}</p>
          <p className="kpi-rodape">
            {r.geral.acertos} de {r.geral.total}
          </p>
        </div>
        <div className="kpi">
          <h3 className="kpi-rotulo">Lote cego da Fase 7</h3>
          <p className="kpi-valor">{taxa(r.loteFase7.acertos, r.loteFase7.total)}</p>
          <p className="kpi-rodape">
            {r.loteFase7.acertos} de {r.loteFase7.total} (1ª rodada, antes de ajustar: 21 de 26)
          </p>
        </div>
        <div className="kpi">
          <h3 className="kpi-rotulo">Latência ponta a ponta</h3>
          <p className="kpi-valor">{formatar(r.latenciaMs.p50, 'int')} ms</p>
          <p className="kpi-rodape">
            p50 · p95 {formatar(r.latenciaMs.p95, 'int')} ms · máx. {formatar(r.latenciaMs.max, 'int')} ms
          </p>
        </div>
        <div className="kpi">
          <h3 className="kpi-rotulo">{r.fallbackNarrador ? 'Texto da IA recusado' : 'Respostas via IA'}</h3>
          <p className="kpi-valor">{r.fallbackNarrador ? taxa(r.fallbackNarrador.recusados, r.fallbackNarrador.tentados) : r.viaIA}</p>
          <p className="kpi-rodape">
            {r.fallbackNarrador ? `${r.fallbackNarrador.recusados} de ${r.fallbackNarrador.tentados} (ficou o template) · ${r.viaIA} via IA` : 'a Camada 0 respondeu tudo sozinha'}
          </p>
        </div>
      </div>
      <div className="avaliacao-tabelas">
        <table className="tabela-resposta" aria-label="Metas">
          <thead>
            <tr>
              <th scope="col">Meta</th>
              <th scope="col">Alvo</th>
              <th scope="col">Medido</th>
            </tr>
          </thead>
          <tbody>
            {r.metas.map((m) => (
              <tr key={m.nome} data-meta-ok={m.ok}>
                <th scope="row">{m.nome}</th>
                <td>{m.alvo}</td>
                <td className={m.ok ? 'ok' : 'erro'}>
                  {m.ok ? '✓' : '✗'} {m.valor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="tabela-resposta" aria-label="Acerto por categoria">
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Acertos</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.porCategoria).map(([c, v]) => (
              <tr key={c} data-categoria={c}>
                <th scope="row">{ROTULO_CATEGORIA[c] ?? c}</th>
                <td className="num">
                  {v.acertos}/{v.total}
                </td>
                <td className="num">{taxa(v.acertos, v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="avaliacao-erros">
        <summary>{erros.length ? `${erros.length} erro(s): ver o que veio diferente do esperado` : 'Nenhum erro: ver todas as respostas'}</summary>
        <ul tabIndex={0} aria-label="Respostas da suíte">
          {(erros.length ? erros : r.resultados).map((x) => (
            <li key={x.id}>
              <code>{x.id}</code> “{x.pergunta}” · {x.modo === 'ia' ? 'IA' : 'Camada 0'} · {formatar(x.ms, 'int')} ms{x.erros.length ? ` · ${x.erros.join('; ')}` : ''}
            </li>
          ))}
        </ul>
      </details>
      <button type="button" className="botao-secundario botao-exportar" onClick={() => exportar(r)}>
        Exportar JSON
      </button>
    </section>
  );
}

/** Página /avaliacao (seção 17): roda a suíte no navegador e mostra acerto, metas, latência e fallback do narrador. */
export function PaginaAvaliacao({ motor, meta, aoVoltar }: { motor: Motor; meta: Metadados; aoVoltar: () => void }) {
  const [valores, setValores] = useState<Valores | null>(null);
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState<{ modo: string; feitas: number } | null>(null);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [pediuIA, setPediuIA] = useState(false);
  const ia = useIALocal(pediuIA);

  useEffect(() => {
    document.title = 'Avaliação · Modo IA local';
    let vivo = true;
    carregarValores(motor, semanticaOlist)
      .then((v) => vivo && setValores(v))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [motor]);

  const ctx = useMemo<ContextoResposta | null>(
    () =>
      valores
        ? { executor: motor, semantica: semanticaOlist, roteador: criarRoteador(semanticaOlist, valores, suite.ancora), mesesParciais: meta.mesesParciais, ancora: suite.ancora }
        : null,
    [valores, motor, meta.mesesParciais],
  );

  const rodar = async (comIA: boolean) => {
    if (!ctx || !valores || progresso) return;
    const modo = comIA ? 'Camada 0 + IA' : 'Camada 0';
    setProgresso({ modo, feitas: 0 });
    try {
      const r = await rodarSuite(perguntas, ctx, {
        ...(comIA && ia.motor ? { ia: { motor: ia.motor, valores } } : {}),
        aoProgresso: (feitas) => setProgresso({ modo, feitas }),
      });
      setRelatorios((atual) => [r, ...atual.filter((x) => x.modo !== r.modo)]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  };

  const faseIA = ia.estado.fase;
  const { ativar } = ia;
  useEffect(() => {
    // Quem já ativou a IA antes é reativado pelo próprio useIALocal.
    if (pediuIA && faseIA === 'disponivel' && !iaFoiAtivada()) ativar();
  }, [pediuIA, faseIA, ativar]);

  return (
    <main className="conteudo pagina-avaliacao" id="conteudo">
      <header className="topo">
        <div>
          <h1>Avaliação</h1>
          <p>
            Suíte de {perguntas.length} perguntas em PT-BR (<code>evals/perguntas.json</code>) com o QuerySpec esperado, rodada aqui no navegador pelo mesmo caminho do
            Modo IA. Nada sai do computador.
          </p>
        </div>
        <div className="zona-botoes">
          <button type="button" className="botao-secundario" onClick={aoVoltar}>
            Voltar ao dashboard
          </button>
        </div>
      </header>

      <section className="painel largo" aria-label="Rodar a suíte">
        <div className="zona-botoes">
          <button type="button" className="botao-primario" disabled={!ctx || Boolean(progresso)} onClick={() => void rodar(false)}>
            Rodar com a Camada 0 (sem IA)
          </button>
          {ia.motor ? (
            <button type="button" className="botao-ia" disabled={!ctx || Boolean(progresso)} onClick={() => void rodar(true)}>
              ✨ Rodar com Camada 0 + IA local
            </button>
          ) : (
            <button type="button" className="botao-secundario" disabled={pediuIA && faseIA !== 'erro'} onClick={() => setPediuIA(true)}>
              {!pediuIA ? '✨ Ativar a IA local para rodar com ela' : faseIA === 'baixando' ? `Carregando a IA: ${Math.round((ia.estado.fase === 'baixando' ? ia.estado.progresso.fracao : 0) * 100)}%` : faseIA === 'sem-webgpu' ? 'Sem WebGPU: só a Camada 0' : faseIA === 'erro' ? 'A IA falhou: tentar de novo' : 'Verificando WebGPU…'}
            </button>
          )}
        </div>
        {!ctx && !erro && <p className="nota">Carregando os valores da base…</p>}
        {progresso && (
          <p role="status" aria-live="polite" data-testid="avaliacao-progresso">
            {progresso.modo}: {progresso.feitas} de {perguntas.length} perguntas…
          </p>
        )}
        {erro && <p className="erro">{erro}</p>}
        <p className="nota">
          A Camada 0 responde sem modelo. Com a IA, o que a Camada 0 não resolve vai para o planejador, e o texto de cada resposta passa pelo narrador da IA e pelo
          validador (o "texto recusado" mostra quantas vezes ficou o template). A qualidade da IA real é medida no PC com GPU.
        </p>
      </section>

      {relatorios.map((r) => (
        <Resultado key={r.modo} r={r} />
      ))}

      <section className="painel largo" aria-label="Modo Universal">
        <header className="painel-cabecalho">
          <h2>Modo Universal (planilhas)</h2>
          <p>
            Medido pelo <code>npm test</code> sobre as planilhas de <code>evals/planilhas/</code> (no mesmo DuckDB-WASM do navegador).
          </p>
        </header>
        <table className="tabela-resposta">
          <tbody>
            <tr>
              <th scope="row">Tipo das colunas certo, sem ajuste manual (meta ≥ 90%)</th>
              <td className="num" data-testid="avaliacao-perfil">
                {perfil.certas}/{perfil.total} ({taxa(perfil.certas, perfil.total)})
              </td>
            </tr>
            <tr>
              <th scope="row">Tema da planilha sem IA (meta ≥ 90%; 1ª rodada, sem ajuste)</th>
              <td className="num" data-testid="avaliacao-temas">
                {temas.acertos}/{temas.total} ({taxa(temas.acertos, temas.total)})
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
