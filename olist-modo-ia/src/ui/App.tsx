import { useCallback, useEffect, useRef, useState } from 'react';

import { useIALocal } from '../modo-ia/useIALocal';
import { useModoIA } from '../modo-ia/useModoIA';
import { Fixados } from './modo-ia/Fixados';
import { PainelIA } from './modo-ia/PainelIA';

import { completarMeses } from '../charts/series';
import { PAGINAS } from '../dashboard/paginas';
import type { Motor } from '../data/duckdb';
import { calcularAncora, mesesComPoucosDados } from '../query/ancora';
import { compilar } from '../query/compiler';
import type { QuerySpec } from '../query/spec';
import { semanticaOlist } from '../semantic';
import { BarraLateral } from './BarraLateral';
import { Dados, type ContextoDados, type Metadados } from './contexto';
import { KpiCard } from './KpiCard';
import { obterMotor } from './motor';
import { Rodape } from './Rodape';
import { useLocal } from './useLocal';
import { Visual } from './Visual';

async function consultarSpec(motor: Motor, spec: QuerySpec) {
  const { sql, params } = compilar(spec, semanticaOlist);
  return (await motor.consultar(sql, params)).linhas;
}

/** Metadados da base inteira: anos e UFs para os filtros, meses incompletos e âncora de datas. */
async function carregarMetadados(motor: Motor): Promise<Metadados> {
  const [mensal, anual, ufs] = await Promise.all([
    consultarSpec(motor, { intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], filters: [], time: { grain: 'mes' } }),
    consultarSpec(motor, { intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], filters: [], time: { grain: 'ano' } }),
    consultarSpec(motor, { intent: 'comparacao', metrics: ['pedidos'], dimensions: ['estado_cliente'], filters: [] }),
  ]);
  const volume = mensal.map((l) => ({ mes: String(l.tempo), n: Number(l.pedidos) }));
  // Meses sem nenhum pedido (ex.: nov/2016) não aparecem no resultado: entram como incompletos.
  const completos = completarMeses(mensal, 'tempo', [{ id: 'pedidos', zeroQuandoVazio: true }]);
  const semPedidos = completos.filter((l) => l.pedidos === 0).map((l) => String(l.tempo));
  return {
    anos: anual.map((l) => Number(String(l.tempo).slice(0, 4))),
    ufs: ufs.map((l) => String(l.estado_cliente)).sort(),
    mesesParciais: new Set([...mesesComPoucosDados(volume), ...semPedidos]),
    ancora: calcularAncora(volume),
  };
}

type Carga = { status: 'carregando' } | { status: 'pronto'; dados: ContextoDados } | { status: 'erro'; mensagem: string };

function Painel({ dados }: { dados: ContextoDados }) {
  const [local, navegar] = useLocal();
  const pagina = PAGINAS.find((p) => p.id === local.pagina) ?? PAGINAS[0];
  const renderizados = useRef(new Set<string>());
  const [iaAberto, setIaAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const ia = useIALocal(iaAberto);
  const modoIA = useModoIA(dados.motor, dados.meta.ancora, dados.meta.mesesParciais, iaAberto, ia.motor);

  // Atalho "/" abre o Modo IA e foca a pergunta; Esc fecha.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT');
      if (e.key === '/' && !digitando) {
        e.preventDefault();
        setIaAberto(true);
        window.setTimeout(() => campo.current?.focus(), 0);
      } else if (e.key === 'Escape') setIaAberto(false);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  useEffect(() => {
    if (pagina) document.title = `${pagina.titulo} · Olist · Modo IA local`;
  }, [pagina]);

  // Medição (docs/BENCHMARK.md): marca quando todos os gráficos da primeira página aparecem.
  const aoRenderizar = useCallback((id: string) => {
    renderizados.current.add(id);
    const primeira = PAGINAS.find((p) => p.id === local.pagina);
    if (primeira && primeira.visuais.every((v) => renderizados.current.has(v.id)) && performance.getEntriesByName('graficos-prontos').length === 0) {
      performance.mark('graficos-prontos');
    }
  }, [local.pagina]);

  if (!pagina) return null;
  const { filtros } = local;
  const filtrosAtivos = [filtros.ano !== null ? `Ano ${filtros.ano}` : null, filtros.uf !== null ? `Estado ${filtros.uf}` : null].filter(Boolean);

  return (
    <Dados.Provider value={dados}>
      <div className={`app${iaAberto ? ' com-ia' : ''}`}>
        <BarraLateral local={local} navegar={navegar} />
        <main className="conteudo" id="conteudo">
          <header className="topo">
            <div>
              <h1>{pagina.titulo}</h1>
              <p>
                {pagina.descricao}
                {filtrosAtivos.length ? ` · ${filtrosAtivos.join(' · ')}` : ' · base inteira (set/2016 a set/2018)'}
              </p>
            </div>
            <button
              type="button"
              className="botao-ia"
              aria-expanded={iaAberto}
              onClick={() => {
                setIaAberto((a) => !a);
                window.setTimeout(() => campo.current?.focus(), 0);
              }}
            >
              ✨ Modo IA <small>atalho /</small>
            </button>
          </header>
          <section className="kpis" aria-label="Indicadores" aria-live="polite">
            {pagina.kpis.map((k) => (
              <KpiCard key={`${pagina.id}-${k.metrica}`} definicao={k} filtros={filtros} />
            ))}
          </section>
          <div className="grade">
            {pagina.visuais.map((v) => (
              <Visual key={v.id} definicao={v} filtros={filtros} aoRenderizar={() => aoRenderizar(v.id)} />
            ))}
          </div>
          {pagina.id === 'visao-geral' && <Fixados />}
          <Rodape />
        </main>
        {iaAberto && <PainelIA estado={modoIA} ia={ia} aoFechar={() => setIaAberto(false)} campo={campo} />}
      </div>
    </Dados.Provider>
  );
}

export function App() {
  const [carga, setCarga] = useState<Carga>({ status: 'carregando' });

  useEffect(() => {
    let ativo = true;
    obterMotor()
      .then(async (motor) => {
        const meta = await carregarMetadados(motor);
        performance.mark('motor-pronto');
        if (ativo) setCarga({ status: 'pronto', dados: { motor, meta } });
      })
      .catch((erro: unknown) => {
        if (ativo) setCarga({ status: 'erro', mensagem: erro instanceof Error ? erro.message : String(erro) });
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (carga.status === 'pronto') return <Painel dados={carga.dados} />;
  return (
    <div className="carregando-app" role="status" aria-live="polite">
      <img src="/icone.svg" alt="" width={56} height={56} />
      {carga.status === 'erro' ? (
        <>
          <h1>Não consegui abrir o banco de dados</h1>
          <p className="erro">{carga.mensagem}</p>
        </>
      ) : (
        <>
          <h1>Abrindo o DuckDB no seu navegador…</h1>
          <p>Nenhum dado sai do seu computador.</p>
          <div className="barra-progresso" aria-hidden="true">
            <span />
          </div>
        </>
      )}
    </div>
  );
}
