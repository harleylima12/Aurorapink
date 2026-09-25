# Benchmark

Medições reais. Quando uma meta não é cumprida, o número aparece do mesmo jeito.

## Fase 2: abrir o dashboard (sem IA)

**Como medi:** `RODADAS=5 npx playwright test medicoes` (resultado em `test-results/medicoes.json`), Chromium 141
headless, build de produção no `vite preview` em localhost, nesta máquina de nuvem (sem GPU). Caminho de dados
**provisório** (`.duckdb`). Mediana de 5 rodadas.

| Momento | Carga fria (cache vazio) | Carga com cache (recarregar) |
|---|---:|---:|
| Primeira pintura (tela de carregamento) | **0,22 s** | 0,11 s |
| DuckDB pronto + metadados | 1,39 s | 1,27 s |
| KPIs e todos os gráficos na tela | **1,65 s** | 1,50 s |

| Interação | Mediana | Máximo |
|---|---:|---:|
| Trocar o filtro de Ano até o KPI mudar (11 consultas: 4 KPIs, 4 minisséries, 3 gráficos) | 131 ms | 139 ms |

**Meta "primeira pintura < 2 s": cumprida** (0,22 s). O dashboard completo, com números, também ficou abaixo de 2 s
em localhost.

**O que essa medição NÃO inclui (limite honesto):** o download pela internet. Em localhost o arquivo chega na hora.
Bytes que o navegador baixa na primeira visita:

| Arquivo | Bruto | gzip | brotli |
|---|---:|---:|---:|
| `duckdb-eh.wasm` (motor) | 34,24 MB | 7,68 MB | 5,19 MB |
| JS do app + worker do DuckDB | 1,85 MB | 0,52 MB | 0,44 MB |
| `fato_itens.duckdb` (provisório) | 2,90 MB | 1,77 MB | 1,63 MB |
| **Total** | **39,0 MB** | **10,0 MB** | **7,3 MB** |

A Vercel serve com brotli: são ~7,3 MB na primeira visita. Numa conexão de 50 Mbit/s isso leva ~1,2 s a mais
(estimativa, não medição) → primeira visita com números em ~3 s; a primeira pintura continua em ~0,2 s. No caminho
final, o Parquet (1,59 MB br) substitui o `.duckdb`, mas a extensão `parquet` entra no download (tamanho a medir no PC).

**Achados:**
- A carga com cache é só ~0,15 s mais rápida: o DuckDB-WASM usa `instantiateStreaming` embrulhado num
  `TransformStream` (para mostrar progresso), e isso parece impedir o Chrome de reaproveitar o código WASM compilado.
  O motor (34 MB) é recompilado a cada visita (~1,1 s aqui). A investigar na Fase 7.
- O bundle JS tem 1,08 MB (0,33 MB gzip); dá para dividir na Fase 7 (ECharts e Arrow sob demanda).

**A medir no PC do Harley:** as mesmas medições com o caminho final (Parquet + extensão), GPU/CPU reais e rede real.
