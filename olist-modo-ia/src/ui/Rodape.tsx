import { formatar } from '../format/numeros';
import { useDados } from './contexto';
import { SeloPrivacidade } from './privacidade/SeloPrivacidade';

export function Rodape() {
  const { motor, meta } = useDados();
  const { fonte, tempos } = motor;
  const provisorio = fonte.tipo === 'duckdb-provisorio';
  return (
    <footer className="rodape">
      <SeloPrivacidade />
      <p className={`selo-fonte${provisorio ? ' provisorio' : ''}`} data-fonte={fonte.tipo}>
        {provisorio ? 'Dados: arquivo .duckdb (caminho provisório)' : 'Dados: Parquet (caminho final)'}
        {' · '}
        {formatar(fonte.bytes / 1e6, 'dec2')} MB · DuckDB-WASM {motor.versaoPacote} (motor {fonte.versaoDuckdb})
        {provisorio && fonte.motivo ? <span className="motivo"> · {fonte.motivo}</span> : null}
      </p>
      <p>
        Tudo é calculado no seu navegador. Carga: motor {formatar(tempos.motorMs / 1000, 'dec1')} s + dados{' '}
        {formatar(tempos.dadosMs / 1000, 'dec1')} s. Âncora de datas: {meta.ancora.split('-').reverse().join('/')}.
      </p>
      <p>
        Dados:{' '}
        <a href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce" target="_blank" rel="noopener noreferrer">
          Brazilian E-Commerce Public Dataset by Olist
        </a>{' '}
        (CC BY-NC-SA 4.0). Nomes de cidade: IBGE.
      </p>
    </footer>
  );
}
