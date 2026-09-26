# Benchmark

Medições reais. Quando uma meta não é cumprida, o número aparece do mesmo jeito.

## Fase 2: abrir o dashboard (sem IA)

**Como medi:** `RODADAS=5 npx playwright test medicoes` (resultado em `evals/resultados/medicoes.json`), Chromium 141
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

**Caminho final medido na nuvem** (depois que o Harley liberou `extensions.duckdb.org`; mesma máquina e método,
mediana de 5 rodadas):

| Momento | Carga fria | Carga com cache |
|---|---:|---:|
| Primeira pintura | **0,23 s** | 0,13 s |
| DuckDB pronto + extensão parquet + metadados | 1,76 s | 1,57 s |
| KPIs e todos os gráficos na tela | **2,00 s** | 1,78 s |
| Trocar o filtro de Ano (mediana / máx.) | 174 ms / 181 ms | |

- Meta "primeira pintura < 2 s": cumprida. O dashboard completo ficou ~0,35 s mais lento que no `.duckdb`
  provisório (2,00 s contra 1,65 s): o `LOAD parquet` confere a assinatura da extensão e o `read_parquet` lê o
  arquivo a cada consulta. O caminho final segue valendo pela seção 6 da especificação (Parquet e nada de CDN).
- Extensão parquet (`wasm_eh`): 3,05 MB bruto, 0,70 MB gzip. `fato_itens.parquet`: 1,77 MB (1,59 MB gzip; já é
  comprimido). O `.duckdb` provisório (2,90 MB) sai do download no caminho final.

## Fase 3: Modo Rápido (sem IA)

**Como medi:** `npx playwright test modo-ia` (resultado em `evals/resultados/latencia-modo-rapido.json`), mesma
máquina e build de produção. Latência **dentro da página**: da tecla Enter até o cartão da resposta ser pintado
(`requestAnimationFrame` depois de entrar no DOM). Inclui Camada 0, SQL no DuckDB-WASM, insights, gráfico e React.

| Pergunta | ms |
|---|---:|
| quanto faturamos no total? | 19 |
| top 5 categorias em 2018 | 34 |
| e só em SP? | 50 |
| faturamento mês a mês | 17 |
| nota de quem recebeu atrasado vs no prazo | 94 |
| onde o frete é mais caro? | 27 |
| por que o faturamento caiu em dezembro de 2017? | 26 |
| faturamento de 2018 vs ano anterior | 8 |
| itens vendidos por faixa de preço | 43 |
| faturamento × nota média por categoria | 96 |
| qual o lucro por categoria? (fora de escopo) | 11 |
| como estamos? (esclarecimento) | 8 |
| **p50 / p95 / máx.** | **27 / 96 / 96** |

**Meta "Modo Rápido < 300 ms de ponta a ponta": cumprida** (p95 = 96 ms). Só a Camada 0 (sem SQL) leva p50 0,5 ms e
p95 14 ms (`evals/resultados/avaliacao-camada0.json`). As perguntas mais lentas são as que rodam métricas por pedido
(subconsulta DISTINCT) sobre todas as categorias.

**Acerto da Camada 0** (`npm test`, `evals/perguntas.json`): 76/76 na suíte atual; **80% (16/20) nas 20 perguntas
escritas às cegas, na primeira rodada** (ver D24). Meta da Fase 3 (≥ 60%): cumprida.

## Fase 4: IA local (WebLLM)

A Fase 4 foi escrita numa nuvem **sem GPU** e com o Hugging Face bloqueado (D29). Tudo que depende do modelo de
verdade está marcado **medir no PC**; roteiro no `CLAUDE.md`. Nada abaixo foi estimado.

### Medido na nuvem

| Item | Valor | Como |
|---|---:|---|
| `model_lib` dos 6 candidatos (3 modelos × q4f16/q4f32) | 31,6 MB (4,9 a 5,9 MB cada) | `npm run baixar-modelo -- --so-libs` |
| WebLLM na thread principal (só depois do clique) | 6,0 MB · 2,15 MB gzip | `npm run build` + `gzip -9` |
| WebLLM no worker (só depois do clique) | 6,0 MB · 2,15 MB gzip | idem |
| Pacote principal vs Fase 3 | +12,7 kB (+4,4 kB gzip) | idem |
| Prompt do planejador (76 perguntas da suíte) | 3.572 a 4.252 caracteres (p50 3.912) | `montarMensagensPlanejador` |
| JSON Schema do QuerySpec enviado ao XGrammar | 2.337 caracteres | `schemaQuerySpecParaModelo` |
| Perguntas da suíte que vão para a IA | 2/76 (a Camada 0 resolve 97%) | D28 |
| Modo Rápido com o código da Fase 4 (p50 / p95) | 32 / 100 ms | `npx playwright test modo-ia` |

### Medir no PC

| Item | Meta | Resultado |
|---|---|---|
| Modelo escolhido na GPU do Harley (e por quê) | — | medir no PC |
| Download dos pesos (medido pela API do Hugging Face, 26/09) | — | Qwen2.5-1.5B 839,5 MB · Llama-3.2-1B 671,9 MB · Qwen3.5-0.8B 426,5 MB (q4f16 e q4f32 iguais) |
| Tempo de carga: 1ª vez (download) e com cache | "depois abre em segundos" | medir no PC |
| Aquecimento (1ª geração, compila shaders) | — | medir no PC |
| Planejamento com IA, modelo em cache (p50 / p95) | < 3 s GPU dedicada · < 6 s integrada | medir no PC |
| Narração com IA (p50) | — | medir no PC |
| Tokens/s de prefill e de decode, tempo da gramática (`metricas` do WebLLM) | — | medir no PC |
| Specs válidos do planejador na suíte (sem ajuda da Camada 0) | — | medir no PC (Fase 7) |
| Textos do narrador aprovados pelo validador | — | medir no PC |
| Domínios contatados no modo demo | só os de `DOMINIOS_PESOS_DEMO` | medido na nuvem: `huggingface.co` + `us.aws.cdn.hf.co` (região; conferir no PC) |
| Requisições externas no modo local | 0 | medir no PC |

## Fase 5: Modo Universal

**Tamanho x tempo** (`LIMITE=1 npx playwright test universal-limite`, `evals/resultados/limite-planilha.json`):
CSV sintético no formato do `vendas_br.csv` (13 colunas, ";" e vírgula decimal), gerado dentro da página. Leitura =
do arquivo escolhido até a tela "Entendi assim" (codificação, separador, cabeçalho, limpeza e perfil). Dashboard =
do clique em "Gerar dashboard" até o primeiro gráfico. Nuvem do Claude Code, Chromium headless, 4 CPUs, sem GPU.

| Linhas | Tamanho | Leitura | Dashboard |
|---:|---:|---:|---:|
| 100.000 | 9,7 MB | 1,3 s | 1,0 s |
| 500.000 | 49 MB | 3,9 s | 2,0 s |
| 1.000.000 | 98 MB | 6,7 s | 4,1 s |
| 2.000.000 | 197 MB | 15,8 s | 9,9 s |
| 3.000.000 | 297 MB | 22,1 s | 11,3 s |

- Nenhum tamanho falhou. O app recusa arquivos acima de 300 MB (`LIMITE_BYTES`) com uma dica ("filtre um período
  menor…"): esse corte é de segurança, **não é o ponto em que o navegador quebra** (não foi medido acima de
  297 MB). No PC, repetir com `LIMITE_LINHAS=1000000,3000000,5000000` e ajustar o corte se fizer sentido.
- Primeira rodada da medição travou em 500 mil linhas: era o próprio TESTE (o layout do tamanho anterior foi
  salvo como modelo, então a planilha seguinte abriu direto no dashboard e a tela esperada nunca veio). Corrigido
  no teste; o app estava certo.

**Perfil das colunas** (`npm test`, `evals/resultados/perfil-planilhas.json`): 82/82 nas 11 planilhas de teste;
**87,5% (21/24) na primeira rodada das 3 planilhas às cegas** (ver D37).

**Pacote:** o Modo Universal é carregado sob demanda (58,6 kB, 20,5 kB gzip); o pacote principal cresceu 2,6 kB
em relação à Fase 4.
