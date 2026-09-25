import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// No PC: `npx playwright install chromium` e pronto. Na nuvem do Claude Code, o Chromium
// já vem instalado em /opt/pw-browsers (ou aponte CHROMIUM_PATH para outro executável).
const chromiumLocal = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const PORTA = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: chromiumLocal ? { executablePath: chromiumLocal } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  // Testa o BUILD de produção, com a CSP de produção no cabeçalho (vite preview).
  webServer: {
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    // Build de teste: modo "local" (CSP estrita, sem domínio externo) e motor falso liberado por ?motor=falso.
    // O motor falso NÃO entra no build normal (tests/e2e/ia-local.spec.ts confere).
    env: { ...process.env, VITE_MODEL_SOURCE: 'local', VITE_PERMITIR_MOTOR_FALSO: '1' } as Record<string, string>,
    timeout: 240_000,
  },
});
