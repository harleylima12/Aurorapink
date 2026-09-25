# olist-modo-ia

Web app de portfólio do Harley (analista de dados júnior): dashboard da base Olist com **Modo IA 100% local** (WebLLM + DuckDB-WASM) e **Modo Universal** (qualquer planilha CSV/Excel).

- **Especificação (fonte da verdade):** `docs/PROMPT_ORIGINAL.md`
- **Plano, versões, ajustes e riscos:** `docs/FASE0_PLANO.md`
- **Decisões tomadas durante a construção:** `docs/DECISOES.md`

## Como trabalhar

- Trabalhe por fases (seção 19 do prompt). Antes de codar uma fase, mostre um plano curto. No fim: rode os testes, faça commit e mostre um resumo com prints. **Só avance com o OK do Harley.**
- Commits pequenos, Conventional Commits em PT-BR (ex.: `feat(dados): gera fato_itens.parquet`).
- Decisões importantes vão para `docs/DECISOES.md` (contexto → decisão → alternativa descartada).
- Explique termos técnicos de forma simples nos resumos: o Harley precisa defender o projeto em entrevista.
- Não esconda limitações. Se algo ficar abaixo da meta, mostre os números.
- Mantenha a seção "Estado atual" abaixo atualizada.

## Regras técnicas (resumo; detalhes no prompt)

- **P1/P2:** o LLM nunca calcula nem gera SQL. Ele gera um `QuerySpec` (validado com Zod) → compilador determinístico → DuckDB.
- **P3:** nada de CDN em runtime. DuckDB-WASM, ECharts, fontes e `model_lib` são servidos pelo próprio app.
- **P5:** toda resposta mostra "Como calculei" (spec, SQL, ms).
- **P6:** a saída do modelo é texto não confiável: nada de `innerHTML`/`dangerouslySetInnerHTML`. Nunca mandar texto livre da base para o modelo.
- **P7:** métricas de pedido são deduplicadas por `order_id`.
- **P8:** confira a API real em `node_modules`. Versões exatas no `package.json` (tabela em `docs/FASE0_PLANO.md` §3). **`@duckdb/duckdb-wasm`: instale exatamente `1.32.0`** (a tag `latest` do npm é build de desenvolvimento).
- TypeScript strict, sem `any`. Núcleo (compilador, roteador, insights, validador) em funções puras e testadas.
- CSP também como **cabeçalho HTTP** (vale para os workers), não só `<meta>`.
- DuckDB: `SET autoinstall_known_extensions=false; SET autoload_known_extensions=false;` logo depois de abrir a conexão.
- **DuckDB-WASM 1.32.0 (motor v1.4.3) não tem Parquet embutido:** a extensão `parquet` precisa ser servida pelo próprio app (`custom_extension_repository` + `LOAD parquet`). Use sempre `read_parquet(...)`, nunca `FROM 'x.parquet'`. Detalhes em `docs/DECISOES.md` D15.

## Ambiente

- **PC do Harley:** Windows. A pasta tem acento e espaço (`Desktop\Projetos tecnológicos\olist-modo-ia`). Se alguma ferramenta falhar por causa disso, avise e sugira mover para `C:\dev\olist-modo-ia`.
- CSVs da Olist em `./dados/` (manter fora do git). O `geolocation` não é usado e não foi copiado; o original está em `..\dashboard-vendas-olist\Dados\`.
- Projeto Power BI de referência: `..\dashboard-vendas-olist\` (tema em `Imagens\tema_olist_dark.json`).
- `gh` e `vercel` já estão autenticados. **Só crie repositório público ou faça deploy com autorização explícita** (Fase 8).
- **Claude Code na nuvem:** o projeto fica na pasta `olist-modo-ia/` do repositório `harleylima12/Aurorapink` (branch `claude/gracious-carson-hgcwsu`). Os CSVs vêm de `python scripts/baixar_dados.py` (repositório oficial da Olist, commit fixo + SHA-256). Kaggle, Hugging Face e `extensions.duckdb.org` são bloqueados pela rede da nuvem; npm, PyPI e `raw.githubusercontent.com` funcionam. Sem GPU: a Fase 4 (WebGPU) precisa do PC.

## Estado atual

- **Fase 0 (plano):** concluída.
- **Fase 1 (dados):** aprovada. Parquet batendo com o Power BI no centavo (`dados/validacao.md`).
- **Fase 2 (base):** aprovada. Dashboard de 3 páginas, compilador spec→SQL, CSP.
- **Fase 3 (Modo Rápido):** concluída na nuvem, aguardando o OK do Harley. Parser de tempo (`src/query/timeParser.ts`), Camada 0 (`src/router/layer0.ts`), motor de insights e decomposição (`src/insights/`), seletor de gráfico (`src/charts/selector.ts`), narrador por template + validador numérico (`src/narrator/`), pipeline (`src/modo-ia/responder.ts`) e painel "✨ Modo IA" (`src/ui/modo-ia/`). Suíte `evals/perguntas.json` (76; 80% nas 20 cegas na 1ª rodada, 76/76 depois). Latência p95 96 ms. Testes: `npm test` (102), `npx playwright test` (15 + prints com `PRINTS=1`), `python -m pytest tests/dados` (57). Prints em `docs/prints/fase3/`.
- **Caminho de dados:** o app usa o `.duckdb` PROVISÓRIO até alguém rodar `npm run baixar-extensoes` (D17). O rodapé mostra qual caminho está ativo.
- **Validar no PC do Harley (continua pendente):**
  1. `npm ci`, `npx playwright install chromium`, `npm run baixar-extensoes` (primeiro download: registra o SHA-256 no lock; commitar lock, manifesto e `public/duckdb-extensions/`).
  2. `npx playwright test`: o teste do rodapé passa a exigir "Parquet (caminho final)"; conferir zero violações de CSP e a auditoria de rede.
  3. `RODADAS=5 npx playwright test medicoes` e anotar no BENCHMARK.md (tamanho real da extensão incluso).
  4. `python scripts/preparar_dados.py` no Windows (caminho com acento e espaço).
  5. Conferir o frete total no card do Power BI (D16).
  6. Decidir se o `.duckdb` provisório fica como plano B ou sai (Fase 6).
- **Próximo passo:** Fase 4 (IA local com WebLLM), depois do OK do Harley. Precisa do PC (WebGPU) para testar o modelo de verdade; na nuvem dá para escrever o worker, o planejador com JSON Schema e os testes sem GPU.
