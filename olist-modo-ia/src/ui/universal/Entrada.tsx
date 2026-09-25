import { useEffect, useRef, useState, type DragEvent } from 'react';

import { apagarModelo, importarModelo, lerModelos, salvarModelo, type ModeloPlanilha } from '../../universal/impressao';
import { apagarUltima, definirLembrar, lembrarLigado, lerUltima, type ArquivoGuardado } from '../../universal/ultima';

interface Props {
  aoEscolher: (arquivos: ArquivoGuardado[]) => void;
  aoVerDemo: () => void;
  erro?: { mensagem: string; dica?: string } | null;
  leParquet: boolean;
}

async function lerArquivos(lista: FileList | File[]): Promise<ArquivoGuardado[]> {
  return Promise.all([...lista].map(async (f) => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

function baixarJson(nome: string, conteudo: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tela inicial do Modo Universal: arrastar planilhas, modelos salvos e "lembrar a última". */
export function Entrada({ aoEscolher, aoVerDemo, erro, leParquet }: Props) {
  const [arrastando, setArrastando] = useState(false);
  const [modelos, setModelos] = useState<ModeloPlanilha[]>(() => lerModelos());
  const [lembrar, setLembrar] = useState(() => lembrarLigado());
  const [ultima, setUltima] = useState<ArquivoGuardado[] | null>(null);
  const [aviso, setAviso] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const campoModelo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void lerUltima().then(setUltima);
  }, [lembrar]);

  const soltar = async (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) aoEscolher(await lerArquivos(e.dataTransfer.files));
  };

  const importar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try {
      const m = importarModelo(await arquivo.text());
      salvarModelo(m);
      setModelos(lerModelos());
      setAviso(`Modelo "${m.nome}" importado: a próxima planilha com esse layout abre direto.`);
    } catch {
      setAviso('Esse arquivo não é um modelo de planilha válido.');
    }
  };

  return (
    <div className="universal-entrada">
      <div
        className={`zona-arquivos${arrastando ? ' arrastando' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => void soltar(e)}
        data-testid="zona-arquivos"
      >
        <p className="zona-icone" aria-hidden="true">
          📂
        </p>
        <h2>Arraste sua planilha aqui</h2>
        <p>
          CSV{leParquet ? ', Parquet' : ''} ou Excel. Um ou vários arquivos (ex.: vendas + clientes). Tudo é lido no seu navegador: <strong>nada é enviado</strong>.
        </p>
        <div className="zona-botoes">
          <button type="button" className="botao-primario" onClick={() => campo.current?.click()}>
            Escolher arquivos
          </button>
          <button type="button" className="botao-secundario" onClick={aoVerDemo}>
            Ver demo com dados da Olist
          </button>
        </div>
        <input
          ref={campo}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.xlsx,.xls,.parquet"
          className="visualmente-oculto"
          aria-label="Escolher planilhas"
          onChange={(e) => {
            if (e.target.files?.length) void lerArquivos(e.target.files).then(aoEscolher);
            e.target.value = '';
          }}
        />
        {erro && (
          <div className="erro-planilha" role="alert">
            <p>{erro.mensagem}</p>
            {erro.dica && <p className="dica">{erro.dica}</p>}
          </div>
        )}
      </div>

      <div className="universal-lateral">
        <section className="painel" aria-labelledby="titulo-modelos">
          <h2 id="titulo-modelos">Modelos de planilha</h2>
          <p className="nota">Quando você gera um dashboard, o app guarda o layout (nomes e tipos das colunas). Planilha com o mesmo layout abre direto.</p>
          {modelos.length ? (
            <ul className="lista-modelos">
              {modelos.map((m) => (
                <li key={m.impressao}>
                  <div>
                    <strong>{m.nome}</strong>
                    <small>
                      {m.colunas.length} colunas · salvo em {new Date(m.salvoEm).toLocaleDateString('pt-BR')}
                    </small>
                  </div>
                  <button type="button" onClick={() => baixarJson(`modelo-${m.nome.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`, m)}>
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      apagarModelo(m.impressao);
                      setModelos(lerModelos());
                    }}
                  >
                    Apagar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nota">Nenhum modelo salvo ainda.</p>
          )}
          <button type="button" className="botao-secundario" onClick={() => campoModelo.current?.click()}>
            Importar modelo (.json)
          </button>
          <input ref={campoModelo} type="file" accept=".json,application/json" className="visualmente-oculto" aria-label="Importar modelo" onChange={(e) => void importar(e.target.files?.[0])} />
          {aviso && (
            <p className="nota" role="status">
              {aviso}
            </p>
          )}
        </section>

        <section className="painel" aria-labelledby="titulo-lembrar">
          <h2 id="titulo-lembrar">Lembrar a última planilha</h2>
          <label className="alternar">
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => {
                const v = e.target.checked;
                setLembrar(v);
                void definirLembrar(v).then(() => lerUltima().then(setUltima));
              }}
            />
            Guardar a última planilha neste navegador (IndexedDB). Desligado por padrão.
          </label>
          {ultima?.length ? (
            <div className="zona-botoes">
              <button type="button" className="botao-secundario" onClick={() => aoEscolher(ultima)}>
                Reabrir {ultima.map((a) => a.nome).join(' + ')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void apagarUltima().then(() => setUltima(null));
                }}
              >
                Apagar
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
