import { useEffect, useMemo, useState } from 'react';

import { CHAVES, lerFixados, type Fixado } from '../../modo-ia/armazenamento';
import { responderSpec, type ContextoResposta, type Resposta } from '../../modo-ia/responder';
import { criarRoteador } from '../../router/layer0';
import { semanticaOlist } from '../../semantic';
import { useDados } from '../contexto';
import { CartaoResposta } from './CartaoResposta';

/** Respostas fixadas pelo Modo IA, recalculadas a cada abertura (nada de número guardado). */
export function Fixados() {
  const { motor, meta } = useDados();
  const [fixados, setFixados] = useState<Fixado[]>(() => lerFixados());
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});

  useEffect(() => {
    const atualizar = (e: Event) => {
      if (e instanceof CustomEvent && e.detail === CHAVES.fixados) setFixados(lerFixados());
    };
    window.addEventListener('olist-armazenamento', atualizar);
    return () => window.removeEventListener('olist-armazenamento', atualizar);
  }, []);

  const ctx = useMemo<ContextoResposta>(
    () => ({ executor: motor, semantica: semanticaOlist, roteador: criarRoteador(semanticaOlist, {}, meta.ancora), mesesParciais: meta.mesesParciais, ancora: meta.ancora }),
    [motor, meta],
  );

  useEffect(() => {
    let vivo = true;
    void Promise.all(fixados.map(async (f) => [f.id, await responderSpec(f.titulo, f.spec, ctx)] as const)).then((lista) => {
      if (vivo) setRespostas(Object.fromEntries(lista));
    });
    return () => {
      vivo = false;
    };
  }, [fixados, ctx]);

  if (!fixados.length) return null;
  return (
    <section className="fixados" aria-label="Fixados do Modo IA">
      <h2>Fixados do Modo IA</h2>
      <div className="grade">
        {fixados.map((f) => {
          const r = respostas[f.id];
          return r ? (
            <div key={f.id} className="painel">
              <CartaoResposta resposta={{ ...r, texto: { ...r.texto, titulo: f.titulo } }} fixadoId={f.id} selo="Fixado" />
            </div>
          ) : null;
        })}
      </div>
    </section>
  );
}
