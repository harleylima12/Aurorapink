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
