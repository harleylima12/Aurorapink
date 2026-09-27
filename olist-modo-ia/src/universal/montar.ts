/**
 * Monta o dashboard de um GRUPO de planilhas: a principal + as que se ligam a ela (vários arquivos).
 * Cada uma vira tabela tipada; as ligadas entram por LEFT JOIN numa visão; a semântica é gerada no fim.
 */
import { faixasHistograma } from '../charts/contas';
import { carregarSemantica, type Dimensao, type Semantica } from '../semantic/schema';
import { aplicarConfig, type BancoUniversal, type LeituraPlanilha } from './carregar';
import type { ModeloPlanilha } from './impressao';
import { ident } from './limpeza';
import { montarPainel, type PainelPlanilha } from './painelAuto';
import type { ColunaConfig } from './perfil';
import { montarJuncao, prefixoDe, type Ligacao } from './relacoes';
import { montarSemantica } from './semanticaAuto';
import { idFaixa, painelDoTema, planejarTema, type EscolhaTema, type PainelTema, type PlanoTema } from './temas/aplicar';
import type { ResultadoTema } from './temas/detector';

export interface ParteGrupo {
  leitura: LeituraPlanilha;
  config: ColunaConfig[];
  /** Só nas juntas: como ela se liga à principal. */
  ligacao?: Ligacao;
  /** Modelo salvo que reconheceu este layout (abre sem revisão). */
  reconhecido?: ModeloPlanilha;
}

export interface Grupo {
  principal: ParteGrupo;
  juntas: ParteGrupo[];
  /** Dados sensíveis: grupos com menos de N registros ficam escondidos (undefined = desligado). */
  minGroupSize?: number;
  /** Tema, objetivo, público e papéis (Fase 5B). Sem isso (ou tema genérico), vale o painel automático. */
  tema?: EscolhaTema;
  /** O que o detector achou (para a tela mostrar o porquê). */
  deteccao?: ResultadoTema;
}

export interface PlanilhaMontada {
  semantica: Semantica;
  config: ColunaConfig[];
  tabela: string;
  linhas: number;
  periodo?: { de: string; ate: string };
  painel: PainelPlanilha | PainelTema;
  /** Valores distintos por coluna (para escolher os gráficos). */
  distintos: Record<string, number>;
  ms: number;
  /** Tabelas e visões criadas (para descartar quando a configuração muda). */
  criadas: string[];
}

export async function montarGrupo(grupo: Grupo, banco: BancoUniversal): Promise<PlanilhaMontada> {
  const t0 = performance.now();
  const amostras = Object.fromEntries(grupo.principal.leitura.perfis.map((p) => [p.id, p.amostraValores ?? []]));
  const plano = grupo.tema ? planejarTema(grupo.tema, grupo.principal.config, amostras) : null;
  const metricasExtras = plano?.metricasExtras;
  const dimensoesExtras = plano?.dimensoesExtras;
  const principal = await aplicarConfig(grupo.principal.leitura, plano?.config ?? grupo.principal.config, banco, { minGroupSize: grupo.minGroupSize, metricasExtras, dimensoesExtras });
  const criadas = [principal.tabela];
  const distintos: Record<string, number> = Object.fromEntries(grupo.principal.leitura.perfis.map((p) => [p.id, p.distintos]));
  let tabela = principal.tabela;
  let config = principal.config;
  let semantica = principal.semantica;
  const nomes = [grupo.principal.leitura.nome];

  for (const junta of grupo.juntas) {
    if (!junta.ligacao) continue;
    const pronta = await aplicarConfig(junta.leitura, junta.config, banco);
    criadas.push(pronta.tabela);
    const visao = `${tabela}_j${criadas.length}`;
    const j = montarJuncao({ tabela, config }, { tabela: pronta.tabela, config: pronta.config, nome: junta.leitura.nome }, junta.ligacao, visao);
    await banco.executar(j.sql);
    criadas.push(visao);
    tabela = visao;
    config = j.config;
    const prefixo = prefixoDe(junta.leitura.nome);
    for (const p of junta.leitura.perfis) distintos[`${prefixo}_${p.id}`] = p.distintos;
    nomes.push(junta.leitura.nome);
  }
  if (grupo.juntas.some((j) => j.ligacao)) {
    semantica = montarSemantica(config, { nome: nomes.map((n) => n.replace(/\.[a-z0-9]+$/i, '')).join(' + '), tabela, linhas: principal.linhas, periodo: principal.periodo, minGroupSize: grupo.minGroupSize, metricasExtras, dimensoesExtras });
  }
  if (plano?.histogramas.length) semantica = await comFaixas(semantica, plano, principal.tabela, banco);
  return {
    semantica,
    config,
    tabela,
    linhas: principal.linhas,
    periodo: principal.periodo,
    painel: grupo.tema && plano ? painelDoTema(grupo.tema, plano, semantica, config, distintos) : montarPainel(semantica, config, distintos),
    distintos,
    ms: performance.now() - t0,
    criadas,
  };
}

/** Descarta as tabelas de uma montagem antiga (a configuração mudou). Visões primeiro. */
export async function descartar(montada: Pick<PlanilhaMontada, 'criadas'>, banco: BancoUniversal): Promise<void> {
  for (const nome of [...montada.criadas].reverse()) {
    await banco.executar(`DROP VIEW IF EXISTS ${ident(nome)}`).catch(() => undefined);
    await banco.executar(`DROP TABLE IF EXISTS ${ident(nome)}`).catch(() => undefined);
  }
}

/**
 * Histogramas (Fase 5C): as faixas saem dos percentis 2 e 98 da coluna, calculados no DuckDB, e viram dimensões
 * "faixa" da semântica. Assim a contagem de cada faixa também é SQL (e respeita o tamanho mínimo de grupo).
 */
async function comFaixas(semantica: Semantica, plano: PlanoTema, tabela: string, banco: BancoUniversal): Promise<Semantica> {
  const extras: Record<string, Dimensao> = {};
  for (const col of plano.histogramas) {
    const c = plano.config.find((x) => x.id === col);
    if (!c) continue;
    const [l] = await banco.executar(
      `SELECT quantile_cont(${ident(col)}, 0.02) AS p02, quantile_cont(${ident(col)}, 0.98) AS p98 FROM ${ident(tabela)} WHERE ${ident(col)} IS NOT NULL`,
    );
    const formato = c.tipo === 'dinheiro' ? 'brl' : c.tipo === 'porcentagem' ? 'pct' : 'dec2';
    const buckets = faixasHistograma(Number(l?.p02), Number(l?.p98), formato);
    if (buckets.length < 3) continue;
    extras[idFaixa(col)] = { type: 'faixa', label: `Faixa de ${c.rotulo}`, column: col, buckets, synonyms: [`faixa de ${c.rotulo.toLowerCase()}`] };
  }
  return Object.keys(extras).length ? carregarSemantica({ ...semantica, dimensions: { ...semantica.dimensions, ...extras } }) : semantica;
}
