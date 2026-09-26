# Decisões do projeto

Formato: **contexto → decisão → alternativa descartada**. As decisões da Fase 0 (ajustes 1 a 15) estão em
[`FASE0_PLANO.md`](FASE0_PLANO.md) §4; aqui entram as que foram tomadas durante a construção.

## Fase 1: dados

### D1. Onde o projeto vive nesta sessão

- **Contexto:** a Fase 1 foi feita no Claude Code na nuvem, e não no PC do Harley como o plano previa (§7). A sessão
  só tem acesso ao repositório `harleylima12/Aurorapink` (site da Aurora, público), no branch
  `claude/gracious-carson-hgcwsu`.
- **Decisão:** o projeto fica isolado na pasta `olist-modo-ia/` desse branch, sem tocar no site. Nenhum pull request
  foi aberto. Para levar ao repositório definitivo na Fase 8: `git subtree split --prefix=olist-modo-ia` preserva o
  histórico só desta pasta.
- **Descartado:** criar um repositório novo agora. A regra do projeto é só criar repositório público com autorização
  explícita, na Fase 8.
- **Atenção:** como o Aurorapink é público, o branch também fica visível.

### D2. De onde vêm os CSVs no ambiente de nuvem

- **Contexto:** os CSVs estão no PC do Harley (`./dados/`), fora do git. Na nuvem, o Kaggle é bloqueado pela política
  de rede (403).
- **Decisão:** `scripts/baixar_dados.py` baixa do repositório oficial da Olist no GitHub
  (`olist/work-at-olist-data`), **fixado no commit `d9e4980`** e com SHA-256 conferido. Prova de que são os mesmos
  arquivos do Kaggle: os recortes A, B e C da Fase 0 (calculados com pandas nos CSVs do Kaggle) batem no centavo e na
  unidade (`dados/validacao.md` §2).
- **Descartado:** apontar para o branch `master` (o conteúdo pode mudar sem aviso) ou para espelhos não oficiais.

### D3. Chaves substitutas no lugar dos IDs (ajuste 6 da Fase 0)

- **Contexto:** os IDs da Olist são textos aleatórios de 32 caracteres, que quase não comprimem.
- **Decisão:** o fato guarda inteiros (`pedido_sk`, `cliente_sk`, `produto_sk`, `vendedor_sk`). Os IDs originais
  ficam em `ids_*.parquet`, que só a tabela de detalhe vai ler. **Medido:** fato com chaves = 1,77 MB; com os IDs
  originais = 5,41 MB (3 vezes maior). `pedido_sk` e `cliente_sk` seguem a ordem cronológica (o pedido 1 é o
  primeiro da base); produtos e vendedores são numerados pelo ID.
- **Descartado:** manter os IDs no fato (o arquivo que o dashboard baixa ao abrir ficaria 3 vezes maior).

### D4. Dinheiro em `DECIMAL(10,2)`, não em ponto flutuante

- **Contexto:** `DOUBLE` soma R$ 13.494.400,740012689; o resíduo some na formatação, mas atrapalha testes e comparações
  exatas.
- **Decisão:** `price` e `freight_value` como `DECIMAL(10,2)`: a soma dá exatamente `13494400.74`. Conferido que
  nenhum valor dos CSVs tem mais de 2 casas decimais (0 de 112.650). No navegador (Fase 2), o compilador converte os
  agregados para `DOUBLE` (ou o DuckDB-WASM usa `query.castDecimalToDouble`), porque o Arrow do JavaScript não lida bem
  com decimal.
- **Descartado:** `DOUBLE` (resíduo de arredondamento) e centavos em inteiro (mais difícil de explicar e de usar no SQL).

### D5. zstd nível 19

- **Contexto:** o tamanho do Parquet pesa na meta de abrir o dashboard em menos de 2 s.
- **Decisão:** zstd nível 19. **Medido no fato:** nível 19 = 1,77 MB; nível 3 (padrão) = 2,13 MB; snappy = 2,91 MB.
  O tempo de leitura é o mesmo (cerca de 12 ms no DuckDB), porque o zstd descompacta na mesma velocidade em qualquer
  nível. O custo fica só no script (cerca de 17 s dos 24 s de execução).
- **Descartado:** nível padrão (17% maior, sem ganho na leitura).

### D6. Parquet ordenado e reproduzível

- **Decisão:** as linhas são gravadas em ordem de `pedido_sk` (= ordem de compra). Isso comprime melhor e deixa o
  min/max de `data_compra` de cada bloco útil para pular dados em filtros de período. Rodar o script de novo gera
  arquivos idênticos (mesmo SHA-256), então o git só mostra diferença quando o dado muda de verdade.

### D7. Forma de pagamento principal

- **Contexto:** 2.211 pedidos têm mais de um tipo de pagamento (ex.: voucher + cartão).
- **Decisão:** soma por tipo e escolhe o tipo com maior valor total. O empate desempata pela primeira parcela paga,
  mas não aconteceu nenhum. 1 pedido não tem pagamento nos CSVs e fica como "Não informado".
- **Descartado:** "a linha de maior valor". Com 3 vouchers de R$ 20 e um cartão de R$ 50, ela escolheria o cartão,
  embora o voucher tenha pago mais. Muda 40 pedidos.

### D8. Entrega: o que conta como entregue e como atrasado

- **Decisão (aprovada na Fase 0):** entregue = tem data de entrega ao cliente. Atrasado = entregue depois do **dia**
  estimado, comparando só a data.
  - Os 8 pedidos com status `delivered` e sem data de entrega ficam como "Não Entregue", porque sem data não dá para
    calcular prazo.
  - Comparando data **e hora**, o recorte B teria 7.822 atrasados em vez de 6.531: a data estimada da Olist é sempre
    meia-noite, então quem recebe no próprio dia estimado apareceria como atrasado.
- **Descartado:** comparar timestamps.

### D9. Nota do pedido e grão (P7)

- **Decisão:** `nota` = média das reviews do pedido (547 pedidos têm mais de uma). A nota média geral é a média
  **por pedido**: 4,117. Feita por linha do Parquet (por item) daria 4,045, porque pedidos com vários itens pesariam
  mais. É o mesmo raciocínio do `AVERAGEX(VALUES(order_id))` do Power BI. 732 pedidos não têm review e ficam com
  `nota` vazia (fora da média).

### D10. Pedidos sem itens ficam de fora

- **Contexto:** 8 pedidos com status válido não têm nenhum item (5 `created`, 2 `invoiced`, 1 `shipped`).
- **Decisão:** ficam fora do fato, que tem uma linha por item. Sem item não há faturamento, e a contagem de 98.199
  pedidos do Power BI já é essa.

### D11. Nomes de cidade com acento (lista do IBGE)

- **Contexto:** a Olist grava a cidade em minúsculas e sem acento ("sao paulo").
- **Decisão:** procurar cada par (cidade, UF) na lista oficial de 5.571 municípios do IBGE
  (`scripts/referencia/municipios_ibge.csv`, vindo de `kelvins/municipios-brasileiros`, licença MIT), ignorando acento,
  hífen e apóstrofo. **99,4% dos pedidos** ficam com o nome oficial ("São Paulo", "Santa Bárbara d'Oeste"); o resto
  (distritos como "Bonfim Paulista", nomes antigos como "Parati", erros como "Piumhii") fica em Title Case.
  - Grafias diferentes da mesma cidade se juntam ("santa barbara d oeste" e "santa barbara d'oeste").
  - A UF entra na comparação, porque há nomes repetidos entre estados.
- **Pendente para a Fase 2:** agrupar a dimensão cidade por cidade **e** UF, porque "Bom Jesus" existe em vários
  estados.
- **Descartado:** deixar o texto cru da Olist (feio no dashboard) ou só aplicar Title Case ("Sao Paulo", sem til).

### D12. Categorias

- **Decisão:** o mapeamento fica num CSV editável (`scripts/referencia/categorias.csv`, 73 categorias). O script
  falha se aparecer uma categoria sem nome amigável. As duplicatas da própria Olist (`casa_conforto_2`,
  `eletrodomesticos_2`) continuam separadas ("Casa e Conforto 2"), para não mudar os números por categoria em relação
  ao Power BI. 610 produtos sem categoria viram "Sem Categoria" (1.437 pedidos, 1,3% do faturamento).
- **Descartado:** usar a tradução em inglês da própria Olist ou juntar as categorias "_2" (juntar muda o ranking).

### D13. Âncora de datas no `meta.json`

- **Decisão:** o script calcula a âncora com a regra aprovada (último mês com pelo menos 10% da mediana mensal de
  pedidos) e grava em `public/data/meta.json`: **31/08/2018**. A mesma regra (`data_ancora()`, testada) vai ser
  reescrita em TypeScript para o Modo Universal.
- **Caso-limite anotado para a Fase 5:** se uma planilha termina no meio de um mês com volume normal, a âncora vira o
  último dia desse mês, depois da última data dos dados.

### D14. Comentários das reviews não entram no Parquet

- **Decisão:** só a nota (número) vai para o fato. Os textos das reviews (`review_comment_*`) ficam de fora. É a
  forma mais simples de cumprir o P6: o texto livre da base nunca chega perto do modelo, porque nem está no app.

### D15. Parquet no DuckDB-WASM exige a extensão `parquet` servida pelo próprio app ⚠️

- **Contexto (descoberto na Fase 1):** o `@duckdb/duckdb-wasm@1.32.0` roda o DuckDB **v1.4.3** e **não tem leitor de
  Parquet embutido**: a extensão `parquet` é baixada de `extensions.duckdb.org` sob demanda (`duckdb_extensions()`
  mostra `parquet: installed=false`). Com o autoload desligado (ajuste 4 da Fase 0), `read_parquet` falha com
  "exists in the parquet extension", e o atalho `FROM 'arquivo.parquet'` também falha. Ou seja: sem cuidado, abrir o
  dashboard já faria uma requisição escondida a um domínio externo, exatamente a pergunta (b) da seção 1.
- **Decisão para a Fase 2:**
  - baixar uma vez, no setup, `parquet.duckdb_extension.wasm` (plataformas `wasm_mvp` e `wasm_eh`, v1.4.3) para
    `public/duckdb-extensions/`, do mesmo jeito que o `model_lib` do WebLLM (ajuste 7);
  - no app, apontar `SET custom_extension_repository` para o próprio site e rodar `LOAD parquet` explicitamente. A
    opção existe no binário do 1.32.0, conferido com `grep` no `.wasm`;
  - o compilador sempre usa `read_parquet(...)` ou views, nunca o atalho `FROM 'x.parquet'`.
- **O que foi verificado aqui:**
  - o Parquet gerado pelo duckdb 1.5.5 é lido corretamente pelo **duckdb 1.4.3** (a mesma versão do motor WASM, em
    Python): mesmos totais, acentos e joins com os IDs;
  - o carregamento da extensão self-hosted **não pôde ser testado nesta sessão**, porque `extensions.duckdb.org` é
    bloqueado pela rede da nuvem (403). Fica como primeiro teste da Fase 2, no PC do Harley.
- **Plano B, se o self-hosting falhar:** gravar os dados num arquivo de banco do DuckDB (`.duckdb`, lido com
  `ATTACH`), que não precisa de extensão nenhuma. O Modo Universal perderia a entrada de arquivos Parquet (CSV e Excel
  continuam).
- **Descartado:** deixar o autoload ligado (tráfego externo escondido) e trocar Parquet por CSV (arquivo muito maior
  e sem tipos).

### D16. Frete total diferente do anotado na Fase 0 (em aberto)

- **Contexto:** o Parquet dá frete total de **R$ 2.245.816,19** no recorte A. A Fase 0 anotou R$ 2.241.126,29
  (diferença de R$ 4.689,90, ou 0,21%).
- **O que foi testado:** faturamento, pedidos, clientes e itens batem exatamente, então os itens são os mesmos. Nenhum
  dos recortes testados reproduz o número da Fase 0: só `delivered` (R$ 2.202.965,54), sem 2016, frete deduplicado por
  pedido e vendedor, e só produtos com categoria.
- **Situação:** não é critério de aceite. Precisa ser conferido no card de frete do Power BI. Se o Power BI mostrar
  R$ 2.245.816,19, o número da Fase 0 é que estava errado.

## Fase 2: base

### D17. Caminho FINAL × caminho PROVISÓRIO dos dados (sem extensions.duckdb.org nesta nuvem)

- **Contexto:** o DuckDB-WASM 1.32.0 precisa da extensão `parquet` (D15), e `extensions.duckdb.org` está bloqueado nesta
  sessão por decisão do Harley (não liberar por enquanto).
- **FINAL (pronto, falta validar no PC):**
  - `npm run baixar-extensoes` (`scripts/baixar-extensoes.mjs`) descobre a versão do motor pelo próprio pacote
    instalado (v1.4.3), baixa `parquet.duckdb_extension.wasm` para `wasm_mvp` e `wasm_eh`, confere o SHA-256 contra
    `scripts/extensoes-duckdb.lock.json` e grava em `public/duckdb-extensions/v1.4.3/<plataforma>/`, mais o
    manifesto `src/data/extensoes-duckdb.gerado.json`. Tudo em duas etapas: nada é gravado se algum arquivo falhar.
  - Como o hash oficial não pôde ser obtido aqui, o lock começa vazio (`{}`): no primeiro download o script registra
    o hash ("confiança no primeiro uso") e pede commit; daí em diante, arquivo diferente é recusado. A segunda trava é
    a assinatura digital, conferida pelo próprio DuckDB no `LOAD`.
  - No app (`src/data/duckdb.ts`): com o manifesto presente, `SET custom_extension_repository = '<site>/duckdb-extensions'`
    + `LOAD parquet` + `read_parquet('fato_itens.parquet')`.
- **PROVISÓRIO (usado aqui):** `scripts/gerar_duckdb_provisorio.py` copia o Parquet para
  `public/data/provisorio/fato_itens.duckdb` (formato v1.0.0, lido pelo motor 1.4.3 sem extensão), aberto com `ATTACH`.
  Os dados são idênticos (teste `tests/dados/test_provisorio.py`, `EXCEPT ALL` nos dois sentidos).
- **Escolha automática e visível:** sem manifesto → provisório; com manifesto → final; se o final falhar, cai no
  provisório com o motivo no rodapé (P4). `VITE_FONTE_DADOS=duckdb|parquet|auto` força um dos dois.
- **O que foi verificado no Chromium, com uma extensão FALSA:** o DuckDB pediu exatamente
  `/duckdb-extensions/v1.4.3/wasm_eh/parquet.duckdb_extension.wasm` ao próprio site (o layout do script), recusou o
  arquivo por "signature is either missing or invalid" e o app caiu no provisório com os mesmos números, zero
  violações de CSP e nenhuma requisição externa.
- **Não verificado (PC do Harley):** o download real, o `LOAD` da extensão assinada e a leitura do Parquet no navegador.
- **Descartado:** baixar a extensão de espelhos (seria contornar o bloqueio de rede) e ligar o autoload.

### D18. Compilador: grão de pedido com subconsulta DISTINCT e junção por dimensões

- Métricas `grain: "order"` rodam sobre `SELECT DISTINCT pedido_sk, <colunas de pedido>, <dimensões> FROM base`; as de
  item, direto na base; as duas partes se juntam por `IS NOT DISTINCT FROM` nas dimensões. Resultado testado nos dados:
  nota 4,117 (e não 4,045), 6.531 atrasados no recorte B, pedido em 2 categorias conta nas duas.
- Valores do usuário sempre como parâmetro `?`; nomes de coluna só da camada semântica, com checagem de formato
  (`^[a-z][a-z0-9_]*$`). Teste de injeção: `"SP') OR 1=1 --"` retorna 0 pedidos.
- Agregados convertidos para `DOUBLE` no próprio SQL (`CAST(... AS DOUBLE)`), além de `castDecimalToDouble` na conexão.
- **Descartado:** calcular tudo por item (erra a nota) ou gerar SQL a partir de templates de texto com os valores colados.

### D19. Zod em modo `jitless`

- O Zod 4 testa `new Function` para acelerar a validação; a CSP bloqueia e o navegador registrava 2 violações em cada
  carga, mesmo com o erro tratado. `src/zod.ts` liga `z.config({ jitless: true })` e todo o código importa de lá (teste
  de guarda). Resultado: 0 violações.
- **Descartado:** liberar `'unsafe-eval'` na CSP.

### D20. CSP no cabeçalho desde a Fase 2

- Política única em `csp.config.ts`, usada no `vite preview` (produção), no `<meta>` do build e no `vercel.json`
  (teste confere que são iguais). Os testes e2e rodam contra o build de produção e conferem o cabeçalho também no
  arquivo do worker do DuckDB. No `npm run dev`, a CSP ganha `'unsafe-inline'` (React Refresh) e `ws:` (HMR), só em dev.

### D21. Dashboard 100% por QuerySpec

- Cada KPI, minissérie e gráfico é um QuerySpec (`src/dashboard/paginas.ts`) compilado na hora; um teste valida todos
  contra o mesmo schema que a IA vai usar. Cada painel tem "Como calculei" (spec, SQL, parâmetros, ms e tabela de
  dados, que também serve de alternativa acessível ao gráfico). Cache por SQL + parâmetros.
- Meses com poucos pedidos (set–dez/2016, set/2018, pela regra dos 10% da mediana) aparecem sombreados nos gráficos
  mensais e saem das minisséries dos KPIs; meses sem nenhum pedido (nov/2016) viram 0 (soma) ou vazio (média).
- Cidade agrupada como "Cidade (UF)" (resolve o pendente de D11).
- Tooltips do ECharts escapados com `format.encodeHTML` (ajuste 11); teste com `<img onerror>`.

### D22. Sem ESLint por enquanto; guardas por teste

- O TypeScript 7 (compilador nativo) ainda não é suportado pelo typescript-eslint. As regras que importam viraram testes
  (`tests/unit/guardas.test.ts`): nada de `innerHTML`/`dangerouslySetInnerHTML`/`eval`, nada de `any`, nenhuma URL de
  CDN, Zod só via `src/zod.ts`.

## Fase 3: Modo Rápido

### D23. Camada 0 por dicionário + "frase mais longa primeiro"

- **Contexto:** o Modo Rápido precisa acertar perguntas comuns em menos de 300 ms, sem modelo.
- **Decisão:** um dicionário montado a partir do `semantic.json` (métricas, dimensões e sinônimos) e dos **valores
  reais da base** (categorias, UFs, formas de pagamento...). O texto é normalizado, o parser de tempo tira os trechos
  de data, e cada trecho restante casa com a frase MAIS LONGA do dicionário ("rio grande do sul" antes de "rio",
  "no prazo" antes de "prazo"). Erros de digitação passam pelo fuse.js (limiar 0,3), só nas palavras que sobraram.
  Regras de intenção decidem o tipo de pergunta, e uma nota de confiança (limiar 0,45) decide entre responder,
  perguntar de volta com chips ou avisar que o dado não existe.
- **Regras que valem entrevista:** UFs que também são palavras ("SE", "TO", "PE") só contam em maiúsculas ou depois
  de "em/no/de"; "nota **dos clientes**" não vira a métrica clientes (substantivo depois de preposição é contexto);
  dimensão categórica com até 8 valores vira comparação, com mais valores vira ranking (top 10).
- **Descartado:** LLM para tudo (lento e sem necessidade para perguntas comuns) e regex por pergunta (não generaliza).

### D24. Suíte parcial e resultado honesto

- `evals/perguntas.json`: 76 perguntas (fáceis, médias, difíceis, follow-ups, ambíguas, fora de escopo, digitação).
  56 foram escritas **junto** com as regras (o 100% delas é otimista). 20 foram escritas **às cegas** depois das
  regras e rodadas uma vez: **16/20 (80%)** na primeira rodada. Os 4 erros eram lacunas reais (substantivo de contexto
  virando métrica, correção de digitação somando métrica, "custo do frete" como sinônimo de frete, "natal"), foram
  corrigidos, e a suíte inteira passou a 76/76. A Fase 7 amplia para 80+ com perguntas novas, que não servem para ajuste.

### D25. Motor de insights, narrador e validador numérico

- Fatos determinísticos (`src/insights/engine.ts`): total, líder e participação, top 3, maior/menor, diferença entre
  grupos, outliers (z > 2), pico/mínimo/tendência (regressão linear) sem os meses com poucos pedidos, variação contra
  o período de comparação e decomposição da variação (`drivers.ts`), em que a soma das contribuições é exatamente o
  delta total.
- O narrador (`src/narrator/templates.ts`) só usa `valor_formatado` dos fatos. O validador (`validador.ts`) confere
  que todo número do texto está num fato; um teste roda TODAS as perguntas da suíte e exige zero números soltos.
  Na Fase 4 o mesmo validador barra a saída da IA.
- "Por que caiu?" mostra ONDE a variação aconteceu (quais categorias), nunca a causa. O texto diz isso explicitamente.
- "Período anterior" de meses inteiros é o mês (trimestre, ano) anterior do calendário: dez/2017 compara com nov/2017.

### D26. Seletor de gráfico e "Outros"

- Regras da seção 12. "Outros" só aparece quando a lista foi cortada nas 15 barras; num "top 5" pedido pelo usuário,
  ele esmagava o gráfico (R$ 4,29 mi contra R$ 770 mil do líder). A cascata mostra os 3 segmentos que mais empurraram
  na direção da variação + 1 na contrária + "Outros", com o eixo começando perto dos valores.

### D27. O Modo IA não usa os filtros da barra lateral

- A pergunta é autossuficiente ("em 2018", "em SP"); misturar com filtros escondidos tornaria a resposta difícil de
  explicar. O painel avisa isso no rodapé. Fixados e 👍/👎 ficam no `localStorage` (a Fase 6 traz o "Apagar dados locais").

## Fase 4: IA local (escrita na nuvem, sem GPU)

### D28. Quando a pergunta vai para a IA (Camada 1)

- **Contexto:** a especificação manda para a Camada 1 o que fica abaixo do limiar de confiança. Testando, a Camada 0
  também erra com confiança quando a correção de digitação "acha" um valor da base que não tem nada a ver
  ("retrasado" → status Atrasado, "turma" → cidade Turmalina, "carioca" → cidade Acaiaca).
- **Decisão:** a Camada 0 marca `paraCamada1` (com o motivo, que aparece em "Como calculei") quando: a confiança fica
  abaixo de 0,45; nada foi reconhecido; só há palavras desconhecidas; um follow-up não muda nada; ou um **valor** da
  base foi achado por correção de digitação. Com a IA pronta, essas perguntas vão para o planejador; sem ela, vale a
  resposta da Camada 0 (P4). Medido na suíte (76 perguntas, follow-ups com o spec anterior): **2/76 vão para a IA**;
  a Camada 0 resolve 97% sozinha.
- **Descartado:** mandar para a IA toda pergunta com qualquer correção de digitação ou palavra desconhecida: 11/76
  iriam para o modelo, inclusive "faturamnto por categoria" e "nota de quem recebeu atrasado vs no prazo", que a
  Camada 0 já acerta em < 100 ms (a IA levaria segundos).

### D29. Hugging Face bloqueado na nuvem: o que ficou sem teste

- **Contexto:** a rede da nuvem onde a Fase 4 foi escrita bloqueia `huggingface.co` (proxy recusa a conexão).
  `raw.githubusercontent.com` funciona.
- **Decisão:** não contornar (nada de espelho). O que depende do Hugging Face foi escrito contra a API conferida em
  `node_modules` e testado com um **servidor falso** (`tests/unit/baixar-modelo.test.ts`): download dos pesos,
  hashes, revisão fixada, pasta `resolve/main/`. Os domínios de CDN do modo demo em `csp.config.ts`
  (`DOMINIOS_PESOS_DEMO`) são **candidatos, não medidos**; o roteiro do PC (CLAUDE.md) diz como confirmar e podar.
- **Teste de fumaça do caminho REAL (sem GPU física):** Chromium com WebGPU por software (SwiftShader,
  `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`), build de produção no modo demo. Funcionou: import
  dinâmico do WebLLM, worker sob a CSP, escolha do modelo (SwiftShader não tem `shader-f16` → Qwen2.5-1.5B q4f32),
  `model_lib` pedida ao próprio site. Parou onde devia: o pedido a `huggingface.co/.../mlc-chat-config.json` foi
  recusado pelo proxy; a tela mostra "não consegui baixar os pesos do modelo de huggingface.co…", zero violações
  de CSP, e o Modo Rápido continua respondendo (print `docs/prints/fase4/6-caminho-real-hf-bloqueado.png`). Não virou
  teste automático: no PC ele baixaria centenas de MB de verdade.
- **Sem número inventado:** tamanho do download dos pesos, tempo de carga, tempo do 1º token e latência do
  planejador ficam como "medir no PC" no BENCHMARK. O `vram_required_MB` da `prebuiltAppConfig` é VRAM, não download.

### D30. `model_lib` servida pelo próprio site, com SHA-256 fixado

- **Contexto:** P3 (nada de CDN em runtime). A `prebuiltAppConfig` do WebLLM 0.2.85 aponta as libs para o branch
  `main` do GitHub (mutável) e não traz `integrity` em nenhum dos 163 modelos.
- **Decisão:** `npm run baixar-modelo -- --so-libs` baixa as 6 libs dos candidatos (3 modelos × q4f16/q4f32,
  **31,6 MB** no total, 4,9 a 5,9 MB cada) para `public/models/libs/` e registra o SHA-256 em
  `scripts/modelos.lock.json` (commitado). Daí em diante, arquivo diferente é recusado (testado). O app entrega ao
  WebLLM `model_lib = <origem>/models/libs/<arquivo>`. Os pesos no modo local ficam em
  `public/models/<id>/resolve/main/`, com o SHA-256 que o próprio Hugging Face publica e a revisão (commit) fixada.
- **Em aberto (Fase 6/8):** `public/models/` está no `.gitignore`. Para o deploy, ou as libs entram no repositório
  (31,6 MB) ou o build roda `npm run baixar-modelo -- --so-libs`. Decisão do Harley.
- **Descartado:** fixar um commit do repositório das libs pela API do GitHub (bloqueada nesta sessão); o SHA-256 no
  lock cumpre o mesmo papel (se o arquivo mudar no GitHub, o script recusa).

### D31. Escolha do modelo pelo dispositivo

- **Decisão:** `src/ai/modelos.ts` lê a `prebuiltAppConfig.model_list` **da versão instalada** (o teste usa a lista
  real): Qwen2.5-1.5B-Instruct → Qwen3.5-0.8B → Llama-3.2-1B-Instruct; q4f16 se o adaptador tem `shader-f16`, senão
  q4f32; "máquina fraca" (`maxBufferSize` < 1 GB ou `deviceMemory` < 8 GB) pega o de menor `vram_required_MB`
  (Llama-3.2-1B, 879 MB em q4f16). **Esses limites são heurísticos e precisam ser calibrados no PC.** `VITE_MODELO`
  força um modelo. Qwen3.x recebe `enable_thinking: false` (senão "pensa" antes do JSON e gasta segundos).
- **Descartado:** Phi-3.5-mini (3,8B) como padrão: grande demais para GPU integrada; continua na lista do WebLLM
  se o Harley quiser testar com `VITE_MODELO`.

### D32. JSON Schema para o XGrammar e validação depois

- **Contexto:** o XGrammar (dentro do WebLLM) é o risco nº 2 da Fase 0; o `z.toJSONSchema` do Zod 4 gera uma regex
  de data enorme e `format: date`.
- **Decisão:** o schema do modelo nasce do MESMO schema Zod do QuerySpec, mas simplificado (`schemaModelo.ts`): só
  `type/enum/properties/required/items/anyOf/limites/pattern` (um teste garante), data como `^\d{4}-\d{2}-\d{2}$`,
  2.337 caracteres. Depois do modelo, o Zod completo valida (período invertido etc.) e os valores de filtro são
  conferidos contra a base (`valueResolver.ts`: "são paulo" → SP, "beleza e saude" → Beleza e Saúde). Valor que não
  existe, JSON quebrado ou métrica inventada viram **pergunta de volta**, nunca SQL (testado).
- **Prompt:** `planejador-v1`, com as métricas/dimensões candidatas (top-k pelo fuse.js), valores reais parecidos
  com a pergunta e 8 few-shots (2 fixos: fora de escopo e esclarecimento). Tamanho medido nas 76 perguntas:
  **3.572 a 4.252 caracteres** (p50 3.912). Quanto isso custa em tempo de prefill: medir no PC.

### D33. Narrador da IA: placeholders, validador e sem streaming visível

- **Decisão:** o modelo recebe só `id/tipo/sobre/sentido/importância` de cada fato (sem valores; dígitos do rótulo
  viram `#`) e devolve `{titulo, bullets:[{texto, fatos}], hipotese?}` com `{{id}}`. O app troca os placeholders
  pelo `valor_formatado`. Rejeita: dígito fora de placeholder, número por extenso, nome de mês, placeholder
  inexistente ou malformado, causa afirmada fora de `hipotese` (que precisa começar com "Hipótese:"); por fim o
  validador numérico da Fase 3 roda de novo no texto final. Rejeitou → fica o template, o motivo aparece em "Como
  calculei" e vai para `localStorage` (`olist-modo-ia:falhas-narrador`, para a Fase 7).
- **Diferença da especificação:** a seção 13 pede o texto da IA "em streaming". Mostrar o texto enquanto chega
  exibiria texto **ainda não validado** (e JSON cru). O worker faz streaming (`aoParcial`), mas a tela mostra o
  template + "IA local revisando o texto…" e troca tudo de uma vez quando passa no validador.

### D34. Motor falso e build de teste

- **Decisão:** `src/ai/motorFalso.ts` segue o contrato `MotorLLM` e responde de forma determinística (planejador e
  narrador), com modos adversários (JSON quebrado, métrica inventada, número no texto, causa, placeholder
  inexistente, erro). No navegador, `?motor=falso` só funciona num build com `VITE_PERMITIR_MOTOR_FALSO=1` (o do
  Playwright); no build normal o código nem entra no pacote (conferido: nenhum chunk `motorFalso` no `dist`).
- **Limite honesto:** o motor falso testa o **encanamento** (roteamento, validação, UI, CSP, rede), não a qualidade
  nem a velocidade do modelo.

### D35. Custo do WebLLM no pacote

- **Medido:** o pacote principal cresceu 12,7 kB (1.160,7 → 1.173,4 kB; +4,4 kB gzip) em relação à Fase 3. O WebLLM
  só é baixado ao clicar em "Ativar IA local": 6,0 MB (2,15 MB gzip) na thread principal + 6,0 MB (2,15 MB gzip) no
  worker. A thread principal só precisa da `prebuiltAppConfig` e do cliente do worker; mover a escolha do modelo
  para dentro do worker cortaria ~2 MB gzip (Fase 7). Os pesos (centenas de MB) ficam no cache do navegador.

## Fase 5: Modo Universal (qualquer planilha)

### D36. Quem lê o quê: o JS decide o formato, o DuckDB lê e converte

- **Contexto:** CSV brasileiro vem em Latin-1, com ";" e vírgula decimal, títulos acima da tabela e linhas de total.
  O leitor automático do DuckDB não trata títulos nem Latin-1 (que exige extensão, bloqueada).
- **Decisão:** o JS olha só o começo do arquivo (até 2 MB) e decide codificação (UTF-8 válido ou Windows-1252),
  separador (o que divide as linhas no mesmo número de colunas com mais frequência; empate favorece ";") e a linha
  do cabeçalho (primeira com várias células de texto seguida de linhas de largura parecida). O arquivo inteiro vai
  para o DuckDB como texto (`read_csv(... all_varchar=true, skip=n, names=[...])`), a limpeza é um `DELETE`
  (linhas vazias e de total/subtotal) e a conversão de tipos é SQL gerado pelo app (`TRY_CAST`, `TRY_STRPTIME`).
  Todo número do dashboard continua vindo do DuckDB (P1). Ajuste 12 da Fase 0.
- **Descartado:** fazer o parse do arquivo inteiro em JS (lento e duplica a memória em planilhas grandes) e
  confiar no sniffer do DuckDB (erra títulos e totais).

### D37. Perfil das colunas: regras explicáveis e resultado honesto

- **Decisão:** `src/universal/perfil.ts` classifica cada coluna em 11 tipos pelo nome, por uma amostra aleatória
  repetível (600 linhas, `REPEATABLE (42)`), pela cardinalidade e pelos vazios. Cada regra exige a MAIORIA da
  amostra (um e-mail perdido não vira "dado pessoal"). O motivo aparece na tela "Entendi assim".
- **Resultado:** 8 planilhas escritas junto com as regras: 58/58 colunas. Depois, 3 planilhas **às cegas**
  (esperado escrito antes de rodar): **21/24 (87,5%) na primeira rodada**, abaixo da meta de 90%. Os 3 erros eram
  lacunas reais (nomes de coluna em inglês: "Revenue", "Discount Rate"; comentários curtos repetidos virando
  categoria). Corrigido de forma geral (dicas em inglês, "frases são texto"), a suíte foi a 82/82. Como na D24,
  o 100% é otimista; a Fase 7 traz planilhas novas que não servem para ajuste.
- **Teste de conversão sem perda:** toda célula preenchida precisa virar um valor do tipo escolhido. Ele pegou
  um erro que a classificação não mostrava: data com hora sem segundos ("2024-03-15 11:48") virava vazio.

### D38. Semântica automática no MESMO formato da Olist

- **Decisão:** `semanticaAuto.ts` gera um semantic.json validado pelo mesmo Zod: métrica "Registros" (contagem de
  linhas); soma e média de cada coluna de dinheiro; soma ou média de números (média quando o nome sugere nota,
  idade, score); média de porcentagens; contagem distinta de ids que se repetem (ex.: "Cliente (distintos)");
  dimensões de categoria/UF/cidade/Sim-Não; a data mais "de evento" vira o eixo do tempo. Sinônimos vêm de um
  dicionário PT-BR de termos de negócio. Dashboard, Camada 0, IA e insights funcionam sem mudança.
- **Privacidade:** dados pessoais (e-mail, CPF/CNPJ, telefone, nome de pessoa) são mascarados JÁ na tabela
  tipada ("***.***.***-12", "a***@dominio", "Yasmin S."), não só na tela; eles e o texto livre ficam fora do
  catálogo da IA (P6). Na tela, dado pessoal só pode ter o papel "Ignorar".
- `time_column` virou opcional (planilha sem data): o compilador recusa filtro de período com mensagem clara.
- A tabela tipada ganha nome novo a cada "Gerar"/edição: o cache de consultas do motor (por texto do SQL) nunca
  devolve número de uma configuração antiga. As antigas são descartadas.

### D39. Excel: SheetJS pelo tarball oficial (bloqueada no início, liberada depois)

- **Contexto:** a especificação manda instalar a SheetJS pelo tarball oficial (`cdn.sheetjs.com`), porque a
  versão do npm está desatualizada. Esse domínio é bloqueado nesta nuvem (proxy devolve 403).
- **Decisão:** não usar a versão do npm nem espelho (instrução do Harley). O código do Excel está pronto
  (`src/universal/excel.ts`: escolhe a aba com dados, converte para CSV e segue o mesmo caminho) e procura a
  biblioteca por `import.meta.glob('/node_modules/xlsx/xlsx.mjs')`: sem ela, o build passa e a tela explica
  "salve como CSV". Testado com uma SheetJS falsa; a planilha `financeiro_titulo_total.xlsx` (título mesclado,
  aba "Leia-me" antes da de dados, fórmula no total) já está em `evals/planilhas/` para o teste real no PC.
  A interface usada (`read`, `utils.sheet_to_json`) precisa ser conferida no `node_modules` quando a lib chegar (P8).
- **Parquet do usuário:** também depende da extensão parquet (D15); sem ela, a tela avisa e sugere CSV.

### D40. Modelos de planilha ("joga e pronto")

- **Decisão:** impressão digital = nomes normalizados + tipos DETECTADOS das colunas, na ordem (FNV-1a de 64
  bits). As vendas do mês seguinte têm a mesma impressão e abrem direto no dashboard, com o aviso "Reconheci o
  layout… Revisar colunas". A configuração fica no `localStorage`; exportar/importar leva a outro computador, e
  todo `.json` importado passa pelo schema Zod (ids só `a-z0-9_`; um id com SQL é recusado, testado).
- **Descartado:** impressão pelos tipos EDITADOS (a planilha nova ainda não foi editada, então nunca bateria).

### D41. Vários arquivos: ligação medida pelos valores, sem duplicar linhas

- **Decisão:** candidatas = colunas com o mesmo nome-base ("Cliente ID" = id_cliente = cod_cliente) ou dois
  identificadores. Cada candidata é medida no DuckDB: % dos valores de um lado que existem do outro, com
  exemplos dos que não batem. A planilha "um" (chave única) entra por `LEFT JOIN` como dimensões com prefixo
  ("Segmento (clientes)"); se a chave se repete, o app mostra o risco de grão e não deixa ligar. Métricas da
  planilha "um" ficam de fora (somadas por linha da principal, sairiam infladas). Planilha sem nenhuma ligação
  ganha o alerta "não tem relação com as outras". Setor provável de cada uma (Vendas, RH, Estoque…) pelos nomes
  das colunas. Conferido: vendas + clientes = 1.500 linhas e a mesma receita antes e depois da junção.

### D42. `/planilha` em vez de trocar a tela inicial

- **Contexto:** a seção 14 pede uma tela inicial com "Arraste sua planilha" + "Ver demo com dados da Olist".
- **Decisão (provisória, rever na Fase 8):** `/` continua sendo o dashboard da Olist (links diretos, testes e a
  comparação com o Power BI dependem disso); `/planilha` tem a área de arrastar, o botão "Ver demo com dados da
  Olist", os modelos salvos e "Lembrar a última planilha". A barra lateral da Olist ganhou o link "📂 Sua
  planilha". O código do Modo Universal é carregado sob demanda (58,6 kB, 20,5 kB gzip); o pacote principal
  ficou só 2,6 kB maior que o da Fase 4.
- **Filtros:** o dashboard da planilha não tem a barra de filtros (Ano/UF são da Olist); o Modo IA filtra por
  pergunta ("em SP", "em 2024").

### D43. Bibliotecas do modelo baixadas no build

- **Decisão do Harley:** as 6 `model_lib` (31,6 MB) ficam fora do git; `npm run build` roda
  `baixar-modelo --so-libs` antes, que só baixa o que falta e confere o SHA-256 do `modelos.lock.json`
  (arquivo diferente = build falha). Revisar na hora do deploy (Fase 8).

### D44. "Lembrar a última planilha": opcional e desligado por padrão

- Ligado, os bytes ficam no IndexedDB deste navegador; desligar apaga na hora, e há botão "Apagar". A Fase 6
  inclui isso no "Apagar dados locais".

### D45. Limite de tamanho da planilha

- **Medido na nuvem:** até 3 milhões de linhas (297 MB) abrem sem erro (22 s de leitura). O corte de 300 MB
  (`LIMITE_BYTES`) é de segurança e ainda não foi medido como limite real: a máquina da nuvem tem 16 GB de RAM e o
  PC do Harley pode ter menos. Medir no PC antes de mudar (BENCHMARK, Fase 5).

### D46. Rede liberada pelo Harley (26/09): caminho final, Excel e domínios reais dos pesos

- **Contexto:** o Harley liberou `cdn.sheetjs.com`, `extensions.duckdb.org`, `huggingface.co` e `*.hf.co` na rede
  do ambiente de nuvem. Detalhe desta nuvem: o `curl` passa pelo proxy liberado, mas o `fetch` do Node só passa
  com `NODE_USE_ENV_PROXY=1` (sem isso, "Host not in allowlist"). É configuração da nuvem, não do projeto.
- **Caminho final dos dados ativo:** `npm run baixar-extensoes` baixou a extensão parquet v1.4.3
  (`wasm_mvp` 2,87 MB, SHA-256 `0785c6c9…`; `wasm_eh` 3,05 MB, `22765c8f…`), agora commitada. O e2e inteiro passa
  no caminho final (rodapé "Parquet (caminho final)", zero violações de CSP, só o próprio site na rede).
- **SheetJS:** a versão mais recente em `cdn.sheetjs.com` é a 0.20.3 (a da Fase 0). Tarball em
  `vendor/xlsx-0.20.3.tgz`, SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, instalado
  com `npm install --save-exact file:vendor/xlsx-0.20.3.tgz`. A interface usada foi conferida em
  `node_modules/xlsx/types/index.d.ts`. Carregada sob demanda (492 kB, só quando alguém solta um Excel).
  O `.xlsx` de teste (título mesclado, aba "Leia-me" antes da de dados, total com fórmula) passou de primeira:
  aba certa, 60 linhas, total removido, 6/6 colunas certas e a mesma receita do CSV equivalente.
- **Domínio real dos pesos:** um download de teste de `huggingface.co/.../resolve/main/params_shard_0.bin`
  redirecionou para `us.aws.cdn.hf.co` (armazenamento Xet), que NÃO estava na lista de candidatos da D29.
  Entra em `DOMINIOS_PESOS_DEMO`; a lista completa só fecha quando o modelo inteiro for baixado.

### D47. Modelo real na GPU simulada: carrega, mas não serve para medir nada

- **O que foi feito:** Chromium com WebGPU por software (SwiftShader), build no modo local com
  `VITE_MODELO=Qwen3.5-0.8B-q4f32_1-MLC` (SwiftShader não tem `shader-f16`), pesos baixados pelo
  `npm run baixar-modelo` (18 arquivos, 426,5 MB, hashes do Hugging Face conferidos).
- **Resultado:** a integração real funcionou até o fim da carga: import dinâmico, worker sob a CSP, `model_lib` e
  pesos servidos pelo próprio site (405 MB lidos em ~10 s), status "IA pronta · 100% local". Carga 19,6 s, mas o
  aquecimento (compilar os shaders em CPU) levou ~17 min, e a primeira pergunta ao planejador não terminou em
  15 min (prompt de ~4.000 caracteres processado em CPU). Qualidade do JSON e velocidade continuam sem medida:
  **só no PC, com GPU de verdade** (roteiro no CLAUDE.md).
- **Ajuste que o teste mostrou:** o status dizia só "carregou em 19,6 s" e escondia o aquecimento; agora mostra
  os dois tempos.

## Fase 6: Privacidade

### D48. Service Worker "firewall" assume a página ANTES do DuckDB

- **Contexto:** a especificação pede que o SW veja também as requisições dos workers ("confirme no Chrome que os
  workers estão sob controle; se não estiverem, instrumente o fetch dentro deles"). Um worker só fica sob o SW se
  nascer depois que o SW controla a página; na 1ª visita, o SW normal só assume depois do carregamento.
- **Decisão:** `main.tsx` registra o SW e o motor de dados espera ele assumir (`clients.claim()`, no máximo 3 s)
  antes de criar o worker do DuckDB. Conferido no Chromium: o SW vê requisições feitas **de dentro do worker**
  (a extensão parquet é baixada pelo worker do DuckDB), então não foi preciso instrumentar o `fetch` dos workers.
  O SW conta as externas, avisa as abas (contador ao vivo) e, no modo local, responde erro para qualquer uma.
- **Custo medido:** a 1ª visita ficou mais lenta até o dashboard completo: 2,52–2,63 s (era 2,00 s). A primeira
  pintura não mudou (0,23 s) e as visitas seguintes não esperam (1,96–2,13 s). Registrado no BENCHMARK.
- **Descartado:** instrumentar o `fetch` dentro dos workers (o do DuckDB é de terceiros, e o SW já cobre) e
  registrar o SW sem esperar (a 1ª visita ficaria fora do contador).
- **Em `npm run dev` o SW fica desligado** (o HMR do Vite não combina com ele); o selo diz isso.

### D49. Offline (PWA) sem duplicar os pesos do modelo

- Manifesto + ícones (gerados do `icone.svg`). O SW guarda no Cache Storage o que o app usou: arquivos com hash
  (`/assets/`) cache primeiro; o resto rede primeiro com cache se offline; toda rota usa o mesmo `index.html`.
  `/models/` fica de fora: o WebLLM já guarda os pesos no cache dele (não guardar duas vezes 400-800 MB).
- Evidência: `privacidade.spec.ts` recarrega a página offline e o faturamento continua R$ 13.494.400,74.

### D50. Dados sensíveis: tamanho mínimo de grupo no compilador

- **Decisão:** `dataset.min_group_size` na semântica; o compilador põe `HAVING COUNT(*) >= N` em toda agregação
  (com ou sem dimensão). Vale para dashboard, Modo Rápido e IA ao mesmo tempo, e fecha o furo do filtro ("salário
  médio de quem tem 3 horas extras" com 2 pessoas não volta nada). Ligado por padrão (N = 5) quando a planilha tem
  dado pessoal ou coluna de salário/saúde; a tabela linha a linha fica escondida. A Olist não usa (dados públicos).
- **Descartado:** esconder grupos só no gráfico (o KPI filtrado e a IA ainda mostrariam o número).

### D51. "Apagar dados locais" diz o tamanho real

- A estimativa do navegador (`navigator.storage.estimate()`) demora a atualizar e mostrava "0,0 MB liberados"
  logo depois de apagar 35 MB. O relatório agora soma o `Content-Length` do que estava nos caches antes de apagar.
