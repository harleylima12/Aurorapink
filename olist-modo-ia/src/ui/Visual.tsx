import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';

import { opcoesBarras, opcoesDispersao, opcoesLinha } from '../charts/opcoes';
import { PALETA_OLIST, type PaletaTema } from '../charts/paletas';
import { completarMeses, faixasParciais } from '../charts/series';
import { aplicarFiltros, type Filtros } from '../dashboard/filtros';
import type { DefinicaoVisual } from '../dashboard/paginas';
import type { Linha } from '../data/duckdb';
import { formatar, rotuloPeriodo } from '../format/numeros';
import type { Grao } from '../query/spec';
import type { Semantica } from '../semantic/schema';
import { ComoCalculei } from './ComoCalculei';
import { useDados } from './contexto';
import { montarEspecial, type Especial } from './especial';
import { Grafico } from './Grafico';
import { resultadoAtual, useConsulta, type ResultadoConsulta } from './useConsulta';

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function montar(def: DefinicaoVisual, resultado: ResultadoConsulta, parciais: ReadonlySet<string>, semantica: Semantica, cor?: string): { opcoes: EChartsCoreOption; descricao: string } {
  const [idMetrica, idMetrica2] = def.spec.metrics;
  const [idDimensao] = def.spec.dimensions;
  const metrica = idMetrica ? semantica.metrics[idMetrica] : undefined;
  if (!metrica || !idMetrica || !idDimensao) throw new Error(`visual ${def.id} mal definido`);
  let linhas: Linha[] = resultado.linhas;

  if (def.tipo === 'linha') {
    const grao: Grao = def.spec.time?.grain ?? 'mes';
    if (grao === 'mes') linhas = completarMeses(linhas, idDimensao, [{ id: idMetrica, zeroQuandoVazio: metrica.empty_is_zero }]);
    const eixo = linhas.map((l) => String(l[idDimensao]));
    const rotulos = eixo.map((iso) => rotuloPeriodo(iso, grao));
    // "Poucos dados" descreve a base inteira (meta), não o recorte filtrado.
    const faixas = faixasParciais(eixo, parciais).map(([de, ate]): [string, string] => [rotuloPeriodo(de, grao), rotuloPeriodo(ate, grao)]);
    const valores = linhas.map((l) => numero(l[idMetrica]));
    const maior = Math.max(...valores.filter((v): v is number => v !== null));
    const descricao = `Gráfico de linha: ${metrica.label} por ${grao === 'mes' ? 'mês' : grao}, de ${rotulos[0] ?? ''} a ${rotulos.at(-1) ?? ''}. Maior valor: ${formatar(Number.isFinite(maior) ? maior : null, metrica.format)}.`;
    return {
      descricao,
      opcoes: opcoesLinha({ rotulos, series: [{ nome: metrica.label, valores }], formato: metrica.format, descricao, faixasParciais: faixas, alerta: def.alerta ?? false, cor }),
    };
  }

  if (def.tipo === 'dispersao') {
    const metrica2 = idMetrica2 ? semantica.metrics[idMetrica2] : undefined;
    if (!metrica2 || !idMetrica2) throw new Error(`visual ${def.id} precisa de 2 métricas`);
    const descricao = `Gráfico de dispersão: ${metrica.label} (horizontal) e ${metrica2.label} (vertical), um ponto por ${semantica.dimensions[idDimensao]?.label.toLowerCase() ?? idDimensao}.`;
    return {
      descricao,
      opcoes: opcoesDispersao({
        pontos: linhas.map((l) => ({ nome: String(l[idDimensao]), x: numero(l[idMetrica]), y: numero(l[idMetrica2]) })),
        x: { rotulo: metrica.label, formato: metrica.format },
        y: { rotulo: metrica2.label, formato: metrica2.format },
        descricao,
        cor,
      }),
    };
  }

  const categorias = linhas.map((l) => String(l[idDimensao]));
  const valores = linhas.map((l) => numero(l[idMetrica]));
  const [primeira] = categorias;
  const descricao = `Gráfico de barras: ${metrica.label} por ${semantica.dimensions[idDimensao]?.label.toLowerCase() ?? idDimensao}. ${primeira ? `Primeiro: ${primeira}, ${formatar(valores[0] ?? null, metrica.format)}.` : 'Sem dados.'}`;
  return {
    descricao,
    opcoes: opcoesBarras({
      categorias,
      valores,
      formato: metrica.format,
      serie: metrica.label,
      descricao,
      horizontal: def.tipo === 'barra',
      alertas: new Set(def.valoresAlerta ?? []),
      cor,
    }),
  };
}

/** Medidor (um percentual e a meta) e lista de alerta: HTML de verdade, legível por leitor de tela. */
function Html({ especial }: { especial: Exclude<Especial, { tipo: 'grafico' }> }) {
  if (especial.tipo === 'medidor') {
    const pct = Math.max(0, Math.min(1, especial.valor ?? 0));
    return (
      <div className="medidor" role="img" aria-label={especial.descricao}>
        <p className="medidor-valor">{formatar(especial.valor, 'pct')}</p>
        <div className="medidor-trilho" aria-hidden="true">
          <span style={{ width: `${pct * 100}%` }} />
        </div>
        {especial.meta && <p className="nota">Meta de SLA assumida: {especial.meta}</p>}
      </div>
    );
  }
  if (!especial.itens.length) return <p className="vazio">✓ Nenhum item abaixo do mínimo.</p>;
  return (
    <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Itens abaixo do mínimo">
      <table className="tabela-resposta tabela-alerta">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Atual</th>
            <th scope="col">Mínimo</th>
            <th scope="col">Falta</th>
          </tr>
        </thead>
        <tbody>
          {especial.itens.map((i) => (
            <tr key={i.nome}>
              <th scope="row">
                <span aria-hidden="true">⚠ </span>
                {i.nome}
              </th>
              <td className="num">{formatar(i.atual, 'int')}</td>
              <td className="num">{formatar(i.minimo, 'int')}</td>
              <td className="num alerta">{formatar(i.falta, 'int')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Visual({ definicao, filtros, aoRenderizar }: { definicao: DefinicaoVisual; filtros: Filtros; aoRenderizar?: () => void }) {
  const { meta, semantica, paleta } = useDados();
  const estado = useConsulta(aplicarFiltros(definicao.spec, filtros));
  const resultado = resultadoAtual(estado);
  const especial = definicao.forma && definicao.forma !== 'auto';
  const montado = useMemo(
    () => (resultado && !especial ? montar(definicao, resultado, meta.mesesParciais, semantica, paleta?.destaque) : null),
    [definicao, resultado, meta.mesesParciais, semantica, paleta, especial],
  );
  const doTema = useMemo(
    () => (resultado && especial ? montarEspecial(definicao, resultado.linhas, semantica, paleta ?? (PALETA_OLIST satisfies PaletaTema)) : null),
    [definicao, resultado, semantica, paleta, especial],
  );
  const altura = definicao.hero ? 360 : definicao.tipo === 'barra' && (definicao.spec.limit ?? 10) > 10 ? 380 : 280;
  const tituloId = `titulo-${definicao.id}`;
  const pronto = montado ?? doTema;

  return (
    <section
      className={`painel${definicao.largo ? ' largo' : ''}${definicao.hero ? ' hero' : ''}`}
      aria-labelledby={tituloId}
      data-visual={definicao.id}
      data-forma={definicao.forma ?? 'auto'}
      aria-busy={estado.status === 'carregando'}
    >
      <header className="painel-cabecalho">
        <h2 id={tituloId}>
          {definicao.icone && (
            <span className="icone-secao" aria-hidden="true">
              {definicao.icone}{' '}
            </span>
          )}
          {definicao.titulo}
        </h2>
        <p>{definicao.subtitulo}</p>
      </header>
      {estado.status === 'erro' ? (
        <p className="erro">Não consegui calcular este gráfico: {estado.mensagem}</p>
      ) : pronto && resultado && resultado.linhas.length > 0 ? (
        <div className={estado.status === 'carregando' ? 'atualizando' : undefined}>
          {montado ? (
            <Grafico opcoes={montado.opcoes} rotulo={montado.descricao} altura={altura} aoRenderizar={aoRenderizar} />
          ) : doTema?.tipo === 'grafico' ? (
            <Grafico opcoes={doTema.opcoes} rotulo={doTema.descricao} altura={doTema.altura} aoRenderizar={aoRenderizar} />
          ) : doTema ? (
            <Html especial={doTema} />
          ) : null}
        </div>
      ) : pronto || (resultado && especial) ? (
        <p className="vazio">Nenhum dado para os filtros escolhidos.</p>
      ) : (
        <div className="esqueleto grafico-esqueleto" style={{ height: altura }} aria-label="carregando" />
      )}
      <ComoCalculei estado={estado} />
    </section>
  );
}
