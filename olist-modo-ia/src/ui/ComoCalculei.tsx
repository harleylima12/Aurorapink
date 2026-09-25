import { formatar } from '../format/numeros';
import type { EstadoConsulta } from './useConsulta';
import { resultadoAtual } from './useConsulta';

const MAX_LINHAS = 30;

/** P5: o spec, o SQL executado, os parâmetros, o tempo e os dados (tabela também serve de alternativa acessível ao gráfico). */
export function ComoCalculei({ estado }: { estado: EstadoConsulta }) {
  const resultado = resultadoAtual(estado);
  if (!resultado) return null;
  const { compilado, spec, linhas, ms, doCache } = resultado;
  const tempo = doCache ? 'do cache' : `${formatar(ms, 'dec1')} ms`;
  return (
    <details className="como-calculei">
      <summary>Como calculei · {tempo}</summary>
      <div className="como-corpo">
        <h3>QuerySpec</h3>
        <pre>{JSON.stringify(spec, null, 2)}</pre>
        <h3>SQL executado no DuckDB</h3>
        <pre>{compilado.sql}</pre>
        <h3>Parâmetros</h3>
        <pre>{compilado.params.length ? JSON.stringify(compilado.params) : 'nenhum'}</pre>
        <h3>
          Dados ({linhas.length} {linhas.length === 1 ? 'linha' : 'linhas'})
        </h3>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                {compilado.colunas.map((c) => (
                  <th key={c.id} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, MAX_LINHAS).map((linha, i) => (
                <tr key={i}>
                  {compilado.colunas.map((c) => {
                    const valor = linha[c.id];
                    return (
                      <td key={c.id} className={c.papel === 'metrica' ? 'num' : undefined}>
                        {c.formato && typeof valor === 'number' ? formatar(valor, c.formato) : String(valor ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {linhas.length > MAX_LINHAS && <p className="nota">Mostrando {MAX_LINHAS} de {linhas.length} linhas.</p>}
      </div>
    </details>
  );
}
