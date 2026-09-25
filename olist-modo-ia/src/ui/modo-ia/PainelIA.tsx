import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { EstadoModoIA } from '../../modo-ia/useModoIA';
import { CartaoResposta } from './CartaoResposta';

const SUGESTOES = [
  'Top 5 categorias em 2018',
  'Faturamento mês a mês',
  'Nota de quem recebeu atrasado vs no prazo',
  'Onde o frete é mais caro?',
  'Por que o faturamento caiu em dezembro de 2017?',
  'Qual o lucro por categoria?',
];

const temWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

interface Props {
  estado: EstadoModoIA;
  aoFechar: () => void;
  campo: React.RefObject<HTMLInputElement | null>;
}

export function PainelIA({ estado, aoFechar, campo }: Props) {
  const [texto, setTexto] = useState('');
  const corpo = useRef<HTMLDivElement>(null);

  // Rola só o painel (não a página) até a resposta nova.
  useEffect(() => {
    const el = corpo.current;
    if (el && estado.historico.length) el.scrollTop = el.scrollHeight;
  }, [estado.historico.length]);

  // O campo fica sempre habilitado (dá para digitar enquanto os valores carregam) e ganha foco ao ficar pronto.
  useEffect(() => {
    if (estado.pronto) campo.current?.focus();
  }, [estado.pronto, campo]);

  const enviar = (pergunta: string) => {
    if (!pergunta.trim() || estado.pensando || !estado.pronto) return;
    setTexto('');
    void estado.perguntar(pergunta);
  };

  const aoEnviar = (e: FormEvent) => {
    e.preventDefault();
    enviar(texto);
  };

  return (
    <aside className="painel-ia" aria-label="Modo IA">
      <header className="painel-ia-topo">
        <div>
          <h2>✨ Modo IA</h2>
          <p className="status-ia" data-status="rapido">
            <span className="ponto" aria-hidden="true" /> Modo Rápido · sem modelo, 100% local
          </p>
          <p className="status-detalhe">
            IA local (WebGPU) chega na Fase 4 · este navegador {temWebGpu ? 'tem' : 'não tem'} WebGPU.
          </p>
        </div>
        <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar o Modo IA">
          ✕
        </button>
      </header>

      <div className="painel-ia-corpo" ref={corpo} aria-live="polite" aria-busy={estado.pensando}>
        {estado.erro && <p className="erro">Não consegui preparar o Modo IA: {estado.erro}</p>}
        {!estado.pronto && !estado.erro && <p className="nota">Carregando os valores da base…</p>}

        {estado.insights.length > 0 && (
          <section aria-label="Insights automáticos" className="insights-automaticos">
            {estado.insights.map((r) => (
              <CartaoResposta key={r.id} resposta={r} selo="Insight automático" />
            ))}
          </section>
        )}

        {estado.historico.map(({ resposta, msTela }) => (
          <CartaoResposta key={resposta.id} resposta={resposta} msTela={msTela} aoEscolher={enviar} />
        ))}
        {estado.pensando && <p className="nota">Calculando…</p>}
      </div>

      <footer className="painel-ia-rodape">
        <div className="chips chips-rolagem" role="group" aria-label="Sugestões de perguntas">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => enviar(s)} disabled={!estado.pronto}>
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={aoEnviar} className="pergunta">
          <label htmlFor="campo-pergunta" className="visualmente-oculto">
            Pergunta em português
          </label>
          <input
            id="campo-pergunta"
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pergunte em português…  (atalho: /)"
            autoComplete="off"
            maxLength={300}
          />
          <button type="submit" disabled={!estado.pronto || !texto.trim() || estado.pensando}>
            Enviar
          </button>
        </form>
        <p className="nota">As respostas usam a base inteira; os filtros da barra lateral não se aplicam aqui.</p>
      </footer>
    </aside>
  );
}
