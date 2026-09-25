/**
 * Excel -> CSV com a SheetJS (seção 5: "empacotada localmente, pelo tarball oficial da própria SheetJS").
 *
 * PENDENTE (docs/DECISOES.md D39): o domínio da SheetJS (cdn.sheetjs.com) é bloqueado na nuvem onde a
 * Fase 5 foi escrita, e a versão do npm está desatualizada (a especificação proíbe usá-la). Por isso a
 * biblioteca é procurada com `import.meta.glob`: sem ela instalada, o glob volta vazio, o build passa e
 * o app avisa "salve como CSV". Com ela instalada (roteiro do PC no CLAUDE.md), o mesmo código passa a
 * ler .xlsx sem nenhuma outra mudança. A interface abaixo é o MÍNIMO que usamos; conferir contra
 * node_modules/xlsx/types/index.d.ts quando a biblioteca chegar (P8).
 */
import { ErroPlanilha } from './erros';

export interface PlanilhaSheetJS {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

export interface SheetJS {
  read(dados: Uint8Array, opcoes: { type: 'array'; cellDates?: boolean }): PlanilhaSheetJS;
  utils: {
    sheet_to_json(aba: unknown, opcoes: { header: 1; raw: boolean; defval: string; blankrows: boolean; dateNF?: string }): unknown[][];
  };
}

const modulos = import.meta.glob<SheetJS>('/node_modules/xlsx/xlsx.mjs');

export async function carregarSheetJS(): Promise<SheetJS | null> {
  const carregar = Object.values(modulos)[0];
  return carregar ? carregar() : null;
}

function celulaCsv(v: unknown): string {
  const t = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** A aba com os dados é a que tem mais células preenchidas (a "Leia-me" perde). */
export function escolherAba(abas: { nome: string; linhas: unknown[][] }[]): { nome: string; linhas: unknown[][] } | undefined {
  const preenchidas = (l: unknown[][]) => l.reduce((s, r) => s + r.filter((c) => String(c ?? '').trim() !== '').length, 0);
  return [...abas].sort((a, b) => preenchidas(b.linhas) - preenchidas(a.linhas))[0];
}

export async function lerExcelComoCsv(bytes: Uint8Array, sheetjs?: SheetJS | null): Promise<{ csv: string; aba: string; abas: string[] }> {
  const xlsx = sheetjs === undefined ? await carregarSheetJS() : sheetjs;
  if (!xlsx) {
    throw new ErroPlanilha(
      'Ler Excel precisa da biblioteca SheetJS, que ainda não foi instalada neste app.',
      'Por enquanto, no Excel use "Salvar como > CSV (separado por vírgulas)" e arraste o CSV.',
    );
  }
  const planilha = xlsx.read(bytes, { type: 'array', cellDates: true });
  const abas = planilha.SheetNames.map((nome) => ({
    nome,
    // raw:false = o texto como aparece na célula ("R$ 1.234,56", "12,5%"): o mesmo caminho do CSV.
    linhas: xlsx.utils.sheet_to_json(planilha.Sheets[nome], { header: 1, raw: false, defval: '', blankrows: true, dateNF: 'yyyy-mm-dd' }),
  }));
  const escolhida = escolherAba(abas);
  if (!escolhida) throw new ErroPlanilha('O arquivo Excel não tem nenhuma aba com dados.');
  const csv = escolhida.linhas.map((l) => l.map(celulaCsv).join(',')).join('\n');
  return { csv, aba: escolhida.nome, abas: planilha.SheetNames };
}
