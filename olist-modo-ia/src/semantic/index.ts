import bruto from './semantic.json';
import { carregarSemantica, type Semantica } from './schema';

/** Camada semântica da Olist, validada ao carregar (erro de digitação no JSON quebra o build dos testes). */
export const semanticaOlist: Semantica = carregarSemantica(bruto);
