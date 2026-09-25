/**
 * Parser de tempo em PT-BR (função pura). Entrada: texto JÁ normalizado (sem acento, minúsculo).
 *
 * "Hoje" é a âncora dos dados (na Olist, 31/08/2018), nunca a data do relógio.
 * Período sem ano ("dezembro", "1º semestre") = a ocorrência mais recente que já terminou até a âncora.
 */
import { PALAVRAS_NUMERO, numero } from '../router/normalizar';
import type { Grao } from './spec';

export interface Periodo {
  from: string;
  to: string;
  rotulo: string;
}

export interface ResultadoTempo {
  periodo?: Periodo;
  /** Dois anos citados ("2017 vs 2018"). */
  anos?: [number, number];
  /** Pedido de série ("mês a mês", "evolução"). */
  serie: boolean;
  grain?: Grao;
  compare?: 'periodo_anterior' | 'mesmo_periodo_ano_anterior';
  /** Texto com os trechos de tempo apagados (para o roteador não reler). */
  restante: string;
  trechos: string[];
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_NOME = `(${MESES.join('|')})`;
const MES_QUALQUER = `(${[...MESES, ...ABREV].join('|')})`;
const ANO = '(20\\d\\d|\\d\\d)';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (a: number, m: number, d: number) => `${a}-${pad(m)}-${pad(d)}`;
const fimMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

function ano(texto: string): number {
  const n = Number(texto);
  return n < 100 ? 2000 + n : n;
}

function indiceMes(nome: string): number {
  const i = MESES.indexOf(nome);
  return (i >= 0 ? i : ABREV.indexOf(nome)) + 1;
}

export function periodoMes(a: number, m: number): Periodo {
  return { from: iso(a, m, 1), to: iso(a, m, fimMes(a, m)), rotulo: `${ABREV[m - 1]}/${a}` };
}

function periodoMeses(a: number, m1: number, a2: number, m2: number): Periodo {
  return { from: iso(a, m1, 1), to: iso(a2, m2, fimMes(a2, m2)), rotulo: `${ABREV[m1 - 1]}/${a}–${ABREV[m2 - 1]}/${a2}` };
}

function blackFriday(a: number): string {
  // Dia seguinte à 4ª quinta-feira de novembro.
  const primeiro = new Date(Date.UTC(a, 10, 1)).getUTCDay(); // 0 = domingo
  const primeiraQuinta = 1 + ((4 - primeiro + 7) % 7);
  return iso(a, 11, primeiraQuinta + 21 + 1);
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, (d ?? 1) + dias)).toISOString().slice(0, 10);
}

export function interpretarTempo(texto: string, ancora: string): ResultadoTempo {
  const [anoA, mesA] = ancora.split('-').map(Number) as [number, number];
  const resultado: ResultadoTempo = { serie: false, restante: ` ${texto} `, trechos: [] };

  /** Aplica a regex; o callback devolve true se usou o trecho (aí ele é apagado). */
  const usar = (regex: RegExp, aoAchar: (m: RegExpExecArray) => boolean) => {
    const r = new RegExp(regex.source, 'g');
    let achado: RegExpExecArray | null;
    let texto = resultado.restante;
    while ((achado = r.exec(texto)) !== null) {
      if (aoAchar(achado)) {
        resultado.trechos.push(achado[0].trim());
        texto = texto.slice(0, achado.index) + ' '.repeat(achado[0].length) + texto.slice(achado.index + achado[0].length);
      }
    }
    resultado.restante = texto;
  };
  const definir = (p: Periodo) => {
    if (resultado.periodo) return false;
    resultado.periodo = p;
    return true;
  };
  const ultimoMesCom = (m: number) => (m <= mesA ? anoA : anoA - 1);

  // 1. Comparações ("vs ano anterior", "em relação ao mês passado").
  const conector = '(vs|versus|contra|comparad[oa] (a|ao|com o|com)|em relacao (a|ao)|frente (a|ao))';
  usar(new RegExp(` ${conector} (o |a )?(mesmo periodo do )?(ano anterior|ano passado)`), () => {
    resultado.compare = 'mesmo_periodo_ano_anterior';
    return true;
  });
  usar(new RegExp(` ${conector} (o |a )?(mes anterior|mes passado|periodo anterior)`), () => {
    resultado.compare = 'periodo_anterior';
    return true;
  });

  // 2. Série temporal e grão.
  const graos: [string, Grao][] = [
    ['mes a mes|por mes|mensal|mensalmente|a cada mes|cada mes', 'mes'],
    ['ano a ano|por ano|anual|anualmente|cada ano', 'ano'],
    ['por trimestre|trimestral|trimestralmente', 'trimestre'],
    ['por semana|semanal|semanalmente|semana a semana', 'semana'],
    ['por dia|diario|diaria|diariamente|dia a dia', 'dia'],
  ];
  for (const [padrao, grao] of graos) {
    usar(new RegExp(` (${padrao}) `), () => {
      resultado.serie = true;
      resultado.grain ??= grao;
      return true;
    });
  }
  usar(/ (evolucao|ao longo do tempo|ao longo|tendencia|historico|linha do tempo) /, () => {
    resultado.serie = true;
    return true;
  });

  // 3. Black Friday.
  usar(new RegExp(` (na |da )?(semana da )?black ?friday( de | )?(20\\d\\d)? `), (m) => {
    const a = m[4] ? Number(m[4]) : anoA - 1;
    const dia = blackFriday(a);
    const semana = Boolean(m[2]);
    return definir(
      semana
        ? { from: somarDias(dia, -4), to: somarDias(dia, 2), rotulo: `semana da Black Friday ${a}` }
        : { from: dia, to: dia, rotulo: `Black Friday ${a} (${dia.slice(8)}/11)` },
    );
  });

  // Natal = dezembro (do ano citado ou o mais recente).
  usar(/ (no |do |de )?natal( de (20\d\d))? /, (m) => {
    const a = m[3] ? Number(m[3]) : ultimoMesCom(12);
    return definir({ ...periodoMes(a, 12), rotulo: `Natal ${a} (dez/${a})` });
  });

  // 4. Semestre e trimestre.
  usar(new RegExp(` (1|1o|primeiro|2|2o|segundo) semestre( de| do ano de| do ano| em)?( ${ANO})? `), (m) => {
    const s = m[1]?.startsWith('1') || m[1] === 'primeiro' ? 1 : 2;
    const fimS = s === 1 ? 6 : 12;
    const a = m[4] ? ano(m[4]) : fimS <= mesA ? anoA : anoA - 1;
    return definir({ ...periodoMeses(a, s === 1 ? 1 : 7, a, fimS), rotulo: `${s}º semestre/${a}` });
  });
  const ordinalTri = '(1|1o|primeiro|2|2o|segundo|3|3o|terceiro|4|4o|quarto)';
  const numeroTri = (t: string) =>
    ({ '1': 1, '1o': 1, primeiro: 1, '2': 2, '2o': 2, segundo: 2, '3': 3, '3o': 3, terceiro: 3, '4': 4, '4o': 4, quarto: 4 })[t] ?? 1;
  const trimestre = (q: number, a?: number) => {
    const fimQ = q * 3;
    const aa = a ?? (fimQ <= mesA ? anoA : anoA - 1);
    return definir({ ...periodoMeses(aa, fimQ - 2, aa, fimQ), rotulo: `T${q}/${aa}` });
  };
  usar(new RegExp(` ${ordinalTri} trimestre( de| do ano de| do ano| em)?( ${ANO})? `), (m) =>
    trimestre(numeroTri(m[1] ?? '1'), m[4] ? ano(m[4]) : undefined),
  );
  usar(new RegExp(` (t|q)([1-4])( de|/| )?(20\\d\\d)? `), (m) => trimestre(Number(m[2]), m[4] ? ano(m[4]) : undefined));

  // 5. Relativos à âncora.
  usar(new RegExp(` (nos |dos )?ultimos (\\d+|${PALAVRAS_NUMERO}) meses `), (m) => {
    const n = numero(m[2] ?? '') ?? 1;
    const inicio = new Date(Date.UTC(anoA, mesA - n, 1));
    return definir({
      ...periodoMeses(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, anoA, mesA),
      rotulo: `últimos ${n} meses`,
    });
  });
  usar(/ (no |do |o )?(ultimo mes|mes passado|este mes|esse mes|mes atual|neste mes) /, () => definir(periodoMes(anoA, mesA)));
  usar(/ (no |do |o )?(ultimo trimestre|trimestre passado) /, () => trimestre(Math.floor(mesA / 3) || 4, Math.floor(mesA / 3) ? anoA : anoA - 1));
  usar(/ (neste ano|este ano|esse ano|ano atual) /, () =>
    definir({ from: iso(anoA, 1, 1), to: ancora, rotulo: `${anoA} até ${ABREV[mesA - 1]}` }),
  );
  usar(/ (no |do |o )?(ano passado|ultimo ano|ano anterior) /, () =>
    definir({ from: iso(anoA - 1, 1, 1), to: iso(anoA - 1, 12, 31), rotulo: String(anoA - 1) }),
  );

  // 6. Intervalos de meses ("de janeiro a março de 2018").
  usar(new RegExp(` (de |entre )?${MES_QUALQUER}( de ${ANO}|/${ANO})? (a|ate|e) ${MES_QUALQUER}( de |/| )${ANO} `), (m) => {
    const a2 = ano(m[9] ?? '');
    const a1 = m[4] ? ano(m[4]) : m[5] ? ano(m[5]) : a2;
    return definir(periodoMeses(a1, indiceMes(m[2] ?? ''), a2, indiceMes(m[7] ?? '')));
  });

  // 7. Mês com ano ("dez/2017", "dezembro de 2017", "nov 17") e mês por extenso sem ano.
  usar(new RegExp(` (em |de |no mes de )?${MES_QUALQUER}( de |/| )${ANO} `), (m) =>
    definir(periodoMes(ano(m[4] ?? ''), indiceMes(m[2] ?? ''))),
  );
  usar(new RegExp(` (em |de |no mes de )?${MES_NOME} `), (m) => {
    const mes = indiceMes(m[2] ?? '');
    return definir(periodoMes(ultimoMesCom(mes), mes));
  });

  // 8. Anos soltos.
  const anos: number[] = [];
  usar(/ (desde|a partir de) (20\d\d) /, (m) => definir({ from: iso(Number(m[2]), 1, 1), to: '2099-12-31', rotulo: `desde ${m[2]}` }));
  usar(/ (em |de |no ano de |do ano de |no |o )?(20\d\d) /, (m) => {
    anos.push(Number(m[2]));
    return true;
  });
  const distintos = [...new Set(anos)].sort();
  if (distintos.length >= 2) {
    const [a1, a2] = [distintos[0] ?? 0, distintos.at(-1) ?? 0];
    resultado.anos = [a1, a2];
    definir({ from: iso(a1, 1, 1), to: iso(a2, 12, 31), rotulo: `${a1} e ${a2}` });
  } else if (distintos.length === 1) {
    const a = distintos[0] ?? 0;
    definir({ from: iso(a, 1, 1), to: iso(a, 12, 31), rotulo: String(a) });
  }

  resultado.restante = resultado.restante.replace(/\s+/g, ' ').trim();
  return resultado;
}
