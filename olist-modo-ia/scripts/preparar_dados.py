"""Fase 1: gera public/data/fato_itens.parquet a partir dos CSVs da Olist.

Uso:
    python scripts/preparar_dados.py
    python scripts/preparar_dados.py --dados dados --saida public/data

Saídas:
    public/data/fato_itens.parquet   uma linha por item vendido (zstd)
    public/data/ids_*.parquet        chave substituta -> ID original da Olist
    public/data/meta.json            período, âncora de datas e regras do dataset
    dados/validacao.md               totais conferidos com o Power BI

Regras (iguais às do Power BI):
    - pedidos com status canceled e unavailable ficam de fora;
    - faturamento = soma de price, sem frete;
    - atributos de pedido (nota, pagamento, entrega) se repetem em cada item,
      por isso as métricas de pedido deduplicam por pedido_sk (princípio P7).

O script termina com código 1 se os totais não baterem com o Power BI ou se
alguma checagem de qualidade falhar. O validacao.md é gerado mesmo assim,
para ajudar a investigar.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import sys
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
REFERENCIA = Path(__file__).resolve().parent / "referencia"

STATUS_EXCLUIDOS = ("canceled", "unavailable")

# Números do Power BI (critério de aceite da Fase 1, recorte A = base inteira).
ALVO_FATURAMENTO = 13_494_400.74
ALVO_PEDIDOS = 98_199
ALVO_TICKET = 137.42
ALVO_CLIENTES = 94_983

# Números da Fase 0 (docs/FASE0_PLANO.md, seção 2), calculados com pandas.
# Não são critério de aceite; servem para mostrar que os dados são os mesmos.
FASE0_RECORTES: dict[str, dict[str, float]] = {
    "A": {"faturamento": ALVO_FATURAMENTO, "pedidos": ALVO_PEDIDOS, "ticket": ALVO_TICKET, "clientes": ALVO_CLIENTES,
          "itens": 112_101},
    "B": {"faturamento": 13_449_529.68, "pedidos": 97_905, "ticket": 137.37, "clientes": 94_703, "itens": 111_752},
    "C": {"faturamento": 13_591_643.70, "pedidos": 98_666, "ticket": 137.75, "clientes": 95_420, "itens": 112_650},
}
FASE0_FRETE_A = 2_241_126.29
FASE0_ENTREGA_B = {"entregues": 96_203, "atrasados": 6_531, "nao_entregues": 1_702}
FASE0_NOTA_B = 4.12
FASE0_VARIAS_REVIEWS = 547

RECORTE_B = (date(2017, 1, 1), date(2018, 8, 31))

FORMAS_PAGAMENTO = {
    "credit_card": "Cartão de crédito",
    "boleto": "Boleto",
    "voucher": "Voucher",
    "debit_card": "Cartão de débito",
    "not_defined": "Não definido",
}
SEM_PAGAMENTO = "Não informado"
SEM_CATEGORIA = "Sem Categoria"
STATUS_ENTREGA = ("No Prazo", "Atrasado", "Não Entregue")

# Tipos explícitos: o resultado não depende da detecção automática do DuckDB.
ESQUEMAS_CSV: dict[str, dict[str, str]] = {
    "orders": {
        "order_id": "VARCHAR",
        "customer_id": "VARCHAR",
        "order_status": "VARCHAR",
        "order_purchase_timestamp": "TIMESTAMP",
        "order_approved_at": "TIMESTAMP",
        "order_delivered_carrier_date": "TIMESTAMP",
        "order_delivered_customer_date": "TIMESTAMP",
        "order_estimated_delivery_date": "TIMESTAMP",
    },
    "order_items": {
        "order_id": "VARCHAR",
        "order_item_id": "INTEGER",
        "product_id": "VARCHAR",
        "seller_id": "VARCHAR",
        "shipping_limit_date": "TIMESTAMP",
        "price": "DECIMAL(10,2)",
        "freight_value": "DECIMAL(10,2)",
    },
    "customers": {
        "customer_id": "VARCHAR",
        "customer_unique_id": "VARCHAR",
        "customer_zip_code_prefix": "VARCHAR",
        "customer_city": "VARCHAR",
        "customer_state": "VARCHAR",
    },
    "order_payments": {
        "order_id": "VARCHAR",
        "payment_sequential": "INTEGER",
        "payment_type": "VARCHAR",
        "payment_installments": "INTEGER",
        "payment_value": "DECIMAL(10,2)",
    },
    "order_reviews": {
        "review_id": "VARCHAR",
        "order_id": "VARCHAR",
        "review_score": "INTEGER",
        "review_comment_title": "VARCHAR",
        "review_comment_message": "VARCHAR",
        "review_creation_date": "TIMESTAMP",
        "review_answer_timestamp": "TIMESTAMP",
    },
    "products": {
        "product_id": "VARCHAR",
        "product_category_name": "VARCHAR",
        "product_name_lenght": "INTEGER",
        "product_description_lenght": "INTEGER",
        "product_photos_qty": "INTEGER",
        "product_weight_g": "INTEGER",
        "product_length_cm": "INTEGER",
        "product_height_cm": "INTEGER",
        "product_width_cm": "INTEGER",
    },
    "sellers": {
        "seller_id": "VARCHAR",
        "seller_zip_code_prefix": "VARCHAR",
        "seller_city": "VARCHAR",
        "seller_state": "VARCHAR",
    },
}

COLUNAS_FATO = (
    "pedido_sk",
    "order_item_id",
    "produto_sk",
    "vendedor_sk",
    "price",
    "freight_value",
    "order_status",
    "data_compra",
    "data_entrega",
    "data_estimada",
    "dias_entrega",
    "status_entrega",
    "nota",
    "forma_pagamento",
    "parcelas",
    "cliente_sk",
    "cidade_cliente",
    "estado_cliente",
    "estado_vendedor",
    "categoria",
)

# Colunas que descrevem o pedido (e não o item): precisam ser iguais em todos os itens do pedido.
COLUNAS_DE_PEDIDO = (
    "order_status",
    "data_compra",
    "data_entrega",
    "data_estimada",
    "dias_entrega",
    "status_entrega",
    "nota",
    "forma_pagamento",
    "parcelas",
    "cliente_sk",
    "cidade_cliente",
    "estado_cliente",
)

COLUNAS_OBRIGATORIAS = tuple(
    c for c in COLUNAS_FATO if c not in ("data_entrega", "dias_entrega", "nota", "parcelas")
)

TABELAS_IDS = {
    "ids_pedido": ("pedido_sk", "order_id"),
    "ids_cliente": ("cliente_sk", "customer_unique_id"),
    "ids_produto": ("produto_sk", "product_id"),
    "ids_vendedor": ("vendedor_sk", "seller_id"),
}

OPCOES_PARQUET = "FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 19, PARQUET_VERSION v1"

PARTICULAS = {"da", "das", "de", "do", "dos", "e", "d"}


# ---------------------------------------------------------------------------
# Funções puras (testadas em tests/dados/test_funcoes.py)
# ---------------------------------------------------------------------------


def normalizar_nome(texto: str) -> str:
    """Chave de comparação: minúsculas, sem acento, hífen e apóstrofo viram espaço."""
    sem_acento = "".join(ch for ch in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(ch))
    s = re.sub(r"[-'’`´]", " ", sem_acento.lower())
    return re.sub(r"\s+", " ", s).strip()


def titulo_cidade(nome: str) -> str:
    """Title Case em português: "santa barbara d'oeste" -> "Santa Barbara d'Oeste"."""
    palavras = []
    for i, palavra in enumerate(nome.strip().lower().split()):
        partes = []
        for j, parte in enumerate(palavra.split("-")):
            inicio = i == 0 and j == 0
            if "'" in parte:
                prefixo, _, resto = parte.partition("'")
                prefixo = prefixo if prefixo in PARTICULAS and not inicio else prefixo.capitalize()
                parte = f"{prefixo}'{resto.capitalize()}"
            elif parte not in PARTICULAS or inicio:
                parte = parte.capitalize()
            partes.append(parte)
        palavras.append("-".join(partes))
    return " ".join(palavras)


def mapear_cidades(
    pares: Iterable[tuple[str, str]], municipios: Iterable[tuple[str, str]]
) -> dict[tuple[str, str], tuple[str, bool]]:
    """(cidade da Olist, UF) -> (nome oficial do IBGE, True) ou (Title Case, False) se não achar."""
    indice = {(normalizar_nome(nome), uf): nome for nome, uf in municipios}
    resultado: dict[tuple[str, str], tuple[str, bool]] = {}
    for cidade, uf in pares:
        oficial = indice.get((normalizar_nome(cidade), uf))
        resultado[(cidade, uf)] = (oficial, True) if oficial else (titulo_cidade(cidade), False)
    return resultado


def ultimo_dia_do_mes(dia: date) -> date:
    primeiro_do_proximo = (dia.replace(day=28) + timedelta(days=4)).replace(day=1)
    return primeiro_do_proximo - timedelta(days=1)


def data_ancora(volume_mensal: Sequence[tuple[date, int]], fracao_minima: float = 0.10) -> date:
    """Fim do último mês "completo": o último mês com volume >= 10% da mediana mensal.

    Serve para qualquer base: um mês com poucos registros no fim da série
    (ex.: set/2018 na Olist, com 1 pedido) não vira o "mês atual".
    """
    if not volume_mensal:
        raise ValueError("volume_mensal vazio")
    mediana = statistics.median(n for _, n in volume_mensal)
    for mes, n in sorted(volume_mensal, reverse=True):
        if n >= fracao_minima * mediana:
            return ultimo_dia_do_mes(mes)
    raise ValueError("nenhum mês atinge o volume mínimo")


def brl(valor: float) -> str:
    return "R$ " + _milhar(valor, 2)


def inteiro(valor: float) -> str:
    return _milhar(valor, 0)


def decimal_br(valor: float, casas: int = 2) -> str:
    return _milhar(valor, casas)


def pct(fracao: float, casas: int = 1) -> str:
    return _milhar(100 * fracao, casas) + "%"


def _milhar(valor: float, casas: int) -> str:
    texto = f"{valor:,.{casas}f}"
    return texto.replace(",", "\0").replace(".", ",").replace("\0", ".")


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def literal(caminho: Path) -> str:
    """Caminho como literal SQL (funciona com acento e espaço no Windows)."""
    return "'" + caminho.as_posix().replace("'", "''") + "'"


def conectar() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    # Nada de baixar extensões em segundo plano (mesma regra do app no navegador).
    con.execute("SET autoinstall_known_extensions = false")
    con.execute("SET autoload_known_extensions = false")
    return con


def carregar_csvs(con: duckdb.DuckDBPyConnection, pasta: Path) -> None:
    faltando = [f"olist_{t}_dataset.csv" for t in ESQUEMAS_CSV if not (pasta / f"olist_{t}_dataset.csv").exists()]
    if faltando:
        raise SystemExit(
            f"CSVs faltando em {pasta}: {', '.join(faltando)}\n"
            "Copie os CSVs da Olist para essa pasta ou rode: python scripts/baixar_dados.py"
        )
    for tabela, colunas in ESQUEMAS_CSV.items():
        tipos = ", ".join(f"'{nome}': '{tipo}'" for nome, tipo in colunas.items())
        con.execute(
            f"""
            CREATE TABLE {tabela} AS
            SELECT * FROM read_csv(
                {literal(pasta / f"olist_{tabela}_dataset.csv")},
                header = true, delim = ',', quote = '"', escape = '"',
                timestampformat = '%Y-%m-%d %H:%M:%S',
                columns = {{{tipos}}}
            )
            """
        )


def carregar_referencias(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    con.execute(
        f"""
        CREATE TABLE ref_categoria AS
        SELECT * FROM read_csv({literal(REFERENCIA / "categorias.csv")}, header = true,
                               columns = {{'categoria_original': 'VARCHAR', 'categoria': 'VARCHAR'}})
        """
    )
    con.execute(
        f"""
        CREATE TABLE ref_pagamento (payment_type VARCHAR, forma_pagamento VARCHAR);
        INSERT INTO ref_pagamento VALUES {", ".join(f"('{k}', '{v}')" for k, v in FORMAS_PAGAMENTO.items())};
        """
    )
    municipios = con.sql(
        f"""
        SELECT nome, uf FROM read_csv({literal(REFERENCIA / "municipios_ibge.csv")}, header = true,
                                      columns = {{'codigo_ibge': 'VARCHAR', 'nome': 'VARCHAR', 'uf': 'VARCHAR'}})
        """
    ).fetchall()
    pares = con.sql(
        "SELECT DISTINCT customer_city, customer_state FROM customers WHERE customer_city IS NOT NULL"
    ).fetchall()
    mapa = mapear_cidades(pares, municipios)
    con.execute("CREATE TABLE ref_cidade (cidade_olist VARCHAR, uf VARCHAR, cidade VARCHAR, oficial BOOLEAN)")
    # Quatro listas como parâmetros + unnest: bem mais rápido que inserir linha a linha.
    colunas = list(zip(*((cidade, uf, nome, oficial) for (cidade, uf), (nome, oficial) in mapa.items())))
    con.execute(
        "INSERT INTO ref_cidade SELECT unnest($1), unnest($2), unnest($3), unnest($4)",
        [list(c) for c in colunas],
    )
    return {"municipios_ibge": len(municipios), "cidades_olist": len(pares)}


def construir_fato(con: duckdb.DuckDBPyConnection) -> None:
    excluidos = ", ".join(f"'{s}'" for s in STATUS_EXCLUIDOS)
    con.execute(
        f"""
        -- Pedidos que entram no modelo: sem canceled/unavailable e com pelo menos 1 item.
        CREATE TABLE pedidos_validos AS
        SELECT o.* FROM orders o
        WHERE o.order_status NOT IN ({excluidos})
          AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.order_id);

        -- Chaves substitutas: inteiros pequenos no lugar dos IDs de 32 caracteres.
        -- Pedidos e clientes numerados em ordem cronológica; produtos e vendedores pelo ID.
        CREATE TABLE ids_pedido AS
        SELECT CAST(row_number() OVER (ORDER BY order_purchase_timestamp, order_id) AS INTEGER) AS pedido_sk,
               order_id
        FROM pedidos_validos;

        CREATE TABLE ids_cliente AS
        SELECT CAST(row_number() OVER (ORDER BY min(p.order_purchase_timestamp), c.customer_unique_id) AS INTEGER)
                   AS cliente_sk,
               c.customer_unique_id
        FROM pedidos_validos p JOIN customers c USING (customer_id)
        GROUP BY c.customer_unique_id;

        CREATE TABLE ids_produto AS
        SELECT CAST(row_number() OVER (ORDER BY product_id) AS INTEGER) AS produto_sk, product_id
        FROM (SELECT DISTINCT i.product_id FROM order_items i JOIN pedidos_validos USING (order_id));

        CREATE TABLE ids_vendedor AS
        SELECT CAST(row_number() OVER (ORDER BY seller_id) AS INTEGER) AS vendedor_sk, seller_id
        FROM (SELECT DISTINCT i.seller_id FROM order_items i JOIN pedidos_validos USING (order_id));

        -- Nota do pedido = média das reviews do pedido (547 pedidos têm mais de uma).
        CREATE TABLE nota_pedido AS
        SELECT order_id, avg(review_score) AS nota
        FROM order_reviews
        GROUP BY order_id;

        -- Forma de pagamento principal = o tipo que pagou o maior valor no pedido
        -- (soma por tipo; empate improvável desempata pela primeira parcela paga).
        CREATE TABLE pagamento_pedido AS
        WITH por_tipo AS (
            SELECT order_id, payment_type, sum(payment_value) AS valor, min(payment_sequential) AS primeira
            FROM order_payments
            GROUP BY order_id, payment_type
        ),
        principal AS (
            SELECT order_id, payment_type,
                   row_number() OVER (PARTITION BY order_id ORDER BY valor DESC, primeira) AS ordem
            FROM por_tipo
        )
        SELECT p.order_id, p.payment_type, r.forma_pagamento, m.parcelas
        FROM principal p
        LEFT JOIN ref_pagamento r USING (payment_type)
        JOIN (SELECT order_id, max(payment_installments) AS parcelas FROM order_payments GROUP BY order_id) m
          USING (order_id)
        WHERE p.ordem = 1;

        CREATE TABLE fato_itens AS
        WITH base AS (
            SELECT
                dp.pedido_sk,
                i.order_item_id,
                pr.produto_sk,
                ve.vendedor_sk,
                i.price,
                i.freight_value,
                o.order_status,
                CAST(o.order_purchase_timestamp AS DATE) AS data_compra,
                CAST(o.order_delivered_customer_date AS DATE) AS data_entrega,
                CAST(o.order_estimated_delivery_date AS DATE) AS data_estimada,
                n.nota,
                pg.payment_type,
                pg.forma_pagamento,
                pg.parcelas,
                cl.cliente_sk,
                ci.cidade AS cidade_cliente,
                c.customer_state AS estado_cliente,
                s.seller_state AS estado_vendedor,
                p.product_category_name,
                cat.categoria AS categoria_mapeada
            FROM order_items i
            JOIN pedidos_validos o USING (order_id)
            JOIN ids_pedido dp USING (order_id)
            JOIN ids_produto pr USING (product_id)
            JOIN ids_vendedor ve USING (seller_id)
            JOIN customers c ON c.customer_id = o.customer_id
            JOIN ids_cliente cl ON cl.customer_unique_id = c.customer_unique_id
            LEFT JOIN ref_cidade ci ON ci.cidade_olist = c.customer_city AND ci.uf = c.customer_state
            LEFT JOIN sellers s ON s.seller_id = i.seller_id
            LEFT JOIN products p ON p.product_id = i.product_id
            LEFT JOIN ref_categoria cat ON cat.categoria_original = p.product_category_name
            LEFT JOIN nota_pedido n ON n.order_id = i.order_id
            LEFT JOIN pagamento_pedido pg ON pg.order_id = i.order_id
        )
        SELECT
            pedido_sk,
            CAST(order_item_id AS TINYINT) AS order_item_id,
            produto_sk,
            vendedor_sk,
            price,
            freight_value,
            order_status,
            data_compra,
            data_entrega,
            data_estimada,
            CAST(date_diff('day', data_compra, data_entrega) AS SMALLINT) AS dias_entrega,
            CASE
                WHEN data_entrega IS NULL THEN 'Não Entregue'
                WHEN data_entrega > data_estimada THEN 'Atrasado'
                ELSE 'No Prazo'
            END AS status_entrega,
            nota,
            CASE WHEN payment_type IS NULL THEN '{SEM_PAGAMENTO}' ELSE forma_pagamento END AS forma_pagamento,
            CAST(parcelas AS TINYINT) AS parcelas,
            cliente_sk,
            coalesce(cidade_cliente, 'Não informada') AS cidade_cliente,
            estado_cliente,
            estado_vendedor,
            CASE WHEN product_category_name IS NULL THEN '{SEM_CATEGORIA}' ELSE categoria_mapeada END AS categoria
        FROM base;
        """
    )


@dataclass
class Checagem:
    descricao: str
    ok: bool
    detalhe: str = ""


def checar_qualidade(con: duckdb.DuckDBPyConnection) -> list[Checagem]:
    def um(sql: str) -> int:
        linha = con.sql(sql).fetchone()
        assert linha is not None
        return int(linha[0])

    checagens: list[Checagem] = []

    esperado = um("SELECT count(*) FROM order_items JOIN pedidos_validos USING (order_id)")
    linhas = um("SELECT count(*) FROM fato_itens")
    checagens.append(
        Checagem("Uma linha por item (os joins não duplicaram nem perderam linhas)", linhas == esperado,
                 f"{inteiro(linhas)} linhas; esperado {inteiro(esperado)}")
    )

    dup = um("SELECT count(*) - count(DISTINCT (pedido_sk, order_item_id)) FROM fato_itens")
    checagens.append(Checagem("Chave (pedido_sk, order_item_id) única", dup == 0, f"{dup} duplicadas"))

    nulos = {
        c: um(f"SELECT count(*) FROM fato_itens WHERE {c} IS NULL") for c in COLUNAS_OBRIGATORIAS
    }
    com_nulo = {c: n for c, n in nulos.items() if n}
    checagens.append(
        Checagem("Colunas obrigatórias sem valores vazios", not com_nulo,
                 ", ".join(f"{c}: {n}" for c, n in com_nulo.items()) or f"{len(nulos)} colunas conferidas")
    )

    excluidos = ", ".join(f"'{s}'" for s in STATUS_EXCLUIDOS)
    n = um(f"SELECT count(*) FROM fato_itens WHERE order_status IN ({excluidos})")
    checagens.append(Checagem("Nenhum pedido canceled/unavailable", n == 0, f"{n} linhas"))

    sem_mapa = con.sql(
        """
        SELECT DISTINCT p.product_category_name
        FROM products p LEFT JOIN ref_categoria r ON r.categoria_original = p.product_category_name
        WHERE p.product_category_name IS NOT NULL AND r.categoria IS NULL
        """
    ).fetchall()
    checagens.append(
        Checagem("Todas as categorias têm nome amigável (scripts/referencia/categorias.csv)", not sem_mapa,
                 ", ".join(str(r[0]) for r in sem_mapa) or f"{um('SELECT count(*) FROM ref_categoria')} categorias")
    )

    dominio = ", ".join(f"'{s}'" for s in STATUS_ENTREGA)
    n = um(
        f"""
        SELECT count(*) FROM fato_itens
        WHERE status_entrega NOT IN ({dominio})
           OR (status_entrega = 'Não Entregue') <> (data_entrega IS NULL)
           OR (status_entrega = 'Atrasado') <> coalesce(data_entrega > data_estimada, false)
        """
    )
    checagens.append(Checagem("status_entrega coerente com as datas", n == 0, f"{n} linhas incoerentes"))

    n = um(
        "SELECT count(*) FROM fato_itens WHERE (dias_entrega IS NULL) <> (data_entrega IS NULL) OR dias_entrega < 0"
    )
    checagens.append(Checagem("dias_entrega >= 0 e só para pedidos entregues", n == 0, f"{n} linhas"))

    n = um("SELECT count(*) FROM fato_itens WHERE nota < 1 OR nota > 5")
    checagens.append(Checagem("nota entre 1 e 5 (ou vazia, se o pedido não tem review)", n == 0, f"{n} linhas"))

    formas = ", ".join(f"'{s}'" for s in [*FORMAS_PAGAMENTO.values(), SEM_PAGAMENTO])
    n = um(f"SELECT count(*) FROM fato_itens WHERE forma_pagamento NOT IN ({formas})")
    checagens.append(Checagem("forma_pagamento em PT-BR e dentro do domínio", n == 0, f"{n} linhas"))

    n = um("SELECT count(*) FROM fato_itens WHERE price <= 0 OR freight_value < 0")
    checagens.append(Checagem("price > 0 e freight_value >= 0", n == 0, f"{n} linhas"))

    variam = [
        c for c in COLUNAS_DE_PEDIDO
        if um(f"SELECT count(*) FROM (SELECT pedido_sk FROM fato_itens GROUP BY 1 HAVING count(DISTINCT {c}) > 1)")
    ]
    checagens.append(
        Checagem("Atributos de pedido iguais em todos os itens do pedido", not variam,
                 ", ".join(variam) or f"{len(COLUNAS_DE_PEDIDO)} colunas conferidas")
    )

    for tabela, (sk, id_original) in TABELAS_IDS.items():
        total, sks, ids, maximo = con.sql(
            f"SELECT count(*), count(DISTINCT {sk}), count(DISTINCT {id_original}), max({sk}) FROM {tabela}"
        ).fetchone() or (0, 0, 0, 0)
        orfaos = um(f"SELECT count(*) FROM (SELECT DISTINCT {sk} FROM fato_itens) f ANTI JOIN {tabela} USING ({sk})")
        ok = total == sks == ids == maximo and orfaos == 0
        checagens.append(
            Checagem(f"{tabela}: {sk} de 1 a N, sem repetição, cobre o fato", ok,
                     f"{inteiro(total)} linhas, {orfaos} chaves sem ID")
        )
    return checagens


def exportar(con: duckdb.DuckDBPyConnection, saida: Path) -> dict[str, int]:
    saida.mkdir(parents=True, exist_ok=True)
    arquivos: dict[str, Path] = {"fato_itens": saida / "fato_itens.parquet"}
    colunas = ", ".join(COLUNAS_FATO)
    # Ordenado por pedido (= ordem cronológica): comprime melhor e deixa o
    # min/max de data_compra de cada bloco útil para filtros por período.
    con.execute(
        f"COPY (SELECT {colunas} FROM fato_itens ORDER BY pedido_sk, order_item_id) "
        f"TO {literal(arquivos['fato_itens'])} ({OPCOES_PARQUET})"
    )
    for tabela, (sk, _) in TABELAS_IDS.items():
        arquivos[tabela] = saida / f"{tabela}.parquet"
        con.execute(f"COPY (SELECT * FROM {tabela} ORDER BY {sk}) TO {literal(arquivos[tabela])} ({OPCOES_PARQUET})")
    return {nome: caminho.stat().st_size for nome, caminho in arquivos.items()}


def medir_tamanho_com_ids(con: duckdb.DuckDBPyConnection, saida: Path) -> int:
    """Tamanho que o fato teria com os IDs originais no lugar das chaves (evidência do ajuste 6)."""
    temporario = saida / "_medicao_com_ids.parquet"
    colunas = ", ".join(
        {
            "pedido_sk": "p.order_id",
            "produto_sk": "pr.product_id",
            "vendedor_sk": "v.seller_id",
            "cliente_sk": "c.customer_unique_id",
        }.get(col, f"f.{col}")
        for col in COLUNAS_FATO
    )
    con.execute(
        f"""
        COPY (
            SELECT {colunas}
            FROM fato_itens f
            JOIN ids_pedido p USING (pedido_sk) JOIN ids_produto pr USING (produto_sk)
            JOIN ids_vendedor v USING (vendedor_sk) JOIN ids_cliente c USING (cliente_sk)
            ORDER BY f.pedido_sk, f.order_item_id
        ) TO {literal(temporario)} ({OPCOES_PARQUET})
        """
    )
    tamanho = temporario.stat().st_size
    temporario.unlink()
    return tamanho


# ---------------------------------------------------------------------------
# Validação (lida do Parquet gerado, não das tabelas em memória)
# ---------------------------------------------------------------------------


@dataclass
class Kpis:
    faturamento: float
    pedidos: int
    ticket: float
    clientes: int
    itens: int
    frete: float


def kpis(con: duckdb.DuckDBPyConnection, origem: str, filtro: str = "true") -> Kpis:
    linha = con.sql(
        f"""
        SELECT CAST(sum(price) AS DOUBLE), count(DISTINCT pedido_sk),
               CAST(sum(price) AS DOUBLE) / count(DISTINCT pedido_sk),
               count(DISTINCT cliente_sk), count(*), CAST(sum(freight_value) AS DOUBLE)
        FROM {origem} WHERE {filtro}
        """
    ).fetchone()
    assert linha is not None
    return Kpis(*linha)


def kpis_sem_excluir_status(con: duckdb.DuckDBPyConnection) -> Kpis:
    linha = con.sql(
        """
        SELECT CAST(sum(i.price) AS DOUBLE), count(DISTINCT i.order_id),
               CAST(sum(i.price) AS DOUBLE) / count(DISTINCT i.order_id),
               count(DISTINCT c.customer_unique_id), count(*), CAST(sum(i.freight_value) AS DOUBLE)
        FROM order_items i JOIN orders o USING (order_id) JOIN customers c ON c.customer_id = o.customer_id
        """
    ).fetchone()
    assert linha is not None
    return Kpis(*linha)


def entrega(con: duckdb.DuckDBPyConnection, origem: str, filtro: str = "true") -> dict[str, float]:
    linha = con.sql(
        f"""
        WITH pedidos AS (   -- grão pedido (P7): um registro por pedido_sk
            SELECT DISTINCT pedido_sk, status_entrega, dias_entrega, nota FROM {origem} WHERE {filtro}
        )
        SELECT count(*),
               count(*) FILTER (WHERE status_entrega <> 'Não Entregue'),
               count(*) FILTER (WHERE status_entrega = 'No Prazo'),
               count(*) FILTER (WHERE status_entrega = 'Atrasado'),
               count(*) FILTER (WHERE status_entrega = 'Não Entregue'),
               avg(dias_entrega),
               median(dias_entrega),
               avg(nota),
               count(nota)
        FROM pedidos
        """
    ).fetchone()
    assert linha is not None
    chaves = ("pedidos", "entregues", "no_prazo", "atrasados", "nao_entregues", "prazo_medio", "prazo_mediana",
              "nota", "pedidos_com_nota")
    return dict(zip(chaves, linha))


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def status(ok: bool) -> str:
    return "✅" if ok else "❌"


def gerar_validacao(
    con: duckdb.DuckDBPyConnection,
    pasta_dados: Path,
    saida: Path,
    checagens: list[Checagem],
    tamanhos: dict[str, int],
    tamanho_com_ids: int,
    ancora: date,
    volume_mensal: list[tuple[date, int]],
    refs: dict[str, int],
) -> tuple[str, bool]:
    fato = f"read_parquet({literal(saida / 'fato_itens.parquet')})"
    de_b, ate_b = RECORTE_B
    filtro_b = f"data_compra BETWEEN DATE '{de_b}' AND DATE '{ate_b}'"

    a = kpis(con, fato)
    b = kpis(con, fato, filtro_b)
    c = kpis_sem_excluir_status(con)
    ea = entrega(con, fato)
    eb = entrega(con, fato, filtro_b)

    ok_fat = abs(a.faturamento - ALVO_FATURAMENTO) < 0.005
    ok_ped = a.pedidos == ALVO_PEDIDOS
    ok_tic = round(a.ticket, 2) == ALVO_TICKET
    ok_cli = a.clientes == ALVO_CLIENTES
    aceite = ok_fat and ok_ped and ok_tic and ok_cli
    qualidade = all(ch.ok for ch in checagens)

    periodo = con.sql(f"SELECT min(data_compra), max(data_compra) FROM {fato}").fetchone()
    assert periodo is not None
    nota_por_item = con.sql(f"SELECT avg(nota) FROM {fato}").fetchone()
    assert nota_por_item is not None
    varias_reviews = con.sql(
        "SELECT count(*) FROM (SELECT order_id FROM order_reviews GROUP BY 1 HAVING count(*) > 1)"
    ).fetchone()
    assert varias_reviews is not None

    L: list[str] = []
    L += [
        "# Validação dos dados (Fase 1)",
        "",
        "> Arquivo gerado por `scripts/preparar_dados.py`. Não edite à mão: rode o script de novo.",
        "",
        f"- **Resultado:** {'✅ bate com o Power BI' if aceite else '❌ NÃO bate com o Power BI'}"
        f" · checagens de qualidade: {sum(ch.ok for ch in checagens)}/{len(checagens)} "
        f"{'✅' if qualidade else '❌'}",
        f"- **Período dos dados:** {periodo[0]:%d/%m/%Y} a {periodo[1]:%d/%m/%Y}"
        f" · **âncora de datas:** {ancora:%d/%m/%Y} (seção 6 abaixo)",
        f"- **Regras:** sem pedidos `{'`/`'.join(STATUS_EXCLUIDOS)}`; faturamento = soma de `price`, sem frete.",
        f"- **Gerado com:** DuckDB {duckdb.__version__}, lendo o Parquet final (`public/data/fato_itens.parquet`).",
        "",
        "## 1. Critério de aceite: recorte A (base inteira) × Power BI",
        "",
        "| Métrica | Power BI | Parquet | Bate? |",
        "|---|---:|---:|:---:|",
        f"| Faturamento | {brl(ALVO_FATURAMENTO)} | {brl(a.faturamento)} | {status(ok_fat)} |",
        f"| Pedidos | {inteiro(ALVO_PEDIDOS)} | {inteiro(a.pedidos)} | {status(ok_ped)} |",
        f"| Ticket médio | {brl(ALVO_TICKET)} | {brl(a.ticket)} | {status(ok_tic)} |",
        f"| Clientes únicos | {inteiro(ALVO_CLIENTES)} | {inteiro(a.clientes)} | {status(ok_cli)} |",
        "",
        "## 2. Os outros recortes da Fase 0 (mesmos dados?)",
        "",
        "Os números abaixo foram calculados na Fase 0 com pandas, direto dos CSVs do Kaggle.",
        "Se todos baterem, os CSVs usados aqui são os mesmos.",
        "",
        "| Recorte | Faturamento | Pedidos | Ticket médio | Clientes únicos | Itens | Bate? |",
        "|---|---:|---:|---:|---:|---:|:---:|",
    ]
    for nome, k, ref in (
        ("A. Base inteira", a, FASE0_RECORTES["A"]),
        ("B. jan/2017 a ago/2018", b, FASE0_RECORTES["B"]),
        ("C. Sem excluir status (CSVs)", c, FASE0_RECORTES["C"]),
    ):
        bate = (
            abs(k.faturamento - ref["faturamento"]) < 0.005 and k.pedidos == ref["pedidos"]
            and round(k.ticket, 2) == ref["ticket"] and k.clientes == ref["clientes"] and k.itens == ref["itens"]
        )
        L.append(
            f"| {nome} | {brl(k.faturamento)} | {inteiro(k.pedidos)} | {brl(k.ticket)} | {inteiro(k.clientes)}"
            f" | {inteiro(k.itens)} | {status(bate)} |"
        )

    frete_ok = abs(a.frete - FASE0_FRETE_A) < 0.005
    atraso_b = eb["atrasados"] / eb["entregues"]
    L += [
        "",
        "## 3. Entrega, frete e nota (definições aprovadas na Fase 0)",
        "",
        "- **Entregue:** o pedido tem data de entrega ao cliente. **Atrasado:** entregue depois do dia"
        " estimado, comparando só a data. **Não Entregue:** sem data de entrega (inclui os 8 pedidos com"
        " status `delivered` e data vazia).",
        "- **Prazo de entrega:** dias corridos entre a compra e a entrega, só pedidos entregues.",
        "- **Frete médio:** frete total ÷ número de pedidos.",
        "- **Nota:** média das reviews de cada pedido; a média geral é calculada **por pedido** (P7).",
        "",
        "| Indicador | Recorte A (base inteira) | Recorte B (jan/17–ago/18) | Fase 0 (recorte B) | Bate? |",
        "|---|---:|---:|---:|:---:|",
        f"| Pedidos entregues | {inteiro(ea['entregues'])} | {inteiro(eb['entregues'])}"
        f" | {inteiro(FASE0_ENTREGA_B['entregues'])} | {status(eb['entregues'] == FASE0_ENTREGA_B['entregues'])} |",
        f"| Atrasados | {inteiro(ea['atrasados'])} ({pct(ea['atrasados'] / ea['entregues'])})"
        f" | {inteiro(eb['atrasados'])} ({pct(atraso_b)})"
        f" | {inteiro(FASE0_ENTREGA_B['atrasados'])} (6,8%) | {status(eb['atrasados'] == FASE0_ENTREGA_B['atrasados'])} |",
        f"| Não entregues | {inteiro(ea['nao_entregues'])} | {inteiro(eb['nao_entregues'])}"
        f" | {inteiro(FASE0_ENTREGA_B['nao_entregues'])}"
        f" | {status(eb['nao_entregues'] == FASE0_ENTREGA_B['nao_entregues'])} |",
        f"| Nota média (por pedido) | {decimal_br(ea['nota'])} | {decimal_br(eb['nota'])}"
        f" | {decimal_br(FASE0_NOTA_B)} | {status(round(eb['nota'], 2) == FASE0_NOTA_B)} |",
        f"| Pedidos com mais de uma review (arquivo inteiro) | {inteiro(varias_reviews[0])} | | "
        f"{inteiro(FASE0_VARIAS_REVIEWS)}"
        f" | {status(varias_reviews[0] == FASE0_VARIAS_REVIEWS)} |",
        f"| Prazo médio de entrega | {decimal_br(ea['prazo_medio'], 1)} dias | {decimal_br(eb['prazo_medio'], 1)} dias | — | |",
        f"| Prazo mediano de entrega | {decimal_br(ea['prazo_mediana'], 0)} dias | {decimal_br(eb['prazo_mediana'], 0)} dias | — | |",
        f"| Frete total | {brl(a.frete)} | {brl(b.frete)} | {brl(FASE0_FRETE_A)} (recorte A)"
        f" | {'✅' if frete_ok else '⚠️'} |",
        f"| Frete médio por pedido | {brl(a.frete / a.pedidos)} | {brl(b.frete / b.pedidos)} | — | |",
        "",
        f"**Por que a nota é por pedido (P7):** se a média fosse feita por linha do Parquet (por item),"
        f" pedidos com vários itens pesariam mais e a nota cairia para {decimal_br(nota_por_item[0], 3)},"
        f" contra {decimal_br(ea['nota'], 3)} por pedido. É a mesma lógica do `AVERAGEX(VALUES(order_id))` do Power BI.",
        "",
    ]
    if not frete_ok:
        L += [
            f"> ⚠️ **Frete total diferente da Fase 0.** O Parquet dá {brl(a.frete)}; a Fase 0 anotou"
            f" {brl(FASE0_FRETE_A)} (diferença de {brl(a.frete - FASE0_FRETE_A)},"
            f" {pct((a.frete - FASE0_FRETE_A) / a.frete, 2)}). Faturamento, pedidos, clientes e itens batem"
            " no centavo e na unidade, então os itens são os mesmos. Nenhum recorte testado reproduz"
            " o número da Fase 0 (só `delivered`, sem 2016, frete deduplicado por pedido/vendedor, só produtos com"
            " categoria). **Não é critério de aceite, mas precisa ser conferido no card de frete do Power BI.**",
            "",
        ]

    total_pedidos = ea["pedidos"]
    formas = con.sql(
        f"""
        SELECT forma_pagamento, count(*) AS pedidos, avg(parcelas) AS parcelas
        FROM (SELECT DISTINCT pedido_sk, forma_pagamento, parcelas FROM {fato})
        GROUP BY 1 ORDER BY 2 DESC
        """
    ).fetchall()
    L += [
        "## 4. Forma de pagamento principal (grão pedido)",
        "",
        "Principal = o tipo de pagamento que pagou o maior valor no pedido (somando os pagamentos de cada tipo).",
        "",
        "| Forma de pagamento | Pedidos | % | Parcelas (média) |",
        "|---|---:|---:|---:|",
        *(
            f"| {nome} | {inteiro(n)} | {pct(n / total_pedidos)} | "
            f"{decimal_br(parc, 1) if parc is not None else '—'} |"
            for nome, n, parc in formas
        ),
        "",
    ]

    categorias = con.sql(
        f"""
        SELECT categoria, CAST(sum(price) AS DOUBLE) AS fat, count(DISTINCT pedido_sk) AS pedidos
        FROM {fato} GROUP BY 1 ORDER BY 2 DESC
        """
    ).fetchall()
    L += [
        f"## 5. Categorias ({len(categorias)} no total; top 10 por faturamento)",
        "",
        "Um pedido com itens de 2 categorias conta nas duas (mesmo comportamento do Power BI).",
        "",
        "| # | Categoria | Faturamento | % do total | Pedidos |",
        "|---:|---|---:|---:|---:|",
        *(
            f"| {i} | {nome} | {brl(fat)} | {pct(fat / a.faturamento)} | {inteiro(ped)} |"
            for i, (nome, fat, ped) in enumerate(categorias[:10], start=1)
        ),
        "",
    ]
    sem_cat = next((x for x in categorias if x[0] == SEM_CATEGORIA), None)
    if sem_cat:
        L += [f"\"{SEM_CATEGORIA}\": {brl(sem_cat[1])} ({pct(sem_cat[1] / a.faturamento)}), {inteiro(sem_cat[2])} pedidos.", ""]

    mediana = statistics.median(n for _, n in volume_mensal)
    L += [
        "## 6. Âncora de datas",
        "",
        "Regra: âncora = último dia do último mês com volume de pelo menos 10% da mediana mensal"
        f" (mediana = {inteiro(mediana)} pedidos; mínimo = {inteiro(0.1 * mediana)}).",
        f"Resultado: **{ancora:%d/%m/%Y}**. Perguntas como \"último mês\" usam essa data como \"hoje\", nunca a data real.",
        "",
        "| Mês | Pedidos | Conta para a âncora? |",
        "|---|---:|:---:|",
        *(
            f"| {mes:%m/%Y} | {inteiro(n)} | {'sim' if n >= 0.1 * mediana else 'não (poucos pedidos)'} |"
            for mes, n in volume_mensal
        ),
        "",
    ]

    casadas = con.sql(
        f"""
        SELECT count(DISTINCT pedido_sk) FILTER (WHERE r.oficial), count(DISTINCT pedido_sk)
        FROM (SELECT DISTINCT pedido_sk, cidade_cliente, estado_cliente FROM {fato}) f
        LEFT JOIN (SELECT DISTINCT cidade, uf, oficial FROM ref_cidade) r
          ON r.cidade = f.cidade_cliente AND r.uf = f.estado_cliente
        """
    ).fetchone()
    assert casadas is not None
    fora = con.sql(
        """
        SELECT r.cidade_olist, r.uf, count(DISTINCT o.order_id) AS pedidos
        FROM pedidos_validos o JOIN customers c USING (customer_id)
        JOIN ref_cidade r ON r.cidade_olist = c.customer_city AND r.uf = c.customer_state
        WHERE NOT r.oficial GROUP BY ALL ORDER BY pedidos DESC, 1 LIMIT 5
        """
    ).fetchall()
    L += [
        "## 7. Nomes de cidade",
        "",
        "Os CSVs da Olist trazem a cidade em minúsculas e sem acento (\"sao paulo\"). O script procura cada"
        f" (cidade, UF) na lista oficial de {inteiro(refs['municipios_ibge'])} municípios do IBGE"
        " (`scripts/referencia/municipios_ibge.csv`), ignorando acento, hífen e apóstrofo.",
        f"- **{pct(casadas[0] / casadas[1])} dos pedidos** ({inteiro(casadas[0])} de {inteiro(casadas[1])}) ficaram com"
        " o nome oficial (\"São Paulo\", \"Santa Bárbara d'Oeste\").",
        "- O resto (distritos, nomes antigos ou com erro de digitação) fica em Title Case. Os 5 maiores: "
        + "; ".join(f"{cid} ({uf}): {inteiro(n)}" for cid, uf, n in fora) + ".",
        "- Nomes de cidade se repetem entre estados (ex.: \"Bom Jesus\"). Na Fase 2, a dimensão cidade agrupa"
        " por cidade **e** UF.",
        "",
    ]

    qtd_linhas = con.sql(f"SELECT count(*) FROM {fato}").fetchone()
    assert qtd_linhas is not None
    total_bytes = sum(tamanhos.values())
    L += [
        "## 8. Checagens de qualidade",
        "",
        "| Checagem | Resultado | Detalhe |",
        "|---|:---:|---|",
        *(f"| {ch.descricao} | {status(ch.ok)} | {ch.detalhe} |" for ch in checagens),
        "",
        "## 9. Arquivos gerados",
        "",
        "| Arquivo | Tamanho | Conteúdo |",
        "|---|---:|---|",
        f"| `public/data/fato_itens.parquet` | {decimal_br(tamanhos['fato_itens'] / 1e6, 2)} MB"
        f" | {inteiro(qtd_linhas[0])} itens × {len(COLUNAS_FATO)} colunas |",
        *(
            f"| `public/data/{tabela}.parquet` | {decimal_br(tamanhos[tabela] / 1e6, 2)} MB | `{sk}` → `{orig}` |"
            for tabela, (sk, orig) in TABELAS_IDS.items()
        ),
        f"| **Total** | **{decimal_br(total_bytes / 1e6, 2)} MB** | |",
        "",
        f"Compressão zstd. O dashboard só precisa do `fato_itens.parquet`"
        f" ({decimal_br(tamanhos['fato_itens'] / 1e6, 2)} MB). Com os IDs originais de 32 caracteres dentro do fato,"
        f" ele teria {decimal_br(tamanho_com_ids / 1e6, 2)} MB"
        f" ({pct(tamanho_com_ids / tamanhos['fato_itens'] - 1, 0)} a mais): é o ganho das chaves substitutas.",
        "",
        "Colunas do `fato_itens.parquet`:",
        "",
        "| Coluna | Tipo |",
        "|---|---|",
        *(f"| `{nome}` | {tipo} |" for nome, tipo, *_ in con.sql(f"DESCRIBE SELECT * FROM {fato}").fetchall()),
        "",
        "## 10. CSVs de entrada (SHA-256)",
        "",
        "Para conferir com os CSVs do Power BI: `Get-FileHash dados\\<arquivo>.csv` no PowerShell.",
        "",
        "| Arquivo | SHA-256 |",
        "|---|---|",
        *(
            f"| `{arq.name}` | `{sha256(arq)}` |"
            for arq in sorted(pasta_dados.glob("*.csv"))
            if arq.name.startswith(("olist_", "product_category")) and "geolocation" not in arq.name
        ),
        "",
    ]
    return "\n".join(L), aceite and qualidade


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Gera o Parquet da Olist (Fase 1).")
    parser.add_argument("--dados", type=Path, default=RAIZ / "dados", help="pasta com os CSVs da Olist")
    parser.add_argument("--saida", type=Path, default=RAIZ / "public" / "data", help="pasta dos Parquets")
    args = parser.parse_args()

    con = conectar()
    print("Lendo CSVs...")
    carregar_csvs(con, args.dados)
    refs = carregar_referencias(con)
    print("Montando fato_itens...")
    construir_fato(con)
    checagens = checar_qualidade(con)

    print("Gravando Parquet...")
    tamanhos = exportar(con, args.saida)
    tamanho_com_ids = medir_tamanho_com_ids(con, args.saida)

    volume = [
        (mes, int(n))
        for mes, n in con.sql(
            "SELECT CAST(date_trunc('month', data_compra) AS DATE) AS mes, count(DISTINCT pedido_sk) "
            "FROM fato_itens GROUP BY 1 ORDER BY 1"
        ).fetchall()
    ]
    ancora = data_ancora(volume)
    periodo = con.sql("SELECT min(data_compra), max(data_compra) FROM fato_itens").fetchone()
    assert periodo is not None

    meta = {
        "dataset": "olist",
        "nome": "Vendas Olist",
        "descricao": "E-commerce brasileiro (Olist): itens vendidos, pedidos, entregas, pagamentos e avaliações",
        "fonte": "Brazilian E-Commerce Public Dataset by Olist (Kaggle / github.com/olist/work-at-olist-data)",
        "licenca": "CC BY-NC-SA 4.0",
        "periodo": {"de": periodo[0].isoformat(), "ate": periodo[1].isoformat()},
        "data_ancora": ancora.isoformat(),
        "linhas": {nome: int((con.sql(f"SELECT count(*) FROM {nome}").fetchone() or (0,))[0])
                   for nome in ("fato_itens", *TABELAS_IDS)},
        "arquivos": {"fato": "fato_itens.parquet", **{t: f"{t}.parquet" for t in TABELAS_IDS}},
        "regras": {
            "status_excluidos": list(STATUS_EXCLUIDOS),
            "faturamento": "soma de price, sem frete",
            "grao": "uma linha por item; atributos de pedido se repetem e são deduplicados por pedido_sk",
        },
    }
    (args.saida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    texto, ok = gerar_validacao(con, args.dados, args.saida, checagens, tamanhos, tamanho_com_ids, ancora, volume, refs)
    destino = args.dados / "validacao.md"
    destino.write_text(texto, encoding="utf-8")

    for ch in checagens:
        print(f"  [{'OK' if ch.ok else 'FALHA'}] {ch.descricao} ({ch.detalhe})")
    print(f"Parquet: {args.saida / 'fato_itens.parquet'} ({tamanhos['fato_itens'] / 1e6:.2f} MB)")
    print(f"Validação: {destino}")
    print("RESULTADO: " + ("OK, bate com o Power BI." if ok else "FALHOU. Veja o validacao.md antes de seguir."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
