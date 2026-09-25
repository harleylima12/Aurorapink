"""O arquivo provisório .duckdb tem exatamente os mesmos dados do Parquet (D17)."""

from pathlib import Path

import duckdb
import pytest

DADOS = Path(__file__).resolve().parents[2] / "public" / "data"
PROVISORIO = DADOS / "provisorio" / "fato_itens.duckdb"

pytestmark = pytest.mark.skipif(not PROVISORIO.exists(), reason="rode scripts/gerar_duckdb_provisorio.py")


def test_mesmas_linhas_que_o_parquet() -> None:
    con = duckdb.connect()
    con.execute(f"ATTACH '{PROVISORIO.as_posix()}' AS p (READ_ONLY)")
    parquet = f"read_parquet('{(DADOS / 'fato_itens.parquet').as_posix()}')"
    diferencas = con.sql(
        f"SELECT count(*) FROM ((SELECT * FROM p.fato_itens EXCEPT ALL SELECT * FROM {parquet})"
        f" UNION ALL (SELECT * FROM {parquet} EXCEPT ALL SELECT * FROM p.fato_itens))"
    ).fetchone()
    assert diferencas == (0,)
    assert con.sql("SELECT count(*) FROM p.fato_itens").fetchone() == (112_101,)


def test_formato_legivel_pelo_motor_do_navegador() -> None:
    con = duckdb.connect(PROVISORIO.as_posix(), read_only=True)
    tags = con.sql("SELECT tags FROM duckdb_databases() WHERE NOT internal AND database_name <> 'temp'").fetchall()
    assert any(t[0].get("storage_version") == "v1.0.0+" for t in tags)
