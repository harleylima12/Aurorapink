# Fase 0 — Plano, versões e riscos

> **Status:** respostas da seção 6 recebidas em 24/09/2026. A Fase 1 começa com o OK do Harley no Claude Code.
> **Data:** 24/09/2026 · **Especificação:** [`PROMPT_ORIGINAL.md`](PROMPT_ORIGINAL.md)

## 1. Resumo

1. O projeto é viável do jeito que foi descrito. Proponho 15 ajustes (seção 4), e nenhum muda a ideia central.
2. **Os números do Power BI já foram reproduzidos a partir dos CSVs** (seção 2), mas só com a base inteira (set/2016 a set/2018). Com jan/2017 a ago/2018 eles não batem.
3. As versões das bibliotecas foram checadas hoje (seção 3). Cuidado com o DuckDB-WASM: no npm, a tag `latest` aponta para uma versão de desenvolvimento.
4. Maior risco técnico: a IA ficar lenta numa GPU integrada. Por isso o Modo Rápido (sem IA) precisa resolver a maior parte das perguntas.
5. Maior risco de privacidade: uma CSP só no `<meta>` do HTML **não protege os Web Workers**, e é neles que rodam o DuckDB e o WebLLM. A CSP precisa ir no cabeçalho HTTP.
6. Onde construir: **Claude Code no seu PC** (seção 7).

## 2. Validação antecipada dos números (critério da Fase 1)

Conferido com pandas nos CSVs da pasta `dashboard-vendas-olist/Dados`, com as regras da seção 6 do prompt (sem `canceled` e `unavailable`, faturamento = soma de `price`, sem frete):

| Recorte | Faturamento | Pedidos | Ticket médio | Clientes únicos | Itens |
|---|---:|---:|---:|---:|---:|
| **A. Base inteira (04/09/2016 a 03/09/2018)** | **R$ 13.494.400,74** | **98.199** | **R$ 137,42** | **94.983** | 112.101 |
| B. jan/2017 a ago/2018 | R$ 13.449.529,68 | 97.905 | R$ 137,37 | 94.703 | 111.752 |
| C. Sem excluir status | R$ 13.591.643,70 | 98.666 | R$ 137,75 | 95.420 | 112.650 |

**Conclusões**

- O Power BI bate com o recorte **A**. O `defaults.periodo` do exemplo da seção 7 (2017-01-01 a 2018-08-31) **não** reproduz os KPIs. Proposta: período padrão = base inteira. Os gráficos de tendência avisam que 2016 e setembro de 2018 têm poucos pedidos.
- **Âncora de datas:** a última compra válida é de **03/09/2018**. Setembro tem 1 pedido, contra 6.421 em agosto. Se a âncora fosse 03/09/2018, a pergunta "quanto vendemos no último mês?" responderia 1 pedido. Proposta de regra, que serve para qualquer planilha: âncora = **fim do último mês completo**, isto é, o último mês com volume de pelo menos 10% da mediana mensal. Na Olist isso dá 31/08/2018, como você previu.
- Outros números para comparar com o Power BI (recorte B, grão pedido):
  - nota média **4,12**;
  - **547** pedidos têm mais de uma review, e por isso a média é calculada por pedido (P7);
  - 96.203 pedidos entregues, **6.531 atrasados (6,8%)** e 1.702 não entregues.

  Para o atraso usei "data de entrega depois da data estimada, comparando só o dia".
- Frete total no recorte A: R$ 2.241.126,29.

## 3. Versões (checadas em 24/09/2026)

Fontes: registro do npm (pelo espelho do jsDelivr), vite.dev, pypi.org e a documentação da SheetJS. No início da Fase 2, o Claude Code confere cada versão com `npm view` e faz commit do `package-lock.json`.

| Pacote | Fixar em | Observação |
|---|---|---|
| vite | 8.3.0 | O Vite 8 usa o empacotador Rolldown. Confirmar que os plugins aceitam a versão 8. |
| react / react-dom | 19.3.0 | |
| typescript | 7.0.2 | Compilador nativo novo e bem mais rápido. Se o ESLint (typescript-eslint) ainda não aceitar, usar 6.0.3. |
| @duckdb/duckdb-wasm | **1.32.0** | ⚠️ A tag `latest` do npm aponta para `1.33.1-dev57.0`, uma build de desenvolvimento. A 1.32.0 é a última estável publicada. Instalar sempre com a versão exata. |
| @mlc-ai/web-llm | 0.2.85 | As bibliotecas dos modelos ficam na pasta `v0_2_84`. |
| echarts | 6.1.0 | Com tema escuro próprio. |
| zod | 4.6.5 | O `z.toJSONSchema` já vem no Zod 4, então não precisa do `zod-to-json-schema`. |
| fuse.js | 7.5.0 | |
| xlsx (SheetJS) | 0.20.3 | Tarball oficial copiado para `vendor/`, como a própria SheetJS recomenda. |
| vitest | 5.0.1 | Versão major nova. |
| @playwright/test | 1.63.0 | |
| vite-plugin-pwa | 1.3.0 | Se não aceitar o Vite 8, o service worker é escrito à mão. |
| duckdb (Python) | 1.5.5 | Gera o Parquet na Fase 1. |

### Modelos candidatos (benchmark na Fase 4)

A lista do WebLLM 0.2.85 já inclui Qwen3.5 e Qwen3, mais novos que os do prompt. Proposta: testar 3 modelos na sua máquina e escolher pelo % de acerto na suíte e pela latência.

| Modelo | VRAM (lista oficial) | Por que testar |
|---|---:|---|
| Qwen2.5-1.5B-Instruct-q4f16_1 | 1.630 MB | É o preferido do prompt. Licença Apache 2.0. |
| Qwen3.5-0.8B-q4f16_1 | 1.629 MB | Mais novo. Se tiver modo "thinking" (raciocínio longo), desligar para responder mais rápido. |
| Llama-3.2-1B-Instruct-q4f16_1 | 879 MB | O mais leve, bom para GPU fraca. Exige o selo "Built with Llama". |

- Se a GPU não tiver `shader-f16`, usar a variante q4f32.
- O Phi-3.5-mini (3.672 MB) fica de fora, porque passa da meta de cerca de 1 GB.
- O Qwen2.5-3B tem licença não comercial: serve para portfólio, mas fica anotado.
- O tamanho real do download de cada modelo é medido na Fase 4.

## 4. Ajustes propostos

| # | Ajuste | Por quê |
|---|---|---|
| 1 | Período padrão = base inteira; âncora = fim do último mês completo | Faz os números baterem com o Power BI (seção 2) |
| 2 | **CSP no cabeçalho HTTP** (`vercel.json` e servidor local), não só no `<meta>` | A CSP do `<meta>` vale só para a página. Um worker carregado do próprio site segue o cabeçalho do arquivo dele; sem cabeçalho, fica sem proteção. Junto: `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (microfone, câmera e localização desligados) e `X-Content-Type-Options: nosniff` |
| 3 | O contador de privacidade também conta **bloqueios** | Requisição barrada pela CSP nunca chega ao service worker. Ouvir o evento `securitypolicyviolation` e mostrar "tentativas bloqueadas: N". Na documentação, deixar claro que a CSP é a trava e o service worker é o medidor |
| 4 | DuckDB com `autoinstall_known_extensions` e `autoload_known_extensions` desligados | Sem isso, o DuckDB-WASM pode baixar extensões de `extensions.duckdb.org` sozinho. É exatamente o "tráfego escondido" da pergunta (b) |
| 5 | Parquet carregado com `registerFileBuffer` (arquivo inteiro na memória) | Evita requisições parciais (HTTP Range), que atrapalham o cache offline do PWA |
| 6 | **Chaves substitutas** inteiras no Parquet (`pedido_sk`, `cliente_sk`…), com os IDs originais num Parquet separado, lido só pela tabela de detalhe | Os IDs da Olist têm 32 caracteres e são o que mais pesa no arquivo, o que ajuda a meta de abrir em menos de 2 s. É também um conceito de modelagem dimensional que rende conversa em entrevista |
| 7 | `model_lib` do WebLLM (os `.wasm` dos modelos) baixado no setup para `public/models/libs` | Por padrão ele vem de `raw.githubusercontent.com`, o que quebra o P3 |
| 8 | Allowlist do modo demo **medida, e não suposta** | O Hugging Face migrou os downloads para o Xet (ex.: `cas-bridge.xethub.hf.co`), então os domínios mudam. Medir com o Playwright antes de fixar. `public/models` fica fora do git, porque o GitHub limita cada arquivo a 100 MB |
| 9 | Benchmark de 3 modelos (seção 3) | A lista do WebLLM mudou desde o prompt |
| 10 | O validador numérico também barra **números por extenso** e datas | "dois", "metade", "dobro" e "milhão" também são números inventados. Datas e meses entram por placeholder |
| 11 | Escapar todo texto vindo dos dados nos tooltips do ECharts (`echarts.format.encodeHTML`) | O tooltip do ECharts é montado em HTML. No Modo Universal, uma célula com `<img onerror=…>` viraria código. A CSP é a segunda barreira |
| 12 | Modo Universal lê tudo como texto no DuckDB e converte os tipos com SQL (`TRY_CAST`, `strptime`) gerado pelo profiler. O Excel passa pelo SheetJS, vira CSV e segue o mesmo caminho | Um caminho só para CSV e Excel, e todo número continua vindo do DuckDB (P1) |
| 13 | Conferência entre planilhas mais forte (item 9 da seção 7A) | Foi o que você pediu no começo. Casar chaves por nome parecido **e** por valores em comum (`id_produto` × `product_id` × `cod_produto`). Mostrar o % de IDs que batem e exemplos dos que não batem, o setor provável de cada planilha e o alerta "esta planilha não tem relação com as outras" |
| 14 | A avaliação com IA roda no seu PC, não no CI | O CI não tem GPU. Ele roda a Camada 0, os testes e2e e a auditoria de rede. A Camada 0+1 roda na página `/avaliacao` e o resultado vai para o `BENCHMARK.md` |
| 15 | Licença dos dados no README e no rodapé | A base Olist é CC BY-NC-SA 4.0. Publicar o Parquet exige atribuição e uso não comercial, e portfólio se encaixa nisso |

## 5. Riscos

| Risco | Chance | Impacto | Como reduzir |
|---|---|---|---|
| IA lenta em GPU integrada (mais de 6 s) | Alta | Médio | Modelo menor, catálogo só com os candidatos (top-k), few-shots escolhidos por semelhança, `max_tokens` baixo, aquecimento do modelo e Camada 0 forte |
| Motor de gramática do WebLLM (XGrammar) não aceitar todo o JSON Schema gerado pelo Zod | Média | Médio | Schema simples (enums, sem refinements) e um teste rápido logo no início da Fase 4 |
| Modelo pequeno fraco em português | Média | Médio | Benchmark dos 3 candidatos com a suíte; pergunta de esclarecimento com chips quando a confiança for baixa |
| CSP quebrar WASM ou workers (`wasm-unsafe-eval`, `blob:`) | Média | Médio | Testes e2e com a CSP de produção desde a Fase 2 |
| Workers fora do controle do service worker | Média | Médio | Medir no Chrome; se precisar, instrumentar o `fetch` dentro dos workers (o prompt já prevê isso) |
| DuckDB-WASM instalado sem versão (vem a build de desenvolvimento) | Alta, se esquecer | Alto | Versão exata no `package.json` + lockfile |
| Extensões do DuckDB baixadas em segundo plano | Média | Alto | Autoload desligado + auditoria de rede no Playwright |
| Domínios de download do Hugging Face mudarem | Média | Médio | Allowlist medida + modo `local` |
| Parquet pesado → dashboard abre em mais de 2 s | Média | Médio | Chaves substitutas, zstd, só as colunas usadas e tela esqueleto enquanto carrega |
| Parquet escrito pelo duckdb 1.5.5 (Python) lido pelo WASM 1.32 (núcleo 1.4.x) | Baixa | Médio | Opções de escrita explícitas + teste de leitura no navegador |
| Injeção de prompt por nomes de coluna ou valores de categoria | Baixa | Médio | Limitar tamanho, limpar caracteres de controle e mandar como JSON. Os enums do schema limitam o estrago: no pior caso sai um spec válido e errado, que aparece em "Como calculei" |
| Planilha grande demais para o navegador | Média | Baixo | Medir o limite real na Fase 5 e avisar |
| Caminho com acento e espaço ("Projetos tecnológicos") | Baixa | Baixo | Se alguma ferramenta falhar, mover para `C:\dev\olist-modo-ia` |
| Escopo grande (8 fases) | Alta | Médio | Critério de aceite por fase. Se precisar cortar: PWA offline e modelos de planilha podem ficar para depois |

## 6. Perguntas para você (antes da Fase 1)

1. **Período padrão:** base inteira (recomendo, porque bate com o Power BI) ou jan/2017 a ago/2018?
2. **Definições do Power BI** que viram critério de aceite. Se puder, cole o DAX ou os valores:
   - Status de entrega: "atrasado" compara só o dia da entrega com o dia estimado?
   - Prazo médio de entrega: são dias corridos entre a compra e a entrega?
   - Frete médio: é por item ou por pedido?
3. **Métricas de pedido quebradas por categoria:** um pedido com itens de 2 categorias conta nas duas. É o mesmo comportamento do `AVERAGEX(VALUES(order_id))` com filtro de categoria. Pode ser assim?
4. **Placa de vídeo:** o seu PC tem placa dedicada (NVIDIA ou AMD) ou só a Intel integrada? Isso define o modelo e as metas de latência.
5. **Nome do repositório:** pode ser `olist-modo-ia`?

### Respostas do Harley (24/09/2026)

1. **Período padrão: base inteira** (04/09/2016 a 03/09/2018). A âncora de datas é 31/08/2018, o fim do último mês completo.
2. **Definições: as propostas.** Elas viram critério de aceite da Fase 1:
   - **Atrasado:** pedido entregue depois do dia estimado, comparando só a data.
   - **Prazo médio de entrega:** dias corridos entre a compra e a entrega, contando só os pedidos entregues.
   - **Frete médio:** frete total ÷ número de pedidos.
   - **Métrica de pedido quebrada por categoria:** o pedido conta em cada categoria que ele tem (mesmo comportamento do `AVERAGEX(VALUES(order_id))`).
3. **Placa de vídeo: não sabe.** No início da Fase 4, detectar pelo WebGPU (adapter, `shader-f16` e limites de memória) e registrar no `BENCHMARK.md`.
4. **Nome do repositório:** decidir na Fase 8. Sugestão: `olist-modo-ia`.

## 7. Onde construir: Claude Code no seu PC

- **Aqui não dá para instalar pacotes.** Este ambiente (Cowork na nuvem) não tem acesso a npm, PyPI nem CDNs, por causa da configuração de rede da conta. Sem isso não dá para cumprir o P8 (conferir a API em `node_modules`) nem rodar as fases 1 a 8.
- **A IA local usa WebGPU.** Só a placa de vídeo do seu PC consegue testar de verdade o Modo IA e as metas de latência.
- **O fluxo do prompt é o jeito de trabalhar do Claude Code:** fase, testes, commit, prints e o seu OK. Além disso, ele já está com o `gh` e o `vercel` autenticados no seu PC.

A pasta `olist-modo-ia` já tem:

- `CLAUDE.md`, com as regras do projeto;
- `docs/PROMPT_ORIGINAL.md`, com o seu prompt completo;
- este plano;
- os CSVs em `dados/`, sem o geolocation.

Para começar, abra um terminal na pasta, rode `claude` e mande:

> Leia o CLAUDE.md e o docs/FASE0_PLANO.md. A Fase 0 está aprovada, com as respostas da seção 6. Pode começar a Fase 1.

## 8. Plano por fase

| Fase | Entregável | Critério de aceite |
|---|---|---|
| 1. Dados | `scripts/preparar_dados.py`, `public/data/fato_itens.parquet`, `dados/validacao.md` | Recorte A igual ao da seção 2 |
| 2. Base | Vite + TS strict, DuckDB-WASM local, `semantic.json`, compilador spec→SQL com snapshots, dashboard de 3 páginas com filtros | Primeira pintura em menos de 2 s, medida; testes verdes |
| 3. Modo Rápido | Camada 0, parser de tempo, motor de insights, seletor de gráfico, narrador por template, painel do Modo IA | Menos de 300 ms; pelo menos 60% da suíte parcial |
| 4. IA local | Worker do WebLLM, escolha do modelo, planejador com JSON Schema, follow-ups, esclarecimento, fora de escopo, narrador com placeholders + validador, drivers | Benchmark dos 3 modelos; 0 números não rastreáveis |
| 5. Universal | Leitura, limpeza e perfil das colunas, `semantic.json` automático, tela "Entendi assim", dashboard automático, impressão digital, vários arquivos + conferência entre planilhas | Pelo menos 90% das colunas classificadas certo nas planilhas de teste |
| 6. Privacidade | CSP por cabeçalho, service worker firewall com contador e bloqueios, modos demo/local, "Apagar dados locais", auditoria, `PRIVACIDADE.md` | Auditoria do Playwright sem nenhum domínio fora da allowlist |
| 7. Avaliação | 80+ perguntas, 5+ planilhas de teste, página `/avaliacao`, `BENCHMARK.md` | Metas da seção 17 do prompt, ou a explicação com números |
| 8. Portfólio | README, GIF, `ENTREVISTA.md`; GitHub e Vercel só com o seu OK | — |

## 9. Glossário rápido

- **CSP (Content Security Policy):** lista, enviada pelo servidor, dos endereços que a página pode acessar. O navegador bloqueia todo o resto.
- **Service worker:** script que fica entre o app e a rede. Aqui ele conta as requisições e guarda o app para uso offline.
- **Web Worker:** uma "segunda linha de execução" do navegador. O DuckDB e a IA rodam nela para a tela não travar.
- **Parquet:** formato de arquivo colunar e comprimido, muito mais leve e rápido de ler que CSV.
- **Chave substituta:** um número inteiro que substitui um ID longo (ex.: o pedido `e481f5…` vira `1`). Ocupa menos espaço e é mais rápido de comparar.
- **WebGPU:** API que deixa o navegador usar a placa de vídeo. É o que faz a IA rodar rápido.
- **JSON Schema / XGrammar:** o "molde" do JSON que a IA precisa seguir. O WebLLM usa o XGrammar para impedir o modelo de gerar qualquer coisa fora do molde.
- **Grão:** o que uma linha da tabela representa (um item, um pedido). Misturar grãos duplica números, e é por isso que existe o P7.
