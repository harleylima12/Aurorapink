# MEGA PROMPT: App de dashboards com "Modo IA" 100% local (demo: vendas Olist)

> Especificação original do Harley (fonte da verdade do projeto). A numeração das seções foi
> restaurada a partir da cópia colada no chat, onde as listas tinham sido renumeradas (ex.: "13.
> Princípios" em vez de "3."). O conteúdo não foi alterado.

## 0. Seu papel

Você é um engenheiro de software sênior e analytics engineer, especialista em IA rodando no navegador (WebGPU / WebLLM), DuckDB-WASM, TypeScript/React, visualização de dados (ECharts) e segurança front-end. Vamos construir juntos, em fases, um web app para o meu portfólio. Eu sou analista de dados júnior. Além de funcionar, o projeto precisa ser explicável por mim numa entrevista.

## 1. Contexto

- Já fiz um dashboard no Power BI com a base pública Olist (e-commerce brasileiro, Kaggle). Agora quero uma versão web com um "Modo IA": clico num botão, pergunto em português ("quais categorias mais faturaram em 2018?", "por que dezembro caiu?") e recebo gráfico + análise em segundos, sem nenhum dado sair do computador.
- Referência que quero superar: um post no LinkedIn mostrou um dashboard de RH em HTML/CSS/JS com "Modo IA": modelo Phi-3 no navegador via WebGPU (fallback WebAssembly) + estruturas condicionais, com gráficos pré-gerados. Os comentários levantaram dúvidas que o nosso projeto deve responder com evidência: a) o modelo pode inventar números ou explicações? b) existe tráfego de rede escondido (pesos em CDN, telemetria de libs)? c) o que fica salvo no navegador (cache dos pesos, IndexedDB)? d) quem controla o acesso aos dados, se a base vai junto com o HTML?
- Os CSVs estão em `./dados/`: orders, order_items, customers, products, sellers, order_reviews, order_payments, geolocation e product_category_name_translation. Não use geolocation.
- A base Olist é a demo. O app também precisa funcionar com qualquer planilha que eu arrastar (CSV ou Excel): ele entende as colunas e monta o dashboard e o Modo IA sozinho (seção 7A).

## 2. O que "melhor" significa aqui (diferenciais mensuráveis)

1. Zero números inventados, por construção. A IA nunca calcula nem escreve números. Todo número vem do DuckDB.
2. Gráficos dinâmicos para qualquer combinação válida de métrica × dimensão × filtro × período. Nada pré-gerado.
3. Rápido. O dashboard abre em menos de 2 s sem IA. O "Modo Rápido" responde perguntas comuns em menos de 300 ms, sem modelo. A IA só é baixada ao clicar e só é acionada quando o roteador determinístico não resolve.
4. Funciona em qualquer máquina. Sem WebGPU, o Modo Rápido continua funcionando, com aviso claro.
5. Leve. Modelo pequeno (cerca de 1 GB ou menos, contra ~2 GB do Phi-3), baixado uma vez, com progresso visível.
6. Privacidade comprovável. Nada de CDN em runtime, CSP restritiva, um Service Worker "firewall" com contador de requisições ao vivo, botão "Apagar dados locais" e teste automatizado de rede.
7. Responde "por quê?". Análise de drivers: decompõe a variação por dimensão.
8. Honesto. Pergunta fora do escopo recebe "não tenho esse dado" + alternativas. Pergunta vaga recebe uma pergunta de volta com opções.
9. Qualidade medida. Suíte com 80 ou mais perguntas, percentual de acerto e latência exibidos na página `/avaliacao`.
10. Universal. Arrasto qualquer planilha e o app monta dashboard + Modo IA sozinho. Planilhas com o mesmo layout (ex.: as vendas do mês seguinte) abrem direto, sem configurar nada.

## 3. Princípios inegociáveis

- **P1.** O LLM é planejador e redator, nunca calculadora.
- **P2.** O LLM nunca gera SQL. Ele gera um `QuerySpec` (JSON validado por schema), e um compilador determinístico transforma esse spec em SQL parametrizado usando a camada semântica.
- **P3.** Nada de CDN em runtime: DuckDB-WASM, ECharts, fontes e o `model_lib` do WebLLM são servidos pelo próprio app. A única exceção é o download dos pesos do modelo no modo "demo", explícito na UI e na allowlist. No modo "estrito", os pesos são self-hosted e nenhum domínio externo é acessado.
- **P4.** Degradação graciosa: tudo que não depende de IA funciona sem IA.
- **P5.** Transparência: toda resposta tem um bloco "Como calculei", com o QuerySpec, o SQL executado e o tempo gasto.
- **P6.** A saída do modelo é texto não confiável. Nunca usar `innerHTML`. Validar sempre com schema. Nunca alimentar o modelo com texto livre da base (ex.: comentários de reviews), por risco de prompt injection.
- **P7.** Grão correto: métricas de pedido (nota, prazo, pedidos) são deduplicadas por `order_id`, a mesma lógica do `AVERAGEX(VALUES(order_id))` que usei no Power BI.
- **P8.** Não invente API de biblioteca. Confira tipos e README em `node_modules` ou na documentação oficial, e fixe as versões no `package.json`.

## 4. Arquitetura

```
Pergunta (PT-BR)
 → Normalizador (minúsculas, sem acento, sinônimos, números por extenso)
 → Parser de tempo PT-BR ("em 2018", "último trimestre", "black friday", "1º semestre")
     âncora = última data presente nos dados (na Olist, 31/08/2018), NUNCA a data de hoje
 → Camada 0: roteador determinístico (sinônimos + fuzzy + regras) → confiança
     confiança ≥ limiar → QuerySpec
     senão → Camada 1: LLM planejador (WebLLM, JSON Schema, temperature 0) → QuerySpec
 → Validador (Zod + valores reais; ex.: "são paulo" → "SP")
     inválido ou ambíguo → pergunta de esclarecimento com chips
 → Compilador SQL (camada semântica) → DuckDB-WASM (Web Worker) → resultado
 → Motor de insights (fatos determinísticos: id, valor, valor formatado, importância)
 → Seletor de gráfico (regras) → ECharts          ← aparece assim que o SQL termina
 → Narrador: template (Modo Rápido) OU LLM com placeholders {{id}}
 → Validador numérico → resposta (texto em streaming)
```

DuckDB e LLM rodam em Web Workers separados. A UI nunca trava.

## 5. Stack

- Vite + React + TypeScript (strict), build estático (deploy na Vercel)
- `@duckdb/duckdb-wasm` com bundles locais (imports `?url` do Vite, sem jsDelivr)
- `@mlc-ai/web-llm` (engine em Web Worker, `response_format` com JSON Schema). Confirme a API exata na versão instalada.
- `echarts`, com tema escuro próprio
- `zod`: o mesmo schema valida a saída e gera o JSON Schema que restringe o modelo (`z.toJSONSchema` no Zod 4, ou `zod-to-json-schema`)
- `fuse.js` para busca aproximada (fuzzy)
- SheetJS, empacotado localmente, para ler Excel no navegador. Instale a versão oficial mais recente pelo tarball da própria SheetJS (a do registro npm está desatualizada). Não use a extensão de Excel do DuckDB-WASM: por padrão ela é baixada de um servidor externo.
- Vitest (testes unitários) + Playwright (e2e + auditoria de rede)
- Python 3 + `duckdb` para preparar os dados (CSV → Parquet)
- Modelo: escolher em runtime a partir da `prebuiltAppConfig.model_list` da versão instalada do WebLLM, preferindo um instruct pequeno bom em PT-BR e em JSON. Ordem de preferência: Qwen (1,5B–3B) → Llama 3.2 (1B/3B) → Phi-3.5-mini. Use a variante q4f16 se o adapter suportar `shader-f16`, senão q4f32. Em máquina com pouca VRAM, use o menor. Documente a escolha com tamanho e latência medidos.

## 6. Dados (Fase 1)

Script `scripts/preparar_dados.py` (Python + duckdb) que gera `public/data/fato_itens.parquet` (compressão zstd), com uma linha por item:

- `order_id, order_item_id, product_id, seller_id, price, freight_value, order_status`
- `data_compra` (date), `data_entrega`, `data_estimada`, `dias_entrega`
- `status_entrega`: "No Prazo" | "Atrasado" | "Não Entregue"
- `nota`: média das reviews por pedido
- `forma_pagamento`: a principal do pedido (maior valor), em PT-BR (Cartão de crédito, Boleto, Voucher, Cartão de débito)
- `parcelas`: máximo de parcelas do pedido
- `customer_unique_id, cidade_cliente, estado_cliente, estado_vendedor`
- `categoria`: nome amigável com acentos ("cama_mesa_banho" → "Cama, Mesa e Banho"); vazio → "Sem Categoria"

Regras iguais às do Power BI: excluir status `canceled` e `unavailable`; faturamento = soma de `price`, sem frete.
Gere `dados/validacao.md` com os totais. Critério de aceite: os números têm que bater com o Power BI (Faturamento ≈ R$ 13,49 mi; ≈ 98 mil pedidos; ticket médio ≈ R$ 137,42; ≈ 95 mil clientes únicos). Se não bater, investigue antes de seguir.

## 7. Camada semântica (`src/semantic/semantic.json`)

É a fonte única de verdade para métricas, dimensões e sinônimos. Formato de exemplo:

```json
{
  "metrics": {
    "faturamento": { "label": "Faturamento", "sql": "SUM(price)", "format": "brl", "grain": "item",
      "synonyms": ["receita", "vendas", "faturou", "quanto vendeu", "valor vendido"],
      "description": "Soma do preço dos itens, sem frete" },
    "pedidos": { "label": "Pedidos", "sql": "COUNT(DISTINCT order_id)", "format": "int",
      "synonyms": ["quantidade de pedidos", "compras", "ordens"] },
    "ticket_medio": { "label": "Ticket médio", "sql": "SUM(price) / COUNT(DISTINCT order_id)", "format": "brl",
      "synonyms": ["valor médio por pedido", "gasto médio"] },
    "nota_media": { "label": "Nota média", "grain": "order", "sql": "AVG(nota)", "format": "dec1",
      "synonyms": ["avaliação", "satisfação", "review", "nota dos clientes"] }
  },
  "dimensions": {
    "categoria": { "label": "Categoria", "column": "categoria", "synonyms": ["produto", "tipo de produto", "segmento"] },
    "estado_cliente": { "label": "Estado do cliente", "column": "estado_cliente", "synonyms": ["uf", "estado"],
      "value_aliases": { "SP": ["são paulo", "sampa"], "RJ": ["rio", "rio de janeiro"] } },
    "tempo": { "column": "data_compra", "grains": ["dia", "semana", "mes", "trimestre", "ano"] }
  },
  "defaults": { "periodo": { "de": "2017-01-01", "ate": "2018-08-31" }, "limit": 10 },
  "out_of_scope_hints": {
    "lucro": "Não há dados de custo. Posso mostrar faturamento ou ticket médio.",
    "estoque": "A base não tem estoque. Posso mostrar itens vendidos por categoria."
  }
}
```

- Métricas mínimas: faturamento, frete_total, frete_medio, pedidos, itens, ticket_medio, clientes, prazo_medio_entrega, pct_no_prazo, pct_atraso, nota_media.
- Dimensões mínimas: tempo, categoria, estado_cliente, cidade_cliente, estado_vendedor, status_entrega, forma_pagamento, faixa_de_preco (buckets).
- Métricas com `grain: "order"` são calculadas via subquery por `order_id`.
- Trocar de dataset (ex.: RH, saúde) deve exigir só dados novos + um novo `semantic.json`.

## 7A. Modo Universal: arraste qualquer planilha

O `semantic.json` da Olist é escrito à mão. Para qualquer outra planilha, o app gera o `semantic.json` sozinho, e o resto do sistema (dashboard, Camada 0, IA, insights) funciona igual, porque tudo é guiado pela camada semântica.

1. Entrada: arrastar um ou mais arquivos CSV, XLSX ou Parquet. Tudo é lido no navegador; nada é enviado.
2. Leitura inteligente: detectar separador (`,` ou `;`), codificação (UTF-8 / Latin-1), decimal brasileiro ("1.234,56"), moeda ("R$"), porcentagem ("12,5%"), datas "dd/mm/aaaa" e qual aba do Excel tem os dados.
3. Limpeza automática: achar a linha de cabeçalho (pulando títulos acima da tabela), remover linhas vazias e linhas de total/subtotal, normalizar nomes de colunas, converter "Sim/Não" em booleano. Mostrar um relatório curto do que foi corrigido.
4. Perfil das colunas: classificar cada coluna em data, dinheiro, número, porcentagem, categoria, UF/cidade, booleano, id, texto livre ou dado pessoal (CPF, e-mail, telefone, nome), usando o nome da coluna, uma amostra dos valores, a cardinalidade e os nulos.
5. Camada semântica automática:
   - métricas: contagem de registros; soma e média das colunas de dinheiro; média das porcentagens; contagem distinta de ids (ex.: clientes, pedidos);
   - dimensões: categorias com 2 a ~200 valores distintos; datas viram a dimensão tempo (dia/mês/trimestre/ano);
   - sinônimos: dicionário PT-BR de termos de negócio (valor/receita/venda/faturamento; qtd/quantidade/unidades; cliente/comprador; vendedor/representante; funcionário/colaborador…). A IA local pode sugerir rótulos amigáveis e sinônimos uma única vez, na configuração, com validação por schema;
   - texto livre e dados pessoais ficam fora do catálogo da IA por padrão (privacidade + prompt injection), e dados pessoais aparecem mascarados.
6. Tela "Entendi assim" (revisão de 1 minuto): cada coluna com tipo, papel (métrica / dimensão / ignorar), agregação (soma / média / contagem) e rótulo, tudo editável por dropdown, com prévia dos KPIs. Botão "Gerar dashboard".
7. Dashboard automático: os 4 KPIs mais relevantes, evolução no tempo (se houver data), rankings das 2 dimensões mais úteis e uma tabela de detalhe, no mesmo tema escuro. O Modo IA já vem funcionando, com sugestões de perguntas geradas a partir das colunas reais.
8. Modelos de planilha ("joga e pronto"): salvar a configuração localmente com uma impressão digital do layout (nomes + tipos das colunas). Quando eu arrastar outra planilha com o mesmo layout, o app reconhece e abre direto no dashboard, sem a tela de revisão. Permitir exportar e importar a configuração (.json) para usar em outro computador.
9. Vários arquivos: sugerir relacionamentos por colunas com o mesmo nome e valores compatíveis (ex.: vendas + clientes por `id_cliente`), pedir confirmação e avisar do risco de duplicação por grão.
10. Limites honestos: avisar quando a planilha for grande demais para o navegador (medir o limite real) ou estiver "desenhada" (células mescladas, várias tabelas na mesma aba), com dicas de como ajustar.
11. Lembrar a última planilha: opcional, com botão para desligar e para apagar, usando o armazenamento local do navegador.

## 8. QuerySpec (definido em Zod, exportado como JSON Schema)

```ts
type QuerySpec = {
  intent: "kpi" | "tendencia" | "ranking" | "comparacao" | "distribuicao"
        | "explicar_variacao" | "detalhe" | "esclarecer" | "fora_de_escopo";
  metrics: MetricId[];        // enum gerado do semantic.json (1 a 3)
  dimensions: DimensionId[];  // 0 a 2
  time?: { grain?: "dia" | "semana" | "mes" | "trimestre" | "ano"; from?: string; to?: string;
           compare?: "periodo_anterior" | "mesmo_periodo_ano_anterior" | "nenhum" };
  filters: { dimension: DimensionId; op: "in" | "not_in" | "gte" | "lte" | "between";
             values: (string | number)[] }[];
  sort?: { by: MetricId; dir: "asc" | "desc" };
  limit?: number;             // 1 a 50
  chart?: "auto" | "linha" | "barra" | "coluna" | "kpi" | "tabela" | "dispersao";
  clarify?: { question: string; options: string[] };  // quando intent = esclarecer
  out_of_scope_reason?: string;                       // quando intent = fora_de_escopo
};
```

Os enums vêm do `semantic.json`, então o modelo fisicamente não consegue citar uma coluna inexistente. Os valores de filtro são conferidos contra os valores distintos reais (fuzzy → valor canônico).

## 9. Camada 0: "Modo Rápido" (sem IA)

- Dicionário de sinônimos + `fuse.js` para métricas e dimensões, parser de tempo e regras de intenção:
  - "top / maiores / mais" → ranking
  - "evolução / mês a mês / ao longo" → tendência
  - "vs / comparar / diferença" → comparação
  - "por que / o que explica" → explicar_variacao
- Score de confiança. Abaixo do limiar: vai para a Camada 1 (se disponível) ou para um esclarecimento com chips.
- Meta: resolver sozinha pelo menos 60% da suíte de avaliação.

## 10. Camada 1: LLM planejador

- Carregar o WebLLM só quando o Modo IA for ativado (dynamic import), em Web Worker, com barra de progresso (MB, %, tempo restante) e o aviso "download único; depois abre em segundos".
- Parâmetros: `temperature: 0`, `max_tokens` por volta de 256, `response_format` com o JSON Schema do QuerySpec.
- Prompt dinâmico enxuto: incluir só as métricas e dimensões candidatas (top-k da Camada 0) + 6 a 10 exemplos few-shot. Menos prefill, resposta mais rápida.
- Follow-ups: enviar o QuerySpec anterior. Perguntas como "e só em SP?" ou "e em 2018?" modificam o spec anterior em vez de começar do zero.
- Rascunho do system prompt (refine e versione em `src/ai/prompts/planner.ts`):

```
Você converte perguntas em português sobre os dados de {{nome_dataset}} ({{descricao_dataset}}) em um JSON QuerySpec.
Regras:
- Use SOMENTE as métricas e dimensões listadas em CATÁLOGO.
- Não calcule nada e não escreva números que não estejam na pergunta.
- Datas relativas usam como "hoje" {{data_ancora}} (última data dos dados).
- Pergunta impossível com o catálogo (lucro, custo, estoque...) → intent "fora_de_escopo" com o motivo.
- Pergunta vaga → intent "esclarecer" com até 3 opções curtas.
- Se houver SPEC_ANTERIOR e a pergunta for um complemento, modifique o SPEC_ANTERIOR.
Responda apenas com o JSON.
CATÁLOGO: {{catalogo_filtrado}}
SPEC_ANTERIOR: {{spec_anterior_ou_null}}
```

- Few-shots mínimos:
  1. "quanto faturamos no total?" → kpi [faturamento]
  2. "top 5 categorias em 2018" → ranking [faturamento] × [categoria], 2018, limit 5
  3. "pedidos mês a mês" → tendencia [pedidos], grain mes
  4. "nota de quem recebeu atrasado vs no prazo" → comparacao [nota_media] × [status_entrega]
  5. "onde o frete é mais caro?" → ranking [frete_medio] × [estado_cliente]
  6. (SPEC_ANTERIOR = exemplo 2) "e só em SP?" → mesmo spec + filtro estado_cliente in [SP]
  7. "por que o faturamento caiu em dez/2017?" → explicar_variacao [faturamento], dez/2017 vs nov/2017
  8. "qual o lucro por categoria?" → fora_de_escopo
  9. "como estamos?" → esclarecer ["Faturamento do período", "Evolução mensal", "Satisfação dos clientes"]
  10. "ticket médio por forma de pagamento" → comparacao [ticket_medio] × [forma_pagamento]
- Para planilhas do Modo Universal, gere os few-shots automaticamente a partir do catálogo (pelo menos 1 por intenção), usando os rótulos reais das colunas.

## 11. Motor de insights (determinístico)

A partir do resultado, calcula fatos com id:

- total
- líder e participação (%)
- concentração (top 3 / Pareto 80-20)
- variação contra o período anterior (absoluta e %)
- tendência (inclinação de regressão linear)
- máximo e mínimo, com data
- outliers (z-score > 2 ou IQR)
- diferença entre grupos (ex.: nota de atrasado vs no prazo)
- para `explicar_variacao`: decomposição da variação por dimensão, com a contribuição de cada segmento para o delta (top 3 positivos e top 3 negativos)

Formato de cada fato: `{ id, tipo, rotulo, valor, valor_formatado, importancia }`. Formatação sempre com `Intl.NumberFormat('pt-BR')` (R$ 13,49 mi; 12,5%).
Ao abrir o Modo IA, mostre 3 insights automáticos (sazonalidade/Black Friday, impacto do atraso na nota, concentração por estado), calculados por consultas pré-definidas. É melhor do que uma tela vazia.

## 12. Seletor de gráfico (regras, não IA)

- 1 valor → cartão KPI (com variação se houver comparação)
- tempo → linha com área suave; com `compare` → 2 séries
- ranking categórico → barras horizontais ordenadas (máx. 15 barras + "Outros")
- comparação de 2 a 5 grupos → colunas
- distribuição (faixa de preço, dias de entrega) → histograma
- 2 métricas × 1 dimensão → dispersão
- explicar_variacao → waterfall (ponte) da variação
- Cores: um destaque (#22D3EE); vermelho (#F87171) só para negativo ou atraso.

## 13. Narrador + validação (zero números inventados)

- Modo Rápido: templates por intenção. Exemplo para ranking: "{{lider.rotulo}} lidera com {{lider.valor}} ({{lider.share}} do total)…"
- Modo IA: o modelo recebe só os fatos (nunca linhas brutas) e responde em JSON `{ titulo, bullets: [{ texto, fatos: [ids] }], hipotese? }`. O texto não pode conter dígitos; os valores entram por placeholders `{{id}}`, preenchidos pelo app.
- Validador: rejeita a resposta se houver dígito fora de placeholder, placeholder inexistente ou afirmação causal sem a marcação "hipótese". Se rejeitar, usa o template e registra a falha no log de avaliação.
- O gráfico e o texto do template aparecem imediatamente. O texto da IA chega depois, em streaming, e substitui o template. Máximo de 4 bullets, tom executivo, PT-BR.

## 14. UX / UI

- Tela inicial: área "Arraste sua planilha (CSV ou Excel)" + botão "Ver demo com dados da Olist" + lista dos modelos de planilha salvos.
- Dashboard principal (sem IA): mesma identidade do meu Power BI. Fundo #0B1120, painéis #131C31, borda #1E2A45, degradê de destaque #22D3EE → #8B5CF6, texto #F1F5F9, texto secundário #94A3B8. Barra lateral com navegação (Visão Geral / Produtos / Logística) e filtros (Ano, Estado). KPIs: Faturamento, Pedidos, Ticket Médio, Clientes.
- Botão "✨ Modo IA" abre um painel lateral, estilo copiloto:
  - status: "Modo Rápido" / "Baixando modelo 43% (412 MB)" / "IA pronta · 100% local"
  - chips de sugestão; campo de pergunta com atalho "/"; Enter envia; histórico da sessão
  - cartão de resposta: título, gráfico, bullets, selo "respondido em 0,4 s · Modo Rápido | IA", bloco "Como calculei" (spec + SQL + ms)
  - ações no cartão: Fixar no dashboard (salvo localmente), Exportar PNG, Copiar texto, 👍/👎 (salvo localmente para alimentar a suíte de avaliação)
  - selo de privacidade com contador ao vivo: "Requisições externas desde que você abriu: 0"
  - botão "Apagar dados locais" (Cache Storage, IndexedDB, OPFS, localStorage)
- PWA: instalável como app (ícone na área de trabalho) e funciona offline depois da primeira visita.
- Responsivo, `aria-live` nas respostas, contraste AA, foco visível.

## 15. Privacidade e segurança

- CSP no `index.html`, no mínimo necessário, documentando cada exceção: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' <domínios dos pesos, só no modo demo>; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'`
- Service Worker "firewall": intercepta as requisições da página e dos workers, registra todas e, no modo estrito, bloqueia o que não for same-origin. É ele que alimenta o contador da UI. Confirme no Chrome que os workers estão sob controle do Service Worker; se não estiverem, instrumente o `fetch` dentro dos workers.
- Dois modos de modelo, escolhidos por variável de ambiente:
  - `VITE_MODEL_SOURCE=demo`: pesos baixados do Hugging Face. Descubra os domínios reais usados no download e coloque só esses na allowlist.
  - `VITE_MODEL_SOURCE=local`: `npm run baixar-modelo` salva os pesos em `public/models`. Nenhum domínio externo é acessado.
- Nenhuma lib de analytics ou telemetria. Revise as dependências.
- Planilhas do Modo Universal são processadas só no navegador. Nada é enviado.
- Para datasets sensíveis (RH, saúde): `minGroupSize` configurável (não exibir grupos com n < 5).
- `docs/PRIVACIDADE.md` respondendo, com evidências (prints, testes), às 4 perguntas da seção 1.

## 16. Performance (medir e mostrar)

- Metas:
  - primeira pintura do dashboard < 2 s
  - Modo Rápido < 300 ms de ponta a ponta
  - planejamento com IA (modelo já em cache) < 3 s em GPU dedicada e < 6 s em GPU integrada
  - gráfico na tela logo após o SQL
- Técnicas: cache de resultados por hash do spec; warm-up do modelo após o carregamento; Parquet com projeção só das colunas usadas.
- Registre as medições reais em `docs/BENCHMARK.md`. Se alguma meta não for viável no meu hardware, meça, explique e proponha alternativa.

## 17. Avaliação

- `evals/perguntas.json`: 80 ou mais perguntas em PT-BR (fáceis, médias, difíceis, follow-ups, ambíguas, fora do escopo, com erros de digitação e gírias). Cada uma com o QuerySpec esperado nos campos essenciais.
- Página `/avaliacao`: roda a suíte no navegador (Camada 0 sozinha e Camada 0+1) e mostra percentual de acerto por categoria, taxa de fallback do narrador e latência p50/p95. Permite exportar em JSON.
- Metas: 90% ou mais nas fáceis e médias; 75% ou mais no geral; 100% das fora de escopo recusadas corretamente; 0 números não rastreáveis.
- Modo Universal: pasta `evals/planilhas/` com 5 ou mais planilhas de teste (vendas em formato BR com `;` e vírgula decimal, Excel com linha de título e linha de total, RH fictício, estoque, uma planilha "bagunçada") e o perfil esperado de cada coluna. Meta: 90% ou mais das colunas classificadas corretamente sem ajuste manual.
- Testes unitários (Vitest): compilador spec→SQL (snapshots), parser de tempo, fuzzy de valores, validador numérico, motor de insights.
- Testes e2e (Playwright): o dashboard carrega; uma pergunta no Modo Rápido gera gráfico; auditoria de rede que falha se houver requisição a domínio não permitido.

## 18. Estrutura de pastas (sugestão)

```
olist-modo-ia/
  dados/                      # CSVs originais (fora do git)
  scripts/preparar_dados.py
  public/data/*.parquet
  src/
    semantic/semantic.json
    data/duckdb.ts
    query/spec.ts  compiler.ts  timeParser.ts  valueResolver.ts
    router/layer0.ts
    ai/engine.worker.ts  planner.ts  narrator.ts  prompts/
    insights/engine.ts  drivers.ts
    universal/reader.ts  cleaner.ts  profiler.ts  semanticBuilder.ts  fingerprint.ts
    charts/selector.ts  theme.ts
    privacy/sw.ts  networkMonitor.ts  clearLocalData.ts
    ui/                       # Dashboard, AiPanel, AnswerCard...
  evals/perguntas.json
  evals/planilhas/            # planilhas de teste do Modo Universal
  tests/                      # unit + e2e
  docs/ARQUITETURA.md  DECISOES.md  PRIVACIDADE.md  BENCHMARK.md  ENTREVISTA.md
```

## 19. Fases

Ao fim de cada fase: pare, rode os testes, faça commit e me mostre um resumo com prints. Só avance com o meu OK.

- **Fase 0: Plano.** Leia tudo, confirme as versões das libs, proponha ajustes e liste os riscos. Ainda não escreva código.
- **Fase 1: Dados.** Script Python, Parquet e `validacao.md` batendo com o Power BI.
- **Fase 2: Base.** Vite + TS, DuckDB-WASM local, `semantic.json`, compilador SQL com testes, dashboard sem IA (3 páginas, KPIs, filtros).
- **Fase 3: Modo Rápido.** Camada 0, motor de insights, seletor de gráfico, narrador por template, painel do Modo IA.
- **Fase 4: IA local.** WebLLM em worker, escolha do modelo pelo dispositivo, planejador com JSON Schema, follow-ups, esclarecimento, fora de escopo, narrador com placeholders + validador, explicar_variacao (drivers).
- **Fase 5: Modo Universal.** Leitura inteligente de CSV/XLSX, limpeza, perfil das colunas, `semantic.json` automático, tela "Entendi assim", dashboard automático, modelos de planilha (impressão digital), vários arquivos.
- **Fase 6: Privacidade.** CSP, Service Worker firewall + contador, modos demo/local, apagar dados locais, auditoria no Playwright, `PRIVACIDADE.md`.
- **Fase 7: Avaliação e performance.** Suíte com 80+ perguntas, planilhas de teste do Modo Universal, página `/avaliacao`, otimizações, `BENCHMARK.md`.
- **Fase 8: Portfólio.**
  - README: problema, arquitetura em Mermaid, GIF de demonstração, tabela de benchmark, como rodar, privacidade.
  - `ENTREVISTA.md`: roteiro de 5 minutos para eu explicar o projeto + 10 perguntas prováveis com respostas.
  - Pergunte antes de criar o repositório público no GitHub (`gh`) e antes do deploy na Vercel.

## 20. Regras de trabalho

- Antes de codar cada fase, mostre um plano curto. Commits pequenos, no padrão Conventional Commits, em PT-BR.
- Verifique a API real das libs (tipos em `node_modules` e docs oficiais); não suponha. Fixe as versões.
- TypeScript strict, sem `any`. O núcleo (compilador, roteador, insights, validador) deve ser feito de funções puras e testáveis.
- Registre cada decisão importante em `docs/DECISOES.md`, no formato contexto → decisão → alternativa descartada.
- Não esconda limitações: se algo falhar ou ficar abaixo da meta, diga, com números.
- Nos resumos de fase, explique termos técnicos de forma simples. Eu preciso entender para defender o projeto.

## 21. Fora de escopo (por enquanto)

Login e usuários, backend, modelos na nuvem, mapas, conexão direta com Google Sheets, bancos de dados ou ERPs, e entrada por voz. A API de voz do Chrome envia áudio para servidores externos; voz só entraria com Whisper rodando local.
