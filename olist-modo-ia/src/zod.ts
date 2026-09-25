/**
 * Zod configurado para a CSP do app. Todo o código importa o `z` DAQUI, nunca de 'zod'
 * (um teste em tests/unit/guardas.test.ts confere).
 *
 * Por quê: o Zod 4 testa se pode usar `new Function` (para acelerar a validação).
 * A CSP bloqueia e o navegador registra uma violação, mesmo com o erro tratado.
 * Com `jitless`, o Zod nem tenta: zero violações, e a validação continua igual.
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
