/**
 * Motor FALSO no lugar do modelo (testes e e2e sem GPU).
 *
 * Segue o mesmo contrato do WebLLM (`MotorLLM`) e é determinístico: reconhece se o pedido é do
 * planejador ou do narrador pelo prompt de sistema, lê a pergunta e devolve JSON pronto.
 * Os "modos adversários" imitam erros típicos de modelo pequeno para testar os validadores.
 * NUNCA mede qualidade nem velocidade do modelo real: isso é no PC (roteiro no CLAUDE.md).
 */
import type { QuerySpec } from '../query/spec';
import { normalizar } from '../router/normalizar';
import type { MensagemChat, MotorLLM, PedidoCompletar, ProgressoCarga, RespostaCompletar } from './tipos';

export type ModoFalso =
  | 'normal'
  | 'json-quebrado'
  | 'com-enfeite'
  | 'metrica-inventada'
  | 'valor-inexistente'
  | 'narrador-com-numero'
  | 'narrador-causal'
  | 'narrador-placeholder-inexistente'
  | 'erro';

export type RespostaPlanejador = QuerySpec | string | ((anterior: QuerySpec | null) => QuerySpec);

/** Perguntas que a Camada 0 não resolve sozinha (conferido no teste) e o spec que um bom modelo daria. */
export const PLANOS_FALSOS: Record<string, RespostaPlanejador> = {
  'quais produtos de casa deram mais dinheiro no ano retrasado': {
    intent: 'ranking',
    metrics: ['faturamento'],
    dimensions: ['categoria'],
    filters: [],
    time: { from: '2017-01-01', to: '2017-12-31' },
    sort: { by: 'faturamento', dir: 'desc' },
    limit: 5,
  },
  'a turma paulista ta comprando muito': {
    intent: 'tendencia',
    metrics: ['pedidos'],
    dimensions: ['tempo'],
    filters: [{ dimension: 'estado_cliente', op: 'in', values: ['são paulo'] }],
    time: { grain: 'mes' },
  },
  'e a galera carioca': (anterior) => ({
    ...(anterior ?? { intent: 'kpi', metrics: ['pedidos'], dimensions: [], filters: [] }),
    filters: [{ dimension: 'estado_cliente', op: 'in', values: ['RJ'] }],
  }),
  'quanto sobra pra gente depois de pagar tudo': {
    intent: 'fora_de_escopo',
    metrics: [],
    dimensions: [],
    filters: [],
    out_of_scope_reason: 'A base não tem custos nem despesas, então não dá para calcular o que sobra (lucro). Posso mostrar faturamento ou frete.',
  },
  'me fala algo sobre isso ai': {
    intent: 'esclarecer',
    metrics: [],
    dimensions: [],
    filters: [],
    clarify: { question: 'Sobre o que você quer saber?', options: ['Faturamento mês a mês', 'Entregas no prazo', 'Notas dos clientes'] },
  },
};

const ESCLARECER_PADRAO: QuerySpec = {
  intent: 'esclarecer',
  metrics: [],
  dimensions: [],
  filters: [],
  clarify: { question: 'Não entendi bem. Seria um destes?', options: ['Faturamento total', 'Faturamento mês a mês', 'Top 5 categorias em 2018'] },
};

export interface OpcoesMotorFalso {
  modo?: ModoFalso;
  planos?: Record<string, RespostaPlanejador>;
  /** Atraso artificial por chamada (para ver os estados de "pensando" no e2e). */
  atrasoMs?: number;
}

export interface MotorFalso extends MotorLLM {
  chamadas: PedidoCompletar[];
  modo: ModoFalso;
}

function ultimaDoUsuario(mensagens: readonly MensagemChat[]): string {
  return [...mensagens].reverse().find((m) => m.role === 'user')?.content ?? '';
}

export function ehPedidoDoNarrador(mensagens: readonly MensagemChat[]): boolean {
  return (mensagens[0]?.content ?? '').includes('Você escreve a análise');
}

function planejar(mensagens: readonly MensagemChat[], modo: ModoFalso, planos: Record<string, RespostaPlanejador>): string {
  const texto = ultimaDoUsuario(mensagens);
  const pergunta = normalizar(/PERGUNTA: (.*)$/s.exec(texto)?.[1] ?? '').replace(/[?!.]/g, '').trim();
  const bruto = /SPEC_ANTERIOR: (.*)\n/.exec(texto)?.[1] ?? 'null';
  const anterior = bruto === 'null' ? null : (JSON.parse(bruto) as QuerySpec);
  if (modo === 'json-quebrado') return '{"intent": "ranking", "metrics": ["faturamento"';
  if (modo === 'metrica-inventada') return JSON.stringify({ intent: 'kpi', metrics: ['lucro_liquido'], dimensions: [], filters: [] });
  if (modo === 'valor-inexistente') {
    return JSON.stringify({ intent: 'kpi', metrics: ['faturamento'], dimensions: [], filters: [{ dimension: 'categoria', op: 'in', values: ['Naves Espaciais'] }] });
  }
  const plano = planos[pergunta];
  const spec = plano === undefined ? ESCLARECER_PADRAO : typeof plano === 'function' ? plano(anterior) : plano;
  const json = typeof spec === 'string' ? spec : JSON.stringify(spec);
  return modo === 'com-enfeite' ? `Claro! Aqui está:\n\`\`\`json\n${json}\n\`\`\`` : json;
}

interface FatoResumo {
  id: string;
  importancia: number;
}

function narrar(mensagens: readonly MensagemChat[], modo: ModoFalso): string {
  const entrada = JSON.parse(ultimaDoUsuario(mensagens)) as { fatos?: FatoResumo[] };
  const fatos = [...(entrada.fatos ?? [])].sort((a, b) => b.importancia - a.importancia).slice(0, 3);
  const bullets = fatos.map((f) => ({ texto: `Destaque para {{${f.id}.rotulo}}: {{${f.id}}}.`, fatos: [f.id] }));
  if (modo === 'narrador-com-numero') bullets.push({ texto: 'As vendas cresceram 15% em março.', fatos: [] });
  if (modo === 'narrador-causal') bullets.push({ texto: 'O resultado caiu porque o frete ficou mais caro.', fatos: [] });
  if (modo === 'narrador-placeholder-inexistente') bullets.push({ texto: 'Veja {{fato_que_nao_existe}}.', fatos: [] });
  return JSON.stringify({
    titulo: 'Leitura da IA local',
    bullets: bullets.length ? bullets : [{ texto: 'Sem destaques nesta consulta.', fatos: [] }],
    ...(fatos.length > 1 ? { hipotese: 'Hipótese: vale olhar os segmentos com mais peso antes de concluir.' } : {}),
  });
}

export function criarMotorFalso(opcoes: OpcoesMotorFalso = {}): MotorFalso {
  const planos = { ...PLANOS_FALSOS, ...opcoes.planos };
  const motor: MotorFalso = {
    id: 'motor-falso',
    tipo: 'falso',
    modo: opcoes.modo ?? 'normal',
    chamadas: [],
    async completar(pedido): Promise<RespostaCompletar> {
      const t0 = performance.now();
      motor.chamadas.push(pedido);
      if (opcoes.atrasoMs) await new Promise((r) => setTimeout(r, opcoes.atrasoMs));
      if (motor.modo === 'erro') throw new Error('falha simulada do motor');
      const texto = ehPedidoDoNarrador(pedido.mensagens) ? narrar(pedido.mensagens, motor.modo) : planejar(pedido.mensagens, motor.modo, planos);
      // Streaming de mentira: entrega em 3 pedaços.
      if (pedido.aoParcial) for (const n of [0.3, 0.6, 1]) pedido.aoParcial(texto.slice(0, Math.ceil(texto.length * n)));
      return { texto, ms: performance.now() - t0 };
    },
  };
  return motor;
}

/** "Download" de mentira, para exercitar a barra de progresso no e2e. */
export async function carregarMotorFalso(aoProgresso: (p: ProgressoCarga) => void, opcoes: OpcoesMotorFalso = {}, passoMs = 60): Promise<MotorFalso> {
  const passos = ['Buscando o modelo no cache', 'Baixando pesos (simulado)', 'Compilando shaders (simulado)', 'Pronto'];
  for (const [i, texto] of passos.entries()) {
    aoProgresso({ fracao: (i + 1) / passos.length, texto, segundos: ((i + 1) * passoMs) / 1000 });
    await new Promise((r) => setTimeout(r, passoMs));
  }
  return criarMotorFalso(opcoes);
}
