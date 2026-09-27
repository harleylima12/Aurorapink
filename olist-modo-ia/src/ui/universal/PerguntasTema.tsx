import { useMemo } from 'react';

import type { ColunaConfig, PerfilColuna } from '../../universal/perfil';
import { EXPLICA_PUBLICO, objetivoPadrao, objetivosPossiveis, planejarTema, PUBLICOS, ROTULO_PUBLICO, type EscolhaTema, type Publico } from '../../universal/temas/aplicar';
import { DEF_PAPEIS, DEF_TEMAS, TEMAS, type PapelNegocio, type Tema } from '../../universal/temas/definicoes';
import type { ResultadoTema } from '../../universal/temas/detector';
import { escolhaDoTema, essencialFaltando, fixar, perfisDaConfig, perguntaDoPapel } from '../../universal/temas/escolha';
import { candidatas } from '../../universal/temas/papeis';
import { receitaDe } from '../../universal/temas/receitas';

interface Props {
  deteccao: ResultadoTema;
  escolha: EscolhaTema;
  perfis: readonly PerfilColuna[];
  config: readonly ColunaConfig[];
  aoMudar: (escolha: EscolhaTema) => void;
}

const NIVEL = { alta: 'alta', media: 'média', baixa: 'baixa' } as const;

function Chips<T extends string>({ rotulo, opcoes, valor, aoEscolher, nome }: { rotulo: string; nome: string; opcoes: { id: T; rotulo: string; titulo?: string; desligado?: boolean }[]; valor: T | undefined; aoEscolher: (v: T) => void }) {
  return (
    <fieldset className="pergunta-tema" data-pergunta={nome}>
      <legend>{rotulo}</legend>
      <div className="chips" role="group" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={valor === o.id} title={o.titulo} disabled={o.desligado} onClick={() => aoEscolher(o.id)}>
            {o.rotulo}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Cartão do tema na tela "Entendi assim" (Fase 5B): o que o app achou (tema, confiança, porquê) e 2 a 4 perguntas
 * rápidas. Todas são opcionais: sem resposta, vale o padrão que aparece marcado.
 */
export function PerguntasTema({ deteccao, escolha, perfis, config, aoMudar }: Props) {
  const def = DEF_TEMAS[escolha.tema];
  const receita = receitaDe(escolha.tema);
  const plano = useMemo(() => planejarTema(escolha, config), [escolha, config]);
  const objetivos = plano ? objetivosPossiveis(escolha.tema, plano, escolha.papeis) : [];
  const objetivoAtual = escolha.objetivo ?? (plano ? objetivoPadrao(escolha.tema, plano, escolha.papeis) : undefined);
  const faltando = essencialFaltando(escolha);
  const trocouTema = escolha.tema !== deteccao.tema;
  const perguntarTema = deteccao.nivel !== 'alta' && !trocouTema;
  const opcoesTema: Tema[] = [...new Set<Tema>([...deteccao.ranking.slice(0, 3).map((r) => r.tema), deteccao.tema, 'generico'])];
  const mudarTema = (t: Tema) => aoMudar(escolhaDoTema(t, perfis, config, { publico: escolha.publico }));
  const papeisUsados = receita ? receita.papeis.filter((p) => escolha.papeis[p]) : [];
  const perfisTipados = perfisDaConfig(perfis, config);
  const nomeColuna = (id: string | undefined) => config.find((c) => c.id === id)?.rotulo ?? id ?? '';

  return (
    <section className="painel tema-cartao" aria-labelledby="titulo-tema" data-tema={escolha.tema} data-confianca={deteccao.nivel}>
      <header>
        <h2 id="titulo-tema">
          <span aria-hidden="true">{def.icone}</span> {trocouTema ? `Tema: ${def.rotulo} (escolhido por você)` : escolha.tema === 'generico' ? 'Não reconheci um tema: painel genérico' : `Parece uma planilha de ${def.rotulo}`}
        </h2>
        {!trocouTema && (
          <p className="nota" data-testid="tema-porque">
            Confiança {NIVEL[deteccao.nivel]} ({Math.round(deteccao.confianca * 100)}%) · {deteccao.porque.join(' · ')}
          </p>
        )}
        {def.sensivel && <p className="nota">Tema sensível: a proteção de grupos pequenos fica ligada por padrão.</p>}
      </header>

      {perguntarTema ? (
        <Chips
          nome="tema"
          rotulo="Não tenho certeza. Esta planilha é de quê?"
          opcoes={opcoesTema.map((t) => ({ id: t, rotulo: `${DEF_TEMAS[t].icone} ${DEF_TEMAS[t].rotulo}` }))}
          valor={escolha.tema}
          aoEscolher={mudarTema}
        />
      ) : null}

      {receita && objetivos.length > 0 && (
        <Chips
          nome="objetivo"
          rotulo="O que você quer ver primeiro?"
          opcoes={objetivos.map((o) => ({ id: o.id, rotulo: o.rotulo, titulo: `${o.paineis} painéis possíveis com estas colunas`, desligado: o.paineis === 0 }))}
          valor={objetivoAtual}
          aoEscolher={(objetivo) => aoMudar({ ...escolha, objetivo })}
        />
      )}

      <Chips
        nome="publico"
        rotulo="Quem vai ver?"
        opcoes={PUBLICOS.map((p) => ({ id: p, rotulo: ROTULO_PUBLICO[p], titulo: EXPLICA_PUBLICO[p] }))}
        valor={escolha.publico ?? 'equipe'}
        aoEscolher={(publico: Publico) => aoMudar({ ...escolha, publico })}
      />
      <p className="nota">{ROTULO_PUBLICO[escolha.publico ?? 'equipe']}: {EXPLICA_PUBLICO[escolha.publico ?? 'equipe']}.</p>

      {faltando && (
        <label className="pergunta-tema pergunta-papel" data-pergunta="papel">
          <span>{perguntaDoPapel(faltando)}</span>
          <select
            value=""
            onChange={(e) => aoMudar(fixar(escolha, faltando, e.target.value === '__nao' ? '' : e.target.value, perfis, config))}
            aria-label={perguntaDoPapel(faltando)}
          >
            <option value="" disabled>
              Escolha a coluna…
            </option>
            {candidatas(faltando, perfisTipados).map((c) => (
              <option key={c.id} value={c.id}>
                {c.original}
              </option>
            ))}
            <option value="__nao">Não tem (esconder os painéis que dependem dela)</option>
          </select>
        </label>
      )}

      {receita && (
        <details className="papeis-tema">
          <summary>
            Colunas que usei para cada papel ({papeisUsados.length} de {receita.papeis.length})
          </summary>
          <ul>
            {receita.papeis.map((p: PapelNegocio) => (
              <li key={p}>
                <label>
                  <span>{DEF_PAPEIS[p].rotulo}</span>
                  <select aria-label={`Coluna de ${DEF_PAPEIS[p].rotulo}`} value={escolha.papeis[p] ?? ''} onChange={(e) => aoMudar(fixar(escolha, p, e.target.value, perfis, config))}>
                    <option value="">— nenhuma —</option>
                    {candidatas(p, perfisTipados).map((c) => (
                      <option key={c.id} value={c.id}>
                        {nomeColuna(c.id)}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!perguntarTema && (
        <label className="trocar-tema">
          Trocar o tema:{' '}
          <select value={escolha.tema} onChange={(e) => mudarTema(e.target.value as Tema)} aria-label="Tema da planilha">
            {TEMAS.map((t) => (
              <option key={t} value={t}>
                {DEF_TEMAS[t].icone} {DEF_TEMAS[t].rotulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="nota">Tudo aqui é opcional: se você pular, uso o que está marcado.</p>
    </section>
  );
}
