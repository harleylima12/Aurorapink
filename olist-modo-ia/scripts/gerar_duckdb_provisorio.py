"""PROVISÓRIO: copia o fato_itens.parquet para um arquivo de banco do DuckDB (.duckdb).

Uso:
    python scripts/gerar_duckdb_provisorio.py      # depois do preparar_dados.py

Por que existe (docs/DECISOES.md, D15 e D17):
    O DuckDB-WASM 1.32.0 não tem leitor de Parquet embutido. O caminho final é o
    app servir a extensão `parquet` (npm run baixar-extensoes). Enquanto ela não
    foi baixada, o app usa este arquivo .duckdb, que o DuckDB lê sem extensão
    nenhuma. Os dados são exatamente os mesmos do Parquet (o teste
    tests/dados/test_provisorio.py confere).

Quando apagar: quando o caminho do Parquet estiver validado no PC do Harley e
ele decidir não manter o .duckdb como plano B (Fase 6).
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parent.parent
PARQUET = RAIZ / "public" / "data" / "fato_itens.parquet"
DESTINO = RAIZ / "public" / "data" / "provisorio" / "fato_itens.duckdb"

# Formato de arquivo que o motor do DuckDB-WASM 1.32.0 (v1.4.3) consegue ler.
VERSAO_ARMAZENAMENTO = "v1.0.0"


def gerar(parquet: Path = PARQUET, destino: Path = DESTINO) -> int:
    if not parquet.exists():
        raise SystemExit(f"{parquet} não existe. Rode antes: python scripts/preparar_dados.py")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.unlink(missing_ok=True)
    con = duckdb.connect()
    alvo = destino.as_posix().replace("'", "''")
    origem = parquet.as_posix().replace("'", "''")
    con.execute(f"ATTACH '{alvo}' AS provisorio (STORAGE_VERSION '{VERSAO_ARMAZENAMENTO}')")
    con.execute(
        f"CREATE TABLE provisorio.fato_itens AS "
        f"SELECT * FROM read_parquet('{origem}') ORDER BY pedido_sk, order_item_id"
    )
    linhas = con.sql("SELECT count(*) FROM provisorio.fato_itens").fetchone()
    con.execute("DETACH provisorio")
    con.close()
    return int(linhas[0]) if linhas else 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    linhas = gerar()
    print(f"PROVISÓRIO: {DESTINO} ({DESTINO.stat().st_size / 1e6:.2f} MB, {linhas} linhas, formato {VERSAO_ARMAZENAMENTO})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
