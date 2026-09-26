import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './ui/estilos.css';
import { App } from './ui/App';
import { iniciarFirewall } from './privacidade/firewall';
import { obterMotor } from './ui/motor';

// 1º o firewall (Service Worker) assume a página; depois o DuckDB começa, já sob o firewall (Fase 6).
// A espera é curta (o SW é um arquivo pequeno) e nunca impede o app de abrir.
void iniciarFirewall();
void obterMotor().catch(() => undefined);

const raiz = document.getElementById('root');
if (!raiz) throw new Error('elemento #root não encontrado');
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
