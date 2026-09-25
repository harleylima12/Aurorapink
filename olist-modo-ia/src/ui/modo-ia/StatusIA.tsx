import { formatar } from '../../format/numeros';
import type { ControleIA } from '../../modo-ia/useIALocal';

/** MB já baixados, lidos do texto de progresso do WebLLM ("… 412MB fetched …"), quando ele informa. */
function mbBaixados(texto: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*MB fetched/i.exec(texto);
  return m ? Number(m[1]) : null;
}

function restante(fracao: number, segundos: number): string | null {
  if (fracao <= 0.02 || fracao >= 1 || segundos <= 0) return null;
  const s = Math.round((segundos * (1 - fracao)) / fracao);
  return s < 60 ? `~${s} s restantes` : `~${Math.round(s / 60)} min restantes`;
}

/** Status do painel: "Modo Rápido" / "Baixando modelo 43% (412 MB)" / "IA pronta · 100% local". */
export function StatusIA({ ia }: { ia: ControleIA }) {
  const { estado } = ia;
  if (estado.fase === 'pronta') {
    const { info } = estado;
    return (
      <>
        <p className="status-ia" data-status="ia">
          <span className="ponto" aria-hidden="true" /> IA pronta · 100% local
        </p>
        <p className="status-detalhe" data-modelo={info.id}>
          {info.id} · carregou em {formatar(info.segundosCarga, 'dec1')} s
          {info.fonte === 'demo' ? ' · pesos do Hugging Face (modo demo)' : info.fonte === 'local' ? ' · pesos servidos por este site' : ''}
        </p>
      </>
    );
  }
  if (estado.fase === 'baixando') {
    const { fracao, texto, segundos } = estado.progresso;
    const mb = mbBaixados(texto);
    const falta = restante(fracao, segundos);
    return (
      <>
        <p className="status-ia" data-status="baixando">
          <span className="ponto" aria-hidden="true" /> Baixando modelo {Math.round(fracao * 100)}%
          {mb !== null ? ` (${formatar(mb, 'int')} MB)` : ''}
        </p>
        <progress className="barra-ia" max={1} value={fracao} aria-label="Progresso do download do modelo" />
        <p className="status-detalhe">
          {falta ? `${falta} · ` : ''}download único; depois abre em segundos.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="status-ia" data-status="rapido">
        <span className="ponto" aria-hidden="true" /> Modo Rápido · sem modelo, 100% local
      </p>
      {estado.fase === 'verificando' && <p className="status-detalhe">Verificando se este navegador tem WebGPU…</p>}
      {estado.fase === 'sem-webgpu' && <p className="status-detalhe">{estado.motivo}</p>}
      {(estado.fase === 'disponivel' || estado.fase === 'erro') && (
        <div className="ativar-ia">
          {estado.fase === 'erro' && <p className="erro">A IA local não carregou: {estado.motivo}. O Modo Rápido continua funcionando.</p>}
          <button type="button" className="botao-ativar-ia" onClick={ia.ativar}>
            {estado.fase === 'erro' ? 'Tentar de novo' : 'Ativar IA local'}
          </button>
          <p className="status-detalhe">
            {estado.fase === 'disponivel' ? `${estado.gpu} · ` : ''}baixa o modelo uma vez (centenas de MB) e roda no seu computador. Ela só entra quando o Modo Rápido não entende a pergunta.
          </p>
        </div>
      )}
    </>
  );
}
