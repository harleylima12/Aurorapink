/**
 * Narrador do Modo Rápido: templates por intenção (função pura).
 *
 * Regra de ouro: os textos fixos daqui não têm números. Todo número vem de um fato
 * (`valor_formatado`), calculado pelo DuckDB e formatado com Intl pt-BR. Palavras como
 * "alta/queda" também são decididas pelo sinal do fato, nunca inventadas.
 */
import { buscarFato, type Fato } from '../insights/engine';
import type { QuerySpec } from '../query/spec';
import type { Semantica } from '../semantic/schema';

export interface TextoResposta {
  titulo: string;
  bullets: string[];
}

function titulo(spec: QuerySpec, semantica: Semantica, rotuloPeriodo?: string): string {
  const metricas = spec.metrics.map((m) => semantica.metrics[m]?.label ?? m).join(' e ');
  const dims = spec.dimensions
    .filter((d) => d !== 'tempo')
    .map((d) => semantica.dimensions[d]?.label.toLowerCase() ?? d);
  const serie = spec.dimensions.includes('tempo') ? (spec.time?.grain === 'ano' ? ' ano a ano' : spec.time?.grain === 'trimestre' ? ' por trimestre' : ' mês a mês') : '';
  const porque = spec.intent === 'explicar_variacao' ? 'O que explica a variação de ' : '';
  const base = `${porque}${porque ? metricas.toLowerCase() : metricas}${serie}${dims.length && !porque ? ` por ${dims.join(' e ')}` : ''}`;
  const filtros = spec.filters.filter((f) => f.dimension !== 'tempo').map((f) => f.values.join(', '));
  return [base, ...filtros, rotuloPeriodo].filter(Boolean).join(' · ');
}

function forca(r: number): string {
  const a = Math.abs(r);
  const intensidade = a >= 0.7 ? 'forte' : a >= 0.4 ? 'moderada' : a >= 0.2 ? 'fraca' : 'quase nenhuma';
  if (intensidade === 'quase nenhuma') return 'quase nenhuma relação';
  return `relação ${intensidade} e ${r > 0 ? 'positiva' : 'negativa'}`;
}

export function narrar(spec: QuerySpec, fatos: readonly Fato[], semantica: Semantica, rotuloPeriodo?: string): TextoResposta {
  const f = (id: string) => buscarFato(fatos, id);
  const [idMetrica] = spec.metrics;
  const metrica = idMetrica ? semantica.metrics[idMetrica] : undefined;
  const nome = metrica?.label ?? 'Valor';
  const bullets: string[] = [];
  const t = titulo(spec, semantica, rotuloPeriodo);

  if (!fatos.length) return { titulo: t, bullets: ['Nenhum dado para esse recorte.'] };

  if (spec.intent === 'explicar_variacao') {
    const v = f('variacao_abs');
    const pct = f('variacao_pct');
    if (v && pct) {
      bullets.push(`${nome}: variação de ${pct.valor_formatado} (${v.valor_formatado}) contra o período anterior, de ${f('anterior')?.valor_formatado ?? '—'} para ${f('total')?.valor_formatado ?? '—'}.`);
    }
    const principais = [1, 2, 3].map((i) => f(`contrib_${i}`)).filter((x): x is Fato => Boolean(x));
    if (principais.length) {
      const [p1] = principais;
      const parte = f('contrib_1_parte');
      if (p1) bullets.push(`Quem mais pesou: ${p1.rotulo} (${p1.valor_formatado}${parte ? `, ${parte.valor_formatado} da variação` : ''}).`);
      const resto = principais.slice(1);
      if (resto.length) bullets.push(`Depois: ${resto.map((c) => `${c.rotulo} (${c.valor_formatado})`).join('; ')}.`);
    }
    const contra = f('contra_1');
    if (contra) bullets.push(`Na direção contrária: ${contra.rotulo} (${contra.valor_formatado}).`);
    bullets.push('Os números mostram onde a variação aconteceu, não a causa. Hipóteses de causa chegam com a IA (Fase 4), sempre marcadas como hipótese.');
    return { titulo: t, bullets: bullets.slice(0, 5) };
  }

  if (spec.dimensions.length === 0) {
    const total = f('total');
    if (total) bullets.push(`${nome}: ${total.valor_formatado}.`);
    const pct = f('variacao_pct');
    const abs = f('variacao_abs');
    if (pct && abs) {
      bullets.push(`Variação de ${pct.valor_formatado} (${abs.valor_formatado}) contra o período de comparação (${f('anterior')?.valor_formatado ?? '—'}).`);
    }
    for (const extra of fatos.filter((x) => x.id.startsWith('total_'))) bullets.push(`${extra.rotulo}: ${extra.valor_formatado}.`);
    return { titulo: t, bullets };
  }

  if (spec.dimensions[0] === 'tempo') {
    const max = f('maximo');
    const min = f('minimo');
    const pico = f('pico_vs_media');
    const tend = f('tendencia');
    if (max) bullets.push(`Pico em ${max.rotulo}: ${max.valor_formatado}${pico ? ` (${pico.valor_formatado} em relação à média do período)` : ''}.`);
    if (min) bullets.push(`Menor valor em ${min.rotulo}: ${min.valor_formatado}.`);
    if (tend) bullets.push(`Tendência de ${tend.valor_formatado} ${tend.rotulo}, em média.`);
    if (f('parciais')) bullets.push('Meses com poucos pedidos na base ficaram fora do pico, do mínimo e da tendência.');
    const ult = f('ultimo_var');
    if (ult) bullets.push(`${ult.rotulo}: ${ult.valor_formatado}.`);
    return { titulo: t, bullets: bullets.slice(0, 4) };
  }

  const corr = f('correlacao');
  if (corr) {
    bullets.push(`Entre ${corr.rotulo}: ${forca(corr.valor)} (correlação ${corr.valor_formatado}).`);
  }

  const primeiro = f('primeiro');
  const share = f('primeiro_share');
  const maior = f('maior');
  const menor = f('menor');
  if (spec.intent === 'ranking' && primeiro) {
    const asc = spec.sort?.dir === 'asc';
    bullets.push(`${primeiro.rotulo} ${asc ? 'tem o menor valor' : 'lidera'}: ${primeiro.valor_formatado}${share ? ` (${share.valor_formatado} do total)` : ''}.`);
    const top3 = f('top3_share');
    if (top3) bullets.push(`Os 3 primeiros (${top3.rotulo}) somam ${top3.valor_formatado} do total.`);
    const ultimoDaLista = asc ? maior : menor;
    if (ultimoDaLista && ultimoDaLista.rotulo !== primeiro.rotulo) bullets.push(`Na outra ponta da lista: ${ultimoDaLista.rotulo}, com ${ultimoDaLista.valor_formatado}.`);
  } else if (maior && menor) {
    bullets.push(`Maior: ${maior.rotulo} (${maior.valor_formatado}). Menor: ${menor.rotulo} (${menor.valor_formatado}).`);
    const dif = f('diferenca');
    const difPct = f('diferenca_pct');
    if (dif) bullets.push(`Diferença de ${dif.valor_formatado}${difPct ? ` (${difPct.valor_formatado})` : ''} entre os dois.`);
    if (share && primeiro) bullets.push(`${primeiro.rotulo} representa ${share.valor_formatado} do total.`);
  } else if (primeiro) {
    bullets.push(`${primeiro.rotulo}: ${primeiro.valor_formatado}.`);
  }
  const out = f('outlier_1');
  if (out && out.rotulo !== primeiro?.rotulo) bullets.push(`${out.rotulo} foge do padrão dos demais (${out.valor_formatado}).`);
  return { titulo: t, bullets: bullets.slice(0, 4) };
}
