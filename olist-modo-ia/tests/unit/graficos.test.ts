/** Gráficos e filtros: funções puras (escape de HTML nos tooltips, séries, sparkline, URL). */
import { describe, expect, it } from 'vitest';

import { escapar, opcoesBarras } from '../../src/charts/opcoes';
import { completarMeses, faixasParciais } from '../../src/charts/series';
import { caminhoSparkline } from '../../src/charts/sparkline';
import { aplicarFiltros, lerLocal, montarUrl } from '../../src/dashboard/filtros';
import { PAGINAS, specsDoKpi } from '../../src/dashboard/paginas';
import { compilar } from '../../src/query/compiler';
import { criarSchemaQuerySpec } from '../../src/query/spec';
import { semanticaOlist } from '../../src/semantic';

describe('tooltip sem HTML vindo dos dados (ajuste 11)', () => {
  it('escapa tags', () => {
    expect(escapar('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('o formatter da barra devolve o nome escapado', () => {
    const opcoes = opcoesBarras({
      categorias: ['<b>x</b>'],
      valores: [1],
      formato: 'int',
      serie: 'Pedidos',
      descricao: 'teste',
      horizontal: true,
    }) as { tooltip: { formatter: (p: unknown) => string } };
    const html = opcoes.tooltip.formatter({ name: '<b>x</b>', value: 1 });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('séries', () => {
  it('completa meses sem linha (0 para soma, vazio para média)', () => {
    const linhas = [
      { tempo: '2016-10-01', pedidos: 290, nota: 4 },
      { tempo: '2016-12-01', pedidos: 1, nota: 5 },
    ];
    expect(
      completarMeses(linhas, 'tempo', [
        { id: 'pedidos', zeroQuandoVazio: true },
        { id: 'nota', zeroQuandoVazio: false },
      ]),
    ).toEqual([linhas[0], { tempo: '2016-11-01', pedidos: 0, nota: null }, linhas[1]]);
    expect(completarMeses([{ tempo: '2017-12-01', n: 1 }, { tempo: '2018-01-01', n: 2 }], 'tempo', [])).toHaveLength(2);
  });

  it('faixas contínuas de meses incompletos', () => {
    const eixo = ['a', 'b', 'c', 'd', 'e'];
    expect(faixasParciais(eixo, new Set(['a', 'b', 'e']))).toEqual([['a', 'b'], ['e', 'e']]);
    expect(faixasParciais(eixo, new Set())).toEqual([]);
  });

  it('sparkline quebra a linha em valor vazio', () => {
    expect(caminhoSparkline([1, 2, null, 3], 100, 20)).toMatch(/^M.* L.* M/);
    expect(caminhoSparkline([1], 100, 20)).toBe('');
  });
});

describe('filtros e URL', () => {
  it('ano e UF viram período e filtro parametrizado', () => {
    const spec = aplicarFiltros(specsDoKpi('faturamento').valor, { ano: 2018, uf: 'SP' });
    expect(spec.time).toEqual({ from: '2018-01-01', to: '2018-12-31' });
    expect(spec.filters).toEqual([{ dimension: 'estado_cliente', op: 'in', values: ['SP'] }]);
  });

  it('lê e monta a URL, ignorando lixo', () => {
    expect(lerLocal('/logistica', '?ano=2018&uf=sp')).toEqual({ pagina: 'logistica', filtros: { ano: 2018, uf: 'SP' } });
    expect(lerLocal('/qualquer', '?ano=abc&uf=<script>')).toEqual({ pagina: 'visao-geral', filtros: { ano: null, uf: null } });
    expect(montarUrl({ pagina: 'produtos', filtros: { ano: 2017, uf: null } })).toBe('/produtos?ano=2017');
    expect(montarUrl({ pagina: 'visao-geral', filtros: { ano: null, uf: null } })).toBe('/');
  });
});

describe('páginas do dashboard', () => {
  const schema = criarSchemaQuerySpec(semanticaOlist);
  const specs = PAGINAS.flatMap((p) => [
    ...p.visuais.map((v) => v.spec),
    ...p.kpis.flatMap((k) => Object.values(specsDoKpi(k.metrica))),
  ]);

  it('3 páginas, 4 KPIs cada', () => {
    expect(PAGINAS.map((p) => p.titulo)).toEqual(['Visão Geral', 'Produtos', 'Logística']);
    for (const p of PAGINAS) expect(p.kpis).toHaveLength(4);
  });

  it('todo spec do dashboard é um QuerySpec válido e compila (nada pré-gerado)', () => {
    for (const s of specs) {
      expect(schema.safeParse(s).success, JSON.stringify(s)).toBe(true);
      expect(() => compilar(s, semanticaOlist)).not.toThrow();
    }
  });
});
