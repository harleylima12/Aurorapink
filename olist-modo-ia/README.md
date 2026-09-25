# olist-modo-ia

Dashboard da base pública da Olist com **Modo IA 100% local** (WebLLM + DuckDB-WASM, nada sai do computador) e
**Modo Universal** (arraste qualquer planilha CSV/Excel). Projeto de portfólio em construção, por fases.

> O README completo (arquitetura, GIF, benchmark) chega na Fase 8. Especificação em
> [`docs/PROMPT_ORIGINAL.md`](docs/PROMPT_ORIGINAL.md); plano em [`docs/FASE0_PLANO.md`](docs/FASE0_PLANO.md);
> decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## Estado

| Fase | Situação |
|---|---|
| 0. Plano | ✅ aprovado |
| 1. Dados | ✅ Parquet gerado e conferido com o Power BI: [`dados/validacao.md`](dados/validacao.md) |
| 2 a 8 | a fazer |

## Fase 1: preparar os dados

Requer Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate             # Windows (PowerShell): .venv\Scripts\Activate.ps1
pip install -r scripts/requirements.txt
python scripts/baixar_dados.py        # baixa o que faltar em ./dados e confere o SHA-256 (--verificar só confere)
python scripts/preparar_dados.py      # gera public/data/*.parquet, meta.json e dados/validacao.md
python -m pytest tests/dados -q       # 55 testes
```

O `preparar_dados.py` termina com erro se os totais não baterem com o Power BI (faturamento R$ 13.494.400,74 ·
98.199 pedidos · ticket médio R$ 137,42 · 94.983 clientes únicos).

## Dados e licença

Os dados são do [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
(também em [olist/work-at-olist-data](https://github.com/olist/work-at-olist-data)), licença
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): uso não comercial, com atribuição, e obras
derivadas sob a mesma licença. Os arquivos de `public/data/` são uma derivação desses dados e seguem a mesma licença.
Os CSVs originais não são versionados. A lista de municípios usada para pôr acento nas cidades vem do IBGE, via
[kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (MIT).
