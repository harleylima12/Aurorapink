import { useEffect, useState } from 'react';

import { formatar } from '../../format/numeros';
import { apagarDadosLocais, type RelatorioApagar } from '../../privacidade/apagar';
import { lerEstado, ouvir, type EstadoFirewall } from '../../privacidade/firewall';

function useFirewall(): EstadoFirewall {
  const [estado, setEstado] = useState(lerEstado);
  useEffect(() => ouvir(setEstado), []);
  return estado;
}

const TEXTO_MODO = {
  estrito: 'Modo local (estrito): nenhum domínio externo é permitido.',
  demo: 'Modo demo: só os pesos do modelo de IA podem vir de fora (huggingface.co e *.hf.co), e só se você ativar a IA.',
};

/** Contador ao vivo (seção 14): "Requisições externas desde que você abriu: 0". */
export function ContadorExternas() {
  const f = useFirewall();
  return (
    <p className="contador-externas" data-externas={f.externas} data-firewall={f.ativo ? 'ativo' : 'inativo'} role="status">
      🛡️ Requisições externas desde que você abriu: <strong>{f.externas}</strong>
      {f.bloqueadas ? ` (${f.bloqueadas} bloqueadas)` : ''}
    </p>
  );
}

function Relatorio({ r }: { r: RelatorioApagar }) {
  return (
    <p className="nota" role="status" data-testid="relatorio-apagar">
      Apagado: {formatar(r.cacheMB, 'dec1')} MB em {r.caches.length} {r.caches.length === 1 ? 'cache' : 'caches'} · {r.bancos.length} {r.bancos.length === 1 ? 'banco' : 'bancos'} IndexedDB ·{' '}
      {r.arquivosOpfs} {r.arquivosOpfs === 1 ? 'item' : 'itens'} no OPFS · {r.chaves} {r.chaves === 1 ? 'chave' : 'chaves'} do localStorage. Recarregue a página para começar do zero.
      {r.erros.length ? ` Não consegui apagar: ${r.erros.join('; ')}.` : ''}
    </p>
  );
}

/** Bloco de privacidade: modo, firewall, contador, lista das requisições e "Apagar dados locais". */
export function SeloPrivacidade() {
  const f = useFirewall();
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioApagar | null>(null);
  return (
    <section className="selo-privacidade" aria-label="Privacidade" data-modo={f.modo}>
      <ContadorExternas />
      <p className="nota">
        {TEXTO_MODO[f.modo]} Firewall (Service Worker): {f.ativo ? 'ativo, vendo a página e os workers' : `inativo (${f.motivo ?? 'carregando'})`}; a CSP
        bloqueia o resto de qualquer jeito.
      </p>
      {f.recentes.length > 0 && (
        <details>
          <summary>Ver as requisições externas ({f.recentes.length})</summary>
          <ul className="lista-rede">
            {f.recentes.map((r, i) => (
              <li key={i}>
                {r.bloqueada ? '⛔' : '↗'} {r.host}
                {r.caminho} · {r.origem} · {r.destino}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="zona-botoes selo-botoes">
        {!confirmar ? (
          <button type="button" className="botao-secundario" onClick={() => setConfirmar(true)}>
            Apagar dados locais
          </button>
        ) : (
          <>
            <span className="nota">Apagar cache do app, pesos do modelo, planilha guardada, modelos de planilha, fixados e avaliações?</span>
            <button
              type="button"
              className="botao-secundario perigo"
              disabled={apagando}
              onClick={() => {
                setApagando(true);
                void apagarDadosLocais().then((r) => {
                  setRelatorio(r);
                  setApagando(false);
                  setConfirmar(false);
                });
              }}
            >
              {apagando ? 'Apagando…' : 'Sim, apagar tudo'}
            </button>
            <button type="button" className="botao-secundario" onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </>
        )}
      </div>
      {relatorio && <Relatorio r={relatorio} />}
    </section>
  );
}
