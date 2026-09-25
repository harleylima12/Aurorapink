/**
 * Camada semântica AUTOMÁTICA (seção 7A, item 5): a configuração das colunas vira
 * 1) o SQL que cria a tabela tipada (texto -> número/data/Sim-Não, dados pessoais mascarados) e
 * 2) um semantic.json no MESMO formato do da Olist, validado pelo MESMO Zod.
 * Daí em diante, dashboard, Camada 0, IA e insights funcionam igual (tudo é guiado pela semântica).
 */
import { normalizar } from '../router/normalizar';
import { semanticaOlist } from '../semantic';
import { carregarSemantica, type Dimensao, type Formato, type Metrica, type Semantica } from '../semantic/schema';
import { ident, literal } from './limpeza';
import { DICAS, palavras, temDica, type ColunaConfig } from './perfil';

// --- Tabela tipada -------------------------------------------------------------------------------------
function numeroSql(c: string, decimal: 'br' | 'us'): string {
  const limpo = `regexp_replace(replace(TRIM(${c}), '−', '-'), '(R\\$|US\\$|\\$|%|\\s)', '', 'g')`;
  const normal = decimal === 'br' ? `replace(replace(${limpo}, '.', ''), ',', '.')` : `replace(${limpo}, ',', '')`;
  return `TRY_CAST(${normal} AS DOUBLE)`;
}

const NOME_PARA_UF: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO',
  maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE',
  piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

/** Expressão SQL que converte a coluna crua (VARCHAR) no tipo escolhido. */
export function expressaoTipada(col: ColunaConfig): string {
  const c = ident(col.id);
  const t = `NULLIF(TRIM(${c}), '')`;
  switch (col.tipo) {
    case 'dinheiro':
    case 'numero':
      return numeroSql(c, col.decimal ?? 'br');
    case 'porcentagem':
      return col.escalaPct === 'fracao' ? numeroSql(c, col.decimal ?? 'br') : `(${numeroSql(c, col.decimal ?? 'br')} / 100.0)`;
    case 'data': {
      const formatos = col.formatosData?.length ? col.formatosData : ['%d/%m/%Y', '%Y-%m-%d'];
      return `CAST(COALESCE(${formatos.map((f) => `TRY_STRPTIME(TRIM(${c}), ${literal(f)})`).join(', ')}) AS DATE)`;
    }
    case 'booleano':
      return (
        `CASE WHEN lower(strip_accents(TRIM(${c}))) IN ('sim','s','true','verdadeiro','v','yes','y','x','ok') THEN 'Sim' ` +
        `WHEN lower(strip_accents(TRIM(${c}))) IN ('nao','n','false','falso','f','no') THEN 'Não' END`
      );
    case 'uf':
      return `CASE lower(strip_accents(TRIM(${c}))) ${Object.entries(NOME_PARA_UF).map(([n, uf]) => `WHEN ${literal(n)} THEN ${literal(uf)}`).join(' ')} ELSE upper(${t}) END`;
    case 'pessoal':
      switch (col.mascara) {
        case 'email':
          return `regexp_replace(${t}, '^(.)[^@]*@', '\\1***@')`;
        case 'cpf':
          return `'***.***.***-' || right(${t}, 2)`;
        case 'cnpj':
          return `'**.***.***/****-' || right(${t}, 2)`;
        case 'telefone':
          return `'(**) *****-' || right(${t}, 4)`;
        default:
          // Nome: primeiro nome + inicial do último sobrenome ("Yasmin S.").
          return `regexp_replace(${t}, '^(\\S+)(\\s.*)?\\s(\\S)\\S*$', '\\1 \\3.')`;
      }
    default:
      return t;
  }
}

export function sqlTabelaTipada(crua: string, tipada: string, colunas: readonly ColunaConfig[]): string {
  const selecao = ['CAST(rowid AS BIGINT) + 1 AS linha_planilha', ...colunas.map((c) => `${expressaoTipada(c)} AS ${ident(c.id)}`)];
  return `CREATE OR REPLACE TABLE ${ident(tipada)} AS SELECT ${selecao.join(',\n  ')}\nFROM ${ident(crua)}`;
}

// --- Semântica -----------------------------------------------------------------------------------------
/** Dicionário PT-BR de termos de negócio: quem tem uma palavra do grupo ganha as outras como sinônimo. */
export const GRUPOS_SINONIMOS: readonly string[][] = [
  ['valor', 'receita', 'venda', 'vendas', 'faturamento', 'faturou', 'vendeu', 'total vendido'],
  ['qtd', 'quantidade', 'unidades', 'itens', 'volume', 'quantos'],
  ['cliente', 'clientes', 'comprador', 'compradores', 'consumidor'],
  ['vendedor', 'vendedores', 'representante', 'consultor', 'atendente'],
  ['funcionario', 'funcionarios', 'colaborador', 'colaboradores', 'empregado', 'pessoas'],
  ['salario', 'salarios', 'remuneracao', 'folha', 'pagamento'],
  ['custo', 'custos', 'gasto', 'gastos', 'despesa', 'despesas'],
  ['preco', 'precos', 'valor unitario', 'preco unitario'],
  ['estoque', 'saldo', 'inventario'],
  ['departamento', 'setor', 'area', 'time'],
  ['produto', 'produtos', 'item', 'mercadoria', 'artigo'],
  ['categoria', 'categorias', 'tipo', 'segmento', 'grupo', 'linha'],
  ['uf', 'estado', 'estados'],
  ['cidade', 'cidades', 'municipio'],
  ['fornecedor', 'fornecedores', 'parceiro'],
  ['desconto', 'descontos', 'abatimento'],
  ['avaliacao', 'nota', 'score', 'satisfacao'],
];

export function sinonimos(rotulo: string): string[] {
  const p = palavras(rotulo);
  const texto = p.join(' ');
  const saida = new Set<string>([normalizar(rotulo)]);
  for (const grupo of GRUPOS_SINONIMOS) if (grupo.some((g) => (g.includes(' ') ? texto.includes(g) : p.includes(g)))) grupo.forEach((g) => saida.add(g));
  return [...saida].filter((s) => s.length > 1);
}

function polaridade(rotulo: string): Metrica['polarity'] {
  const p = palavras(rotulo);
  if (temDica(p, ['despesa', 'custo', 'gasto', 'gastos', 'atraso', 'cancelamento', 'devolucao', 'falta', 'faltas', 'reclamacao'])) return 'lower_is_better';
  if (temDica(p, ['valor', 'receita', 'venda', 'vendas', 'faturamento', 'lucro', 'avaliacao', 'nota', 'satisfacao', 'margem'])) return 'higher_is_better';
  return 'neutral';
}

/** "Cliente ID" -> "Cliente"; "Nº Pedido" -> "Pedido". */
export function rotuloSemId(rotulo: string): string {
  const limpo = rotulo
    .replace(/_/g, ' ')
    .replace(/(^|\s)n\s?[º°]\s*/gi, ' ')
    .replace(/\b(id|cod\.?|c[oó]digo|n[uú]mero|num\.?)\b/gi, ' ')
    .replace(/[_\s]+/g, ' ')
    .replace(/^\s*(d[oae]s?)\s+/i, '')
    .trim();
  return limpo || rotulo;
}

export interface InfoTabela {
  nome: string;
  tabela: string;
  linhas: number;
  /** Menor e maior data da coluna de tempo (AAAA-MM-DD), se houver. */
  periodo?: { de: string; ate: string };
}

export function idsDeMetrica(c: ColunaConfig): string {
  if (c.agregacao === 'contagem_distinta') return `distintos_${c.id}`;
  if (c.agregacao === 'media') return `media_${c.id}`;
  return `soma_${c.id}`;
}

export function montarSemantica(colunas: readonly ColunaConfig[], info: InfoTabela): Semantica {
  const metricas: Record<string, Metrica> = {
    registros: {
      label: 'Registros',
      sql: 'COUNT(*)',
      format: 'int',
      grain: 'item',
      empty_is_zero: true,
      polarity: 'neutral',
      synonyms: ['linhas', 'registros', 'quantidade de registros', 'total de linhas', 'quantos registros', 'contagem'],
      description: 'Número de linhas da planilha (depois da limpeza)',
    },
  };
  for (const c of colunas.filter((x) => x.papel === 'metrica')) {
    const col = ident(c.id);
    const id = idsDeMetrica(c);
    const formato: Formato = c.agregacao === 'contagem_distinta' ? 'int' : c.tipo === 'dinheiro' ? 'brl' : c.tipo === 'porcentagem' ? 'pct' : c.inteiro && c.agregacao === 'soma' ? 'int' : 'dec2';
    if (c.agregacao === 'contagem_distinta') {
      const nome = rotuloSemId(c.rotulo);
      metricas[id] = {
        label: `${nome} (distintos)`,
        sql: `COUNT(DISTINCT ${col})`,
        format: 'int',
        grain: 'item',
        empty_is_zero: true,
        polarity: 'neutral',
        synonyms: [...sinonimos(nome), `quantos ${normalizar(nome)}`, `numero de ${normalizar(nome)}`],
        description: `Quantos valores diferentes de "${c.rotulo}"`,
      };
    } else if (c.agregacao === 'media') {
      metricas[id] = {
        label: `Média de ${c.rotulo}`,
        sql: `AVG(${col})`,
        format: formato,
        grain: 'item',
        empty_is_zero: false,
        polarity: polaridade(c.rotulo),
        synonyms: [...sinonimos(c.rotulo).map((s) => `${s} medio`), ...sinonimos(c.rotulo).map((s) => `media de ${s}`), ...sinonimos(c.rotulo)],
        description: `Média da coluna "${c.rotulo}"`,
      };
    } else {
      metricas[id] = {
        label: c.rotulo,
        sql: `SUM(${col})`,
        format: formato,
        grain: 'item',
        empty_is_zero: true,
        polarity: polaridade(c.rotulo),
        synonyms: [...sinonimos(c.rotulo), `total de ${normalizar(c.rotulo)}`, `soma de ${normalizar(c.rotulo)}`],
        description: `Soma da coluna "${c.rotulo}"`,
      };
      // Dinheiro também ganha a média (ticket médio, salário médio).
      if (c.tipo === 'dinheiro') {
        metricas[`media_${c.id}`] = {
          label: `Média de ${c.rotulo}`,
          sql: `AVG(${col})`,
          format: 'brl',
          grain: 'item',
          empty_is_zero: false,
          polarity: polaridade(c.rotulo),
          synonyms: sinonimos(c.rotulo).flatMap((s) => [`${s} medio`, `media de ${s}`]),
          description: `Média da coluna "${c.rotulo}" por linha`,
        };
      }
    }
  }

  const dimensoes: Record<string, Dimensao> = {};
  const tempo = colunas.find((c) => c.papel === 'tempo');
  if (tempo) {
    dimensoes.tempo = {
      type: 'tempo',
      label: tempo.rotulo,
      column: tempo.id,
      grains: ['dia', 'semana', 'mes', 'trimestre', 'ano'],
      default_grain: 'mes',
      synonyms: ['mês a mês', 'ao longo do tempo', 'por mês', 'evolução', 'data', 'período', normalizar(tempo.rotulo)],
    };
  }
  const aliasesUf = semanticaOlist.dimensions.estado_cliente?.type === 'categoria' ? semanticaOlist.dimensions.estado_cliente.value_aliases : undefined;
  for (const c of colunas.filter((x) => x.papel === 'dimensao')) {
    const id = c.id === 'tempo' || metricas[c.id] ? `${c.id}_dim` : c.id;
    dimensoes[id] = {
      type: 'categoria',
      label: c.rotulo,
      column: c.id,
      synonyms: [...new Set([...sinonimos(c.rotulo), ...(c.tipo === 'uf' ? ['uf', 'estado', 'estados'] : [])])],
      ...(c.tipo === 'uf' && aliasesUf ? { value_aliases: aliasesUf } : {}),
      ...(c.tipo === 'booleano' ? { order: ['Sim', 'Não'] } : {}),
    };
  }

  const nomeLimpo = info.nome.replace(/\.[a-z0-9]+$/i, '');
  const descricaoMetricas = Object.values(metricas).slice(1, 4).map((m) => m.label.toLowerCase());
  return carregarSemantica({
    version: 1,
    dataset: {
      id: 'planilha',
      name: nomeLimpo,
      description: `planilha "${nomeLimpo}" com ${info.linhas} linhas${descricaoMetricas.length ? ` (${descricaoMetricas.join(', ')})` : ''}`,
      table: info.tabela,
      order_key: 'linha_planilha',
      order_columns: [],
      ...(tempo ? { time_column: tempo.id } : {}),
      source: 'planilha enviada pelo usuário (processada só no navegador)',
    },
    metrics: metricas,
    dimensions: dimensoes,
    defaults: { periodo: info.periodo ?? { de: '2000-01-01', ate: '2000-01-01' }, limit: 10 },
    out_of_scope_hints: {},
  });
}

/** Colunas que nunca vão para o catálogo da IA (P6 + privacidade): texto livre e dados pessoais. */
export const foraDoCatalogo = (c: ColunaConfig) => c.tipo === 'texto' || c.tipo === 'pessoal';

export { DICAS };
