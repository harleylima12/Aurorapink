/**
 * Fase 5B: detector de tema (Camada 0, sem IA), papéis e receitas, contra as planilhas de evals/planilhas/
 * com o tema esperado escrito ANTES do detector (esperado_temas.json). Meta: >= 90% de acerto sem IA.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { Linha } from '../../src/data/duckdb';
import { criarMotorFalso } from '../../src/ai/motorFalso';
import { combinarTema, metadadosParaIA, sugerirTemaIA, validarTemaDoModelo } from '../../src/ai/temaIA';
import { compilar } from '../../src/query/compiler';
import { configPadrao, lerPlanilha, type BancoUniversal, type LeituraPlanilha } from '../../src/universal/carregar';
import { montarGrupo, type PlanilhaMontada } from '../../src/universal/montar';
import { TAMANHO_MINIMO_PADRAO } from '../../src/universal/semanticaAuto';
import type { EscolhaTema, PainelTema, Publico } from '../../src/universal/temas/aplicar';
import { DEF_TEMAS, type Tema } from '../../src/universal/temas/definicoes';
import { detectarTema } from '../../src/universal/temas/detector';
import { atribuirPapeis, type Papeis } from '../../src/universal/temas/papeis';
import { RECEITAS, receitaDe } from '../../src/universal/temas/receitas';
import { abrirBancoTeste, RAIZ } from './ajuda/duckdbNode';

const PASTA = path.join(RAIZ, 'evals', 'planilhas');
const ESPERADO = JSON.parse(readFileSync(path.join(PASTA, 'temas', 'esperado_temas.json'), 'utf8')) as Record<string, { tema: string }>;

let banco: BancoUniversal;
const leituras = new Map<string, LeituraPlanilha>();

beforeAll(async () => {
  const b = await abrirBancoTeste();
  banco = { leParquet: false, registrarArquivo: async (n, bytes) => b.registrarArquivo(n, bytes), executar: async (sql) => b.consultar(sql) as Linha[] };
  for (const nome of Object.keys(ESPERADO)) {
    leituras.set(nome, await lerPlanilha({ nome: path.basename(nome), bytes: new Uint8Array(readFileSync(path.join(PASTA, nome))) }, banco));
  }
}, 60_000);

describe('detector de tema (sem IA)', () => {
  const col = (original: string, tipo: 'dinheiro' | 'categoria' | 'data' | 'numero' = 'categoria', amostraValores?: string[]) => ({ original, tipo, amostraValores });

  it('sem pista nenhuma: genérico com confiança alta; com poucas pistas: genérico com confiança baixa (pergunta)', () => {
    expect(detectarTema([col('Sensor'), col('Temperatura', 'numero')])).toMatchObject({ tema: 'generico', nivel: 'alta' });
    expect(detectarTema([col('Cliente'), col('Qtd', 'numero')])).toMatchObject({ tema: 'generico', nivel: 'baixa' });
  });

  it('empate entre dois temas vira confiança baixa (a tela pergunta o tema)', () => {
    const r = detectarTema([col('Pedido'), col('Venda'), col('Estoque', 'numero'), col('Armazém')]);
    expect(r.nivel).toBe('baixa');
    expect(r.ranking.slice(0, 2).map((x) => x.tema).sort()).toEqual(['estoque', 'vendas']);
  });

  it('valores também contam: "Entrada/Saída" e códigos CID-10', () => {
    const fin = detectarTema([col('Conta'), col('Tipo', 'categoria', ['Entrada', 'Saída']), col('Valor', 'dinheiro')]);
    expect(fin.tema).toBe('financeiro');
    expect(fin.porque.join(' ')).toMatch(/entrada\/saída em "Tipo"/);
    expect(detectarTema([col('Código', 'categoria', ['I10', 'E11.9', 'J45']), col('Consulta', 'data')]).tema).toBe('saude');
  });

  it('o porquê cita as colunas reais', () => {
    const r = detectarTema([col('Valor Total', 'dinheiro'), col('Produto'), col('Data da Venda', 'data')]);
    expect(r.tema).toBe('vendas');
    expect(r.porque[0]).toBe('encontrei Data da Venda, Valor Total e Produto');
  });

  it('acerto >= 90% nas planilhas com tema esperado (resultado em evals/resultados/temas.json)', () => {
    const linhas = Object.entries(ESPERADO).map(([nome, { tema }]) => {
      const r = detectarTema(leituras.get(nome)!.perfis);
      return { arquivo: nome, esperado: tema, detectado: r.tema, acertou: r.tema === tema, confianca: r.confianca, nivel: r.nivel, porque: r.porque, ranking: r.ranking.slice(0, 3) };
    });
    const acertos = linhas.filter((l) => l.acertou).length;
    const taxa = acertos / linhas.length;
    writeFileSync(
      path.join(RAIZ, 'evals', 'resultados', 'temas.json'),
      `${JSON.stringify({ gerado_em: 'npm test', modo: 'camada0_sem_ia', acertos, total: linhas.length, taxa: Math.round(taxa * 1000) / 10, planilhas: linhas }, null, 2)}\n`,
    );
    for (const l of linhas.filter((x) => !x.acertou)) console.log(`ERRO ${l.arquivo}: esperado ${l.esperado}, veio ${l.detectado}`, JSON.stringify(l.ranking));
    console.log(`Tema: ${acertos}/${linhas.length} (${(taxa * 100).toFixed(1)}%)`);
    expect(taxa).toBeGreaterThanOrEqual(0.9);
  });
});

async function montarComTema(nome: string, extra: Partial<EscolhaTema> = {}): Promise<{ montada: PlanilhaMontada; painel: PainelTema; papeis: Papeis }> {
  const leitura = leituras.get(nome)!;
  const tema = (extra.tema ?? detectarTema(leitura.perfis).tema) as Tema;
  const receita = receitaDe(tema)!;
  const papeis = atribuirPapeis(leitura.perfis, receita.papeis, extra.papeis);
  const montada = await montarGrupo(
    {
      principal: { leitura, config: configPadrao(leitura.perfis) },
      juntas: [],
      minGroupSize: DEF_TEMAS[tema].sensivel ? TAMANHO_MINIMO_PADRAO : undefined,
      tema: { tema, papeis, ...(extra.objetivo ? { objetivo: extra.objetivo } : {}), ...(extra.publico ? { publico: extra.publico } : {}) },
    },
    banco,
  );
  return { montada, painel: montada.painel as PainelTema, papeis };
}

const executar = async (montada: PlanilhaMontada, spec: Parameters<typeof compilar>[0]) => banco.executar(compilar(spec, montada.semantica).sql);

describe('receitas por tema', () => {
  it('as 8 receitas passam no Zod (papéis, métricas, seções e objetivos que existem)', () => {
    expect(Object.keys(RECEITAS).sort()).toEqual(['atendimento', 'educacao', 'estoque', 'financeiro', 'marketing', 'rh', 'saude', 'vendas']);
    for (const r of Object.values(RECEITAS)) expect(r!.objetivos.length).toBeGreaterThanOrEqual(2);
  });

  it('toda planilha com tema: cada KPI e cada painel da receita roda no DuckDB, e o que falta é explicado', async () => {
    const resumo: string[] = [];
    for (const [nome, { tema }] of Object.entries(ESPERADO)) {
      if (tema === 'generico') continue;
      const { montada, painel } = await montarComTema(nome, { tema: tema as Tema });
      for (const k of painel.kpis) await executar(montada, { intent: 'kpi', metrics: [k.metrica], dimensions: [], filters: [] });
      for (const v of painel.visuais) {
        const linhas = await executar(montada, v.spec);
        expect(linhas.length, `${nome} ${v.titulo}`).toBeGreaterThan(0);
      }
      expect(painel.kpis.length, nome).toBeGreaterThanOrEqual(2);
      // clientes.csv é um cadastro (sem valor de venda): na receita de vendas sobra pouco, e o resto é explicado.
      expect(painel.visuais.length, nome).toBeGreaterThanOrEqual(nome === 'clientes.csv' ? 1 : 2);
      if (nome === 'clientes.csv') expect(painel.escondidos.some((e) => e.motivo === 'não achei a coluna de valor')).toBe(true);
      for (const e of painel.escondidos) expect(e.motivo, `${nome}: ${e.titulos.join()}`).toMatch(/\S/);
      resumo.push(`${nome}: ${painel.kpis.length} KPIs, ${painel.visuais.length} painéis, objetivo ${painel.objetivo?.id}, escondidos: ${painel.escondidos.map((e) => `${e.titulos.join(' + ')} (${e.motivo})`).join('; ')}`);
    }
    console.log(resumo.join('\n'));
  }, 60_000);

  it('vendas: papéis certos e faturamento/ticket batem com o SQL direto na tabela', async () => {
    const { montada, papeis } = await montarComTema('temas/pedidos_loja_virtual.csv');
    expect(papeis).toMatchObject({ valor: 'total_do_pedido', pedido: 'pedido', produto: 'produto', categoria: 'categoria', regiao: 'uf', cliente: 'id_cliente', quantidade: 'qtd' });
    const [kpi] = await executar(montada, { intent: 'kpi', metrics: ['t_faturamento', 't_pedidos', 't_ticket'], dimensions: [], filters: [] });
    const [direto] = await banco.executar(`SELECT SUM(total_do_pedido) AS f, COUNT(DISTINCT pedido) AS p FROM ${montada.tabela}`);
    expect(Number(kpi?.t_faturamento)).toBeCloseTo(Number(direto?.f), 2);
    expect(Number(kpi?.t_pedidos)).toBe(Number(direto?.p));
    expect(Number(kpi?.t_ticket)).toBeCloseTo(Number(direto?.f) / Number(direto?.p), 6);
  });

  it('objetivo muda a ordem; público "cliente" esconde painéis internos e corta para 3', async () => {
    const campeoes = await montarComTema('vendas_br.csv', { objetivo: 'campeoes' });
    expect(campeoes.painel.visuais[0]?.id).toBe('tema-produtos');
    const sazonal = await montarComTema('vendas_br.csv', { objetivo: 'sazonalidade' });
    expect(sazonal.painel.visuais[0]?.id).toBe('tema-volume_mes');
    const cliente = await montarComTema('vendas_br.csv', { publico: 'cliente' as Publico });
    expect(cliente.painel.visuais.length).toBeLessThanOrEqual(3);
    expect(cliente.painel.visuais.map((v) => v.id)).not.toContain('tema-vendedores');
    expect(cliente.painel.mostrarDetalhe).toBe(false);
    const gestor = await montarComTema('vendas_br.csv', { publico: 'gestor' as Publico });
    expect(gestor.painel.visuais.length).toBe(4);
    expect(gestor.painel.cortadosPeloPublico).toBeGreaterThan(0);
  });

  it('papel faltando degrada sem inventar: sem "valor", faturamento = preço × quantidade; sem produto, painel escondido com motivo', async () => {
    const { montada, painel } = await montarComTema('vendas_br.csv', { papeis: { valor: '', produto: '' } });
    const [k] = await executar(montada, { intent: 'kpi', metrics: ['t_faturamento'], dimensions: [], filters: [] });
    const [d] = await banco.executar(`SELECT SUM(preco_unitario * quantidade) AS f FROM ${montada.tabela}`);
    expect(Number(k?.t_faturamento)).toBeCloseTo(Number(d?.f), 2);
    // Ticket: sem valor, a conta com pedido não fecha; a receita NÃO chuta outra coluna.
    expect(montada.semantica.metrics.t_ticket).toBeUndefined();
    expect(painel.escondidos).toEqual(expect.arrayContaining([{ titulos: expect.arrayContaining(['Produtos campeões']), motivo: 'não achei a coluna de produto' }]));
  });

  it('financeiro: entrada/saída pela coluna Tipo; saldo = entradas − saídas; receita/despesa em colunas separadas também', async () => {
    const fluxo = await montarComTema('temas/fluxo_caixa.csv');
    expect(fluxo.papeis).toMatchObject({ valor: 'valor', tipo_lancamento: 'tipo', centro_custo: 'categoria' });
    const [k] = await executar(fluxo.montada, { intent: 'kpi', metrics: ['t_entradas', 't_saidas', 't_saldo'], dimensions: [], filters: [] });
    expect(Number(k?.t_saldo)).toBeCloseTo(Number(k?.t_entradas) - Number(k?.t_saidas), 2);
    const [d] = await banco.executar(`SELECT SUM(valor) FILTER (WHERE tipo = 'Entrada') AS e FROM ${fluxo.montada.tabela}`);
    expect(Number(k?.t_entradas)).toBeCloseTo(Number(d?.e), 2);
    // "Total lançado" misturaria entrada com saída: some quando há Tipo.
    expect(fluxo.montada.semantica.metrics.t_total).toBeUndefined();
    const titulo = await montarComTema('financeiro_titulo_total.csv');
    expect(titulo.papeis).toMatchObject({ receita: 'receita', despesa: 'despesa', centro_custo: 'centro_de_custo' });
    expect(titulo.painel.kpis.map((x) => x.metrica).slice(0, 3)).toEqual(['t_entradas', 't_saidas', 't_saldo']);
  });

  it('saúde: modo sensível ligado; paciente com nome (dado pessoal) NÃO vira contagem de pacientes', async () => {
    const { montada, painel, papeis } = await montarComTema('temas/atendimentos_clinica.csv');
    expect(montada.semantica.dataset.min_group_size).toBe(5);
    expect(papeis.paciente).toBeUndefined();
    expect(painel.kpis.map((k) => k.metrica)).not.toContain('t_pacientes');
    const exames = await montarComTema('temas/exames_laboratorio.csv');
    expect(exames.papeis.paciente).toBe('id_paciente');
    expect(exames.painel.kpis.map((k) => k.metrica)).toContain('t_pacientes');
  });

  it('RH (turnover): o eixo do tempo é a data de desligamento', async () => {
    const { montada, painel, papeis } = await montarComTema('temas/turnover.csv', { objetivo: 'turnover' });
    expect(papeis.desligamento).toBe('data_de_desligamento');
    expect(montada.semantica.dataset.time_column).toBe('data_de_desligamento');
    expect(painel.visuais[0]?.titulo).toBe('Desligamentos por mês');
  });

  it('perguntas sugeridas usam os rótulos reais e só as que dá para responder', async () => {
    const { painel } = await montarComTema('temas/pedidos_loja_virtual.csv');
    expect(painel.perguntas).toContain('Faturamento mês a mês');
    expect(painel.perguntas.some((q) => /vendedor/i.test(q))).toBe(false);
  });
});

describe('tema pela IA local (Camada 1, opcional)', () => {
  it('a IA só vê metadados: nenhum valor da planilha (nem CPF, nem nome, nem categoria) vai no pedido', () => {
    const l = leituras.get('rh_ficticio.csv')!;
    const texto = JSON.stringify(metadadosParaIA(l.perfis, configPadrao(l.perfis)));
    const valores = l.previa.flatMap((linha) => Object.values(linha)).map((v) => String(v ?? '').trim()).filter((v) => v.length >= 4);
    expect(valores.length).toBeGreaterThan(20);
    for (const v of valores) expect(texto.includes(v), v).toBe(false);
    expect(texto).toContain('"tipo":"dado pessoal"');
  });

  it('saída ruim nunca passa: JSON quebrado, tema fora da lista, coluna inventada e pergunta com número', () => {
    expect(validarTemaDoModelo('{"tema": "vendas"', ['a']).sugestao).toBeNull();
    expect(validarTemaDoModelo('{"tema":"astrologia","rotulos":[],"perguntas":[]}', ['a']).sugestao).toBeNull();
    const r = validarTemaDoModelo('Claro! {"tema":"rh","rotulos":[{"coluna":"a","rotulo":"Área"},{"coluna":"x","rotulo":"?"}],"perguntas":["Quem cresceu 15%?","Salário médio por área"]}', ['a']);
    expect(r.sugestao).toEqual({ tema: 'rh', rotulos: [{ coluna: 'a', rotulo: 'Área' }], perguntas: ['Salário médio por área'] });
    expect(r.erros).toHaveLength(2);
  });

  it('a IA só troca o tema quando a Camada 0 não tem confiança alta', () => {
    const alta = detectarTema(leituras.get('vendas_br.csv')!.perfis);
    const baixa = detectarTema(leituras.get('clientes.csv')!.perfis);
    const sugestao = { tema: 'rh' as const, rotulos: [], perguntas: [] };
    expect(combinarTema(alta, sugestao)).toMatchObject({ tema: 'vendas', fonte: 'camada0' });
    expect(combinarTema(baixa, sugestao)).toMatchObject({ tema: 'rh', fonte: 'ia' });
    expect(combinarTema(baixa, null)).toMatchObject({ tema: 'generico', fonte: 'camada0' });
  });

  it('com o motor falso: clientes.csv vira vendas; modos adversários são barrados', async () => {
    const l = leituras.get('clientes.csv')!;
    const config = configPadrao(l.perfis);
    const ok = await sugerirTemaIA(criarMotorFalso(), l.perfis, config);
    expect(ok.sugestao?.tema).toBe('vendas');
    expect(ok.mensagens[1]?.content).not.toContain('@');
    expect((await sugerirTemaIA(criarMotorFalso({ modo: 'json-quebrado' }), l.perfis, config)).sugestao).toBeNull();
    expect((await sugerirTemaIA(criarMotorFalso({ modo: 'metrica-inventada' }), l.perfis, config)).sugestao).toBeNull();
    const fantasma = await sugerirTemaIA(criarMotorFalso({ modo: 'valor-inexistente' }), l.perfis, config);
    expect(fantasma.sugestao?.rotulos.map((r) => r.coluna)).not.toContain('coluna_fantasma');
    expect((await sugerirTemaIA(criarMotorFalso({ modo: 'erro' }), l.perfis, config)).erros[0]).toMatch(/falhou/);
  });
});
