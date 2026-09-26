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
- **Fase 3 (Modo Rápido):** aprovada. Parser de tempo, Camada 0 (`src/router/layer0.ts`), insights e decomposição (`src/insights/`), seletor de gráfico, narrador por template + validador, painel "✨ Modo IA". Suíte `evals/perguntas.json` (76). Prints em `docs/prints/fase3/`.
- **Fase 4 (IA local):** aprovada até onde deu sem GPU; **falta a validação no PC** (roteiro abaixo). Worker do WebLLM com import dinâmico (`src/ai/motorWebLLM.ts`, `engine.worker.ts`), escolha do modelo pela `prebuiltAppConfig` instalada (`modelos.ts`), planejador com JSON Schema (`planner.ts`, `prompts/planner.ts`), valores conferidos na base (`src/query/valueResolver.ts`), narrador com placeholders + validador (`narrator.ts`), motor falso (`motorFalso.ts`), `npm run baixar-modelo`. Decisões D28–D35. Testes: `npm test` (149), `npx playwright test` (22, com `PRINTS=1` grava prints), `python -m pytest tests/dados` (57). Prints em `docs/prints/fase4/`.
- **Fase 5 (Modo Universal):** concluída na nuvem, aguardando o OK do Harley. Rota `/planilha`: leitura (`src/universal/leitor.ts`), limpeza, perfil das colunas (`perfil.ts`), semântica automática (`semanticaAuto.ts`), impressão digital e modelos (`impressao.ts`), vários arquivos (`relacoes.ts`, `montar.ts`), dashboard automático (`painelAuto.ts`) e telas em `src/ui/universal/`. Planilhas de teste em `evals/planilhas/` (`npm run gerar-planilhas-teste`). Decisões D36–D45. Testes: `npm test` (172), `npx playwright test` (24 + 3 pulados: prints com `PRINTS=1`, limite com `LIMITE=1`), `python -m pytest tests/dados` (57). **Excel pendente: SheetJS bloqueada na nuvem (D39), passo no roteiro abaixo.**
- **Caminho de dados:** caminho FINAL ativo desde 26/09 (extensão parquet em `public/duckdb-extensions/`, SHA-256 no lock). O `.duckdb` provisório continua como plano B automático; decidir na Fase 6 se fica.
- **Rede da nuvem:** o Harley liberou `cdn.sheetjs.com`, `extensions.duckdb.org`, `huggingface.co` e `*.hf.co`. O `curl` passa direto; o Node precisa de `NODE_USE_ENV_PROXY=1` nesta nuvem (no PC, não).
- **Validar no PC do Harley (continua pendente):**
  1. `npm ci`, `npx playwright install chromium`, `npx playwright test` (o rodapé deve dizer "Parquet (caminho final)").
  2. `RODADAS=5 npx playwright test medicoes` com rede real e anotar no BENCHMARK.md.
  3. `python scripts/preparar_dados.py` no Windows (caminho com acento e espaço).
  4. Conferir o frete total no card do Power BI (D16).
  5. IA na GPU (roteiro abaixo).
- **Próximo passo:** validar a IA no PC (roteiro abaixo); depois, Fase 5 com o OK do Harley.

## Roteiro: Excel no Modo Universal (Fase 5, SheetJS)

A especificação manda instalar a SheetJS pelo tarball oficial (a do npm está desatualizada). No PC:

1. Conferir a versão atual em https://cdn.sheetjs.com/ (a Fase 0 fixou 0.20.3) e baixar o tarball para `vendor/`:
   `curl -o vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   (PowerShell: `Invoke-WebRequest -OutFile vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`).
2. Anotar o SHA-256 (`Get-FileHash vendor\xlsx-0.20.3.tgz` / `sha256sum`) no `docs/DECISOES.md` (D39) e instalar:
   `npm install --save-exact file:vendor/xlsx-0.20.3.tgz`. Commitar `vendor/xlsx-0.20.3.tgz`, `package.json` e o lock.
3. Conferir que a interface usada em `src/universal/excel.ts` (`read`, `utils.sheet_to_json` com `header: 1`,
   `raw: false`, `defval`, `blankrows`, `dateNF`) bate com `node_modules/xlsx/types/index.d.ts`.
4. `npm test` e `npx playwright test universal`: o teste "Excel sem SheetJS" vai falhar (agora a SheetJS existe):
   trocar por um teste que solta `evals/planilhas/financeiro_titulo_total.xlsx` e confere aba "Dados", 60 linhas,
   linha de total removida e receita total igual à do CSV (`esperado.json`).

## Roteiro: validar a IA de verdade no PC (Fase 4)

Chrome ou Edge atualizados, com WebGPU (conferir em `chrome://gpu`: "WebGPU: Hardware accelerated"). No PowerShell,
variável de ambiente é `$env:VITE_MODEL_SOURCE="local"; npm run dev` (no bash: `VITE_MODEL_SOURCE=local npm run dev`).

1. **Libs do modelo** (obrigatório nos dois modos): `npm run baixar-modelo -- --so-libs`. Deve dizer "ok" nas 6
   (o SHA-256 já está no `scripts/modelos.lock.json`); se disser "SHA-256 diferente", PARE e me avise.
2. **Modo demo** (pesos do Hugging Face): `npm run dev`, abrir o ✨ Modo IA, clicar **Ativar IA local**.
   Observar: barra com %, MB e tempo restante; status "IA pronta · 100% local"; qual modelo foi escolhido.
   - DevTools → Rede → coluna "Domínio": anotar TODOS os domínios externos. Console: anotar violações de CSP.
     Depois, deixar em `DOMINIOS_PESOS_DEMO` (`csp.config.ts`) só os que apareceram (D29).
   - Anotar: tempo de carga da 1ª vez (status mostra "carregou em X s") e depois de recarregar a página (com cache).
3. **Modo local** (nenhum domínio externo): `npm run baixar-modelo -- --modelo <o id que o passo 2 escolheu>`
   (anotar o tamanho total que o script imprime; fica em `public/models/<id>/manifesto.json`), depois
   `VITE_MODEL_SOURCE=local npm run dev`. DevTools → Rede: **zero** domínios externos.
4. **Perguntas** (anotar em cada uma o ms do planejador em "Como calculei" e as métricas do WebLLM logo abaixo):
   - `quais produtos de casa deram mais dinheiro no ano retrasado?` (selo "IA"; ranking de categorias em 2017)
   - `a turma paulista tá comprando muito?` e depois `e a galera carioca?` (filtro SP, depois RJ)
   - `quanto sobra pra gente depois de pagar tudo?` (fora de escopo: não há custos)
   - `me fala algo sobre isso aí` (pergunta de volta com 3 chips)
   - `top 5 categorias em 2018` (Modo Rápido, SEM chamar o modelo; o texto pode virar "texto: IA")
   - Em cada resposta de dados: o texto da IA não pode ter número que não esteja nos "Fatos usados no texto".
5. **Metas:** planejamento < 3 s com GPU dedicada, < 6 s com integrada (modelo já em cache); zero violações de CSP;
   zero requisições externas no modo local. Se não bater: testar `VITE_MODELO=Llama-3.2-1B-Instruct-q4f16_1-MLC`
   e `VITE_MODELO=Qwen3.5-0.8B-q4f16_1-MLC` e anotar os três.
6. **Anotar** tudo na tabela "Medir no PC" do `docs/BENCHMARK.md`, junto com a GPU (`chrome://gpu`). No console,
   `JSON.parse(localStorage['olist-modo-ia:falhas-narrador'] ?? '[]')` mostra os textos da IA que o validador recusou.
7. Calibrar `LIMITE_FRACA` em `src/ai/modelos.ts` se a escolha automática não fizer sentido na máquina.

