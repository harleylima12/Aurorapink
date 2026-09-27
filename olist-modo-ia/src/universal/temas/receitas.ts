/**
 * Receitas de dashboard por tema (Fase 5B): DECLARATIVAS e validadas com Zod, como o semantic.json.
 *
 * Uma receita diz QUAIS papéis de negócio ela usa, quais métricas monta com eles (SQL com marcadores {papel},
 * trocados pelo nome real da coluna, sempre entre aspas), quais KPIs e seções mostrar e em que ordem para cada
 * objetivo. Cada métrica tem alternativas: a primeira cujos papéis existem vale ("ticket médio" = total ÷ pedidos;
 * sem pedido, "valor médio por venda"). Sem nenhuma alternativa possível, o painel some e a tela explica por quê.
 * Quem calcula continua sendo o DuckDB, pelo compilador. A receita nunca tem número.
 */
import { z } from '../../zod';
import { TIPOS_COLUNA } from '../perfil';
import { formato } from '../../semantic/schema';
import { PAPEIS, TEMAS, type PapelNegocio, type Tema } from './definicoes';

const papel = z.enum(PAPEIS);
const idCurto = z.string().regex(/^[a-z][a-z0-9_]*$/);

const alternativa = z.object({
  /** SQL de agregação com marcadores {papel}. */
  sql: z.string().min(1),
  rotulo: z.string().min(1).optional(),
  formato: formato.optional(),
  /** Só vale se a coluna do papel tiver um destes tipos (ex.: frequência já em %). */
  seTipo: z.partialRecord(papel, z.array(z.enum(TIPOS_COLUNA))).optional(),
  /** Só vale se estes papéis NÃO existirem (ex.: "total lançado" só sem entrada/saída). */
  seNaoHouver: z.array(papel).optional(),
});

const metricaReceita = z.object({
  id: idCurto,
  /** Pode ter {u:papel}: a unidade entre parênteses do nome da coluna ("(h)", "(min)"). */
  rotulo: z.string().min(1),
  descricao: z.string().min(1),
  formato,
  polaridade: z.enum(['higher_is_better', 'lower_is_better', 'neutral']).default('neutral'),
  sinonimos: z.array(z.string()).default([]),
  /** Soma/contagem: sem linhas vale 0. Razões e médias: "sem dado". */
  zeroSeVazio: z.boolean().default(false),
  alternativas: z.array(alternativa).min(1),
});

const secao = z.object({
  id: idCurto,
  /** {d} = rótulo da dimensão; {m} = rótulo da métrica; {t} = coluna de data. */
  titulo: z.string().min(1),
  explicacao: z.string().min(1),
  metrica: z.string().min(1),
  dimensao: z.union([z.literal('tempo'), papel]),
  /** Seção de tempo que só faz sentido se o eixo do tempo for esta coluna (ex.: desligamentos por mês). */
  tempoPapel: papel.optional(),
  limite: z.number().int().min(3).max(20).default(10),
  /** Painel interno (vendedor, custo por fornecedor): some para o público "cliente". */
  interno: z.boolean().default(false),
});

const objetivo = z.object({
  id: idCurto,
  rotulo: z.string().min(1),
  secoes: z.array(z.string()).min(1),
  kpis: z.array(z.string()).optional(),
});

export const receitaSchema = z
  .object({
    tema: z.enum(TEMAS),
    /** Eixo do tempo, em ordem de preferência. */
    tempo: z.array(papel).min(1).default(['data']),
    /** Grupos de papéis essenciais: basta UM grupo completo; se nenhum estiver, a tela pergunta o 1º. */
    essenciais: z.array(z.array(papel).min(1)).default([]),
    /** Todos os papéis que a receita procura, do mais para o menos importante. */
    papeis: z.array(papel).min(1),
    metricas: z.array(metricaReceita).min(1),
    kpis: z.array(z.string()).min(1),
    secoes: z.array(secao).min(1),
    objetivos: z.array(objetivo).min(2).max(3),
    /** Seções que alimentam os insights automáticos do Modo IA. */
    insights: z.array(z.string()).min(1),
    /** Perguntas sugeridas no Modo IA: {m:id} métrica, {d:papel} dimensão, {tempo} = "mês a mês". */
    perguntas: z.array(z.string()).min(2),
  })
  .superRefine((r, ctx) => {
    const erro = (message: string) => ctx.addIssue({ code: 'custom', message });
    const metricas = new Set(['registros', ...r.metricas.map((m) => m.id)]);
    if (metricas.size !== r.metricas.length + 1) erro(`${r.tema}: id de métrica repetido`);
    const secoes = new Set(r.secoes.map((s) => s.id));
    if (secoes.size !== r.secoes.length) erro(`${r.tema}: id de seção repetido`);
    const papeis = new Set<string>(r.papeis);
    for (const m of r.metricas)
      for (const a of m.alternativas)
        for (const [, p] of a.sql.matchAll(/\{([a-z_]+)\}/g)) if (!papeis.has(p!)) erro(`${r.tema}.${m.id}: papel {${p}} fora da lista de papéis`);
    for (const k of r.kpis) if (!metricas.has(k)) erro(`${r.tema}: KPI ${k} não existe`);
    for (const s of r.secoes) {
      if (!metricas.has(s.metrica)) erro(`${r.tema}.${s.id}: métrica ${s.metrica} não existe`);
      if (s.dimensao !== 'tempo' && !papeis.has(s.dimensao)) erro(`${r.tema}.${s.id}: papel ${s.dimensao} fora da lista`);
    }
    for (const o of r.objetivos) {
      for (const s of o.secoes) if (!secoes.has(s)) erro(`${r.tema}.${o.id}: seção ${s} não existe`);
      for (const k of o.kpis ?? []) if (!metricas.has(k)) erro(`${r.tema}.${o.id}: KPI ${k} não existe`);
    }
    for (const s of r.insights) if (!secoes.has(s)) erro(`${r.tema}: insight de seção ${s} que não existe`);
    for (const q of r.perguntas) {
      for (const [, m] of q.matchAll(/\{m:([a-z_]+)\}/g)) if (!metricas.has(m!)) erro(`${r.tema}: pergunta com métrica ${m} que não existe`);
      for (const [, d] of q.matchAll(/\{d:([a-z_]+)\}/g)) if (!papeis.has(d!)) erro(`${r.tema}: pergunta com papel ${d} fora da lista`);
    }
  });
export type Receita = z.infer<typeof receitaSchema>;
export type MetricaReceita = Receita['metricas'][number];
export type SecaoReceita = Receita['secoes'][number];

/** SQL: valor da coluna (sem acento, minúsculo) numa lista. */
const em = (p: PapelNegocio, valores: readonly string[]) => `lower(strip_accents(CAST({${p}} AS VARCHAR))) IN (${valores.map((v) => `'${v}'`).join(', ')})`;
const ENTRADA = ['entrada', 'credito', 'receita'];
const SAIDA = ['saida', 'debito', 'despesa'];
const ABERTO = ['em aberto', 'aberto', 'vencido', 'a pagar', 'a receber', 'pendente', 'atrasado'];
const PAGO = ['pago', 'quitado', 'recebido', 'liquidado'];

const soma = (id: string, rotulo: string, p: PapelNegocio, f: 'brl' | 'int' | 'dec2', descricao: string, polaridade: MetricaReceita['polaridade'] = 'neutral', sinonimos: string[] = []) => ({
  id, rotulo, descricao, formato: f, polaridade, sinonimos, zeroSeVazio: true, alternativas: [{ sql: `SUM({${p}})` }],
});

const BRUTAS: Record<Exclude<Tema, 'generico'>, z.input<typeof receitaSchema>> = {
  vendas: {
    tema: 'vendas',
    essenciais: [['valor'], ['preco', 'quantidade']],
    papeis: ['valor', 'data', 'pedido', 'produto', 'categoria', 'cliente', 'regiao', 'vendedor', 'quantidade', 'preco', 'status'],
    metricas: [
      { id: 'faturamento', rotulo: 'Faturamento', descricao: 'Soma do valor das vendas', formato: 'brl', polaridade: 'higher_is_better', sinonimos: ['faturamento', 'receita', 'vendas', 'quanto vendeu', 'valor vendido'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({valor})' }, { sql: 'SUM({preco} * {quantidade})' }] },
      { id: 'pedidos', rotulo: 'Pedidos', descricao: 'Pedidos diferentes', formato: 'int', sinonimos: ['pedidos', 'numero de pedidos', 'quantos pedidos', 'vendas'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {pedido})' }, { sql: 'COUNT(*)', rotulo: 'Vendas (linhas)' }] },
      { id: 'ticket', rotulo: 'Ticket médio', descricao: 'Faturamento ÷ pedidos', formato: 'brl', polaridade: 'higher_is_better', sinonimos: ['ticket medio', 'ticket', 'valor medio por pedido'],
        alternativas: [{ sql: 'SUM({valor}) / NULLIF(COUNT(DISTINCT {pedido}), 0)' }, { sql: 'AVG({valor})', rotulo: 'Valor médio por venda' }] },
      { id: 'clientes', rotulo: 'Clientes', descricao: 'Clientes diferentes', formato: 'int', sinonimos: ['clientes', 'quantos clientes', 'compradores'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {cliente})' }] },
      soma('unidades', 'Unidades vendidas', 'quantidade', 'int', 'Soma das quantidades', 'higher_is_better', ['unidades', 'quantidade vendida', 'itens vendidos']),
    ],
    kpis: ['faturamento', 'pedidos', 'ticket', 'clientes', 'unidades'],
    secoes: [
      { id: 'evolucao', titulo: '{m} mês a mês', explicacao: 'Como o faturamento andou', metrica: 'faturamento', dimensao: 'tempo' },
      { id: 'produtos', titulo: 'Produtos campeões', explicacao: 'Quem mais trouxe dinheiro', metrica: 'faturamento', dimensao: 'produto' },
      { id: 'categorias', titulo: '{m} por {d}', explicacao: 'Onde está o dinheiro', metrica: 'faturamento', dimensao: 'categoria' },
      { id: 'regiao', titulo: '{m} por {d}', explicacao: 'De onde vêm as vendas', metrica: 'faturamento', dimensao: 'regiao' },
      { id: 'vendedores', titulo: '{m} por {d}', explicacao: 'Quem vendeu mais', metrica: 'faturamento', dimensao: 'vendedor', interno: true },
      { id: 'volume_mes', titulo: '{m} mês a mês', explicacao: 'Meses fortes e fracos (sazonalidade)', metrica: 'pedidos', dimensao: 'tempo' },
      { id: 'unidades_produto', titulo: '{m} por {d}', explicacao: 'O que mais sai em quantidade', metrica: 'unidades', dimensao: 'produto' },
      { id: 'ticket_regiao', titulo: '{m} por {d}', explicacao: 'Onde cada compra vale mais', metrica: 'ticket', dimensao: 'regiao' },
      { id: 'status', titulo: '{m} por {d}', explicacao: 'Situação dos pedidos', metrica: 'pedidos', dimensao: 'status', interno: true },
    ],
    objetivos: [
      { id: 'faturamento', rotulo: 'Acompanhar o faturamento', secoes: ['evolucao', 'categorias', 'regiao', 'vendedores', 'produtos', 'ticket_regiao', 'status'] },
      { id: 'campeoes', rotulo: 'Achar os produtos campeões', secoes: ['produtos', 'unidades_produto', 'categorias', 'vendedores', 'evolucao'], kpis: ['faturamento', 'unidades', 'ticket', 'pedidos'] },
      { id: 'sazonalidade', rotulo: 'Entender a sazonalidade', secoes: ['volume_mes', 'evolucao', 'categorias', 'regiao'], kpis: ['pedidos', 'faturamento', 'ticket', 'clientes'] },
    ],
    insights: ['evolucao', 'categorias', 'regiao', 'produtos'],
    perguntas: ['{m:faturamento} {tempo}', 'Top 5 {d:produto} por {m:faturamento}', '{m:faturamento} por {d:categoria}', '{m:ticket} por {d:regiao}', 'Top 5 {d:vendedor} por {m:faturamento}'],
  },
  financeiro: {
    tema: 'financeiro',
    essenciais: [['valor'], ['receita', 'despesa']],
    papeis: ['valor', 'receita', 'despesa', 'data', 'tipo_lancamento', 'centro_custo', 'fornecedor', 'status'],
    metricas: [
      { id: 'entradas', rotulo: 'Entradas', descricao: 'Tudo o que entrou', formato: 'brl', polaridade: 'higher_is_better', sinonimos: ['entradas', 'receitas', 'recebido', 'quanto entrou'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({receita})' }, { sql: `SUM(CASE WHEN ${em('tipo_lancamento', ENTRADA)} THEN {valor} ELSE 0 END)` }] },
      { id: 'saidas', rotulo: 'Saídas', descricao: 'Tudo o que saiu', formato: 'brl', polaridade: 'lower_is_better', sinonimos: ['saidas', 'despesas', 'gastos', 'quanto saiu', 'quanto gastou'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({despesa})' }, { sql: `SUM(CASE WHEN ${em('tipo_lancamento', SAIDA)} THEN {valor} ELSE 0 END)` }] },
      { id: 'saldo', rotulo: 'Saldo', descricao: 'Entradas − saídas', formato: 'brl', polaridade: 'higher_is_better', sinonimos: ['saldo', 'resultado', 'sobrou', 'lucro'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({receita}) - SUM({despesa})' }, { sql: `SUM(CASE WHEN ${em('tipo_lancamento', ENTRADA)} THEN {valor} WHEN ${em('tipo_lancamento', SAIDA)} THEN -{valor} ELSE 0 END)` }] },
      { id: 'total', rotulo: 'Total lançado', descricao: 'Soma de todos os lançamentos', formato: 'brl', sinonimos: ['total', 'valor total', 'total lancado'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({valor})', seNaoHouver: ['tipo_lancamento', 'receita', 'despesa'] }] },
      { id: 'em_aberto', rotulo: 'Em aberto', descricao: 'Soma do que ainda não foi pago', formato: 'brl', polaridade: 'lower_is_better', sinonimos: ['em aberto', 'a pagar', 'pendente', 'vencido'], zeroSeVazio: true,
        alternativas: [{ sql: `SUM(CASE WHEN ${em('status', ABERTO)} THEN {valor} ELSE 0 END)` }] },
      { id: 'pago', rotulo: 'Pago', descricao: 'Soma do que já foi pago', formato: 'brl', sinonimos: ['pago', 'quitado'], zeroSeVazio: true,
        alternativas: [{ sql: `SUM(CASE WHEN ${em('status', PAGO)} THEN {valor} ELSE 0 END)` }] },
      { id: 'lancamentos', rotulo: 'Lançamentos', descricao: 'Número de lançamentos (linhas)', formato: 'int', sinonimos: ['lancamentos', 'quantos lancamentos'], zeroSeVazio: true, alternativas: [{ sql: 'COUNT(*)' }] },
    ],
    kpis: ['entradas', 'saidas', 'saldo', 'total', 'em_aberto', 'pago', 'lancamentos'],
    secoes: [
      { id: 'saldo_mes', titulo: '{m} mês a mês', explicacao: 'Sobrou ou faltou em cada mês', metrica: 'saldo', dimensao: 'tempo' },
      { id: 'saidas_centro', titulo: 'Para onde vai o dinheiro', explicacao: 'Saídas por centro de custo', metrica: 'saidas', dimensao: 'centro_custo' },
      { id: 'entradas_centro', titulo: 'De onde vem o dinheiro', explicacao: 'Entradas por centro de custo', metrica: 'entradas', dimensao: 'centro_custo' },
      { id: 'total_mes', titulo: '{m} mês a mês', explicacao: 'Quanto foi lançado em cada mês', metrica: 'total', dimensao: 'tempo' },
      { id: 'total_centro', titulo: '{m} por {d}', explicacao: 'Onde o dinheiro se concentra', metrica: 'total', dimensao: 'centro_custo' },
      { id: 'total_fornecedor', titulo: '{m} por {d}', explicacao: 'Com quem mais se gasta', metrica: 'total', dimensao: 'fornecedor', interno: true },
      { id: 'aberto_fornecedor', titulo: '{m} por {d}', explicacao: 'Quem ainda falta pagar', metrica: 'em_aberto', dimensao: 'fornecedor', interno: true },
      { id: 'status', titulo: '{m} por {d}', explicacao: 'Pago, em aberto, vencido', metrica: 'total', dimensao: 'status' },
    ],
    objetivos: [
      { id: 'caixa', rotulo: 'Controlar o caixa', secoes: ['saldo_mes', 'total_mes', 'saidas_centro', 'entradas_centro', 'status', 'total_centro'] },
      { id: 'despesas', rotulo: 'Cortar despesas', secoes: ['saidas_centro', 'total_centro', 'total_fornecedor', 'aberto_fornecedor', 'saldo_mes'], kpis: ['saidas', 'saldo', 'total', 'em_aberto', 'lancamentos'] },
      { id: 'contas', rotulo: 'Acompanhar contas a pagar', secoes: ['status', 'aberto_fornecedor', 'total_mes', 'total_fornecedor'], kpis: ['em_aberto', 'pago', 'total', 'saidas', 'lancamentos'] },
    ],
    insights: ['saldo_mes', 'saidas_centro', 'total_mes', 'total_centro'],
    perguntas: ['{m:saldo} {tempo}', '{m:saidas} por {d:centro_custo}', '{m:total} {tempo}', 'Top 5 {d:fornecedor} por {m:total}', '{m:em_aberto} por {d:fornecedor}'],
  },
  rh: {
    tema: 'rh',
    tempo: ['desligamento', 'data'],
    essenciais: [['salario'], ['departamento'], ['desligamento']],
    papeis: ['colaborador', 'salario', 'departamento', 'cargo', 'desligamento', 'data', 'status'],
    metricas: [
      { id: 'pessoas', rotulo: 'Pessoas', descricao: 'Colaboradores diferentes', formato: 'int', sinonimos: ['pessoas', 'colaboradores', 'funcionarios', 'headcount', 'quantas pessoas'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {colaborador})' }, { sql: 'COUNT(*)', rotulo: 'Registros' }] },
      { id: 'folha', rotulo: 'Folha (soma dos salários)', descricao: 'Soma dos salários', formato: 'brl', sinonimos: ['folha', 'folha de pagamento', 'total de salarios'], zeroSeVazio: true, alternativas: [{ sql: 'SUM({salario})' }] },
      { id: 'salario_medio', rotulo: 'Salário médio', descricao: 'Média dos salários', formato: 'brl', sinonimos: ['salario medio', 'media salarial', 'media de salario'], alternativas: [{ sql: 'AVG({salario})' }] },
      { id: 'desligamentos', rotulo: 'Desligamentos', descricao: 'Linhas com data de desligamento', formato: 'int', polaridade: 'lower_is_better', sinonimos: ['desligamentos', 'demissoes', 'saidas'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT({desligamento})' }] },
      { id: 'taxa_desligamento', rotulo: 'Taxa de desligamento', descricao: 'Desligamentos ÷ pessoas da planilha', formato: 'pct', polaridade: 'lower_is_better', sinonimos: ['turnover', 'taxa de desligamento', 'rotatividade'],
        alternativas: [{ sql: 'COUNT({desligamento}) / NULLIF(COUNT(*), 0)' }] },
      { id: 'ativos', rotulo: '% ativos', descricao: 'Parte das pessoas marcada como ativa', formato: 'pct', sinonimos: ['ativos', 'percentual de ativos'],
        alternativas: [{ sql: `AVG(CASE WHEN ${em('status', ['sim', 'ativo', 'true', 'ativa'])} THEN 1.0 ELSE 0 END)` }] },
    ],
    kpis: ['pessoas', 'folha', 'salario_medio', 'desligamentos', 'taxa_desligamento', 'ativos'],
    secoes: [
      { id: 'pessoas_depto', titulo: '{m} por {d}', explicacao: 'Tamanho de cada área', metrica: 'pessoas', dimensao: 'departamento' },
      { id: 'pessoas_cargo', titulo: '{m} por {d}', explicacao: 'Quantas pessoas em cada cargo', metrica: 'pessoas', dimensao: 'cargo' },
      { id: 'salario_cargo', titulo: '{m} por {d}', explicacao: 'Faixa salarial de cada cargo', metrica: 'salario_medio', dimensao: 'cargo', interno: true },
      { id: 'salario_depto', titulo: '{m} por {d}', explicacao: 'Salário médio de cada área', metrica: 'salario_medio', dimensao: 'departamento', interno: true },
      { id: 'folha_mes', titulo: '{m} mês a mês', explicacao: 'Quanto a folha custa ao longo do tempo', metrica: 'folha', dimensao: 'tempo', interno: true },
      { id: 'deslig_mes', titulo: 'Desligamentos por mês', explicacao: 'Quando as pessoas saíram', metrica: 'registros', dimensao: 'tempo', tempoPapel: 'desligamento' },
      { id: 'deslig_depto', titulo: '{m} por {d}', explicacao: 'Onde há mais saídas', metrica: 'desligamentos', dimensao: 'departamento' },
    ],
    objetivos: [
      { id: 'quadro', rotulo: 'Conhecer o quadro de pessoas', secoes: ['pessoas_depto', 'pessoas_cargo', 'salario_depto', 'folha_mes', 'deslig_mes'] },
      { id: 'salarios', rotulo: 'Analisar salários', secoes: ['salario_cargo', 'salario_depto', 'folha_mes', 'pessoas_depto'], kpis: ['salario_medio', 'folha', 'pessoas', 'ativos'] },
      { id: 'turnover', rotulo: 'Acompanhar o turnover', secoes: ['deslig_mes', 'deslig_depto', 'pessoas_depto'], kpis: ['desligamentos', 'taxa_desligamento', 'pessoas', 'salario_medio'] },
    ],
    insights: ['pessoas_depto', 'salario_depto', 'deslig_mes'],
    perguntas: ['{m:pessoas} por {d:departamento}', '{m:salario_medio} por {d:cargo}', '{m:desligamentos} por {d:departamento}', '{m:folha} {tempo}'],
  },
  estoque: {
    tema: 'estoque',
    essenciais: [['estoque_atual'], ['quantidade']],
    papeis: ['item', 'produto', 'categoria', 'estoque_atual', 'estoque_minimo', 'custo', 'armazem', 'fornecedor', 'movimento', 'quantidade', 'data'],
    metricas: [
      { id: 'itens', rotulo: 'Itens (SKUs)', descricao: 'Itens diferentes', formato: 'int', sinonimos: ['itens', 'skus', 'quantos itens', 'produtos'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {item})' }, { sql: 'COUNT(*)', rotulo: 'Linhas' }] },
      soma('saldo', 'Estoque atual (unidades)', 'estoque_atual', 'int', 'Soma do estoque atual', 'neutral', ['estoque', 'saldo', 'estoque atual', 'unidades em estoque']),
      { id: 'abaixo', rotulo: 'Itens abaixo do mínimo', descricao: 'Linhas com estoque atual menor que o mínimo', formato: 'int', polaridade: 'lower_is_better', sinonimos: ['abaixo do minimo', 'falta de estoque', 'repor'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM(CASE WHEN {estoque_atual} < {estoque_minimo} THEN 1 ELSE 0 END)' }] },
      { id: 'valor', rotulo: 'Valor em estoque', descricao: 'Estoque atual × custo unitário', formato: 'brl', sinonimos: ['valor em estoque', 'dinheiro parado', 'valor do estoque'], zeroSeVazio: true,
        alternativas: [{ sql: 'SUM({estoque_atual} * {custo})' }] },
      soma('movimentado', 'Quantidade movimentada', 'quantidade', 'int', 'Soma das quantidades movimentadas', 'neutral', ['movimentado', 'quantidade', 'movimentacao']),
      { id: 'entradas', rotulo: 'Entradas (unidades)', descricao: 'Quantidade nas movimentações de entrada', formato: 'int', sinonimos: ['entradas', 'quanto entrou'], zeroSeVazio: true,
        alternativas: [{ sql: `SUM(CASE WHEN ${em('movimento', ['entrada', 'devolucao'])} THEN {quantidade} ELSE 0 END)` }] },
      { id: 'saidas', rotulo: 'Saídas (unidades)', descricao: 'Quantidade nas movimentações de saída', formato: 'int', sinonimos: ['saidas', 'quanto saiu', 'consumo'], zeroSeVazio: true,
        alternativas: [{ sql: `SUM(CASE WHEN ${em('movimento', ['saida'])} THEN {quantidade} ELSE 0 END)` }] },
    ],
    kpis: ['itens', 'saldo', 'abaixo', 'valor', 'entradas', 'saidas', 'movimentado'],
    secoes: [
      { id: 'abaixo_categoria', titulo: 'Onde falta estoque', explicacao: 'Itens abaixo do mínimo por categoria', metrica: 'abaixo', dimensao: 'categoria' },
      { id: 'abaixo_armazem', titulo: '{m} por {d}', explicacao: 'Qual armazém precisa de reposição', metrica: 'abaixo', dimensao: 'armazem' },
      { id: 'saldo_armazem', titulo: '{m} por {d}', explicacao: 'Quanto há em cada lugar', metrica: 'saldo', dimensao: 'armazem' },
      { id: 'valor_categoria', titulo: '{m} por {d}', explicacao: 'Onde está o dinheiro parado', metrica: 'valor', dimensao: 'categoria' },
      { id: 'valor_fornecedor', titulo: '{m} por {d}', explicacao: 'Dinheiro parado por fornecedor', metrica: 'valor', dimensao: 'fornecedor', interno: true },
      { id: 'mov_tempo', titulo: '{m} mês a mês', explicacao: 'Ritmo das movimentações', metrica: 'movimentado', dimensao: 'tempo' },
      { id: 'mov_tipo', titulo: '{m} por {d}', explicacao: 'Entradas, saídas e ajustes', metrica: 'movimentado', dimensao: 'movimento' },
      { id: 'saidas_produto', titulo: 'Itens que mais saem', explicacao: 'Saídas por produto', metrica: 'saidas', dimensao: 'produto' },
      { id: 'mov_armazem', titulo: '{m} por {d}', explicacao: 'Movimento em cada armazém', metrica: 'movimentado', dimensao: 'armazem' },
    ],
    objetivos: [
      { id: 'reposicao', rotulo: 'Evitar falta de estoque', secoes: ['abaixo_categoria', 'abaixo_armazem', 'saldo_armazem', 'saidas_produto', 'mov_tempo', 'mov_tipo'] },
      { id: 'valor', rotulo: 'Saber quanto dinheiro está parado', secoes: ['valor_categoria', 'valor_fornecedor', 'saldo_armazem', 'abaixo_categoria'], kpis: ['valor', 'saldo', 'itens', 'abaixo'] },
      { id: 'giro', rotulo: 'Acompanhar as movimentações', secoes: ['mov_tempo', 'mov_tipo', 'saidas_produto', 'mov_armazem'], kpis: ['movimentado', 'entradas', 'saidas', 'itens'] },
    ],
    insights: ['abaixo_categoria', 'saldo_armazem', 'mov_tempo', 'mov_tipo'],
    perguntas: ['{m:saldo} por {d:armazem}', '{m:abaixo} por {d:categoria}', '{m:valor} por {d:fornecedor}', '{m:movimentado} {tempo}', '{m:movimentado} por {d:movimento}'],
  },
  marketing: {
    tema: 'marketing',
    essenciais: [['investimento'], ['lead']],
    papeis: ['campanha', 'canal', 'investimento', 'impressoes', 'cliques', 'conversoes', 'receita_atribuida', 'lead', 'status', 'data'],
    metricas: [
      soma('investimento', 'Investimento', 'investimento', 'brl', 'Soma do investimento', 'neutral', ['investimento', 'gasto', 'verba', 'quanto investiu']),
      soma('receita', 'Receita atribuída', 'receita_atribuida', 'brl', 'Receita atribuída às campanhas', 'higher_is_better', ['receita', 'receita atribuida', 'retorno']),
      { id: 'roas', rotulo: 'ROAS (receita ÷ investimento)', descricao: 'Quantos reais voltaram para cada real investido', formato: 'dec2', polaridade: 'higher_is_better', sinonimos: ['roas', 'retorno sobre investimento'],
        alternativas: [{ sql: 'SUM({receita_atribuida}) / NULLIF(SUM({investimento}), 0)' }] },
      soma('conversoes', 'Conversões', 'conversoes', 'int', 'Soma das conversões', 'higher_is_better', ['conversoes', 'vendas', 'converteu']),
      { id: 'cpa', rotulo: 'Custo por conversão (CPA)', descricao: 'Investimento ÷ conversões', formato: 'brl', polaridade: 'lower_is_better', sinonimos: ['cpa', 'custo por conversao', 'custo por aquisicao'],
        alternativas: [{ sql: 'SUM({investimento}) / NULLIF(SUM({conversoes}), 0)' }] },
      { id: 'ctr', rotulo: 'CTR (cliques ÷ impressões)', descricao: 'Cliques ÷ impressões', formato: 'pct', polaridade: 'higher_is_better', sinonimos: ['ctr', 'taxa de clique'],
        alternativas: [{ sql: 'SUM({cliques}) / NULLIF(SUM({impressoes}), 0)' }] },
      soma('cliques', 'Cliques', 'cliques', 'int', 'Soma dos cliques', 'higher_is_better', ['cliques']),
      { id: 'leads', rotulo: 'Leads', descricao: 'Leads diferentes', formato: 'int', polaridade: 'higher_is_better', sinonimos: ['leads', 'quantos leads', 'contatos'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {lead})' }] },
      { id: 'qualificados', rotulo: '% qualificados', descricao: 'Parte dos leads qualificada ou convertida', formato: 'pct', polaridade: 'higher_is_better', sinonimos: ['qualificados', 'taxa de qualificacao'],
        alternativas: [{ sql: `AVG(CASE WHEN ${em('status', ['qualificado', 'convertido', 'ganho', 'cliente', 'oportunidade'])} THEN 1.0 ELSE 0 END)` }] },
    ],
    kpis: ['investimento', 'receita', 'roas', 'conversoes', 'cpa', 'ctr', 'leads', 'qualificados'],
    secoes: [
      { id: 'roas_canal', titulo: '{m} por {d}', explicacao: 'Qual canal devolve mais', metrica: 'roas', dimensao: 'canal' },
      { id: 'inv_canal', titulo: '{m} por {d}', explicacao: 'Para onde vai a verba', metrica: 'investimento', dimensao: 'canal', interno: true },
      { id: 'conv_campanha', titulo: '{m} por {d}', explicacao: 'Campanhas que mais convertem', metrica: 'conversoes', dimensao: 'campanha' },
      { id: 'cpa_campanha', titulo: '{m} por {d}', explicacao: 'Quanto custa cada conversão', metrica: 'cpa', dimensao: 'campanha', interno: true },
      { id: 'receita_tempo', titulo: '{m} mês a mês', explicacao: 'Retorno ao longo do tempo', metrica: 'receita', dimensao: 'tempo' },
      { id: 'leads_tempo', titulo: '{m} mês a mês', explicacao: 'Ritmo de captação', metrica: 'leads', dimensao: 'tempo' },
      { id: 'leads_canal', titulo: '{m} por {d}', explicacao: 'De onde vêm os leads', metrica: 'leads', dimensao: 'canal' },
      { id: 'leads_status', titulo: '{m} por {d}', explicacao: 'Em que etapa estão', metrica: 'leads', dimensao: 'status' },
      { id: 'leads_campanha', titulo: '{m} por {d}', explicacao: 'Campanhas que mais captam', metrica: 'leads', dimensao: 'campanha' },
    ],
    objetivos: [
      { id: 'retorno', rotulo: 'Ver o retorno do investimento', secoes: ['roas_canal', 'cpa_campanha', 'receita_tempo', 'inv_canal', 'leads_canal', 'leads_status'] },
      { id: 'canais', rotulo: 'Comparar canais e campanhas', secoes: ['inv_canal', 'conv_campanha', 'roas_canal', 'leads_canal', 'leads_campanha'] },
      { id: 'leads', rotulo: 'Acompanhar os leads', secoes: ['leads_tempo', 'leads_canal', 'leads_status', 'leads_campanha', 'conv_campanha'], kpis: ['leads', 'qualificados', 'conversoes', 'investimento'] },
    ],
    insights: ['roas_canal', 'receita_tempo', 'leads_canal', 'leads_tempo'],
    perguntas: ['{m:roas} por {d:canal}', '{m:conversoes} por {d:campanha}', '{m:receita} {tempo}', '{m:leads} por {d:canal}', '{m:leads} {tempo}'],
  },
  atendimento: {
    tema: 'atendimento',
    essenciais: [['data'], ['prioridade']],
    papeis: ['chamado', 'data', 'prioridade', 'categoria', 'agente', 'status', 'tempo_resposta', 'satisfacao', 'custo'],
    metricas: [
      { id: 'chamados', rotulo: 'Chamados', descricao: 'Chamados diferentes', formato: 'int', sinonimos: ['chamados', 'tickets', 'quantos chamados', 'atendimentos'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {chamado})' }, { sql: 'COUNT(*)' }] },
      { id: 'resolvidos', rotulo: '% resolvidos', descricao: 'Parte dos chamados resolvida ou fechada', formato: 'pct', polaridade: 'higher_is_better', sinonimos: ['resolvidos', 'taxa de resolucao'],
        alternativas: [{ sql: `AVG(CASE WHEN ${em('status', ['resolvido', 'fechado', 'sim', 'concluido', 'true'])} THEN 1.0 ELSE 0 END)` }] },
      { id: 'tempo_medio', rotulo: 'Tempo médio de resposta{u:tempo_resposta}', descricao: 'Média do tempo de resposta', formato: 'dec1', polaridade: 'lower_is_better', sinonimos: ['tempo medio', 'tempo de resposta', 'sla'],
        alternativas: [{ sql: 'AVG({tempo_resposta})' }] },
      { id: 'csat', rotulo: 'Satisfação média', descricao: 'Média da nota de satisfação', formato: 'dec1', polaridade: 'higher_is_better', sinonimos: ['satisfacao', 'csat', 'nota media'],
        alternativas: [{ sql: 'AVG({satisfacao})' }] },
      soma('custo', 'Custo total', 'custo', 'brl', 'Soma do custo dos atendimentos', 'lower_is_better', ['custo', 'custo total']),
    ],
    kpis: ['chamados', 'resolvidos', 'tempo_medio', 'csat', 'custo'],
    secoes: [
      { id: 'chamados_tempo', titulo: '{m} mês a mês', explicacao: 'Volume ao longo do tempo', metrica: 'chamados', dimensao: 'tempo' },
      { id: 'chamados_prioridade', titulo: '{m} por {d}', explicacao: 'Quanto é urgente', metrica: 'chamados', dimensao: 'prioridade' },
      { id: 'chamados_categoria', titulo: '{m} por {d}', explicacao: 'Os assuntos mais comuns', metrica: 'chamados', dimensao: 'categoria' },
      { id: 'tempo_prioridade', titulo: '{m} por {d}', explicacao: 'Urgentes são atendidos antes?', metrica: 'tempo_medio', dimensao: 'prioridade' },
      { id: 'tempo_agente', titulo: '{m} por {d}', explicacao: 'Rapidez de cada atendente', metrica: 'tempo_medio', dimensao: 'agente', interno: true },
      { id: 'csat_agente', titulo: '{m} por {d}', explicacao: 'Satisfação por atendente', metrica: 'csat', dimensao: 'agente', interno: true },
      { id: 'csat_categoria', titulo: '{m} por {d}', explicacao: 'Assuntos que mais incomodam', metrica: 'csat', dimensao: 'categoria' },
    ],
    objetivos: [
      { id: 'volume', rotulo: 'Entender o volume de chamados', secoes: ['chamados_tempo', 'chamados_categoria', 'chamados_prioridade', 'tempo_agente', 'csat_categoria'] },
      { id: 'tempo', rotulo: 'Reduzir o tempo de resposta', secoes: ['tempo_prioridade', 'tempo_agente', 'chamados_prioridade', 'chamados_tempo'], kpis: ['tempo_medio', 'chamados', 'resolvidos', 'csat'] },
      { id: 'satisfacao', rotulo: 'Melhorar a satisfação', secoes: ['csat_agente', 'csat_categoria', 'tempo_agente', 'chamados_tempo'], kpis: ['csat', 'resolvidos', 'tempo_medio', 'chamados'] },
    ],
    insights: ['chamados_tempo', 'chamados_prioridade', 'chamados_categoria'],
    perguntas: ['{m:chamados} {tempo}', '{m:chamados} por {d:prioridade}', '{m:tempo_medio} por {d:agente}', '{m:csat} por {d:categoria}'],
  },
  educacao: {
    tema: 'educacao',
    essenciais: [['nota']],
    papeis: ['aluno', 'turma', 'disciplina', 'nota', 'frequencia', 'faltas', 'status', 'data'],
    metricas: [
      { id: 'alunos', rotulo: 'Alunos', descricao: 'Alunos diferentes', formato: 'int', sinonimos: ['alunos', 'quantos alunos', 'estudantes'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {aluno})' }, { sql: 'COUNT(*)', rotulo: 'Registros' }] },
      { id: 'media', rotulo: 'Nota média', descricao: 'Média das notas', formato: 'dec1', polaridade: 'higher_is_better', sinonimos: ['nota media', 'media', 'media das notas', 'desempenho'], alternativas: [{ sql: 'AVG({nota})' }] },
      { id: 'aprovacao', rotulo: '% aprovados', descricao: 'Parte dos registros marcada como aprovada', formato: 'pct', polaridade: 'higher_is_better', sinonimos: ['aprovacao', 'aprovados', 'taxa de aprovacao'],
        alternativas: [{ sql: `AVG(CASE WHEN ${em('status', ['aprovado', 'sim', 'true'])} THEN 1.0 ELSE 0 END)` }] },
      { id: 'frequencia', rotulo: 'Frequência média', descricao: 'Média da frequência', formato: 'pct', polaridade: 'higher_is_better', sinonimos: ['frequencia', 'presenca', 'frequencia media'],
        alternativas: [{ sql: 'AVG({frequencia})', seTipo: { frequencia: ['porcentagem'] } }, { sql: 'AVG({frequencia}) / 100.0' }] },
      soma('faltas', 'Faltas', 'faltas', 'int', 'Soma das faltas', 'lower_is_better', ['faltas', 'ausencias']),
    ],
    kpis: ['alunos', 'media', 'aprovacao', 'frequencia', 'faltas'],
    secoes: [
      { id: 'media_turma', titulo: '{m} por {d}', explicacao: 'Desempenho de cada turma', metrica: 'media', dimensao: 'turma' },
      { id: 'media_disciplina', titulo: '{m} por {d}', explicacao: 'Matérias mais difíceis', metrica: 'media', dimensao: 'disciplina' },
      { id: 'aprov_turma', titulo: '{m} por {d}', explicacao: 'Aprovação em cada turma', metrica: 'aprovacao', dimensao: 'turma' },
      { id: 'freq_turma', titulo: '{m} por {d}', explicacao: 'Presença em cada turma', metrica: 'frequencia', dimensao: 'turma' },
      { id: 'faltas_disciplina', titulo: '{m} por {d}', explicacao: 'Onde se falta mais', metrica: 'faltas', dimensao: 'disciplina' },
      { id: 'status', titulo: '{m} por {d}', explicacao: 'Aprovados, recuperação, reprovados', metrica: 'registros', dimensao: 'status' },
      { id: 'media_tempo', titulo: '{m} mês a mês', explicacao: 'Evolução das notas', metrica: 'media', dimensao: 'tempo' },
    ],
    objetivos: [
      { id: 'desempenho', rotulo: 'Acompanhar o desempenho', secoes: ['media_turma', 'media_disciplina', 'aprov_turma', 'media_tempo', 'status'] },
      { id: 'frequencia', rotulo: 'Combater faltas e evasão', secoes: ['freq_turma', 'faltas_disciplina', 'status', 'media_turma'], kpis: ['frequencia', 'faltas', 'alunos', 'aprovacao'] },
      { id: 'aprovacao', rotulo: 'Ver aprovação e recuperação', secoes: ['status', 'aprov_turma', 'media_disciplina', 'media_turma'], kpis: ['aprovacao', 'media', 'alunos', 'frequencia'] },
    ],
    insights: ['media_turma', 'media_disciplina', 'aprov_turma'],
    perguntas: ['{m:media} por {d:turma}', '{m:media} por {d:disciplina}', '{m:frequencia} por {d:turma}', '{m:aprovacao} por {d:turma}'],
  },
  saude: {
    tema: 'saude',
    essenciais: [['data']],
    papeis: ['paciente', 'data', 'especialidade', 'profissional', 'procedimento', 'convenio', 'valor'],
    metricas: [
      { id: 'atendimentos', rotulo: 'Atendimentos', descricao: 'Número de atendimentos (linhas)', formato: 'int', sinonimos: ['atendimentos', 'consultas', 'exames', 'quantos atendimentos'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(*)' }] },
      { id: 'pacientes', rotulo: 'Pacientes', descricao: 'Pacientes diferentes (pelo código do paciente)', formato: 'int', sinonimos: ['pacientes', 'quantos pacientes'], zeroSeVazio: true,
        alternativas: [{ sql: 'COUNT(DISTINCT {paciente})' }] },
      soma('faturamento', 'Faturamento', 'valor', 'brl', 'Soma dos valores', 'higher_is_better', ['faturamento', 'receita', 'valor total']),
      { id: 'valor_medio', rotulo: 'Valor médio por atendimento', descricao: 'Média dos valores', formato: 'brl', sinonimos: ['valor medio', 'ticket medio'], alternativas: [{ sql: 'AVG({valor})' }] },
    ],
    kpis: ['atendimentos', 'pacientes', 'faturamento', 'valor_medio'],
    secoes: [
      { id: 'atend_tempo', titulo: '{m} mês a mês', explicacao: 'Demanda ao longo do tempo', metrica: 'atendimentos', dimensao: 'tempo' },
      { id: 'atend_especialidade', titulo: '{m} por {d}', explicacao: 'Especialidades mais procuradas', metrica: 'atendimentos', dimensao: 'especialidade' },
      { id: 'atend_procedimento', titulo: '{m} por {d}', explicacao: 'Procedimentos mais feitos', metrica: 'atendimentos', dimensao: 'procedimento' },
      { id: 'atend_convenio', titulo: '{m} por {d}', explicacao: 'Quem paga os atendimentos', metrica: 'atendimentos', dimensao: 'convenio' },
      { id: 'fat_convenio', titulo: '{m} por {d}', explicacao: 'Faturamento de cada convênio', metrica: 'faturamento', dimensao: 'convenio', interno: true },
      { id: 'fat_especialidade', titulo: '{m} por {d}', explicacao: 'Faturamento de cada especialidade', metrica: 'faturamento', dimensao: 'especialidade', interno: true },
      { id: 'atend_profissional', titulo: '{m} por {d}', explicacao: 'Carga de cada profissional', metrica: 'atendimentos', dimensao: 'profissional', interno: true },
    ],
    objetivos: [
      { id: 'demanda', rotulo: 'Entender a demanda', secoes: ['atend_tempo', 'atend_especialidade', 'atend_procedimento', 'atend_convenio'] },
      { id: 'faturamento', rotulo: 'Acompanhar o faturamento', secoes: ['fat_convenio', 'fat_especialidade', 'atend_tempo', 'atend_convenio'], kpis: ['faturamento', 'valor_medio', 'atendimentos', 'pacientes'] },
      { id: 'equipe', rotulo: 'Distribuir a equipe', secoes: ['atend_profissional', 'atend_especialidade', 'atend_tempo'] },
    ],
    insights: ['atend_tempo', 'atend_especialidade', 'atend_convenio'],
    perguntas: ['{m:atendimentos} {tempo}', '{m:atendimentos} por {d:especialidade}', '{m:faturamento} por {d:convenio}', '{m:atendimentos} por {d:procedimento}'],
  },
};

/** Validadas na carga: receita quebrada derruba o teste, não o usuário. */
export const RECEITAS: Readonly<Partial<Record<Tema, Receita>>> = Object.fromEntries(
  Object.entries(BRUTAS).map(([tema, bruta]) => [tema, receitaSchema.parse(bruta)]),
);

export const receitaDe = (tema: Tema): Receita | undefined => RECEITAS[tema];
