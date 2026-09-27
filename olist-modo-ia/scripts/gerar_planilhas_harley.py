"""Recria, com dados FICTÍCIOS, os tipos de planilha que o Harley usa no dia a dia (Fase 5C).

Não são os arquivos reais dele: são imitações a partir da descrição (mesmos formatos e armadilhas), para testar
tema, papéis e gráficos. Semente fixa. Saída: evals/planilhas/harley/ + esperado.json (tema esperado ESCRITO
ANTES de rodar o detector, como na Fase 5B).

  aulas_violino.xlsx        Excel com linha de título e linha TOTAL           -> educação
  projetos_sites.csv        ";" + Latin-1 + "R$ 1.234,56" + status em etapas -> vendas (funil)
  afiliado_shopee.csv       colunas em inglês                                 -> vendas ou marketing
  clinica_odonto.csv        telefone e e-mail (mascarados), data com hora     -> saúde
  loja_musica_clientes.csv  +  loja_musica_vendas.csv (2 arquivos ligados)    -> vendas
  estoque_baguncado.csv     títulos, linhas vazias e subtotais                -> estoque
  treinos_academia.csv      nada de negócio                                   -> genérico

Uso: .venv/bin/python scripts/gerar_planilhas_harley.py   (precisa do openpyxl)
"""
from __future__ import annotations

import csv
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "evals" / "planilhas" / "harley"
rnd = random.Random(20260928)

NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Íris", "João", "Karina", "Lucas", "Marina", "Nicolas", "Olívia", "Paulo"]
SOBRENOMES = ["Silva", "Souza", "Lima", "Araújo", "Ferreira", "Gomes", "Ribeiro", "Martins", "Carvalho", "Rocha"]


def nome() -> str:
    return f"{rnd.choice(NOMES)} {rnd.choice(SOBRENOMES)}"


def brl(v: float) -> str:
    inteiro, dec = f"{v:,.2f}".split(".")
    return f"R$ {inteiro.replace(',', '.')},{dec}"


def dia(inicio: date, dias: int) -> date:
    return inicio + timedelta(days=rnd.randrange(dias))


def escrever_csv(nome_arq: str, cab: list[str], linhas: list[list[object]], sep: str = ",", codificacao: str = "utf-8", antes: list[str] | None = None) -> None:
    with open(PASTA / nome_arq, "w", newline="", encoding=codificacao) as f:
        for linha in antes or []:
            f.write(linha + "\n")
        w = csv.writer(f, delimiter=sep)
        w.writerow(cab)
        w.writerows(linhas)


def aulas_violino() -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Aulas"
    ws.append(["Controle de Aulas de Violino - 2024"])
    ws.append([])
    ws.append(["Aluno", "Data da Aula", "Nível", "Professor", "Duração (min)", "Valor da Aula", "Presença", "Nota da Avaliação"])
    total = 0.0
    alunos = [nome() for _ in range(14)]
    for _ in range(220):
        valor = rnd.choice([90.0, 120.0, 150.0])
        presente = rnd.random() > 0.12
        total += valor if presente else 0
        ws.append([
            rnd.choice(alunos),
            dia(date(2024, 2, 1), 300),
            rnd.choice(["Iniciante", "Intermediário", "Avançado"]),
            rnd.choice(["Prof. Harley", "Prof. Marina"]),
            rnd.choice([45, 60]),
            valor,
            "Presente" if presente else "Faltou",
            round(rnd.uniform(5, 10), 1) if presente else None,
        ])
    ws.append(["TOTAL", None, None, None, None, total, None, None])
    wb.save(PASTA / "aulas_violino.xlsx")


def projetos_sites() -> None:
    etapas = ["Orçamento", "Aprovado", "Em desenvolvimento", "Em revisão", "Entregue"]
    linhas = []
    for i in range(140):
        status = rnd.choices(etapas + ["Cancelado"], weights=[18, 14, 12, 8, 40, 8])[0]
        valor = rnd.choice([1500, 2800, 4500, 7900, 12000]) * rnd.uniform(0.9, 1.2)
        linhas.append([f"PRJ-{300 + i}", nome(), rnd.choice(["Landing page", "Institucional", "E-commerce", "Blog"]), status, brl(valor), dia(date(2024, 1, 1), 330).strftime("%d/%m/%Y"), rnd.randint(10, 90)])
    escrever_csv("projetos_sites.csv", ["Nº Pedido", "Cliente", "Tipo de Site", "Status", "Valor do Projeto", "Data do Pedido", "Prazo (dias)"], linhas, sep=";", codificacao="latin-1")


def afiliado_shopee() -> None:
    linhas = []
    for i in range(260):
        preco = round(rnd.uniform(19, 399), 2)
        qtd = rnd.randint(1, 3)
        linhas.append([
            f"SH{880000 + i}",
            dia(date(2024, 3, 1), 240).isoformat(),
            rnd.choice(["Fone Bluetooth", "Capinha", "Garrafa térmica", "Luminária LED", "Tapete de yoga", "Mochila"]),
            rnd.choice(["Electronics", "Home", "Sports", "Accessories"]),
            preco,
            qtd,
            round(preco * qtd * rnd.choice([0.03, 0.05, 0.08]), 2),
            rnd.choice(["Instagram", "TikTok", "WhatsApp", "YouTube"]),
            rnd.choices(["Completed", "Pending", "Cancelled"], weights=[75, 15, 10])[0],
        ])
    escrever_csv("afiliado_shopee.csv", ["Order ID", "Order Date", "Product Name", "Category", "Price", "Quantity", "Commission", "Channel", "Order Status"], linhas)


def clinica_odonto() -> None:
    linhas = []
    pacientes = [(nome(), f"({rnd.randint(11, 99)}) 9{rnd.randint(1000, 9999)}-{rnd.randint(1000, 9999)}") for _ in range(90)]
    for _ in range(420):
        p, tel = rnd.choice(pacientes)
        quando = datetime.combine(dia(date(2024, 1, 2), 300), datetime.min.time()) + timedelta(hours=rnd.choice([8, 9, 10, 11, 14, 15, 16, 17, 18]), minutes=rnd.choice([0, 30]))
        email = p.split()[0].lower().replace("í", "i").replace("á", "a").replace("é", "e") + "@exemplo.com"
        linhas.append([
            p, tel, email, quando.strftime("%d/%m/%Y %H:%M"),
            rnd.choice(["Limpeza", "Restauração", "Canal", "Extração", "Clareamento", "Avaliação"]),
            rnd.choice(["Dra. Paula", "Dr. Renato", "Dra. Sônia"]),
            rnd.choice(["Particular", "Odontoprev", "Amil Dental", "SulAmérica"]),
            brl(rnd.choice([150, 220, 380, 650, 900])),
            rnd.choices(["Compareceu", "Faltou"], weights=[85, 15])[0],
        ])
    escrever_csv("clinica_odonto.csv", ["Paciente", "Telefone", "E-mail", "Data da Consulta", "Procedimento", "Dentista", "Convênio", "Valor", "Status"], linhas, sep=";")


def loja_musica() -> None:
    clientes = [[f"C{100 + i}", nome(), rnd.choice(["São Paulo", "Campinas", "Santos", "Curitiba"]), rnd.choice(["SP", "PR"]), rnd.choice(["Violino", "Violão", "Bateria", "Teclado"])] for i in range(60)]
    escrever_csv("loja_musica_clientes.csv", ["ID Cliente", "Nome", "Cidade", "UF", "Instrumento Favorito"], clientes)
    vendas = []
    for i in range(380):
        cat, prod, preco = rnd.choice([("Cordas", "Jogo de cordas", 89.9), ("Cordas", "Violino 4/4", 1890.0), ("Percussão", "Baqueta", 49.9), ("Sopro", "Flauta doce", 79.9), ("Acessórios", "Afinador", 119.0), ("Acessórios", "Estante de partitura", 159.0)])
        qtd = rnd.randint(1, 3)
        vendas.append([f"V{5000 + i}", dia(date(2024, 1, 1), 330).strftime("%d/%m/%Y"), rnd.choice(clientes)[0], prod, cat, qtd, brl(preco * qtd)])
    escrever_csv("loja_musica_vendas.csv", ["Nº Venda", "Data da Venda", "ID Cliente", "Produto", "Categoria", "Quantidade", "Valor Total"], vendas)


def estoque_baguncado() -> None:
    antes = ["ESTOQUE LOJA - CONFERÊNCIA MENSAL,,,,,", "(atualizado à mão, não apagar!),,,,,", ",,,,,"]
    linhas: list[list[object]] = []
    for cat, itens in [("Cordas", ["Encordoamento violino", "Encordoamento violão", "Corda Lá avulsa"]), ("Acessórios", ["Breu", "Espaleira", "Surdina", "Afinador"]), ("Percussão", ["Baqueta 5A", "Pele 14\""])]:
        soma = 0
        for j, item in enumerate(itens * 3):
            atual = rnd.randint(0, 60)
            minimo = rnd.choice([5, 10, 15, 20])
            soma += atual
            linhas.append([f"{cat[:3].upper()}-{j:03d}", f"{item} {j // len(itens) + 1}", cat, atual, minimo, f"{rnd.uniform(8, 120):.2f}".replace(".", ",")])
        linhas.append(["", f"Subtotal {cat}", "", soma, "", ""])
        linhas.append(["", "", "", "", "", ""])
    escrever_csv("estoque_baguncado.csv", ["Código", "Item", "Categoria", "Qtd em Estoque", "Estoque Mínimo", "Custo Unit."], linhas, antes=antes)


def treinos_academia() -> None:
    linhas = []
    for _ in range(200):
        linhas.append([dia(date(2024, 1, 1), 200).isoformat(), rnd.choice(["Supino", "Agachamento", "Remada", "Leg press", "Rosca"]), rnd.randint(3, 5), rnd.randint(8, 15), rnd.choice([20, 30, 40, 60, 80]), rnd.randint(30, 75)])
    escrever_csv("treinos_academia.csv", ["Data", "Exercício", "Séries", "Repetições", "Carga (kg)", "Duração (min)"], linhas)


# Tema esperado, escrito ANTES de rodar o detector. "aceitos" = mais de uma resposta razoável (dito pelo Harley).
ESPERADO = {
    "aulas_violino.xlsx": {"tema": "educacao"},
    "projetos_sites.csv": {"tema": "vendas"},
    "afiliado_shopee.csv": {"tema": "vendas", "aceitos": ["vendas", "marketing"]},
    "clinica_odonto.csv": {"tema": "saude"},
    "loja_musica_vendas.csv": {"tema": "vendas"},
    "estoque_baguncado.csv": {"tema": "estoque"},
    "treinos_academia.csv": {"tema": "generico"},
}


def main() -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    aulas_violino()
    projetos_sites()
    afiliado_shopee()
    clinica_odonto()
    loja_musica()
    estoque_baguncado()
    treinos_academia()
    (PASTA / "esperado.json").write_text(json.dumps(ESPERADO, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(list(PASTA.iterdir()))} arquivos em {PASTA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
