/**
 * Monta o dashboard de um GRUPO de planilhas: a principal + as que se ligam a ela (vários arquivos).
 * Cada uma vira tabela tipada; as ligadas entram por LEFT JOIN numa visão; a semântica é gerada no fim.
 */
import type { Semantica } from '../semantic/schema';
import { aplicarConfig, type BancoUniversal, type LeituraPlanilha } from './carregar';
import type { ModeloPlanilha } from './impressao';
import { ident } from './limpeza';
import { montarPainel, type PainelPlanilha } from './painelAuto';
import type { ColunaConfig } from './perfil';
import { montarJuncao, prefixoDe, type Ligacao } from './relacoes';
import { montarSemantica } from './semanticaAuto';

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
}

export interface PlanilhaMontada {
  semantica: Semantica;
  config: ColunaConfig[];
  tabela: string;
  linhas: number;
  periodo?: { de: string; ate: string };
  painel: PainelPlanilha;
  /** Valores distintos por coluna (para escolher os gráficos). */
  distintos: Record<string, number>;
  ms: number;
  /** Tabelas e visões criadas (para descartar quando a configuração muda). */
  criadas: string[];
}

export async function montarGrupo(grupo: Grupo, banco: BancoUniversal): Promise<PlanilhaMontada> {
  const t0 = performance.now();
  const principal = await aplicarConfig(grupo.principal.leitura, grupo.principal.config, banco, { minGroupSize: grupo.minGroupSize });
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
    semantica = montarSemantica(config, { nome: nomes.map((n) => n.replace(/\.[a-z0-9]+$/i, '')).join(' + '), tabela, linhas: principal.linhas, periodo: principal.periodo, minGroupSize: grupo.minGroupSize });
  }
  return {
    semantica,
    config,
    tabela,
    linhas: principal.linhas,
    periodo: principal.periodo,
    painel: montarPainel(semantica, config, distintos),
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
