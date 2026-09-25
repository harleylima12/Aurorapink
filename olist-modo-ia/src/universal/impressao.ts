/**
 * Modelos de planilha ("joga e pronto", seção 7A item 8).
 *
 * Impressão digital do LAYOUT = nomes normalizados + tipos detectados das colunas, na ordem. As vendas do
 * mês seguinte (mesmas colunas, outros valores) têm a mesma impressão: o app aplica a configuração salva e
 * abre direto no dashboard. Tudo fica no localStorage deste navegador; exportar/importar leva para outro PC.
 */
import { normalizar } from '../router/normalizar';
import { z } from '../zod';
import { TIPOS_COLUNA, type ColunaConfig, type PerfilColuna } from './perfil';

/** FNV-1a de 64 bits (em BigInt): rápido, determinístico e sem depender de crypto.subtle. */
export function hash64(texto: string): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(texto)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function impressaoDigital(perfis: readonly Pick<PerfilColuna, 'original' | 'tipo'>[]): string {
  return hash64(perfis.map((p) => `${normalizar(p.original)}:${p.tipo}`).join('|'));
}

const colunaConfig = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  original: z.string(),
  rotulo: z.string().min(1).max(80),
  tipo: z.enum(TIPOS_COLUNA),
  papel: z.enum(['metrica', 'dimensao', 'tempo', 'ignorar']),
  agregacao: z.enum(['soma', 'media', 'contagem_distinta']).optional(),
  decimal: z.enum(['br', 'us']).optional(),
  escalaPct: z.enum(['texto', 'fracao']).optional(),
  formatosData: z.array(z.string().regex(/^[%A-Za-z/\-.: ]+$/)).max(6).optional(),
  mascara: z.enum(['email', 'cpf', 'cnpj', 'telefone', 'nome']).optional(),
  inteiro: z.boolean().optional(),
});

export const modeloSchema = z.object({
  formato: z.literal('olist-modo-ia/modelo-planilha'),
  versao: z.literal(1),
  impressao: z.string().regex(/^[0-9a-f]{16}$/),
  nome: z.string().min(1).max(120),
  colunas: z.array(colunaConfig).min(1).max(300),
  salvoEm: z.string(),
});
export type ModeloPlanilha = z.infer<typeof modeloSchema>;

export function criarModelo(nome: string, impressao: string, colunas: readonly ColunaConfig[]): ModeloPlanilha {
  return modeloSchema.parse({ formato: 'olist-modo-ia/modelo-planilha', versao: 1, impressao, nome, colunas, salvoEm: new Date().toISOString() });
}

/** Importar é validar: um .json de fora nunca entra sem passar pelo schema (e nunca vira SQL solto). */
export function importarModelo(texto: string): ModeloPlanilha {
  return modeloSchema.parse(JSON.parse(texto) as unknown);
}

/** O modelo salvo só vale se as colunas ainda baterem com a planilha nova (mesmos ids). */
export function aplicarModelo(modelo: ModeloPlanilha, perfis: readonly PerfilColuna[]): ColunaConfig[] | null {
  const ids = new Set(perfis.map((p) => p.id));
  if (modelo.colunas.length !== perfis.length || modelo.colunas.some((c) => !ids.has(c.id))) return null;
  return modelo.colunas;
}

const CHAVE = 'olist-modo-ia:modelos-planilha';

export function lerModelos(): ModeloPlanilha[] {
  try {
    const bruto = JSON.parse(window.localStorage.getItem(CHAVE) ?? '[]') as unknown;
    return Array.isArray(bruto) ? bruto.flatMap((m) => (modeloSchema.safeParse(m).success ? [m as ModeloPlanilha] : [])) : [];
  } catch {
    return [];
  }
}

export function salvarModelo(modelo: ModeloPlanilha): void {
  try {
    const outros = lerModelos().filter((m) => m.impressao !== modelo.impressao);
    window.localStorage.setItem(CHAVE, JSON.stringify([...outros, modelo].slice(-20)));
  } catch {
    // sem armazenamento: só não lembra
  }
}

export function apagarModelo(impressao: string): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lerModelos().filter((m) => m.impressao !== impressao)));
  } catch {
    // idem
  }
}

export const buscarModelo = (impressao: string) => lerModelos().find((m) => m.impressao === impressao) ?? null;

export const CHAVE_MODELOS = CHAVE;
