/**
 * Vários arquivos (seção 7A item 9 + ajuste 13 da Fase 0): sugerir como as planilhas se ligam.
 *
 * Uma ligação candidata precisa de NOME parecido ("Cliente ID" x id_cliente x cod_cliente x customer_id)
 * OU dos dois lados serem identificadores, e é medida pelos VALORES: % dos ids de um lado que existem do
 * outro, com exemplos dos que não batem. O lado "um" (chave única) vira dimensão do lado "muitos"; se a
 * chave se repete dos dois lados, juntar duplicaria linhas (risco de grão), então o app avisa e não junta.
 */
import type { Linha } from '../data/duckdb';
import { normalizar } from '../router/normalizar';
import type { BancoUniversal, LeituraPlanilha } from './carregar';
import { ident, idDeColuna } from './limpeza';
import { palavras, type ColunaConfig, type PerfilColuna } from './perfil';

const PALAVRAS_DE_CHAVE = new Set(['id', 'cod', 'codigo', 'code', 'numero', 'num', 'nro', 'no', 'key', 'chave', 'do', 'da', 'de']);

/** "Cliente ID" -> "cliente"; "cod_produto" -> "produto"; "customer_id" -> "customer". */
export function chaveDoNome(original: string): string {
  const p = palavras(original.replace(/_/g, ' ')).filter((x) => !PALAVRAS_DE_CHAVE.has(x));
  return p.map((x) => (x.length > 3 && x.endsWith('s') ? x.slice(0, -1) : x)).join(' ');
}

const SETORES: Record<string, string[]> = {
  Vendas: ['venda', 'vendas', 'pedido', 'valor', 'desconto', 'produto', 'faturamento', 'receita', 'order', 'revenue', 'sales'],
  'RH / Pessoas': ['salario', 'colaborador', 'funcionario', 'cargo', 'departamento', 'admissao', 'matricula', 'ferias', 'employee'],
  Estoque: ['sku', 'estoque', 'fornecedor', 'armazem', 'minimo', 'entrada', 'inventario', 'stock'],
  Financeiro: ['despesa', 'centro', 'custo', 'margem', 'receita', 'orcamento', 'lancamento', 'conta'],
  Clientes: ['cliente', 'segmento', 'cadastro', 'email', 'telefone', 'cpf', 'cnpj', 'customer'],
  'Atendimento': ['chamado', 'protocolo', 'prioridade', 'atendente', 'resolvido', 'ticket', 'sla'],
  'Educação': ['aluno', 'turma', 'nota', 'frequencia', 'prova', 'aprovado', 'student'],
};

/** Setor provável pelos nomes das colunas (só para orientar a pessoa; não muda nenhum cálculo). */
export function setorProvavel(perfis: readonly Pick<PerfilColuna, 'original'>[]): string {
  const todas = perfis.flatMap((p) => palavras(p.original));
  const notas = Object.entries(SETORES).map(([setor, chaves]) => [setor, todas.filter((w) => chaves.includes(w)).length] as const);
  const [melhor] = [...notas].sort((a, b) => b[1] - a[1]);
  return melhor && melhor[1] >= 2 ? melhor[0] : 'Geral';
}

export interface Ligacao {
  de: { planilha: number; coluna: string; original: string };
  para: { planilha: number; coluna: string; original: string };
  /** % dos valores distintos de "de" que existem em "para". */
  cobertura: number;
  /** "para" tem cada valor uma vez só (a ligação não duplica linhas de "de"). */
  paraUnico: boolean;
  deUnico: boolean;
  exemplosSemPar: string[];
  motivo: string;
}

const candidata = (p: PerfilColuna) => ['id', 'categoria', 'uf', 'cidade'].includes(p.tipo) && p.distintos > 1;

export async function sugerirLigacoes(planilhas: readonly LeituraPlanilha[], banco: BancoUniversal): Promise<Ligacao[]> {
  const ligacoes: Ligacao[] = [];
  for (let i = 0; i < planilhas.length; i++) {
    for (let j = 0; j < planilhas.length; j++) {
      if (i === j) continue;
      const a = planilhas[i];
      const b = planilhas[j];
      if (!a || !b) continue;
      for (const ca of a.perfis.filter(candidata)) {
        for (const cb of b.perfis.filter(candidata)) {
          const mesmoNome = chaveDoNome(ca.original) !== '' && chaveDoNome(ca.original) === chaveDoNome(cb.original);
          const doisIds = ca.tipo === 'id' && cb.tipo === 'id';
          if (!mesmoNome && !doisIds) continue;
          // Só um sentido por par: de = lado com mais linhas por valor ("muitos").
          if (ca.preenchidas / Math.max(1, ca.distintos) < cb.preenchidas / Math.max(1, cb.distintos)) continue;
          const [r] = await banco.executar(
            `WITH x AS (SELECT DISTINCT TRIM(${ident(ca.id)}) AS v FROM ${ident(a.tabelaCrua)} WHERE NULLIF(TRIM(${ident(ca.id)}), '') IS NOT NULL),
                  y AS (SELECT DISTINCT TRIM(${ident(cb.id)}) AS v FROM ${ident(b.tabelaCrua)} WHERE NULLIF(TRIM(${ident(cb.id)}), '') IS NOT NULL)
             SELECT COUNT(*) AS total, COUNT(y.v) AS achados,
                    (SELECT list(x2.v ORDER BY x2.v)[1:3] FROM x AS x2 LEFT JOIN y AS y2 ON x2.v = y2.v WHERE y2.v IS NULL) AS sem_par
             FROM x LEFT JOIN y ON x.v = y.v`,
          );
          const total = Number(r?.total ?? 0);
          const cobertura = total ? Number(r?.achados ?? 0) / total : 0;
          if (cobertura < (mesmoNome ? 0.2 : 0.6)) continue;
          ligacoes.push({
            de: { planilha: i, coluna: ca.id, original: ca.original },
            para: { planilha: j, coluna: cb.id, original: cb.original },
            cobertura,
            paraUnico: cb.distintos === cb.preenchidas,
            deUnico: ca.distintos === ca.preenchidas,
            exemplosSemPar: listaDeTexto(r?.sem_par),
            motivo: mesmoNome ? `mesmo nome ("${ca.original}" e "${cb.original}")` : 'os dois são identificadores com valores em comum',
          });
        }
      }
    }
  }
  return ligacoes.sort((x, y) => y.cobertura - x.cobertura);
}

function listaDeTexto(v: Linha[string] | undefined): string[] {
  if (v === null || v === undefined) return [];
  const t = String(v);
  // O DuckDB-WASM devolve listas como texto ("[a, b]") depois da normalização do app.
  return t.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

/** Prefixo curto para as colunas da planilha "um" dentro da junção ("clientes" -> clientes_segmento). */
export function prefixoDe(nomeArquivo: string): string {
  return idDeColuna(normalizar(nomeArquivo.replace(/\.[a-z0-9]+$/i, '')), 0).slice(0, 14).replace(/_+$/, '');
}

export interface Juncao {
  sql: string;
  visao: string;
  config: ColunaConfig[];
}

/**
 * Visão "muitos" LEFT JOIN "um": as linhas de "muitos" continuam as mesmas (a chave de "um" é única),
 * e as colunas de "um" entram com prefixo. Recusa se a chave de "um" se repete (duplicaria linhas).
 */
export function montarJuncao(
  muitos: { tabela: string; config: readonly ColunaConfig[] },
  um: { tabela: string; config: readonly ColunaConfig[]; nome: string },
  ligacao: Pick<Ligacao, 'de' | 'para' | 'paraUnico'>,
  visao: string,
): Juncao {
  if (!ligacao.paraUnico) throw new Error(`"${ligacao.para.original}" se repete em ${um.nome}: juntar duplicaria linhas (risco de grão).`);
  const prefixo = prefixoDe(um.nome);
  const deUm = um.config.filter((c) => c.id !== ligacao.para.coluna && c.papel !== 'tempo');
  const selecao = [
    'm.*',
    ...deUm.map((c) => `u.${ident(c.id)} AS ${ident(`${prefixo}_${c.id}`)}`),
  ];
  const sql =
    `CREATE OR REPLACE VIEW ${ident(visao)} AS SELECT ${selecao.join(', ')} FROM ${ident(muitos.tabela)} AS m ` +
    `LEFT JOIN ${ident(um.tabela)} AS u ON TRIM(CAST(m.${ident(ligacao.de.coluna)} AS VARCHAR)) = TRIM(CAST(u.${ident(ligacao.para.coluna)} AS VARCHAR))`;
  const config = [
    ...muitos.config,
    ...deUm.map((c) => ({
      ...c,
      id: `${prefixo}_${c.id}`,
      rotulo: `${c.rotulo} (${um.nome.replace(/\.[a-z0-9]+$/i, '')})`,
      // Métricas de "um" (ex.: limite de crédito do cliente) somadas por linha de "muitos" ficariam infladas.
      papel: c.papel === 'metrica' ? ('ignorar' as const) : c.papel,
    })),
  ];
  return { sql, visao, config };
}
