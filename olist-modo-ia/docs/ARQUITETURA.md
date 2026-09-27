# Arquitetura

Tudo roda **no navegador**. Não existe servidor de aplicação: o site é estático (Vercel) e o cálculo acontece
em dois workers, o DuckDB-WASM (banco de dados) e o WebLLM (IA local, só se você ativar).

## O caminho de uma pergunta

```mermaid
flowchart TD
    P["Pergunta em PT-BR<br/>'top 5 categorias em 2018'"] --> C0["Camada 0: roteador por regras<br/>src/router/layer0.ts (sem IA, ~1 ms)"]
    C0 -->|entendeu| SPEC["QuerySpec (JSON)<br/>validado com Zod"]
    C0 -->|"não entendeu e a IA está ativa"| C1["Camada 1: IA local planeja<br/>WebLLM em worker, JSON Schema"]
    C1 -->|"só um QuerySpec, nunca SQL nem número"| V["Validação: Zod + valores reais da base"]
    V -->|ok| SPEC
    V -->|falhou| ESC["Pergunta de volta com chips"]
    SPEC --> COMP["Compilador determinístico<br/>src/query/compiler.ts"]
    COMP --> SQL["SQL parametrizado"]
    SQL --> DB[("DuckDB-WASM no worker<br/>read_parquet + cache por SQL")]
    DB --> INS["Motor de insights<br/>líder, Pareto, variação, decomposição"]
    INS --> GRAF["Seletor de gráfico por regras<br/>ECharts"]
    INS --> TXT["Texto por template<br/>com os fatos"]
    TXT -->|"IA ativa"| NARR["Narrador da IA com marcadores no lugar dos números"]
    NARR --> VAL{"Validador: algum número<br/>fora dos fatos? causa sem 'Hipótese:'?"}
    VAL -->|sim| TXT2["Fica o template"]
    VAL -->|não| TXTIA["Texto da IA com os números do DuckDB"]
    GRAF --> UI["Resposta + 'Como calculei'<br/>(spec, SQL, ms)"]
    TXT2 --> UI
    TXTIA --> UI
```

**Por que assim:** o modelo de linguagem é bom para entender a pergunta e ruim para fazer conta. Então ele nunca
calcula (P1) nem escreve SQL (P2): ele só preenche um formulário (QuerySpec) que o Zod valida. Quem calcula é o
DuckDB, com SQL gerado por um compilador testado. O texto da IA usa marcadores; os números vêm do banco, e um
validador recusa qualquer número que não esteja nos fatos.

## Modo Universal: qualquer planilha

```mermaid
flowchart LR
    A["CSV / Excel / Parquet"] --> L["Leitor<br/>codificação, separador, cabeçalho"]
    L --> LIMP["Limpeza<br/>linhas vazias e de total"]
    LIMP --> PERF["Perfil das colunas<br/>11 tipos: data, dinheiro, %, UF, dado pessoal…"]
    PERF --> TEMA["Tema sem IA<br/>nomes + valores + tipos"]
    TEMA --> PAP["Papéis de negócio<br/>valor, produto, data…"]
    PAP --> REC["Receita do tema<br/>declarativa, validada com Zod"]
    PERF --> TAB["Tabela tipada no DuckDB<br/>dados pessoais mascarados"]
    REC --> SEM["semantic.json automático<br/>mesmo formato da Olist"]
    TAB --> SEM
    SEM --> DASH["Dashboard por tema + Modo IA<br/>(o mesmo caminho da pergunta)"]
    TEMA -.->|"opcional: só metadados"| IA["IA local sugere tema,<br/>rótulos e perguntas"]
```

A tela **"Entendi assim"** mostra tudo o que foi deduzido (tipo, papel, tema, confiança, porquê) e deixa corrigir.
A configuração vira um "modelo" (impressão digital do layout): a próxima planilha igual abre direto.

## Privacidade em camadas

```mermaid
flowchart LR
    subgraph Navegador
      PAG["Página"] --> SW
      WD["Worker DuckDB"] --> SW
      WI["Worker IA"] --> SW
      SW["Service Worker 'firewall'<br/>conta e, no modo local, bloqueia"]
    end
    SW -->|"mesmo site"| SITE["Arquivos do próprio site<br/>(DuckDB, dados, extensão, model_lib)"]
    SW -.->|"modo demo, só depois do clique"| HF["huggingface.co<br/>(pesos do modelo)"]
    CSP["CSP no cabeçalho HTTP<br/>vale para página e workers"] -.-> Navegador
```

- **CSP** (cabeçalho HTTP): modo local = nenhum domínio externo; modo demo = só os domínios dos pesos.
- **Service Worker** assume a página ANTES de o DuckDB nascer; conta cada requisição externa (contador ao vivo).
- **Dados sensíveis:** `min_group_size` no compilador esconde grupos com menos de 5 registros em tudo (KPI,
  gráfico, IA, filtro). Detalhes e evidências em [`PRIVACIDADE.md`](PRIVACIDADE.md).

## Onde está cada coisa

| Pasta | O quê |
|---|---|
| `scripts/` | preparo dos dados (Python), download conferido por SHA-256 (extensão, `model_lib`, CSVs), GIF, `vercel.json` |
| `public/data/` | `fato_itens.parquet` (a base da Olist, 1,77 MB) e metadados |
| `src/semantic/` | `semantic.json` (métricas e dimensões com sinônimos) + schema Zod |
| `src/query/` | QuerySpec, compilador, parser de tempo, resolvedor de valores |
| `src/router/` | Camada 0 (regras) |
| `src/ai/` | Camada 1: WebLLM em worker, planejador, narrador, validador, motor falso dos testes, tema pela IA |
| `src/insights/`, `src/charts/`, `src/narrator/` | fatos, escolha do gráfico, texto por template |
| `src/universal/` | Modo Universal: leitura, limpeza, perfil, semântica automática, temas e receitas |
| `src/privacidade/`, `public/sw.js` | firewall, contador, apagar dados locais |
| `src/avaliacao/`, `evals/` | suíte de perguntas, planilhas de teste, resultados |
| `tests/` | Vitest (unitários, no mesmo DuckDB-WASM), Playwright (e2e no build de produção), pytest (dados) |

Decisões com contexto e alternativas descartadas: [`DECISOES.md`](DECISOES.md). Números: [`BENCHMARK.md`](BENCHMARK.md).
