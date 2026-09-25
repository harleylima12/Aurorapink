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

- **Fase 0 (plano):** concluída. As respostas do Harley estão na seção 6 do `docs/FASE0_PLANO.md`: período = base inteira, definições de entrega e frete = as propostas, GPU = detectar na Fase 4.
- **Fase 1 (dados):** concluída, aguardando o OK do Harley. `scripts/preparar_dados.py` gera `public/data/fato_itens.parquet` (1,77 MB, 112.101 itens × 20 colunas), `ids_*.parquet` (chaves substitutas → IDs originais) e `meta.json` (âncora 31/08/2018). Os números batem com o Power BI no centavo: faturamento R$ 13.494.400,74 · pedidos 98.199 · ticket médio R$ 137,42 · clientes únicos 94.983 (`dados/validacao.md`). Testes: `python -m pytest tests/dados -q` (55).
- **Em aberto:** o frete total (R$ 2.245.816,19) difere do anotado na Fase 0 (R$ 2.241.126,29). Conferir no Power BI (D16).
- **Próximo passo:** Fase 2 (base), depois do OK do Harley. Primeiro teste: carregar a extensão `parquet` self-hosted no DuckDB-WASM (D15); se falhar, plano B = arquivo `.duckdb`. Também: dimensão cidade agrupada por cidade + UF (D11) e agregados `DECIMAL` convertidos para `DOUBLE` (D4).
