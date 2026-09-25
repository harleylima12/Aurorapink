# Validação dos dados (Fase 1)

> Arquivo gerado por `scripts/preparar_dados.py`. Não edite à mão: rode o script de novo.

- **Resultado:** ✅ bate com o Power BI · checagens de qualidade: 15/15 ✅
- **Período dos dados:** 04/09/2016 a 03/09/2018 · **âncora de datas:** 31/08/2018 (seção 6 abaixo)
- **Regras:** sem pedidos `canceled`/`unavailable`; faturamento = soma de `price`, sem frete.
- **Gerado com:** DuckDB 1.5.5, lendo o Parquet final (`public/data/fato_itens.parquet`).

## 1. Critério de aceite: recorte A (base inteira) × Power BI

| Métrica | Power BI | Parquet | Bate? |
|---|---:|---:|:---:|
| Faturamento | R$ 13.494.400,74 | R$ 13.494.400,74 | ✅ |
| Pedidos | 98.199 | 98.199 | ✅ |
| Ticket médio | R$ 137,42 | R$ 137,42 | ✅ |
| Clientes únicos | 94.983 | 94.983 | ✅ |

## 2. Os outros recortes da Fase 0 (mesmos dados?)

Os números abaixo foram calculados na Fase 0 com pandas, direto dos CSVs do Kaggle.
Se todos baterem, os CSVs usados aqui são os mesmos.

| Recorte | Faturamento | Pedidos | Ticket médio | Clientes únicos | Itens | Bate? |
|---|---:|---:|---:|---:|---:|:---:|
| A. Base inteira | R$ 13.494.400,74 | 98.199 | R$ 137,42 | 94.983 | 112.101 | ✅ |
| B. jan/2017 a ago/2018 | R$ 13.449.529,68 | 97.905 | R$ 137,37 | 94.703 | 111.752 | ✅ |
| C. Sem excluir status (CSVs) | R$ 13.591.643,70 | 98.666 | R$ 137,75 | 95.420 | 112.650 | ✅ |

## 3. Entrega, frete e nota (definições aprovadas na Fase 0)

- **Entregue:** o pedido tem data de entrega ao cliente. **Atrasado:** entregue depois do dia estimado, comparando só a data. **Não Entregue:** sem data de entrega (inclui os 8 pedidos com status `delivered` e data vazia).
- **Prazo de entrega:** dias corridos entre a compra e a entrega, só pedidos entregues.
- **Frete médio:** frete total ÷ número de pedidos.
- **Nota:** média das reviews de cada pedido; a média geral é calculada **por pedido** (P7).

| Indicador | Recorte A (base inteira) | Recorte B (jan/17–ago/18) | Fase 0 (recorte B) | Bate? |
|---|---:|---:|---:|:---:|
| Pedidos entregues | 96.470 | 96.203 | 96.203 | ✅ |
| Atrasados | 6.534 (6,8%) | 6.531 (6,8%) | 6.531 (6,8%) | ✅ |
| Não entregues | 1.729 | 1.702 | 1.702 | ✅ |
| Nota média (por pedido) | 4,12 | 4,12 | 4,12 | ✅ |
| Pedidos com mais de uma review (arquivo inteiro) | 547 | | 547 | ✅ |
| Prazo médio de entrega | 12,5 dias | 12,5 dias | — | |
| Prazo mediano de entrega | 10 dias | 10 dias | — | |
| Frete total | R$ 2.245.816,19 | R$ 2.238.866,96 | R$ 2.241.126,29 (recorte A) | ⚠️ |
| Frete médio por pedido | R$ 22,87 | R$ 22,87 | — | |

**Por que a nota é por pedido (P7):** se a média fosse feita por linha do Parquet (por item), pedidos com vários itens pesariam mais e a nota cairia para 4,045, contra 4,117 por pedido. É a mesma lógica do `AVERAGEX(VALUES(order_id))` do Power BI.

> ⚠️ **Frete total diferente da Fase 0.** O Parquet dá R$ 2.245.816,19; a Fase 0 anotou R$ 2.241.126,29 (diferença de R$ 4.689,90, 0,21%). Faturamento, pedidos, clientes e itens batem no centavo e na unidade, então os itens são os mesmos. Nenhum recorte testado reproduz o número da Fase 0 (só `delivered`, sem 2016, frete deduplicado por pedido/vendedor, só produtos com categoria). **Não é critério de aceite, mas precisa ser conferido no card de frete do Power BI.**

## 4. Forma de pagamento principal (grão pedido)

Principal = o tipo de pagamento que pagou o maior valor no pedido (somando os pagamentos de cada tipo).

| Forma de pagamento | Pedidos | % | Parcelas (média) |
|---|---:|---:|---:|
| Cartão de crédito | 74.072 | 75,4% | 3,6 |
| Boleto | 19.535 | 19,9% | 1,0 |
| Voucher | 3.077 | 3,1% | 1,2 |
| Cartão de débito | 1.514 | 1,5% | 1,0 |
| Não informado | 1 | 0,0% | — |

## 5. Categorias (74 no total; top 10 por faturamento)

Um pedido com itens de 2 categorias conta nas duas (mesmo comportamento do Power BI).

| # | Categoria | Faturamento | % do total | Pedidos |
|---:|---|---:|---:|---:|
| 1 | Beleza e Saúde | R$ 1.255.695,13 | 9,3% | 8.800 |
| 2 | Relógios e Presentes | R$ 1.198.185,21 | 8,9% | 5.604 |
| 3 | Cama, Mesa e Banho | R$ 1.035.964,06 | 7,7% | 9.399 |
| 4 | Esporte e Lazer | R$ 979.740,92 | 7,3% | 7.673 |
| 5 | Informática e Acessórios | R$ 904.322,02 | 6,7% | 6.654 |
| 6 | Móveis e Decoração | R$ 727.465,05 | 5,4% | 6.425 |
| 7 | Utilidades Domésticas | R$ 626.825,80 | 4,6% | 5.847 |
| 8 | Cool Stuff | R$ 620.770,49 | 4,6% | 3.616 |
| 9 | Automotivo | R$ 586.585,73 | 4,3% | 3.872 |
| 10 | Ferramentas e Jardim | R$ 481.009,94 | 3,6% | 3.505 |

"Sem Categoria": R$ 178.572,55 (1,3%), 1.437 pedidos.

## 6. Âncora de datas

Regra: âncora = último dia do último mês com volume de pelo menos 10% da mediana mensal (mediana = 4.250 pedidos; mínimo = 425).
Resultado: **31/08/2018**. Perguntas como "último mês" usam essa data como "hoje", nunca a data real.

| Mês | Pedidos | Conta para a âncora? |
|---|---:|:---:|
| 09/2016 | 2 | não (poucos pedidos) |
| 10/2016 | 290 | não (poucos pedidos) |
| 12/2016 | 1 | não (poucos pedidos) |
| 01/2017 | 787 | sim |
| 02/2017 | 1.718 | sim |
| 03/2017 | 2.617 | sim |
| 04/2017 | 2.377 | sim |
| 05/2017 | 3.640 | sim |
| 06/2017 | 3.205 | sim |
| 07/2017 | 3.946 | sim |
| 08/2017 | 4.272 | sim |
| 09/2017 | 4.227 | sim |
| 10/2017 | 4.547 | sim |
| 11/2017 | 7.421 | sim |
| 12/2017 | 5.618 | sim |
| 01/2018 | 7.187 | sim |
| 02/2018 | 6.624 | sim |
| 03/2018 | 7.168 | sim |
| 04/2018 | 6.919 | sim |
| 05/2018 | 6.833 | sim |
| 06/2018 | 6.145 | sim |
| 07/2018 | 6.233 | sim |
| 08/2018 | 6.421 | sim |
| 09/2018 | 1 | não (poucos pedidos) |

## 7. Nomes de cidade

Os CSVs da Olist trazem a cidade em minúsculas e sem acento ("sao paulo"). O script procura cada (cidade, UF) na lista oficial de 5.571 municípios do IBGE (`scripts/referencia/municipios_ibge.csv`), ignorando acento, hífen e apóstrofo.
- **99,4% dos pedidos** (97.600 de 98.199) ficaram com o nome oficial ("São Paulo", "Santa Bárbara d'Oeste").
- O resto (distritos, nomes antigos ou com erro de digitação) fica em Title Case. Os 5 maiores: piumhii (MG): 28; santana do livramento (RS): 20; bonfim paulista (SP): 18; barra de sao joao (RJ): 13; parati (RJ): 13.
- Nomes de cidade se repetem entre estados (ex.: "Bom Jesus"). Na Fase 2, a dimensão cidade agrupa por cidade **e** UF.

## 8. Checagens de qualidade

| Checagem | Resultado | Detalhe |
|---|:---:|---|
| Uma linha por item (os joins não duplicaram nem perderam linhas) | ✅ | 112.101 linhas; esperado 112.101 |
| Chave (pedido_sk, order_item_id) única | ✅ | 0 duplicadas |
| Colunas obrigatórias sem valores vazios | ✅ | 16 colunas conferidas |
| Nenhum pedido canceled/unavailable | ✅ | 0 linhas |
| Todas as categorias têm nome amigável (scripts/referencia/categorias.csv) | ✅ | 73 categorias |
| status_entrega coerente com as datas | ✅ | 0 linhas incoerentes |
| dias_entrega >= 0 e só para pedidos entregues | ✅ | 0 linhas |
| nota entre 1 e 5 (ou vazia, se o pedido não tem review) | ✅ | 0 linhas |
| forma_pagamento em PT-BR e dentro do domínio | ✅ | 0 linhas |
| price > 0 e freight_value >= 0 | ✅ | 0 linhas |
| Atributos de pedido iguais em todos os itens do pedido | ✅ | 12 colunas conferidas |
| ids_pedido: pedido_sk de 1 a N, sem repetição, cobre o fato | ✅ | 98.199 linhas, 0 chaves sem ID |
| ids_cliente: cliente_sk de 1 a N, sem repetição, cobre o fato | ✅ | 94.983 linhas, 0 chaves sem ID |
| ids_produto: produto_sk de 1 a N, sem repetição, cobre o fato | ✅ | 32.729 linhas, 0 chaves sem ID |
| ids_vendedor: vendedor_sk de 1 a N, sem repetição, cobre o fato | ✅ | 3.053 linhas, 0 chaves sem ID |

## 9. Arquivos gerados

| Arquivo | Tamanho | Conteúdo |
|---|---:|---|
| `public/data/fato_itens.parquet` | 1,77 MB | 112.101 itens × 20 colunas |
| `public/data/ids_pedido.parquet` | 1,82 MB | `pedido_sk` → `order_id` |
| `public/data/ids_cliente.parquet` | 1,76 MB | `cliente_sk` → `customer_unique_id` |
| `public/data/ids_produto.parquet` | 0,57 MB | `produto_sk` → `product_id` |
| `public/data/ids_vendedor.parquet` | 0,05 MB | `vendedor_sk` → `seller_id` |
| **Total** | **5,97 MB** | |

Compressão zstd. O dashboard só precisa do `fato_itens.parquet` (1,77 MB). Com os IDs originais de 32 caracteres dentro do fato, ele teria 5,41 MB (205% a mais): é o ganho das chaves substitutas.

Colunas do `fato_itens.parquet`:

| Coluna | Tipo |
|---|---|
| `pedido_sk` | INTEGER |
| `order_item_id` | TINYINT |
| `produto_sk` | INTEGER |
| `vendedor_sk` | INTEGER |
| `price` | DECIMAL(10,2) |
| `freight_value` | DECIMAL(10,2) |
| `order_status` | VARCHAR |
| `data_compra` | DATE |
| `data_entrega` | DATE |
| `data_estimada` | DATE |
| `dias_entrega` | SMALLINT |
| `status_entrega` | VARCHAR |
| `nota` | DOUBLE |
| `forma_pagamento` | VARCHAR |
| `parcelas` | TINYINT |
| `cliente_sk` | INTEGER |
| `cidade_cliente` | VARCHAR |
| `estado_cliente` | VARCHAR |
| `estado_vendedor` | VARCHAR |
| `categoria` | VARCHAR |

## 10. CSVs de entrada (SHA-256)

Para conferir com os CSVs do Power BI: `Get-FileHash dados\<arquivo>.csv` no PowerShell.

| Arquivo | SHA-256 |
|---|---|
| `olist_customers_dataset.csv` | `c26c17f59f3027a6a0dbeb8f1fa373c38f3323ecc84f225a8f4820e5bb288df8` |
| `olist_order_items_dataset.csv` | `4f6abdbbc94036d0df4a76fa0520c072e31a40119d70f7f370fba1e2285d2bcb` |
| `olist_order_payments_dataset.csv` | `61674868ed7b872aac3dcd95bf774448a88f6426b183f21be55f75af021ffdec` |
| `olist_order_reviews_dataset.csv` | `012b61c7593e34f51fa614efdf802b9c7056ce6aae5307ddb93236e7cfc797d7` |
| `olist_orders_dataset.csv` | `8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf` |
| `olist_products_dataset.csv` | `3e6569628a17fbc75fd206ee357b59e20364b9afa90f5b6cd5b4d624c58aa9cc` |
| `olist_sellers_dataset.csv` | `31eb9bd50d684526a78f2389413ce61841e97692de7b828fe7d956b534586312` |
| `product_category_name_translation.csv` | `a81f0d1f27b27e7293f761bc79e3ce8f348ee39c4b3ed3e49bde38f478586278` |
