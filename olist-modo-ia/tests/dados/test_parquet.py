"""Testes do Parquet gerado (rode antes: python scripts/preparar_dados.py).

Leem só os arquivos de public/data, do mesmo jeito que o app vai ler.
"""

import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import duckdb
import pytest

import preparar_dados as p

DADOS = Path(__file__).resolve().parents[2] / "public" / "data"
FATO = f"read_parquet('{(DADOS / 'fato_itens.parquet').as_posix()}')"

pytestmark = pytest.mark.skipif(
    not (DADOS / "fato_itens.parquet").exists(), reason="rode scripts/preparar_dados.py antes"
)


@pytest.fixture(scope="module")
def con() -> Iterator[duckdb.DuckDBPyConnection]:
    c = duckdb.connect()
    yield c
    c.close()


def um(con: duckdb.DuckDBPyConnection, sql: str) -> object:
    linha = con.sql(sql).fetchone()
    assert linha is not None
    return linha[0]


def test_kpis_batem_com_power_bi(con: duckdb.DuckDBPyConnection) -> None:
    k = p.kpis(con, FATO)
    assert k.faturamento == pytest.approx(p.ALVO_FATURAMENTO, abs=0.005)
    assert k.pedidos == p.ALVO_PEDIDOS
    assert round(k.ticket, 2) == p.ALVO_TICKET
    assert k.clientes == p.ALVO_CLIENTES
    assert k.itens == 112_101


def test_faturamento_exato_em_decimal(con: duckdb.DuckDBPyConnection) -> None:
    # Dinheiro em DECIMAL: a soma é exata, sem resíduo de ponto flutuante.
    assert str(um(con, f"SELECT sum(price) FROM {FATO}")) == "13494400.74"


def test_colunas_e_tipos(con: duckdb.DuckDBPyConnection) -> None:
    colunas = con.sql(f"DESCRIBE SELECT * FROM {FATO}").fetchall()
    assert tuple(c[0] for c in colunas) == p.COLUNAS_FATO
    tipos = {c[0]: c[1] for c in colunas}
    assert tipos["price"] == tipos["freight_value"] == "DECIMAL(10,2)"
    assert tipos["data_compra"] == tipos["data_entrega"] == tipos["data_estimada"] == "DATE"
    assert tipos["pedido_sk"] == tipos["cliente_sk"] == "INTEGER"


def test_ids_originais_nao_estao_no_fato(con: duckdb.DuckDBPyConnection) -> None:
    colunas = {c[0] for c in con.sql(f"DESCRIBE SELECT * FROM {FATO}").fetchall()}
    assert not colunas & {"order_id", "product_id", "seller_id", "customer_id", "customer_unique_id"}


def test_compressao_zstd(con: duckdb.DuckDBPyConnection) -> None:
    for arquivo in DADOS.glob("*.parquet"):
        compressoes = {r[0] for r in con.sql(
            f"SELECT DISTINCT compression FROM parquet_metadata('{arquivo.as_posix()}')").fetchall()}
        assert compressoes == {"ZSTD"}, arquivo.name


def test_sem_status_excluidos(con: duckdb.DuckDBPyConnection) -> None:
    assert um(con, f"SELECT count(*) FROM {FATO} WHERE order_status IN ('canceled', 'unavailable')") == 0


def test_dominios(con: duckdb.DuckDBPyConnection) -> None:
    status = {r[0] for r in con.sql(f"SELECT DISTINCT status_entrega FROM {FATO}").fetchall()}
    assert status == set(p.STATUS_ENTREGA)
    formas = {r[0] for r in con.sql(f"SELECT DISTINCT forma_pagamento FROM {FATO}").fetchall()}
    assert formas <= {*p.FORMAS_PAGAMENTO.values(), p.SEM_PAGAMENTO}
    assert "Cartão de crédito" in formas
    ufs = {r[0] for r in con.sql(f"SELECT DISTINCT estado_cliente FROM {FATO}").fetchall()}
    assert len(ufs) == 27


def test_categorias_amigaveis(con: duckdb.DuckDBPyConnection) -> None:
    categorias = {r[0] for r in con.sql(f"SELECT DISTINCT categoria FROM {FATO}").fetchall()}
    assert "Cama, Mesa e Banho" in categorias
    assert p.SEM_CATEGORIA in categorias
    assert not any("_" in c for c in categorias)


def test_cidades_com_acento(con: duckdb.DuckDBPyConnection) -> None:
    top = con.sql(
        f"SELECT cidade_cliente FROM {FATO} GROUP BY 1 ORDER BY count(DISTINCT pedido_sk) DESC LIMIT 2"
    ).fetchall()
    assert [r[0] for r in top] == ["São Paulo", "Rio de Janeiro"]


def test_uma_linha_por_item(con: duckdb.DuckDBPyConnection) -> None:
    assert um(con, f"SELECT count(*) - count(DISTINCT (pedido_sk, order_item_id)) FROM {FATO}") == 0


@pytest.mark.parametrize("coluna", p.COLUNAS_DE_PEDIDO)
def test_atributos_de_pedido_constantes(con: duckdb.DuckDBPyConnection, coluna: str) -> None:
    sql = f"SELECT count(*) FROM (SELECT pedido_sk FROM {FATO} GROUP BY 1 HAVING count(DISTINCT {coluna}) > 1)"
    assert um(con, sql) == 0


def test_status_entrega_coerente(con: duckdb.DuckDBPyConnection) -> None:
    sql = f"""
        SELECT count(*) FROM {FATO}
        WHERE (status_entrega = 'Não Entregue') <> (data_entrega IS NULL)
           OR (status_entrega = 'Atrasado') <> coalesce(data_entrega > data_estimada, false)
           OR (dias_entrega IS NULL) <> (data_entrega IS NULL)
           OR dias_entrega <> date_diff('day', data_compra, data_entrega)
    """
    assert um(con, sql) == 0


def test_entrega_e_nota_recorte_b(con: duckdb.DuckDBPyConnection) -> None:
    e = p.entrega(con, FATO, "data_compra BETWEEN DATE '2017-01-01' AND DATE '2018-08-31'")
    assert e["entregues"] == 96_203
    assert e["atrasados"] == 6_531
    assert e["nao_entregues"] == 1_702
    assert round(e["nota"], 2) == 4.12


def test_nota_por_pedido_difere_da_media_por_item(con: duckdb.DuckDBPyConnection) -> None:
    por_pedido = p.entrega(con, FATO)["nota"]
    por_item = um(con, f"SELECT avg(nota) FROM {FATO}")
    assert isinstance(por_item, float)
    assert por_pedido - por_item > 0.05  # prova de que o grão importa (P7)


@pytest.mark.parametrize(("tabela", "chaves"), list(p.TABELAS_IDS.items()))
def test_tabelas_de_ids(con: duckdb.DuckDBPyConnection, tabela: str, chaves: tuple[str, str]) -> None:
    sk, original = chaves
    ids = f"read_parquet('{(DADOS / f'{tabela}.parquet').as_posix()}')"
    total, sks, originais, maximo = con.sql(
        f"SELECT count(*), count(DISTINCT {sk}), count(DISTINCT {original}), max({sk}) FROM {ids}"
    ).fetchone() or (0, 0, 0, 0)
    assert total == sks == originais == maximo
    assert um(con, f"SELECT count(*) FROM (SELECT DISTINCT {sk} FROM {FATO}) ANTI JOIN {ids} USING ({sk})") == 0
    assert um(con, f"SELECT min(length({original})) FROM {ids}") == 32


def test_pedido_sk_em_ordem_cronologica(con: duckdb.DuckDBPyConnection) -> None:
    sql = f"""
        SELECT count(*) FROM (
            SELECT data_compra < lag(data_compra) OVER (ORDER BY pedido_sk) AS volta
            FROM (SELECT DISTINCT pedido_sk, data_compra FROM {FATO})
        ) WHERE volta
    """
    assert um(con, sql) == 0


def test_meta_json() -> None:
    meta = json.loads((DADOS / "meta.json").read_text(encoding="utf-8"))
    assert meta["data_ancora"] == "2018-08-31"
    assert meta["periodo"] == {"de": "2016-09-04", "ate": "2018-09-03"}
    assert meta["linhas"]["fato_itens"] == 112_101
    assert date.fromisoformat(meta["data_ancora"]) <= date.fromisoformat(meta["periodo"]["ate"])
