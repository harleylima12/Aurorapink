/**
 * Pipeline do Modo Universal: arquivo -> texto (codificação) -> plano de leitura -> DuckDB (tabela crua,
 * tudo VARCHAR) -> limpeza -> perfil das colunas -> [tela "Entendi assim"] -> tabela tipada -> semântica.
 *
 * Recebe o banco por uma interface: no navegador é o DuckDB-WASM do app (no worker); nos testes, o
 * mesmo DuckDB-WASM rodando no Node. Nada sai do computador.
 */
import type { Linha } from '../data/duckdb';
import type { Semantica } from '../semantic/schema';
import { ErroPlanilha } from './erros';
import { lerExcelComoCsv } from './excel';
import { decodificar, planejarLeitura, type AvisoLeitura, type Codificacao } from './leitor';
import {
  colunasBrutas,
  descreverRelatorio,
  ident,
  literal,
  sqlContagemLimpeza,
  sqlLimpar,
  sqlTabelaCrua,
  type ColunaBruta,
  type RelatorioLimpeza,
} from './limpeza';
import { classificarColuna, configPadrao, type ColunaConfig, type PerfilColuna } from './perfil';
import { montarSemantica, sqlTabelaTipada } from './semanticaAuto';

export interface BancoUniversal {
  registrarArquivo(nome: string, bytes: Uint8Array): Promise<void>;
  /** Sem cache: a planilha pode ser trocada a qualquer momento. */
  executar(sql: string): Promise<Linha[]>;
  /** A extensão parquet está carregada (caminho final de dados, D15)? */
  leParquet: boolean;
}

export interface ArquivoPlanilha {
  nome: string;
  bytes: Uint8Array;
}

export type TipoArquivo = 'csv' | 'excel' | 'parquet';

export function tipoDoArquivo(nome: string): TipoArquivo | null {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (['csv', 'tsv', 'txt'].includes(ext)) return 'csv';
  if (['xlsx', 'xlsm', 'xls', 'ods'].includes(ext)) return 'excel';
  if (ext === 'parquet') return 'parquet';
  return null;
}

export { ErroPlanilha };

export interface LeituraPlanilha {
  nome: string;
  tipo: TipoArquivo;
  /** Prefixo único desta planilha no banco (tabelas <prefixo>_crua e <prefixo>). */
  prefixo: string;
  tabelaCrua: string;
  colunas: ColunaBruta[];
  perfis: PerfilColuna[];
  relatorio: RelatorioLimpeza;
  resumo: string[];
  avisos: AvisoLeitura[];
  linhas: number;
  bytes: number;
  /** Primeiras linhas (cruas) para a prévia da tela "Entendi assim". */
  previa: Linha[];
  aba?: string;
  ms: number;
}

/** Limite de segurança (medido no BENCHMARK): acima disso o navegador pode ficar sem memória. */
export const LIMITE_BYTES = 300 * 1024 * 1024;

const numero = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

async function perfilar(banco: BancoUniversal, tabela: string, colunas: ColunaBruta[], separador: string | undefined): Promise<{ perfis: PerfilColuna[]; linhas: number }> {
  if (!colunas.length) return { perfis: [], linhas: 0 };
  const [contagens] = await banco.executar(
    `SELECT COUNT(*) AS linhas, ${colunas.map((c) => `COUNT(NULLIF(TRIM(${ident(c.id)}), '')) AS ${ident(`p_${c.id}`)}, COUNT(DISTINCT NULLIF(TRIM(${ident(c.id)}), '')) AS ${ident(`d_${c.id}`)}`).join(', ')} FROM ${ident(tabela)}`,
  );
  const linhas = numero(contagens?.linhas);
  // Amostra aleatória, mas repetível (semente fixa): planilha ordenada não engana o perfil.
  const amostra = await banco.executar(`SELECT * FROM ${ident(tabela)} USING SAMPLE reservoir(600 ROWS) REPEATABLE (42)`);
  const perfis = colunas.map((c) =>
    classificarColuna(
      {
        id: c.id,
        original: c.original,
        linhas,
        preenchidas: numero(contagens?.[`p_${c.id}`]),
        distintos: numero(contagens?.[`d_${c.id}`]),
        amostra: amostra.map((l) => l[c.id]).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()),
      },
      { separador },
    ),
  );
  return { perfis, linhas };
}

let sequencia = 0;
let versaoTipada = 0;

export async function lerPlanilha(arquivo: ArquivoPlanilha, banco: BancoUniversal): Promise<LeituraPlanilha> {
  const t0 = performance.now();
  const tipo = tipoDoArquivo(arquivo.nome);
  if (!tipo) throw new ErroPlanilha(`Não sei ler "${arquivo.nome}".`, 'Use CSV, Excel (.xlsx) ou Parquet.');
  if (arquivo.bytes.length > LIMITE_BYTES) {
    throw new ErroPlanilha(
      `"${arquivo.nome}" tem ${Math.round(arquivo.bytes.length / 2 ** 20)} MB: grande demais para abrir com segurança no navegador.`,
      'Filtre um período menor ou tire colunas que não usa, e tente de novo.',
    );
  }
  const prefixo = `u${Date.now().toString(36)}${(sequencia++).toString(36)}`;
  const tabelaCrua = `${prefixo}_crua`;

  if (tipo === 'parquet') {
    if (!banco.leParquet) {
      throw new ErroPlanilha('Ler Parquet precisa da extensão parquet do DuckDB, que ainda não foi baixada neste app.', 'Rode `npm run baixar-extensoes` (D15) ou salve como CSV.');
    }
    await banco.registrarArquivo(`${prefixo}.parquet`, arquivo.bytes);
    const esquema = await banco.executar(`DESCRIBE SELECT * FROM read_parquet(${literal(`${prefixo}.parquet`)})`);
    const colunas = colunasBrutas(esquema.map((l) => String(l.column_name)));
    const selecao = esquema.map((l, i) => `CAST(${ident(String(l.column_name))} AS VARCHAR) AS ${ident(colunas[i]?.id ?? `c${i}`)}`);
    await banco.executar(`CREATE OR REPLACE TABLE ${ident(tabelaCrua)} AS SELECT ${selecao.join(', ')} FROM read_parquet(${literal(`${prefixo}.parquet`)})`);
    const { perfis, linhas } = await perfilar(banco, tabelaCrua, colunas, undefined);
    const relatorio: RelatorioLimpeza = { linhasTitulo: 0, linhasVazias: 0, linhasTotal: 0, colunasVazias: [], nomesCorrigidos: [], codificacao: 'utf-8', separador: '' };
    const previa = await banco.executar(`SELECT * FROM ${ident(tabelaCrua)} LIMIT 5`);
    return { nome: arquivo.nome, tipo, prefixo, tabelaCrua, colunas, perfis, relatorio, resumo: ['Parquet: tipos lidos do próprio arquivo.'], avisos: [], linhas, bytes: arquivo.bytes.length, previa, ms: performance.now() - t0 };
  }

  let texto: string;
  let codificacao: Codificacao;
  let aba: string | undefined;
  let abas: string[] = [];
  if (tipo === 'excel') {
    const excel = await lerExcelComoCsv(arquivo.bytes);
    texto = excel.csv;
    codificacao = 'utf-8';
    aba = excel.aba;
    abas = excel.abas;
  } else {
    ({ texto, codificacao } = decodificar(arquivo.bytes));
  }
  const plano = planejarLeitura(texto, codificacao);
  const colunas = colunasBrutas(plano.cabecalho.nomes);
  if (!colunas.length) throw new ErroPlanilha(`Não achei nenhuma coluna em "${arquivo.nome}".`, 'Confira se o arquivo não está vazio.');

  // O DuckDB lê UTF-8: o que veio em Latin-1 (ou do Excel) é regravado em UTF-8.
  const bytesUtf8 = codificacao === 'utf-8' && tipo === 'csv' ? arquivo.bytes : new TextEncoder().encode(texto);
  await banco.registrarArquivo(`${prefixo}.csv`, bytesUtf8);
  await banco.executar(sqlTabelaCrua(tabelaCrua, { arquivo: `${prefixo}.csv`, separador: plano.separador, pular: plano.cabecalho.pular, colunas }));

  const [cont] = await banco.executar(sqlContagemLimpeza(tabelaCrua, colunas));
  await banco.executar(sqlLimpar(tabelaCrua, colunas));
  const vazias = colunas.filter((c) => numero(cont?.[`n_${c.id}`]) === 0);
  const uteis = colunas.filter((c) => !vazias.includes(c));
  const relatorio: RelatorioLimpeza = {
    linhasTitulo: plano.cabecalho.indice,
    linhasVazias: numero(cont?.vazias),
    linhasTotal: numero(cont?.totais),
    colunasVazias: vazias.map((c) => c.original),
    nomesCorrigidos: plano.cabecalho.nomes.map((original, i) => ({ original, id: colunas[i]?.id ?? '' })),
    codificacao,
    separador: plano.separador,
  };
  const { perfis, linhas } = await perfilar(banco, tabelaCrua, uteis, plano.separador);
  const previa = await banco.executar(`SELECT ${uteis.map((c) => ident(c.id)).join(', ')} FROM ${ident(tabelaCrua)} LIMIT 5`);
  return {
    nome: arquivo.nome,
    tipo,
    prefixo,
    tabelaCrua,
    colunas: uteis,
    perfis,
    relatorio,
    resumo:
      tipo === 'excel'
        ? [`Excel: dados lidos da aba "${aba ?? ''}"${abas.length > 1 ? ` (a com mais células preenchidas, de ${abas.length} abas)` : ''}.`, ...descreverRelatorio(relatorio).slice(1)]
        : descreverRelatorio(relatorio),
    avisos: plano.cabecalho.avisos,
    linhas,
    bytes: arquivo.bytes.length,
    previa,
    aba,
    ms: performance.now() - t0,
  };
}

export interface PlanilhaPronta {
  semantica: Semantica;
  config: ColunaConfig[];
  tabela: string;
  linhas: number;
  periodo?: { de: string; ate: string };
  ms: number;
}

/** Depois da revisão: cria a tabela tipada e a semântica. */
export async function aplicarConfig(leitura: LeituraPlanilha, config: ColunaConfig[], banco: BancoUniversal): Promise<PlanilhaPronta> {
  const t0 = performance.now();
  // Nome novo a cada aplicação: o cache de consultas do motor (por texto do SQL) nunca devolve número velho.
  const tabela = `${leitura.prefixo}_t${(versaoTipada++).toString(36)}`;
  await banco.executar(sqlTabelaTipada(leitura.tabelaCrua, tabela, config));
  const tempo = config.find((c) => c.papel === 'tempo');
  let periodo: { de: string; ate: string } | undefined;
  if (tempo) {
    const [p] = await banco.executar(
      `SELECT strftime(MIN(${ident(tempo.id)}), '%Y-%m-%d') AS de, strftime(MAX(${ident(tempo.id)}), '%Y-%m-%d') AS ate FROM ${ident(tabela)}`,
    );
    if (p?.de && p.ate) periodo = { de: String(p.de), ate: String(p.ate) };
  }
  const semantica = montarSemantica(tempo && !periodo ? config.map((c) => (c === tempo ? { ...c, papel: 'ignorar' as const } : c)) : config, {
    nome: leitura.nome,
    tabela,
    linhas: leitura.linhas,
    periodo,
  });
  return { semantica, config, tabela, linhas: leitura.linhas, periodo, ms: performance.now() - t0 };
}

export { configPadrao };
