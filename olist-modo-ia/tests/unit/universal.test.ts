/**
 * Modo Universal (Fase 5) com as planilhas de evals/planilhas/ no MESMO DuckDB-WASM do navegador:
 * leitura (codificação, separador, cabeçalho), limpeza (vazias e totais), perfil das colunas contra o
 * esperado (meta >= 90%), semântica automática validada e números conferidos com os totais do Python.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { Linha } from '../../src/data/duckdb';
import { compilar } from '../../src/query/compiler';
import { criarRoteador } from '../../src/router/layer0';
import { aplicarConfig, lerPlanilha, tipoDoArquivo, type BancoUniversal, type LeituraPlanilha } from '../../src/universal/carregar';
import { escolherAba, lerExcelComoCsv, type SheetJS } from '../../src/universal/excel';
import { acharCabecalho, decodificar, detectarSeparador, lerRegistros } from '../../src/universal/leitor';
import { colunasBrutas, idDeColuna } from '../../src/universal/limpeza';
import { classificarColuna, configPadrao, detectarDecimal, detectarFormatosData, paraNumero } from '../../src/universal/perfil';
import { expressaoTipada, montarSemantica, rotuloSemId, sinonimos } from '../../src/universal/semanticaAuto';
import { abrirBancoTeste, RAIZ } from './ajuda/duckdbNode';

const PASTA = path.join(RAIZ, 'evals', 'planilhas');
interface Esperado {
  leitura: { separador?: string; codificacao?: string; linha_cabecalho?: number; linhas_total_removidas?: number; aviso?: string };
  colunas: Record<string, string>;
  totais?: Record<string, number>;
}
const ESPERADO = JSON.parse(readFileSync(path.join(PASTA, 'esperado.json'), 'utf8')) as Record<string, Esperado>;
const CSVS = Object.keys(ESPERADO).filter((n) => tipoDoArquivo(n) === 'csv');

let banco: BancoUniversal;
const leituras = new Map<string, LeituraPlanilha>();

beforeAll(async () => {
  const b = await abrirBancoTeste();
  banco = {
    leParquet: false,
    registrarArquivo: async (nome, bytes) => b.registrarArquivo(nome, bytes),
    executar: async (sql) => b.consultar(sql) as Linha[],
  };
  for (const nome of CSVS) leituras.set(nome, await lerPlanilha({ nome, bytes: new Uint8Array(readFileSync(path.join(PASTA, nome))) }, banco));
});

describe('leitor (funções puras)', () => {
  it('UTF-8 válido fica UTF-8; o resto é Latin-1 (Windows-1252)', () => {
    expect(decodificar(new TextEncoder().encode('Não')).codificacao).toBe('utf-8');
    const latin = decodificar(new Uint8Array([0x4e, 0xe3, 0x6f]));
    expect(latin).toEqual({ texto: 'Não', codificacao: 'latin-1' });
  });

  it('separador: ";" com vírgula decimal, tab, vírgula com aspas', () => {
    expect(detectarSeparador('a;b;c\n1,5;2,5;3\n4;5;6')).toBe(';');
    expect(detectarSeparador('a\tb\n1\t2\n3\t4')).toBe('\t');
    expect(detectarSeparador('a,b\n"1,5",2\n"3,5",4')).toBe(',');
  });

  it('aspas com quebra de linha dentro contam as linhas físicas', () => {
    const r = lerRegistros('titulo\n"a\nb",c\n1,2', ',');
    expect(r.map((x) => x.celulas)).toEqual([['titulo'], ['a\nb', 'c'], ['1', '2']]);
    expect(r[1]?.linhaFinal).toBe(2);
  });

  it('cabeçalho depois de títulos e linha vazia', () => {
    const cab = acharCabecalho(lerRegistros('Relatório 2023\n\nMês,Valor\n01/2023,10\n02/2023,20', ','));
    expect(cab).toMatchObject({ indice: 2, pular: 3, nomes: ['Mês', 'Valor'], avisos: [] });
  });

  it('nomes de coluna viram identificadores únicos e seguros', () => {
    expect(colunasBrutas(['  VALOR (R$) ', 'Nº Pedido', 'Desconto (%)', 'loja', 'Loja', '2023', 'select', '']).map((c) => c.id)).toEqual([
      'valor_r',
      'numero_pedido',
      'desconto_pct',
      'loja',
      'loja_2',
      'c_2023',
      'select_col',
      'coluna_8',
    ]);
    expect(idDeColuna('Entregue no prazo', 0)).toBe('entregue_no_prazo');
  });
});

describe('perfil (funções puras)', () => {
  it('decimal brasileiro x americano', () => {
    expect(detectarDecimal(['1.234,56', '12,5'], false)).toBe('br');
    expect(detectarDecimal(['1,234.56', '12.50'], false)).toBe('us');
    expect(detectarDecimal(['1.234'], true)).toBe('br');
    expect(paraNumero('R$ 1.234,56', 'br')).toBe(1234.56);
    expect(paraNumero('-45,2%', 'br')).toBe(-45.2);
    expect(paraNumero('1,234.5', 'us')).toBe(1234.5);
  });

  it('datas: dd/mm por padrão; mm/dd só com prova', () => {
    expect(detectarFormatosData(['01/02/2024', '13/02/2024']).formatos).toEqual(['%d/%m/%Y']);
    expect(detectarFormatosData(['02/13/2024', '02/01/2024']).formatos).toEqual(['%m/%d/%Y']);
    expect(detectarFormatosData(['2024-03-01', '05/03/2024', '06/03/2024']).formatos).toEqual(['%d/%m/%Y', '%Y-%m-%d']);
  });

  it('um valor só não decide: precisa da maioria', () => {
    const e = { id: 'x', original: 'Qualquer', linhas: 10, preenchidas: 10, distintos: 10 };
    expect(classificarColuna({ ...e, amostra: ['a@b.com', 'x', 'y', 'z', 'w'] }).tipo).not.toBe('pessoal');
    expect(classificarColuna({ ...e, amostra: ['a@b.com', 'c@d.com.br', 'e@f.org'] }).tipo).toBe('pessoal');
  });
});

describe('planilhas de teste (evals/planilhas)', () => {
  it('leitura: codificação, separador, cabeçalho e totais removidos', () => {
    for (const nome of CSVS) {
      const l = leituras.get(nome);
      const e = ESPERADO[nome]?.leitura;
      if (!l || !e) throw new Error(nome);
      if (e.separador) expect(l.relatorio.separador, nome).toBe(e.separador);
      if (e.codificacao) expect(l.relatorio.codificacao, nome).toBe(e.codificacao);
      if (e.linha_cabecalho !== undefined) expect(l.relatorio.linhasTitulo, nome).toBe(e.linha_cabecalho);
      if (e.linhas_total_removidas !== undefined) expect(l.relatorio.linhasTotal, nome).toBe(e.linhas_total_removidas);
      if (e.aviso) expect(l.avisos, nome).toContain(e.aviso);
      else expect(l.avisos, nome).toEqual([]);
    }
  });

  it('perfil das colunas: meta >= 90% sem ajuste manual (resultado em evals/resultados/perfil-planilhas.json)', () => {
    const erros: string[] = [];
    let total = 0;
    let certas = 0;
    const porArquivo: Record<string, { certas: number; total: number; erros: string[] }> = {};
    for (const nome of CSVS) {
      const l = leituras.get(nome);
      const esperado = ESPERADO[nome]?.colunas ?? {};
      const r = { certas: 0, total: 0, erros: [] as string[] };
      for (const [coluna, tipo] of Object.entries(esperado)) {
        const perfil = l?.perfis.find((p) => p.original === coluna);
        r.total++;
        if (perfil?.tipo === tipo) r.certas++;
        else r.erros.push(`${coluna}: esperado ${tipo}, veio ${perfil?.tipo ?? 'nada'} (${perfil?.motivo ?? ''})`);
      }
      total += r.total;
      certas += r.certas;
      erros.push(...r.erros.map((e) => `${nome} · ${e}`));
      porArquivo[nome] = r;
    }
    const pct = certas / total;
    writeFileSync(
      path.join(RAIZ, 'evals', 'resultados', 'perfil-planilhas.json'),
      JSON.stringify({ geradoEm: 'npm test', certas, total, acerto: Math.round(pct * 1000) / 10, porArquivo }, null, 2) + '\n',
    );
    expect(erros).toEqual([]);
    expect(pct).toBeGreaterThanOrEqual(0.9);
  });

  it('números conferem com os totais calculados no Python', async () => {
    for (const nome of CSVS) {
      const esperado = ESPERADO[nome];
      const l = leituras.get(nome);
      if (!esperado?.totais || !l) continue;
      const config = configPadrao(l.perfis);
      const pronta = await aplicarConfig(l, config, banco);
      for (const [coluna, valor] of Object.entries(esperado.totais)) {
        if (coluna === 'linhas') {
          const { sql } = compilar({ intent: 'kpi', metrics: ['registros'], dimensions: [], filters: [] }, pronta.semantica);
          expect((await banco.executar(sql))[0]?.registros, `${nome} linhas`).toBe(valor);
          continue;
        }
        const col = config.find((c) => c.original === coluna);
        if (!col) throw new Error(`${nome}: sem coluna ${coluna}`);
        const { sql } = compilar({ intent: 'kpi', metrics: [`soma_${col.id}`], dimensions: [], filters: [] }, pronta.semantica);
        expect(Number((await banco.executar(sql))[0]?.[`soma_${col.id}`]), `${nome} ${coluna}`).toBeCloseTo(valor, 2);
      }
    }
  });

  it('conversão sem perda: toda célula preenchida vira um valor do tipo certo', async () => {
    const perdas: string[] = [];
    for (const nome of CSVS) {
      const l = leituras.get(nome);
      if (!l || !l.perfis.length) continue;
      const config = configPadrao(l.perfis);
      const pronta = await aplicarConfig(l, config, banco);
      for (const c of config.filter((x) => ['data', 'dinheiro', 'numero', 'porcentagem', 'booleano', 'uf'].includes(x.tipo))) {
        const [r] = await banco.executar(
          `SELECT COUNT(*) AS n FROM "${l.tabelaCrua}" AS c JOIN "${pronta.tabela}" AS t ON t.linha_planilha = c.rowid + 1 WHERE NULLIF(TRIM(c."${c.id}"), '') IS NOT NULL AND t."${c.id}" IS NULL`,
        );
        if (Number(r?.n)) perdas.push(`${nome} · ${c.original} (${c.tipo}): ${String(r?.n)} células não converteram`);
      }
    }
    expect(perdas).toEqual([]);
  });

  it('dados pessoais saem mascarados na tabela tipada', async () => {
    const l = leituras.get('rh_ficticio.csv');
    if (!l) throw new Error('rh');
    const pronta = await aplicarConfig(l, configPadrao(l.perfis), banco);
    const [linha] = await banco.executar(`SELECT cpf, e_mail_corporativo, nome_do_colaborador FROM "${pronta.tabela}" LIMIT 1`);
    expect(String(linha?.cpf)).toMatch(/^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/);
    expect(String(linha?.e_mail_corporativo)).toMatch(/^[a-z]\*\*\*@empresaficticia\.com$/);
    expect(String(linha?.nome_do_colaborador)).toMatch(/^\S+ [A-ZÀ-Ý]\.$/);
  });

  it('semântica automática: métricas, dimensões e tempo; fora do catálogo: texto livre e pessoais', async () => {
    const l = leituras.get('vendas_br.csv');
    if (!l) throw new Error('vendas');
    const pronta = await aplicarConfig(l, configPadrao(l.perfis), banco);
    const s = pronta.semantica;
    expect(Object.keys(s.metrics)).toEqual(expect.arrayContaining(['registros', 'soma_valor_total', 'media_valor_total', 'soma_quantidade', 'distintos_cliente_id', 'media_desconto_pct']));
    expect(Object.keys(s.dimensions)).toEqual(expect.arrayContaining(['tempo', 'categoria', 'uf', 'cidade', 'vendedor', 'pago']));
    expect(s.dataset.time_column).toBe('data_da_venda');
    expect(pronta.periodo?.de.startsWith('2023-01')).toBe(true);
    expect(s.metrics.distintos_cliente_id?.label).toBe('Cliente (distintos)');
    const rh = leituras.get('rh_ficticio.csv');
    if (!rh) throw new Error('rh');
    const srh = (await aplicarConfig(rh, configPadrao(rh.perfis), banco)).semantica;
    expect(JSON.stringify(srh)).not.toMatch(/comentario_do_gestor|cpf|nome_do_colaborador/);
  });

  it('Camada 0 funciona sobre a planilha (mesmo roteador da Olist)', async () => {
    const l = leituras.get('vendas_br.csv');
    if (!l) throw new Error('vendas');
    const pronta = await aplicarConfig(l, configPadrao(l.perfis), banco);
    const valores: Record<string, string[]> = {};
    for (const [id, d] of Object.entries(pronta.semantica.dimensions)) {
      if (d.type !== 'categoria') continue;
      valores[id] = (await banco.executar(`SELECT DISTINCT CAST("${d.column}" AS VARCHAR) AS v FROM "${pronta.tabela}" WHERE "${d.column}" IS NOT NULL`)).map((x) => String(x.v));
    }
    const roteador = criarRoteador(pronta.semantica, valores, pronta.periodo?.ate ?? '2024-12-31');
    const r = roteador.rotear('valor total por categoria', null);
    expect(r.spec).toMatchObject({ metrics: ['soma_valor_total'], dimensions: ['categoria'] });
    const r2 = roteador.rotear('valor total em SP mês a mês', null);
    expect(r2.spec).toMatchObject({ intent: 'tendencia', filters: [{ dimension: 'uf', values: ['SP'] }] });
    const linhas = await banco.executar(compilar(r.spec, pronta.semantica).sql);
    expect(linhas.length).toBe(5);
  });
});

describe('semântica automática (funções puras)', () => {
  it('sinônimos do dicionário PT-BR e rótulo sem "ID"', () => {
    expect(sinonimos('Valor Total')).toEqual(expect.arrayContaining(['receita', 'faturamento', 'vendas']));
    expect(sinonimos('Nome do Colaborador')).toEqual(expect.arrayContaining(['funcionario']));
    expect(rotuloSemId('Cliente ID')).toBe('Cliente');
    expect(rotuloSemId('Nº Pedido')).toBe('Pedido');
    expect(rotuloSemId('cod_produto')).toBe('produto');
  });

  it('expressões de conversão (texto -> tipo) são SQL fixo, sem valor do usuário', () => {
    expect(expressaoTipada({ id: 'v', original: 'V', rotulo: 'V', tipo: 'dinheiro', papel: 'metrica', decimal: 'br' })).toContain("replace(replace(");
    expect(expressaoTipada({ id: 'd', original: 'D', rotulo: 'D', tipo: 'data', papel: 'tempo', formatosData: ['%d/%m/%Y'] })).toContain("TRY_STRPTIME(TRIM(\"d\"), '%d/%m/%Y')");
  });

  it('planilha sem data: sem dimensão de tempo, e o compilador recusa período', () => {
    const s = montarSemantica(
      [
        { id: 'loja', original: 'Loja', rotulo: 'Loja', tipo: 'categoria', papel: 'dimensao' },
        { id: 'valor', original: 'Valor', rotulo: 'Valor', tipo: 'dinheiro', papel: 'metrica', agregacao: 'soma' },
      ],
      { nome: 'x.csv', tabela: 'ux', linhas: 3 },
    );
    expect(s.dataset.time_column).toBeUndefined();
    expect(() => compilar({ intent: 'kpi', metrics: ['soma_valor'], dimensions: [], filters: [], time: { from: '2024-01-01', to: '2024-01-31' } }, s)).toThrow(/data/);
  });
});

describe('Excel (SheetJS pendente, D39)', () => {
  it('sem a SheetJS instalada, o erro diz o que fazer', async () => {
    await expect(lerExcelComoCsv(new Uint8Array([1, 2, 3]), null)).rejects.toThrow(/SheetJS/);
  });

  it('com uma SheetJS (falsa), escolhe a aba com dados e gera CSV', async () => {
    const falsa: SheetJS = {
      read: () => ({ SheetNames: ['Leia-me', 'Dados'], Sheets: { 'Leia-me': 'a', Dados: 'b' } }),
      utils: {
        sheet_to_json: (aba) =>
          aba === 'a'
            ? [['Os dados estão na aba Dados']]
            : [['Relatório'], [''], ['Mês', 'Receita', 'Obs'], ['2023-01-01', 'R$ 1,234.50', 'tem, vírgula'], ['Total', '1234.5', '']],
      },
    };
    const r = await lerExcelComoCsv(new Uint8Array(), falsa);
    expect(r.aba).toBe('Dados');
    expect(r.csv.split('\n')[3]).toBe('2023-01-01,"R$ 1,234.50","tem, vírgula"');
    expect(escolherAba([{ nome: 'a', linhas: [] }])?.nome).toBe('a');
  });
});

describe('modelos de planilha (impressão digital)', () => {
  it('mesmo layout = mesma impressão; tipo ou nome diferente = outra', async () => {
    const { impressaoDigital, criarModelo, importarModelo, aplicarModelo } = await import('../../src/universal/impressao');
    const l = leituras.get('vendas_br.csv');
    if (!l) throw new Error('vendas');
    const a = impressaoDigital(l.perfis);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(impressaoDigital(l.perfis.map((p) => ({ ...p })))).toBe(a);
    expect(impressaoDigital(l.perfis.map((p, i) => (i === 0 ? { ...p, tipo: 'texto' as const } : p)))).not.toBe(a);
    const config = configPadrao(l.perfis).map((c) => (c.id === 'valor_total' ? { ...c, rotulo: 'Receita' } : c));
    const modelo = criarModelo('Vendas mensais', a, config);
    const volta = importarModelo(JSON.stringify(modelo));
    expect(aplicarModelo(volta, l.perfis)?.find((c) => c.id === 'valor_total')?.rotulo).toBe('Receita');
    expect(aplicarModelo(volta, l.perfis.slice(1))).toBeNull();
    expect(() => importarModelo(JSON.stringify({ ...modelo, colunas: [{ ...config[0], id: 'x"; DROP TABLE t; --' }] }))).toThrow();
  });
});

describe('vários arquivos (relações)', () => {
  it('vendas x clientes: liga por "Cliente ID", 100% dos ids batem, sem duplicar linhas', async () => {
    const { sugerirLigacoes, montarJuncao, setorProvavel } = await import('../../src/universal/relacoes');
    const vendas = leituras.get('vendas_br.csv');
    const clientes = leituras.get('clientes.csv');
    const rh = leituras.get('rh_ficticio.csv');
    if (!vendas || !clientes || !rh) throw new Error('planilhas');
    const ligacoes = await sugerirLigacoes([vendas, clientes, rh], banco);
    const [melhor] = ligacoes;
    expect(melhor).toMatchObject({ de: { planilha: 0, original: 'Cliente ID' }, para: { planilha: 1, original: 'Cliente ID' }, cobertura: 1, paraUnico: true });
    expect(ligacoes.some((x) => x.de.planilha === 2 || x.para.planilha === 2)).toBe(false);
    expect([setorProvavel(vendas.perfis), setorProvavel(clientes.perfis), setorProvavel(rh.perfis)]).toEqual(['Vendas', 'Clientes', 'RH / Pessoas']);

    const pv = await aplicarConfig(vendas, configPadrao(vendas.perfis), banco);
    const pc = await aplicarConfig(clientes, configPadrao(clientes.perfis), banco);
    if (!melhor) throw new Error('sem ligação');
    const j = montarJuncao({ tabela: pv.tabela, config: pv.config }, { tabela: pc.tabela, config: pc.config, nome: 'clientes.csv' }, melhor, `${pv.tabela}_j`);
    await banco.executar(j.sql);
    const s = montarSemantica(j.config, { nome: 'vendas + clientes', tabela: j.visao, linhas: 1500, periodo: pv.periodo });
    expect(s.dimensions.clientes_segmento?.label).toBe('Segmento (clientes)');
    const linhas = await banco.executar(compilar({ intent: 'comparacao', metrics: ['registros', 'soma_valor_total'], dimensions: ['clientes_segmento'], filters: [] }, s).sql);
    expect(linhas.reduce((t, l) => t + Number(l.registros), 0)).toBe(1500);
    expect(linhas.reduce((t, l) => t + Number(l.soma_valor_total), 0)).toBeCloseTo(ESPERADO['vendas_br.csv']?.totais?.['Valor Total'] ?? 0, 2);
    expect(() => montarJuncao({ tabela: 'a', config: [] }, { tabela: 'b', config: [], nome: 'b' }, { ...melhor, paraUnico: false }, 'v')).toThrow(/duplicaria/);
  });
});
