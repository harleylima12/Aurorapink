/** Funções puras: âncora de datas, períodos, formatação pt-BR e escolha da fonte de dados. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { conferirVersao, lerManifesto, lerPreferencia, literalSql, planejarFonte } from '../../src/data/fonte';
import { formatar, rotuloPeriodo } from '../../src/format/numeros';
import { calcularAncora, mediana, mesesComPoucosDados, ultimoDiaDoMes } from '../../src/query/ancora';
import { compilar } from '../../src/query/compiler';
import { anoAnterior, periodoDoAno, somarDias, specDeComparacao } from '../../src/query/periodo';
import { semanticaOlist } from '../../src/semantic';
import { abrirBancoTeste, RAIZ, type BancoTeste } from './ajuda/duckdbNode';

/** O Intl usa espaço não separável (U+00A0) entre "R$" e o número. */
const limpo = (texto: string) => texto.replace(/ | /g, ' ');

describe('âncora de datas (mesmos casos do teste em Python)', () => {
  const meses = (valores: number[], ano = 2018) =>
    valores.map((n, i) => ({ mes: `${ano}-${String(i + 1).padStart(2, '0')}-01`, n }));

  it('ignora o último mês quase vazio (formato da Olist)', () => {
    expect(calcularAncora([...meses([6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008]), { mes: '2018-09-01', n: 1 }])).toBe(
      '2018-08-31',
    );
  });
  it('usa o último mês quando ele tem volume', () => {
    expect(calcularAncora(meses([100, 100, 100, 100, 100, 100], 2020))).toBe('2020-06-30');
  });
  it('limite de exatamente 10% conta', () => {
    const base = meses(Array(10).fill(1000), 2021);
    expect(calcularAncora([...base, { mes: '2021-11-01', n: 100 }])).toBe('2021-11-30');
    expect(calcularAncora([...base, { mes: '2021-11-01', n: 99 }])).toBe('2021-10-31');
  });
  it('não depende da ordem de entrada', () => {
    expect(calcularAncora([{ mes: '2019-03-01', n: 50 }, { mes: '2019-01-01', n: 50 }, { mes: '2019-02-01', n: 50 }])).toBe(
      '2019-03-31',
    );
  });
  it('lista vazia é erro', () => {
    expect(() => calcularAncora([])).toThrow();
  });
  it('último dia do mês e mediana', () => {
    expect(ultimoDiaDoMes('2016-02-01')).toBe('2016-02-29');
    expect(ultimoDiaDoMes('2018-12-15')).toBe('2018-12-31');
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('âncora nos dados reais = meta.json do Python', () => {
  let banco: BancoTeste;
  beforeAll(async () => {
    banco = await abrirBancoTeste();
  });

  it('31/08/2018 e os meses com poucos pedidos', () => {
    const { sql, params } = compilar(
      { intent: 'tendencia', metrics: ['pedidos'], dimensions: ['tempo'], filters: [], time: { grain: 'mes' } },
      semanticaOlist,
    );
    const volume = banco.consultar(sql, params).map((l) => ({ mes: String(l.tempo), n: Number(l.pedidos) }));
    const meta = JSON.parse(readFileSync(path.join(RAIZ, 'public', 'data', 'meta.json'), 'utf8')) as { data_ancora: string };
    expect(calcularAncora(volume)).toBe(meta.data_ancora);
    expect(mesesComPoucosDados(volume)).toEqual(['2016-09-01', '2016-10-01', '2016-12-01', '2018-09-01']);
  });
});

describe('períodos', () => {
  it('ano anterior, inclusive 29/02', () => {
    expect(anoAnterior('2018-08-31')).toBe('2017-08-31');
    expect(anoAnterior('2016-02-29')).toBe('2015-02-28');
    expect(somarDias('2018-01-01', -1)).toBe('2017-12-31');
    expect(periodoDoAno(2017)).toEqual({ from: '2017-01-01', to: '2017-12-31' });
  });

  it('comparações', () => {
    const base = { intent: 'kpi' as const, metrics: ['faturamento'], dimensions: [], filters: [] };
    expect(specDeComparacao(base)).toBeNull();
    const nov = { ...base, time: { from: '2017-11-01', to: '2017-11-30', compare: 'periodo_anterior' as const } };
    expect(specDeComparacao(nov)?.time).toEqual({ from: '2017-10-02', to: '2017-10-31', compare: 'nenhum' });
    const ano = { ...base, time: { from: '2018-01-01', to: '2018-08-31', compare: 'mesmo_periodo_ano_anterior' as const } };
    expect(specDeComparacao(ano)?.time).toEqual({ from: '2017-01-01', to: '2017-08-31', compare: 'nenhum' });
    expect(() => specDeComparacao({ ...base, time: { compare: 'periodo_anterior' } })).toThrow();
  });
});

describe('formatação pt-BR', () => {
  it.each([
    [13_494_400.74, 'brl', {}, 'R$ 13.494.400,74'],
    [13_494_400.74, 'brl', { compacto: true }, 'R$ 13,49 mi'],
    [137.4189, 'brl', { compacto: true }, 'R$ 137,42'],
    [98_199, 'int', {}, '98.199'],
    [98_199, 'int', { compacto: true }, '98,2 mil'],
    [4.1167, 'dec2', {}, '4,12'],
    [0.0679, 'pct', {}, '6,8%'],
    [12.49, 'dias', {}, '12,5 dias'],
  ] as const)('%s como %s', (valor, formato, opcoes, esperado) => {
    expect(limpo(formatar(valor, formato, opcoes))).toBe(esperado);
  });

  it('sem valor vira travessão', () => {
    expect(formatar(null, 'brl')).toBe('—');
    expect(formatar(Number.NaN, 'pct')).toBe('—');
  });

  it('rótulos de período', () => {
    expect(rotuloPeriodo('2017-11-01', 'mes')).toBe('nov/2017');
    expect(rotuloPeriodo('2017-10-01', 'trimestre')).toBe('T4/2017');
    expect(rotuloPeriodo('2018-01-01', 'ano')).toBe('2018');
    expect(rotuloPeriodo('2017-11-24', 'dia')).toBe('24/11/2017');
  });
});

describe('fonte de dados: final x provisório', () => {
  const manifesto = {
    pacote_duckdb_wasm: '1.32.0',
    versao_duckdb: 'v1.4.3',
    extensoes: ['parquet'],
    plataformas: ['wasm_mvp', 'wasm_eh'],
    arquivos: { 'wasm_eh/parquet.duckdb_extension.wasm': { sha256: 'a'.repeat(64), bytes: 10 } },
  };

  it('sem manifesto: provisório, com o motivo', () => {
    const plano = planejarFonte('auto', null);
    expect(plano.tipo).toBe('duckdb-provisorio');
    expect(plano.tipo === 'duckdb-provisorio' && plano.motivo).toMatch(/baixar-extensoes/);
  });
  it('com manifesto: caminho final', () => {
    expect(planejarFonte('auto', lerManifesto(manifesto))).toEqual({ tipo: 'parquet' });
  });
  it('VITE_FONTE_DADOS=duckdb força o provisório', () => {
    expect(planejarFonte(lerPreferencia('duckdb'), lerManifesto(manifesto)).tipo).toBe('duckdb-provisorio');
    expect(lerPreferencia(undefined)).toBe('auto');
    expect(lerPreferencia('qualquer')).toBe('auto');
  });
  it('manifesto inválido conta como ausente', () => {
    expect(lerManifesto({ versao_duckdb: 'x' })).toBeNull();
  });
  it('versão do motor diferente da extensão é erro claro', () => {
    const lido = lerManifesto(manifesto);
    expect(lido).not.toBeNull();
    if (!lido) return;
    expect(conferirVersao(lido, 'v1.4.3')).toBeNull();
    expect(conferirVersao(lido, 'v1.5.0')).toMatch(/v1.4.3.*v1.5.0/);
  });
  it('literal SQL escapa aspas', () => {
    expect(literalSql("http://a/b'c")).toBe("'http://a/b''c'");
  });
});
