import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './ui/estilos.css';
import { App } from './ui/App';
import { obterMotor } from './ui/motor';

// Começa a baixar o WASM do DuckDB e os dados antes mesmo do React desenhar a tela.
void obterMotor().catch(() => undefined);

const raiz = document.getElementById('root');
if (!raiz) throw new Error('elemento #root não encontrado');
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
