import { completarMeses } from '../charts/series';
import { caminhoSparkline } from '../charts/sparkline';
import { aplicarFiltros, type Filtros } from '../dashboard/filtros';
import { specsDoKpi, type DefinicaoKpi } from '../dashboard/paginas';
import { formatar } from '../format/numeros';
import { ComoCalculei } from './ComoCalculei';
import { useDados } from './contexto';
import { resultadoAtual, useConsulta } from './useConsulta';

const LARGURA = 96;
const ALTURA = 32;

export function KpiCard({ definicao, filtros }: { definicao: DefinicaoKpi; filtros: Filtros }) {
  const { meta, semantica } = useDados();
  const metrica = semantica.metrics[definicao.metrica];
  const temTempo = semantica.dimensions.tempo?.type === 'tempo';
  const specs = specsDoKpi(definicao.metrica);
  const estadoValor = useConsulta(aplicarFiltros(specs.valor, filtros));
  // Sem coluna de data não há minissérie: repete o spec do valor (vem do cache, custo zero).
  const estadoSerie = useConsulta(aplicarFiltros(temTempo ? specs.serie : specs.valor, filtros));
  if (!metrica) return null;

  const resultado = resultadoAtual(estadoValor);
  const bruto = resultado?.linhas[0]?.[definicao.metrica];
  const valor = typeof bruto === 'number' ? bruto : null;
  const serie = resultadoAtual(estadoSerie);
  const valoresSerie = serie && temTempo
    ? completarMeses(serie.linhas, 'tempo', [{ id: definicao.metrica, zeroQuandoVazio: metrica.empty_is_zero }])
        // Meses com poucos pedidos (2016, set/2018) distorcem a escala da minissérie.
        .filter((l) => !meta.mesesParciais.has(String(l.tempo)))
        .map((l) => {
        const v = l[definicao.metrica];
        return typeof v === 'number' ? v : null;
      })
    : [];
  const caminho = caminhoSparkline(valoresSerie, LARGURA, ALTURA);
  const carregando = estadoValor.status === 'carregando';

  return (
    <article className={`kpi${definicao.alerta ? ' kpi-alerta' : ''}`} data-metrica={definicao.metrica} aria-busy={carregando}>
      <h2 className="kpi-rotulo">{metrica.label}</h2>
      <div className="kpi-linha">
        {estadoValor.status === 'erro' ? (
          <p className="erro">Erro: {estadoValor.mensagem}</p>
        ) : resultado ? (
          <p className={`kpi-valor${carregando ? ' atualizando' : ''}`} title={formatar(valor, metrica.format)} data-valor={valor ?? ''}>
            {formatar(valor, metrica.format, { compacto: metrica.format === 'brl' && Math.abs(valor ?? 0) >= 1_000_000 })}
          </p>
        ) : (
          <p className="kpi-valor esqueleto" aria-label="carregando">
            &nbsp;
          </p>
        )}
        {caminho && (
          <svg className="kpi-sparkline" viewBox={`0 0 ${LARGURA} ${ALTURA}`} aria-hidden="true" focusable="false">
            <path d={caminho} />
          </svg>
        )}
      </div>
      <p className="kpi-descricao">{metrica.description}</p>
      <ComoCalculei estado={estadoValor} />
    </article>
  );
}
