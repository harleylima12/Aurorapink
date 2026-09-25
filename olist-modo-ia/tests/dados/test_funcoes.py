"""Testes das funções puras do preparar_dados.py (não precisam dos CSVs)."""

import csv
from datetime import date

import pytest

import preparar_dados as p


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("São Paulo", "sao paulo"),
        ("Santa Bárbara d'Oeste", "santa barbara d oeste"),
        ("santa barbara d oeste", "santa barbara d oeste"),
        ("Mogi-Guaçu", "mogi guacu"),
        ("  rio   de janeiro ", "rio de janeiro"),
    ],
)
def test_normalizar_nome(entrada: str, esperado: str) -> None:
    assert p.normalizar_nome(entrada) == esperado


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("rio de janeiro", "Rio de Janeiro"),
        ("santa barbara d'oeste", "Santa Barbara d'Oeste"),
        ("mogi-guacu", "Mogi-Guacu"),
        ("pingo-d'agua", "Pingo-d'Agua"),
        ("nao-me-toque", "Nao-Me-Toque"),
        ("dias d'avila", "Dias d'Avila"),
        ("e", "E"),  # partícula no início continua maiúscula
    ],
)
def test_titulo_cidade(entrada: str, esperado: str) -> None:
    assert p.titulo_cidade(entrada) == esperado


def test_mapear_cidades_usa_ibge_e_cai_para_title_case() -> None:
    municipios = [("São Paulo", "SP"), ("Santa Bárbara d'Oeste", "SP"), ("Bom Jesus", "GO"), ("Bom Jesus", "PI")]
    pares = [
        ("sao paulo", "SP"),
        ("santa barbara d oeste", "SP"),
        ("santa barbara d'oeste", "SP"),
        ("bom jesus", "PI"),
        ("sao paulo", "RJ"),  # mesma cidade, UF errada: não pode casar
        ("piumhii", "MG"),
    ]
    mapa = p.mapear_cidades(pares, municipios)
    assert mapa[("sao paulo", "SP")] == ("São Paulo", True)
    assert mapa[("santa barbara d oeste", "SP")] == ("Santa Bárbara d'Oeste", True)
    assert mapa[("santa barbara d'oeste", "SP")] == ("Santa Bárbara d'Oeste", True)
    assert mapa[("bom jesus", "PI")] == ("Bom Jesus", True)
    assert mapa[("sao paulo", "RJ")] == ("Sao Paulo", False)
    assert mapa[("piumhii", "MG")] == ("Piumhii", False)


@pytest.mark.parametrize(
    ("dia", "esperado"),
    [
        (date(2018, 8, 1), date(2018, 8, 31)),
        (date(2018, 2, 15), date(2018, 2, 28)),
        (date(2016, 2, 1), date(2016, 2, 29)),
        (date(2017, 12, 31), date(2017, 12, 31)),
    ],
)
def test_ultimo_dia_do_mes(dia: date, esperado: date) -> None:
    assert p.ultimo_dia_do_mes(dia) == esperado


def test_ancora_ignora_ultimo_mes_quase_vazio() -> None:
    # Formato da Olist: meses cheios e um último mês com 1 pedido.
    volume = [(date(2018, m, 1), 6000 + m) for m in range(1, 9)] + [(date(2018, 9, 1), 1)]
    assert p.data_ancora(volume) == date(2018, 8, 31)


def test_ancora_usa_ultimo_mes_quando_ele_tem_volume() -> None:
    volume = [(date(2020, m, 1), 100) for m in range(1, 7)]
    assert p.data_ancora(volume) == date(2020, 6, 30)


def test_ancora_limite_de_10_por_cento() -> None:
    base = [(date(2021, m, 1), 1000) for m in range(1, 11)]
    assert p.data_ancora([*base, (date(2021, 11, 1), 100)]) == date(2021, 11, 30)  # exatamente 10%: conta
    assert p.data_ancora([*base, (date(2021, 11, 1), 99)]) == date(2021, 10, 31)


def test_ancora_nao_depende_da_ordem_de_entrada() -> None:
    volume = [(date(2019, 3, 1), 50), (date(2019, 1, 1), 50), (date(2019, 2, 1), 50)]
    assert p.data_ancora(volume) == date(2019, 3, 31)


def test_ancora_sem_dados() -> None:
    with pytest.raises(ValueError):
        p.data_ancora([])


def test_formatacao_brasileira() -> None:
    assert p.brl(13_494_400.74) == "R$ 13.494.400,74"
    assert p.inteiro(98_199) == "98.199"
    assert p.decimal_br(4.1167, 2) == "4,12"
    assert p.pct(0.0679) == "6,8%"


def test_categorias_csv_sem_repeticao_e_sem_nome_cru() -> None:
    with (p.REFERENCIA / "categorias.csv").open(encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    originais = [l["categoria_original"] for l in linhas]
    amigaveis = [l["categoria"] for l in linhas]
    assert len(linhas) == 73
    assert len(set(originais)) == len(originais)
    assert len(set(amigaveis)) == len(amigaveis)
    assert all(nome and "_" not in nome and nome == nome.strip() for nome in amigaveis)
    assert dict(zip(originais, amigaveis))["cama_mesa_banho"] == "Cama, Mesa e Banho"
    assert p.SEM_CATEGORIA not in amigaveis
