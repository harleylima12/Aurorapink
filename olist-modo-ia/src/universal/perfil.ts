/**
 * Perfil das colunas (seção 7A, item 4). Função pura: nome da coluna + amostra dos valores + contagens.
 *
 * Ordem das regras (a primeira que "pega" decide):
 *   dado pessoal (e-mail, CPF/CNPJ, telefone, nome de pessoa) -> booleano -> data -> porcentagem
 *   -> número (dinheiro / id / número) -> UF -> cidade -> texto livre -> id -> categoria -> texto.
 * Cada regra exige que a MAIORIA da amostra concorde (não um valor só), e o motivo fica registrado para a
 * tela "Entendi assim", onde tudo pode ser corrigido.
 */
import { normalizar } from '../router/normalizar';

export const TIPOS_COLUNA = ['data', 'dinheiro', 'numero', 'porcentagem', 'categoria', 'uf', 'cidade', 'booleano', 'id', 'texto', 'pessoal'] as const;
export type TipoColuna = (typeof TIPOS_COLUNA)[number];

export const ROTULO_TIPO: Record<TipoColuna, string> = {
  data: 'Data',
  dinheiro: 'Dinheiro (R$)',
  numero: 'Número',
  porcentagem: 'Porcentagem',
  categoria: 'Categoria',
  uf: 'UF (estado)',
  cidade: 'Cidade',
  booleano: 'Sim/Não',
  id: 'Identificador',
  texto: 'Texto livre',
  pessoal: 'Dado pessoal',
};

export type Mascara = 'email' | 'cpf' | 'cnpj' | 'telefone' | 'nome';

export interface EstatisticaColuna {
  id: string;
  original: string;
  /** Linhas da tabela (já limpa). */
  linhas: number;
  /** Células não vazias. */
  preenchidas: number;
  distintos: number;
  /** Até ~500 valores não vazios, sem espaços nas pontas. */
  amostra: readonly string[];
}

export interface PerfilColuna {
  id: string;
  original: string;
  tipo: TipoColuna;
  /** Por que o app achou isso (aparece na tela "Entendi assim"). */
  motivo: string;
  /** Números: vírgula decimal (1.234,56) ou ponto (1234.56). */
  decimal?: 'br' | 'us';
  /** Porcentagem: "12,5%" (texto, divide por 100) ou 0,125 (fração). */
  escalaPct?: 'texto' | 'fracao';
  /** Datas: formatos do strptime do DuckDB, na ordem de tentativa. */
  formatosData?: string[];
  mascara?: Mascara;
  /** Números: todos inteiros na amostra (formato sem casas decimais). */
  inteiro?: boolean;
  distintos: number;
  preenchidas: number;
  linhas: number;
}

export const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
const NOMES_UF = new Set(
  ['acre', 'alagoas', 'amapa', 'amazonas', 'bahia', 'ceara', 'distrito federal', 'espirito santo', 'goias', 'maranhao', 'mato grosso', 'mato grosso do sul',
    'minas gerais', 'para', 'paraiba', 'parana', 'pernambuco', 'piaui', 'rio de janeiro', 'rio grande do norte', 'rio grande do sul', 'rondonia', 'roraima',
    'santa catarina', 'sao paulo', 'sergipe', 'tocantins'],
);

const VERDADE = new Set(['sim', 's', 'true', 'verdadeiro', 'v', 'yes', 'y', 'x', 'ok']);
const FALSO = new Set(['nao', 'n', 'false', 'falso', 'f', 'no']);

/** Palavras do NOME da coluna (normalizadas, sem acento). */
export function palavras(original: string): string[] {
  const t = original.replace(/(^|\s)n\s?[º°]\s*/gi, '$1numero ').replace(/%/g, ' % ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return normalizar(t).split(/[^a-z0-9%$]+/).filter(Boolean);
}

export const temDica = (p: string[], dicas: readonly string[]) => dicas.some((d) => (d.includes(' ') ? p.join(' ').includes(d) : p.includes(d)));

export const DICAS = {
  id: ['id', 'cod', 'codigo', 'matricula', 'sku', 'numero', 'num', 'nro', 'protocolo', 'chave', 'ean', 'nf', 'nota fiscal', 'pedido', 'registro', 'code', 'number', 'ticket', 'order'],
  dinheiro: ['valor', 'preco', 'receita', 'despesa', 'custo', 'salario', 'faturamento', 'venda', 'vendas', 'pagamento', 'pago', 'frete', 'total', 'ticket',
    'r$', 'reais', 'saldo', 'orcamento', 'remuneracao', 'comissao', 'lucro', 'margem bruta', 'bonus', 'mensalidade', 'gasto', 'gastos', 'investimento', 'rs',
    'revenue', 'sales', 'amount', 'price', 'cost', 'salary', 'income', 'profit', 'spend', 'value', 'usd', 'brl'],
  pct: ['%', 'pct', 'percentual', 'porcentagem', 'taxa', 'margem', 'desconto', 'share', 'participacao', 'rate', 'percent', 'percentage', 'ratio', 'discount', 'margin'],
  media: ['nota', 'avaliacao', 'idade', 'score', 'indice', 'media', 'satisfacao', 'nps', 'rating', 'estrelas', 'temperatura'],
  texto: ['obs', 'observacao', 'observacoes', 'comentario', 'comentarios', 'descricao', 'anotacao', 'detalhe', 'detalhes', 'mensagem', 'justificativa', 'historico', 'motivo',
    'parecer', 'feedback', 'resumo', 'notes', 'note', 'comment', 'comments', 'description', 'remarks'],
  nome: ['nome', 'cliente', 'colaborador', 'funcionario', 'responsavel', 'pessoa', 'contato', 'paciente', 'aluno', 'titular', 'name', 'customer', 'employee', 'student'],
  cidade: ['cidade', 'municipio', 'localidade', 'city'],
  uf: ['uf', 'estado'],
  data: ['data', 'dt', 'dia', 'mes', 'periodo', 'competencia', 'vencimento', 'admissao', 'cadastro', 'entrada', 'emissao', 'nascimento'],
} as const;

const fracao = (amostra: readonly string[], teste: (v: string) => boolean) => (amostra.length ? amostra.filter(teste).length / amostra.length : 0);

// --- Padrões de valor -------------------------------------------------------------------------------
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const RE_CNPJ = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const RE_TELEFONE = /^(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}$/;
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function pareceNomeDePessoa(v: string): boolean {
  const partes = v.trim().split(/\s+/);
  if (partes.length < 2 || partes.length > 6) return false;
  return partes.every((p) => PARTICULAS.has(p.toLowerCase()) || /^[A-ZÀ-Ý][a-zà-ÿ'’]+\.?$/.test(p) || /^[A-ZÀ-Ý]\.$/.test(p));
}

/** Número em texto: aceita R$, sinal, milhar e decimal nos dois padrões, % no fim. */
const RE_NUMERO = /^[-+−]?\s*(R\$|\$|US\$)?\s*[-+−]?\s*(\d{1,3}([.,\s]\d{3})+|\d+)([.,]\d+)?\s*%?$/i;
export function pareceNumero(v: string): boolean {
  return RE_NUMERO.test(v.trim());
}

/** Vírgula decimal ou ponto? Olha os valores que decidem ("1.234,56", "12,5", "1,234.56", "12.50"). */
export function detectarDecimal(amostra: readonly string[], dicaBr: boolean): 'br' | 'us' {
  let br = 0;
  let us = 0;
  for (const bruto of amostra) {
    const v = bruto.replace(/[^\d.,]/g, '');
    const ultVirgula = v.lastIndexOf(',');
    const ultPonto = v.lastIndexOf('.');
    if (ultVirgula >= 0 && ultPonto >= 0) (ultVirgula > ultPonto ? br++ : us++);
    else if (ultVirgula >= 0) (v.length - ultVirgula - 1 === 3 && /^\d{1,3}(,\d{3})+$/.test(v) ? us++ : br++);
    else if (ultPonto >= 0) (v.length - ultPonto - 1 === 3 && /^\d{1,3}(\.\d{3})+$/.test(v) ? br++ : us++);
  }
  if (br === us) return dicaBr ? 'br' : 'us';
  return br > us ? 'br' : 'us';
}

export function paraNumero(v: string, decimal: 'br' | 'us'): number | null {
  let t = v.trim().replace(/(R\$|US\$|\$|%|\s)/gi, '').replace('−', '-');
  t = decimal === 'br' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : null;
}

// --- Datas -------------------------------------------------------------------------------------------
interface FormatoData {
  re: RegExp;
  strptime: string;
  /** Posição de dia e mês no match (para decidir dd/mm x mm/dd). */
  dm?: [number, number];
}
const FORMATOS: FormatoData[] = [
  { re: /^(\d{4})-(\d{2})-(\d{2})$/, strptime: '%Y-%m-%d' },
  { re: /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/, strptime: '%Y-%m-%d %H:%M:%S' },
  { re: /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/, strptime: '%Y-%m-%d %H:%M' },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, strptime: '%d/%m/%Y', dm: [1, 2] },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/, strptime: '%d/%m/%Y %H:%M:%S', dm: [1, 2] },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/, strptime: '%d/%m/%Y %H:%M', dm: [1, 2] },
  { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, strptime: '%d-%m-%Y', dm: [1, 2] },
  { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, strptime: '%d.%m.%Y', dm: [1, 2] },
  { re: /^(\d{1,2})\/(\d{4})$/, strptime: '%m/%Y' },
  { re: /^(\d{4})\/(\d{2})\/(\d{2})$/, strptime: '%Y/%m/%d' },
];

export function detectarFormatosData(amostra: readonly string[]): { formatos: string[]; fracao: number } {
  const usados = new Map<string, number>();
  let casaram = 0;
  let mesPrimeiro = 0;
  for (const v of amostra) {
    const f = FORMATOS.find((x) => x.re.test(v.trim()));
    if (!f) continue;
    casaram++;
    usados.set(f.strptime, (usados.get(f.strptime) ?? 0) + 1);
    if (f.dm) {
      const m = f.re.exec(v.trim());
      const a = Number(m?.[f.dm[0]]);
      const b = Number(m?.[f.dm[1]]);
      if (b > 12 && a <= 12) mesPrimeiro++;
      if (a > 12 && b <= 12) mesPrimeiro -= 1000; // prova de dd/mm
    }
  }
  let formatos = [...usados].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  // Padrão brasileiro: dd/mm. Só vira mm/dd se algum valor provar (segundo número > 12) e nenhum desmentir.
  if (mesPrimeiro > 0) formatos = formatos.map((f) => f.replace('%d/%m', '%m/%d').replace('%d-%m', '%m-%d').replace('%d.%m', '%m.%d'));
  return { formatos, fracao: amostra.length ? casaram / amostra.length : 0 };
}

// --- Classificação --------------------------------------------------------------------------------------
export interface Contexto {
  /** Separador ";" costuma vir com vírgula decimal (Excel brasileiro). */
  separador?: string;
}

export function classificarColuna(e: EstatisticaColuna, ctx: Contexto = {}): PerfilColuna {
  const base = { id: e.id, original: e.original, distintos: e.distintos, preenchidas: e.preenchidas, linhas: e.linhas };
  const p = palavras(e.original);
  const a = e.amostra.map((v) => v.trim()).filter(Boolean);
  const razaoDistintos = e.preenchidas ? e.distintos / e.preenchidas : 0;
  const r = (tipo: TipoColuna, motivo: string, extra: Partial<PerfilColuna> = {}): PerfilColuna => ({ ...base, tipo, motivo, ...extra });

  if (!a.length) return r('texto', 'coluna vazia');

  // 1. Dados pessoais: mascarados e fora do catálogo da IA.
  if (fracao(a, (v) => RE_EMAIL.test(v)) >= 0.8) return r('pessoal', 'valores são e-mails', { mascara: 'email' });
  if (fracao(a, (v) => RE_CPF.test(v)) >= 0.8 && (temDica(p, ['cpf']) || fracao(a, (v) => v.includes('.') || v.includes('-')) >= 0.8)) {
    return r('pessoal', 'valores no formato de CPF', { mascara: 'cpf' });
  }
  if (fracao(a, (v) => RE_CNPJ.test(v)) >= 0.8) return r('pessoal', 'valores no formato de CNPJ', { mascara: 'cnpj' });
  if (fracao(a, (v) => RE_TELEFONE.test(v)) >= 0.8 && (temDica(p, ['telefone', 'tel', 'celular', 'fone', 'whatsapp', 'contato']) || fracao(a, (v) => /[()\-\s]/.test(v)) >= 0.8)) {
    return r('pessoal', 'valores no formato de telefone', { mascara: 'telefone' });
  }
  if (!temDica(p, DICAS.id) && fracao(a, pareceNomeDePessoa) >= 0.8 && (temDica(p, DICAS.nome) || razaoDistintos > 0.5) && (razaoDistintos > 0.2 || e.distintos > 50)) {
    return r('pessoal', 'parecem nomes de pessoas, quase todos diferentes', { mascara: 'nome' });
  }

  // 2. Sim/Não.
  const normalizados = a.map((v) => normalizar(v));
  const distintosNorm = new Set(normalizados);
  if (distintosNorm.size <= 6 && [...distintosNorm].every((v) => VERDADE.has(v) || FALSO.has(v)) && [...distintosNorm].some((v) => VERDADE.has(v)) && !(distintosNorm.size === 1 && e.distintos < 2)) {
    return r('booleano', `valores só do tipo sim/não (${[...new Set(a)].slice(0, 4).join(', ')})`);
  }

  // 3. Data.
  const datas = detectarFormatosData(a);
  if (datas.fracao >= 0.9) return r('data', `valores de data (${datas.formatos.join(', ').replace(/%/g, '')})`, { formatosData: datas.formatos });

  // 4. Números (porcentagem, dinheiro, id, número).
  const fracNumero = fracao(a, pareceNumero);
  if (fracNumero >= 0.9) {
    const decimal = detectarDecimal(a, ctx.separador === ';');
    const comPct = fracao(a, (v) => v.endsWith('%'));
    if (comPct >= 0.8) return r('porcentagem', 'valores terminam com %', { decimal, escalaPct: 'texto' });
    const numeros = a.map((v) => paraNumero(v, decimal)).filter((n): n is number => n !== null);
    const inteiros = numeros.every((n) => Number.isInteger(n));
    if (temDica(p, DICAS.pct) && !temDica(p, DICAS.dinheiro) && numeros.every((n) => Math.abs(n) <= 1.5)) {
      return r('porcentagem', 'nome de porcentagem e valores entre 0 e 1', { decimal, escalaPct: 'fracao' });
    }
    const comMoeda = fracao(a, (v) => /R\$|\$/.test(v));
    if (comMoeda >= 0.5) return r('dinheiro', 'valores com R$', { decimal });
    if (temDica(p, DICAS.id) && inteiros && (razaoDistintos > 0.5 || temDica(p, ['id', 'codigo', 'cod', 'matricula', 'sku']))) {
      return r('id', 'nome de identificador e números inteiros sem repetição', { decimal });
    }
    if (temDica(p, DICAS.dinheiro) && !temDica(p, ['qtd', 'quantidade', 'quantidades', 'unidades', 'itens', 'horas'])) {
      return r('dinheiro', 'nome de valor em dinheiro', { decimal });
    }
    return r('numero', inteiros ? 'números inteiros' : 'números com casas decimais', { decimal, inteiro: inteiros });
  }

  // 5. Texto: UF, cidade, texto livre, id, categoria.
  if (fracao(a, (v) => UFS.has(v.toUpperCase()) || NOMES_UF.has(normalizar(v))) >= 0.9) return r('uf', 'valores são siglas ou nomes de UF');
  if (temDica(p, DICAS.cidade)) return r('cidade', 'nome de coluna de cidade');
  const tamanhoMedio = a.reduce((s, v) => s + v.length, 0) / a.length;
  if (temDica(p, DICAS.texto) || tamanhoMedio > 60) return r('texto', temDica(p, DICAS.texto) ? 'nome de campo de texto livre' : 'textos longos');
  // Frases (4+ palavras terminando em pontuação) são comentário, mesmo que se repitam.
  if (fracao(a, (v) => v.split(/\s+/).length >= 4 && /[.!?]$/.test(v)) >= 0.6) return r('texto', 'valores são frases');
  const pareceCodigo = fracao(a, (v) => /^[A-Z0-9]{0,6}[-_./]?[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(v) && !/\s/.test(v)) >= 0.9;
  if ((temDica(p, DICAS.id) && (pareceCodigo || razaoDistintos > 0.5)) || (pareceCodigo && razaoDistintos > 0.9)) {
    return r('id', temDica(p, DICAS.id) ? 'nome de identificador' : 'códigos quase todos diferentes');
  }
  if (e.distintos >= 2 && e.distintos <= 200 && (razaoDistintos <= 0.5 || e.distintos <= 12)) return r('categoria', `${e.distintos} valores diferentes que se repetem`);
  if (razaoDistintos > 0.9) return r('texto', 'quase todos os valores são diferentes');
  return r('categoria', `${e.distintos} valores diferentes`);
}

// --- Papel no dashboard -------------------------------------------------------------------------------
export type Papel = 'metrica' | 'dimensao' | 'tempo' | 'ignorar';
export type Agregacao = 'soma' | 'media' | 'contagem_distinta';

export interface ColunaConfig {
  id: string;
  original: string;
  rotulo: string;
  tipo: TipoColuna;
  papel: Papel;
  agregacao?: Agregacao;
  decimal?: 'br' | 'us';
  escalaPct?: 'texto' | 'fracao';
  formatosData?: string[];
  mascara?: Mascara;
  inteiro?: boolean;
}

/** Papel e agregação padrão de cada tipo (o usuário muda na tela "Entendi assim"). */
export function configPadrao(perfis: readonly PerfilColuna[]): ColunaConfig[] {
  // Uma data só vira o eixo do tempo: a com nome mais "de evento" (venda, pedido, compra) ganha.
  const datas = perfis.filter((x) => x.tipo === 'data');
  const nota = (x: PerfilColuna) => {
    const p = palavras(x.original);
    return (temDica(p, ['venda', 'pedido', 'compra', 'emissao', 'data', 'dt', 'mes', 'competencia', 'periodo']) ? 2 : 0) - (temDica(p, ['cadastro', 'nascimento', 'admissao', 'atualizacao']) ? 1 : 0) + x.preenchidas / Math.max(1, x.linhas);
  };
  const tempo = [...datas].sort((a, b) => nota(b) - nota(a))[0];
  return perfis.map((x): ColunaConfig => {
    const comum = { id: x.id, original: x.original, rotulo: x.original, tipo: x.tipo, decimal: x.decimal, escalaPct: x.escalaPct, formatosData: x.formatosData, mascara: x.mascara, inteiro: x.inteiro };
    switch (x.tipo) {
      case 'data':
        return { ...comum, papel: x === tempo ? 'tempo' : 'ignorar' };
      case 'dinheiro':
        return { ...comum, papel: 'metrica', agregacao: 'soma' };
      case 'numero':
        return { ...comum, papel: 'metrica', agregacao: temDica(palavras(x.original), DICAS.media) ? 'media' : 'soma' };
      case 'porcentagem':
        return { ...comum, papel: 'metrica', agregacao: 'media' };
      case 'id':
        // Id que se repete (cliente, vendedor) vira "quantos distintos"; id único por linha = contagem de linhas.
        return { ...comum, papel: x.distintos < x.preenchidas * 0.98 ? 'metrica' : 'ignorar', agregacao: 'contagem_distinta' };
      case 'categoria':
      case 'uf':
      case 'cidade':
      case 'booleano':
        return { ...comum, papel: x.distintos >= 2 ? 'dimensao' : 'ignorar' };
      default:
        return { ...comum, papel: 'ignorar' };
    }
  });
}
