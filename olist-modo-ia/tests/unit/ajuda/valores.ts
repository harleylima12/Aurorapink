/** Valores distintos reais de cada dimensão categórica (o mesmo que o app carrega ao abrir o Modo IA). */
import type { Valores } from '../../../src/router/layer0';
import { consultaValoresDistintos } from '../../../src/router/valores';
import { semanticaOlist } from '../../../src/semantic';
import { abrirBancoTeste } from './duckdbNode';

let cache: Promise<Valores> | null = null;

export function carregarValores(): Promise<Valores> {
  cache ??= (async () => {
    const banco = await abrirBancoTeste();
    const { sql } = consultaValoresDistintos(semanticaOlist);
    const linhas = banco.consultar(sql);
    const valores: Record<string, string[]> = {};
    for (const l of linhas) (valores[String(l.dimensao)] ??= []).push(String(l.valor));
    return valores;
  })();
  return cache;
}
