"""Baixa os CSVs públicos da Olist para ./dados e confere a integridade (SHA-256).

Fonte: repositório oficial da Olist no GitHub (mesmos arquivos do Kaggle
"Brazilian E-Commerce Public Dataset by Olist"), fixado num commit para que o
download seja sempre igual. Licença dos dados: CC BY-NC-SA 4.0.

Uso:
    python scripts/baixar_dados.py              # baixa o que falta e confere tudo
    python scripts/baixar_dados.py --verificar  # só confere os arquivos que já estão em ./dados

Se os CSVs já vieram do Kaggle, rode com --verificar: um hash diferente não é
erro (o arquivo pode ter outra quebra de linha); quem decide se os dados batem
é o preparar_dados.py, que confere os totais com o Power BI.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_DADOS = RAIZ / "dados"

COMMIT_OLIST = "d9e49802f3e92d09ee94ab9ccc5e457f207a8959"
URL_BASE = f"https://raw.githubusercontent.com/olist/work-at-olist-data/{COMMIT_OLIST}/datasets"

# geolocation fica de fora de propósito (não é usado no projeto).
ARQUIVOS: dict[str, str] = {
    "olist_customers_dataset.csv": "c26c17f59f3027a6a0dbeb8f1fa373c38f3323ecc84f225a8f4820e5bb288df8",
    "olist_order_items_dataset.csv": "4f6abdbbc94036d0df4a76fa0520c072e31a40119d70f7f370fba1e2285d2bcb",
    "olist_order_payments_dataset.csv": "61674868ed7b872aac3dcd95bf774448a88f6426b183f21be55f75af021ffdec",
    "olist_order_reviews_dataset.csv": "012b61c7593e34f51fa614efdf802b9c7056ce6aae5307ddb93236e7cfc797d7",
    "olist_orders_dataset.csv": "8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf",
    "olist_products_dataset.csv": "3e6569628a17fbc75fd206ee357b59e20364b9afa90f5b6cd5b4d624c58aa9cc",
    "olist_sellers_dataset.csv": "31eb9bd50d684526a78f2389413ce61841e97692de7b828fe7d956b534586312",
    "product_category_name_translation.csv": "a81f0d1f27b27e7293f761bc79e3ce8f348ee39c4b3ed3e49bde38f478586278",
}


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def baixar(nome: str, destino: Path) -> None:
    url = f"{URL_BASE}/{nome}"
    temporario = destino.with_suffix(".parcial")
    with urllib.request.urlopen(url, timeout=120) as resposta, temporario.open("wb") as f:
        while bloco := resposta.read(1 << 20):
            f.write(bloco)
    temporario.replace(destino)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verificar", action="store_true", help="não baixa nada; só confere os hashes")
    args = parser.parse_args()

    PASTA_DADOS.mkdir(exist_ok=True)
    divergentes = 0
    faltando = 0
    for nome, esperado in ARQUIVOS.items():
        caminho = PASTA_DADOS / nome
        if not caminho.exists():
            if args.verificar:
                print(f"[falta]     {nome}")
                faltando += 1
                continue
            print(f"[baixando]  {nome}")
            baixar(nome, caminho)
        atual = sha256(caminho)
        if atual == esperado:
            print(f"[ok]        {nome}")
        else:
            print(f"[diferente] {nome}  (sha256 {atual[:12]}..., esperado {esperado[:12]}...)")
            divergentes += 1

    if faltando:
        print(f"\n{faltando} arquivo(s) faltando. Rode sem --verificar para baixar.")
        return 1
    if divergentes:
        print(
            f"\n{divergentes} arquivo(s) com hash diferente do repositório oficial. "
            "Não é necessariamente erro: rode o preparar_dados.py, que confere os totais."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
