/**
 * Temas e papéis de negócio (Fase 5B). Só dados: quem decide é o detector (detector.ts) e quem monta o
 * dashboard é a receita do tema (receitas.ts). Palavras em PT-BR e EN, já normalizadas (sem acento, minúsculas).
 */
import type { TipoColuna } from '../perfil';

export const TEMAS = ['vendas', 'financeiro', 'rh', 'estoque', 'marketing', 'atendimento', 'educacao', 'saude', 'generico'] as const;
export type Tema = (typeof TEMAS)[number];

export interface SinalValor {
  /** Valores normalizados (sem acento, minúsculas) OU uma regex para os valores originais. */
  valores?: readonly string[];
  regex?: RegExp;
  /** Fração mínima dos valores da amostra que precisam casar. */
  minimo: number;
  peso: number;
  descricao: string;
}

export interface DefTema {
  id: Tema;
  rotulo: string;
  icone: string;
  descricao: string;
  /** Dados sensíveis: o tamanho mínimo de grupo liga por padrão (D50). */
  sensivel?: boolean;
  /** Palavra do nome da coluna -> peso. Frases com espaço valem no nome inteiro. */
  palavras: Readonly<Record<string, number>>;
  valores?: readonly SinalValor[];
}

export const DEF_TEMAS: Readonly<Record<Tema, DefTema>> = {
  vendas: {
    id: 'vendas',
    rotulo: 'Vendas / E-commerce',
    icone: '🛒',
    descricao: 'pedidos, produtos, clientes e faturamento',
    palavras: {
      venda: 3, vendas: 3, vendido: 2, pedido: 3, pedidos: 3, order: 2, orders: 2, produto: 2, product: 2, cliente: 2, customer: 2,
      preco: 2, price: 2, faturamento: 3, revenue: 2, sales: 3, frete: 2, desconto: 2, discount: 2, vendedor: 3, seller: 3, loja: 2,
      qtd: 1, quantidade: 1, units: 1, 'ticket medio': 3, 'valor total': 2, total: 1, pago: 1, 'product line': 2,
    },
  },
  financeiro: {
    id: 'financeiro',
    rotulo: 'Financeiro',
    icone: '💰',
    descricao: 'receitas, despesas, contas e fluxo de caixa',
    palavras: {
      despesa: 3, despesas: 3, receita: 2, receitas: 2, lancamento: 3, fluxo: 3, caixa: 2, saldo: 2, conta: 2, contas: 2, vencimento: 3,
      pagamento: 1, 'centro de custo': 3, custo: 1, debito: 2, credito: 2, margem: 2, orcamento: 3, balanco: 3, documento: 1, nf: 1,
      'forma de pagamento': 1, fornecedor: 1, 'pago em': 2, expense: 3, income: 2, budget: 3,
    },
    valores: [
      { valores: ['entrada', 'saida', 'credito', 'debito', 'receita', 'despesa'], minimo: 0.8, peso: 3, descricao: 'valores do tipo entrada/saída' },
      { valores: ['pago', 'em aberto', 'aberto', 'vencido', 'a pagar', 'a receber', 'quitado'], minimo: 0.8, peso: 2, descricao: 'valores do tipo pago/em aberto' },
    ],
  },
  rh: {
    id: 'rh',
    rotulo: 'RH / Pessoas',
    icone: '👥',
    descricao: 'colaboradores, cargos, salários e turnover',
    sensivel: true,
    palavras: {
      salario: 3, salarios: 3, remuneracao: 3, matricula: 1, cargo: 3, departamento: 2, admissao: 3, desligamento: 3, demissao: 3,
      colaborador: 3, colaboradores: 3, funcionario: 3, employee: 3, gestor: 2, ferias: 3, folha: 3, 'horas extras': 2, beneficios: 2,
      turnover: 3, 'tempo de casa': 3, competencia: 1, liquido: 1, descontos: 1, area: 1, 'avaliacao de desempenho': 3, headcount: 3,
    },
  },
  estoque: {
    id: 'estoque',
    rotulo: 'Estoque / Operações',
    icone: '📦',
    descricao: 'itens, saldos, movimentações e armazéns',
    palavras: {
      estoque: 3, sku: 2, armazem: 3, warehouse: 3, lote: 3, validade: 2, movimento: 3, movimentacao: 3, inventario: 3, inventory: 3,
      fornecedor: 2, supplier: 2, reorder: 3, minimo: 2, 'on hand': 3, 'item code': 2, reposicao: 3, deposito: 3, 'last count': 2,
    },
    valores: [{ valores: ['entrada', 'saida', 'ajuste', 'transferencia', 'devolucao'], minimo: 0.8, peso: 1.5, descricao: 'valores do tipo entrada/saída/ajuste' }],
  },
  marketing: {
    id: 'marketing',
    rotulo: 'Marketing / Campanhas',
    icone: '📣',
    descricao: 'campanhas, canais, investimento e conversões',
    palavras: {
      campanha: 3, campaign: 3, utm: 3, investimento: 2, impressoes: 3, impressions: 3, cliques: 3, clicks: 3, conversoes: 3,
      conversions: 3, ctr: 3, cpc: 3, cpa: 3, roas: 3, lead: 3, leads: 3, midia: 2, anuncio: 3, 'receita atribuida': 3, canal: 1, source: 1,
    },
    valores: [
      { valores: ['google', 'google ads', 'meta ads', 'facebook', 'instagram', 'tiktok', 'e mail', 'email', 'newsletter', 'linkedin', 'organico'], minimo: 0.6, peso: 2, descricao: 'valores de canais de mídia' },
    ],
  },
  atendimento: {
    id: 'atendimento',
    rotulo: 'Atendimento / Suporte',
    icone: '🎧',
    descricao: 'chamados, prioridades, tempos e satisfação',
    palavras: {
      ticket: 2, chamado: 3, chamados: 3, protocolo: 2, prioridade: 3, sla: 3, agente: 2, atendente: 3, csat: 3, nps: 2,
      'tempo de resposta': 3, 'primeira resposta': 3, abertura: 2, 'aberto em': 2, fechamento: 2, resolvido: 2, suporte: 3, solicitacao: 2,
    },
    valores: [
      { valores: ['baixa', 'media', 'alta', 'urgente', 'critica'], minimo: 0.8, peso: 2, descricao: 'valores de prioridade (baixa/média/alta)' },
      { valores: ['aberto', 'resolvido', 'fechado', 'em andamento', 'pendente'], minimo: 0.8, peso: 1, descricao: 'valores de status de chamado' },
    ],
  },
  educacao: {
    id: 'educacao',
    rotulo: 'Educação',
    icone: '🎓',
    descricao: 'alunos, turmas, notas e frequência',
    sensivel: true,
    palavras: {
      aluno: 3, alunos: 3, student: 3, turma: 3, disciplina: 3, nota: 2, notas: 2, frequencia: 2, faltas: 2, prova: 3, aprovado: 2,
      professor: 3, curso: 2, escola: 3, bimestre: 3, semestre: 1, parecer: 1, boletim: 3, 'media final': 3,
    },
    valores: [{ valores: ['aprovado', 'reprovado', 'recuperacao', 'cursando'], minimo: 0.8, peso: 2, descricao: 'valores de situação do aluno' }],
  },
  saude: {
    id: 'saude',
    rotulo: 'Saúde / Clínica',
    icone: '🩺',
    descricao: 'pacientes, consultas, procedimentos e exames',
    sensivel: true,
    palavras: {
      paciente: 3, consulta: 3, medico: 3, especialidade: 3, cid: 3, exame: 3, exames: 3, procedimento: 2, convenio: 3,
      diagnostico: 3, internacao: 3, coleta: 2, laboratorio: 3, prontuario: 3, clinica: 3, 'valor de referencia': 3, leito: 3,
    },
    valores: [
      { regex: /^[A-TV-Z]\d{2}(\.\d{1,2})?$/, minimo: 0.8, peso: 3, descricao: 'códigos no formato CID-10' },
      { valores: ['sus', 'particular', 'unimed', 'amil', 'bradesco saude', 'sulamerica', 'hapvida'], minimo: 0.5, peso: 2, descricao: 'nomes de convênio' },
    ],
  },
  generico: {
    id: 'generico',
    rotulo: 'Genérico',
    icone: '📊',
    descricao: 'qualquer planilha: métricas e categorias encontradas',
    palavras: {},
  },
};

// --- Papéis de negócio --------------------------------------------------------------------------------------
export const PAPEIS = [
  'data', 'valor', 'receita', 'despesa', 'preco', 'custo', 'quantidade', 'produto', 'categoria', 'cliente', 'pedido', 'regiao', 'vendedor', 'status',
  'tipo_lancamento', 'centro_custo', 'fornecedor', 'salario', 'departamento', 'cargo', 'colaborador', 'desligamento',
  'estoque_atual', 'estoque_minimo', 'armazem', 'item', 'movimento', 'campanha', 'canal', 'investimento', 'impressoes', 'cliques',
  'conversoes', 'receita_atribuida', 'lead', 'chamado', 'prioridade', 'agente', 'tempo_resposta', 'satisfacao', 'aluno', 'turma',
  'disciplina', 'nota', 'frequencia', 'presenca', 'faltas', 'paciente', 'especialidade', 'profissional', 'procedimento', 'convenio',
] as const;
export type PapelNegocio = (typeof PAPEIS)[number];

export interface DefPapel {
  rotulo: string;
  /** Como perguntar ("Qual coluna é o valor da venda?"). */
  pergunta: string;
  tipos: readonly TipoColuna[];
  palavras: readonly string[];
  /** Palavras que TIRAM a coluna do papel (ex.: "Preço Unitário" não é o valor total). */
  evitar?: readonly string[];
  valores?: readonly string[];
}

const CAT: readonly TipoColuna[] = ['categoria', 'uf', 'cidade', 'booleano'];

export const DEF_PAPEIS: Readonly<Record<PapelNegocio, DefPapel>> = {
  data: { rotulo: 'data', pergunta: 'Qual coluna é a data principal?', tipos: ['data'], palavras: ['data', 'dt', 'dia', 'date', 'emissao', 'abertura', 'consulta', 'coleta', 'captura', 'timestamp', 'competencia', 'vencimento', 'admissao'] },
  valor: {
    rotulo: 'valor', pergunta: 'Qual coluna é o valor principal (em R$)?', tipos: ['dinheiro'],
    palavras: ['total', 'valor', 'receita', 'faturamento', 'revenue', 'amount', 'liquido', 'venda', 'sales', 'consulta'], evitar: ['unitario', 'unit', 'frete', 'desconto', 'custo', 'cost', 'base', 'descontos'],
  },
  preco: { rotulo: 'preço unitário', pergunta: 'Qual coluna é o preço unitário?', tipos: ['dinheiro'], palavras: ['preco', 'price', 'unitario', 'unit'] },
  receita: { rotulo: 'receita', pergunta: 'Qual coluna é a receita (entradas)?', tipos: ['dinheiro'], palavras: ['receita', 'receitas', 'entradas', 'income', 'revenue'], evitar: ['atribuida'] },
  despesa: { rotulo: 'despesa', pergunta: 'Qual coluna é a despesa (saídas)?', tipos: ['dinheiro'], palavras: ['despesa', 'despesas', 'saidas', 'gastos', 'expense', 'expenses'] },
  custo: { rotulo: 'custo', pergunta: 'Qual coluna é o custo?', tipos: ['dinheiro', 'numero'], palavras: ['custo', 'cost'] },
  quantidade: { rotulo: 'quantidade', pergunta: 'Qual coluna é a quantidade?', tipos: ['numero'], palavras: ['qtd', 'quantidade', 'qtde', 'units', 'quantity', 'itens'], evitar: ['estoque', 'minimo'] },
  produto: { rotulo: 'produto', pergunta: 'Qual coluna é o produto?', tipos: [...CAT, 'texto', 'id'], palavras: ['produto', 'product', 'item', 'descricao', 'description'], evitar: ['code', 'codigo', 'sku'] },
  categoria: { rotulo: 'categoria', pergunta: 'Qual coluna é a categoria?', tipos: CAT, palavras: ['categoria', 'category', 'segmento', 'segment', 'linha', 'line', 'genero', 'grupo'] },
  cliente: { rotulo: 'cliente', pergunta: 'Qual coluna identifica o cliente?', tipos: ['id', 'categoria'], palavras: ['cliente', 'customer', 'comprador'] },
  pedido: { rotulo: 'pedido', pergunta: 'Qual coluna identifica o pedido?', tipos: ['id'], palavras: ['pedido', 'order', 'venda'] },
  regiao: { rotulo: 'região', pergunta: 'Qual coluna é a região (UF, cidade)?', tipos: ['uf', 'cidade', 'categoria'], palavras: ['uf', 'estado', 'regiao', 'region', 'cidade', 'city'] },
  vendedor: { rotulo: 'vendedor', pergunta: 'Qual coluna é o vendedor?', tipos: CAT, palavras: ['vendedor', 'seller', 'representante', 'consultor'] },
  status: { rotulo: 'status', pergunta: 'Qual coluna é o status?', tipos: CAT, palavras: ['status', 'situacao', 'state', 'resolvido', 'aprovado', 'ativo', 'pago'] },
  tipo_lancamento: {
    rotulo: 'tipo (entrada/saída)', pergunta: 'Qual coluna diz se é entrada ou saída?', tipos: CAT, palavras: ['tipo', 'natureza', 'type'],
    valores: ['entrada', 'saida', 'credito', 'debito', 'receita', 'despesa'],
  },
  centro_custo: { rotulo: 'centro de custo', pergunta: 'Qual coluna é o centro de custo?', tipos: CAT, palavras: ['centro de custo', 'centro', 'categoria', 'conta'] },
  fornecedor: { rotulo: 'fornecedor', pergunta: 'Qual coluna é o fornecedor?', tipos: CAT, palavras: ['fornecedor', 'supplier', 'vendor'] },
  salario: { rotulo: 'salário', pergunta: 'Qual coluna é o salário?', tipos: ['dinheiro'], palavras: ['salario', 'remuneracao', 'liquido', 'base'], evitar: ['descontos'] },
  departamento: { rotulo: 'departamento', pergunta: 'Qual coluna é o departamento?', tipos: CAT, palavras: ['departamento', 'area', 'setor', 'department'] },
  cargo: { rotulo: 'cargo', pergunta: 'Qual coluna é o cargo?', tipos: CAT, palavras: ['cargo', 'funcao', 'role', 'title'] },
  colaborador: { rotulo: 'colaborador', pergunta: 'Qual coluna identifica o colaborador?', tipos: ['id'], palavras: ['matricula', 'funcionario', 'colaborador', 'employee', 'nome'] },
  desligamento: { rotulo: 'data de desligamento', pergunta: 'Qual coluna é a data de desligamento?', tipos: ['data'], palavras: ['desligamento', 'demissao', 'saida'] },
  estoque_atual: { rotulo: 'estoque atual', pergunta: 'Qual coluna é o estoque atual?', tipos: ['numero'], palavras: ['estoque', 'on hand', 'saldo', 'disponivel'], evitar: ['minimo'] },
  estoque_minimo: { rotulo: 'estoque mínimo', pergunta: 'Qual coluna é o estoque mínimo?', tipos: ['numero'], palavras: ['minimo', 'reorder', 'ponto de pedido'] },
  armazem: { rotulo: 'armazém', pergunta: 'Qual coluna é o armazém?', tipos: CAT, palavras: ['armazem', 'warehouse', 'deposito', 'cd', 'loja'] },
  item: { rotulo: 'item (SKU)', pergunta: 'Qual coluna identifica o item?', tipos: ['id', 'categoria'], palavras: ['sku', 'item', 'codigo', 'code'] },
  movimento: {
    rotulo: 'tipo de movimento', pergunta: 'Qual coluna é o tipo de movimento?', tipos: CAT, palavras: ['movimento', 'movimentacao', 'tipo'],
    valores: ['entrada', 'saida', 'ajuste', 'transferencia', 'devolucao'],
  },
  campanha: { rotulo: 'campanha', pergunta: 'Qual coluna é a campanha?', tipos: CAT, palavras: ['campanha', 'campaign'] },
  canal: { rotulo: 'canal', pergunta: 'Qual coluna é o canal?', tipos: CAT, palavras: ['canal', 'channel', 'source', 'origem', 'midia'] },
  investimento: { rotulo: 'investimento', pergunta: 'Qual coluna é o investimento?', tipos: ['dinheiro', 'numero'], palavras: ['investimento', 'spend', 'gasto', 'custo', 'cost'] },
  impressoes: { rotulo: 'impressões', pergunta: 'Qual coluna são as impressões?', tipos: ['numero'], palavras: ['impressoes', 'impressions', 'alcance'] },
  cliques: { rotulo: 'cliques', pergunta: 'Qual coluna são os cliques?', tipos: ['numero'], palavras: ['cliques', 'clicks'] },
  conversoes: { rotulo: 'conversões', pergunta: 'Qual coluna são as conversões?', tipos: ['numero'], palavras: ['conversoes', 'conversions', 'vendas'] },
  receita_atribuida: { rotulo: 'receita atribuída', pergunta: 'Qual coluna é a receita das campanhas?', tipos: ['dinheiro'], palavras: ['receita', 'revenue', 'faturamento'] },
  lead: { rotulo: 'lead', pergunta: 'Qual coluna identifica o lead?', tipos: ['id'], palavras: ['lead'] },
  chamado: { rotulo: 'chamado', pergunta: 'Qual coluna identifica o chamado?', tipos: ['id'], palavras: ['ticket', 'chamado', 'protocolo', 'caso'] },
  prioridade: { rotulo: 'prioridade', pergunta: 'Qual coluna é a prioridade?', tipos: CAT, palavras: ['prioridade', 'priority', 'severidade'] },
  agente: { rotulo: 'agente', pergunta: 'Qual coluna é o atendente?', tipos: CAT, palavras: ['agente', 'atendente', 'equipe', 'analista', 'agent'] },
  tempo_resposta: { rotulo: 'tempo de resposta', pergunta: 'Qual coluna é o tempo de resposta?', tipos: ['numero'], palavras: ['tempo', 'resposta', 'sla', 'minutos', 'horas'] },
  satisfacao: { rotulo: 'satisfação', pergunta: 'Qual coluna é a satisfação?', tipos: ['numero'], palavras: ['csat', 'satisfacao', 'nps', 'avaliacao', 'nota'] },
  aluno: { rotulo: 'aluno', pergunta: 'Qual coluna identifica o aluno?', tipos: ['id'], palavras: ['aluno', 'student', 'matricula'] },
  turma: { rotulo: 'turma', pergunta: 'Qual coluna é a turma (ou nível)?', tipos: CAT, palavras: ['turma', 'classe', 'serie', 'class', 'nivel', 'level', 'modulo'] },
  disciplina: { rotulo: 'disciplina', pergunta: 'Qual coluna é a disciplina?', tipos: CAT, palavras: ['disciplina', 'materia', 'subject', 'curso'] },
  nota: { rotulo: 'nota', pergunta: 'Qual coluna é a nota?', tipos: ['numero'], palavras: ['media', 'nota', 'grade', 'score'] },
  frequencia: { rotulo: 'frequência', pergunta: 'Qual coluna é a frequência?', tipos: ['porcentagem', 'numero'], palavras: ['frequencia', 'presenca', 'attendance'] },
  presenca: {
    rotulo: 'presença', pergunta: 'Qual coluna diz se a pessoa veio (presente/faltou)?', tipos: CAT, palavras: ['presenca', 'comparecimento', 'compareceu', 'attendance'],
    valores: ['presente', 'faltou', 'ausente', 'compareceu', 'falta', 'sim', 'nao'],
  },
  faltas: { rotulo: 'faltas', pergunta: 'Qual coluna são as faltas?', tipos: ['numero'], palavras: ['faltas', 'ausencias', 'absences'] },
  paciente: { rotulo: 'paciente', pergunta: 'Qual coluna identifica o paciente?', tipos: ['id'], palavras: ['paciente', 'patient'] },
  especialidade: { rotulo: 'especialidade', pergunta: 'Qual coluna é a especialidade?', tipos: CAT, palavras: ['especialidade', 'specialty', 'setor'] },
  profissional: { rotulo: 'profissional', pergunta: 'Qual coluna é o profissional?', tipos: CAT, palavras: ['medico', 'profissional', 'doctor', 'dentista'] },
  procedimento: { rotulo: 'procedimento', pergunta: 'Qual coluna é o procedimento?', tipos: CAT, palavras: ['procedimento', 'exame', 'procedure'] },
  convenio: { rotulo: 'convênio', pergunta: 'Qual coluna é o convênio?', tipos: CAT, palavras: ['convenio', 'plano', 'insurance'] },
};
