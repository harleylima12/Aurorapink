"""Planilhas de teste POR TEMA (Fase 5B) em evals/planilhas/temas/ + exemplos da tela inicial em public/exemplos/.

O tema esperado de cada planilha foi escrito ANTES do detector de tema existir (docs/DECISOES.md, D53).
Dados 100% fictícios, determinísticos (semente fixa). Nomes de pessoas são combinações aleatórias de nomes
comuns; não há dado pessoal real.

    python scripts/gerar_planilhas_temas.py
"""

from __future__ import annotations

import json
import random
import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

from gerar_planilhas_teste import NOMES, SOBRENOMES, br, cpf, email, escrever_csv, nome, telefone

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "evals" / "planilhas" / "temas"
EXEMPLOS = RAIZ / "public" / "exemplos"

UFS = ["SP", "RJ", "MG", "RS", "PR", "BA", "PE", "SC", "GO", "CE"]


def dia(r: random.Random, inicio: date, dias: int) -> date:
    return inicio + timedelta(days=r.randint(0, dias))


# --- Vendas -----------------------------------------------------------------------------------------------
def pedidos_loja(r: random.Random, n: int = 900) -> list[list[str]]:
    produtos = {"Eletrônicos": ["Fone sem fio", "Carregador turbo", "Smartwatch"], "Casa": ["Jogo de panelas", "Luminária", "Toalha"],
                "Moda": ["Camiseta", "Tênis", "Mochila"], "Beleza": ["Perfume", "Hidratante"], "Esporte": ["Garrafa", "Tapete de yoga"]}
    linhas = [["Pedido", "Data do Pedido", "Produto", "Categoria", "Qtd", "Preço Unitário", "Frete", "Total do Pedido", "UF", "Status do Pedido", "ID Cliente"]]
    for i in range(n):
        cat = r.choice(list(produtos))
        q = r.choice([1, 1, 2, 3])
        p = round(r.uniform(20, 600), 2)
        f = round(r.uniform(0, 45), 2)
        linhas.append([f"#{50000 + i}", dia(r, date(2024, 1, 1), 360).strftime("%d/%m/%Y"), r.choice(produtos[cat]), cat, str(q), br(p), br(f),
                       br(q * p + f), r.choice(UFS), r.choice(["Entregue", "Entregue", "Enviado", "Cancelado"]), f"CLI{r.randint(1000, 1400)}"])
    return linhas


# --- Financeiro -------------------------------------------------------------------------------------------
def fluxo_caixa(r: random.Random, n: int = 400) -> list[list[str]]:
    cats_entrada = ["Vendas", "Serviços", "Rendimentos"]
    cats_saida = ["Aluguel", "Folha", "Fornecedores", "Impostos", "Marketing", "Energia"]
    linhas = [["Data", "Descrição", "Categoria", "Tipo", "Valor", "Conta", "Forma de Pagamento"]]
    for _ in range(n):
        entrada = r.random() < 0.45
        cat = r.choice(cats_entrada if entrada else cats_saida)
        linhas.append([dia(r, date(2024, 1, 1), 360).strftime("%d/%m/%Y"), f"{cat} - lançamento", cat, "Entrada" if entrada else "Saída",
                       br(r.uniform(300, 25000) if entrada else r.uniform(100, 9000)), r.choice(["Conta Corrente", "Caixa", "Poupança"]),
                       r.choice(["PIX", "Boleto", "Transferência", "Cartão"])])
    return linhas


def contas_pagar(r: random.Random, n: int = 250) -> list[list[str]]:
    linhas = [["Fornecedor", "Vencimento", "Valor", "Pago em", "Status", "Centro de Custo", "Nº Documento"]]
    for i in range(n):
        venc = dia(r, date(2024, 1, 1), 330)
        pago = r.random() < 0.7
        linhas.append([r.choice(["Alfa Ltda", "Beta Serviços", "Gama Energia", "Delta Aluguéis", "Épsilon TI"]), venc.strftime("%d/%m/%Y"),
                       br(r.uniform(200, 15000)), (venc + timedelta(days=r.randint(-5, 10))).strftime("%d/%m/%Y") if pago else "",
                       "Pago" if pago else "Em aberto", r.choice(["Administrativo", "Comercial", "Produção", "TI"]), f"NF-{7000 + i}"])
    return linhas


# --- RH -----------------------------------------------------------------------------------------------------
def folha(r: random.Random, n: int = 180) -> list[list[str]]:
    linhas = [["Matrícula", "Nome", "Cargo", "Departamento", "Salário Base", "Horas Extras", "Descontos", "Salário Líquido", "Competência"]]
    for i in range(n):
        base = round(r.uniform(1800, 16000), 2)
        he = round(r.uniform(0, 1200), 2)
        desc = round(base * r.uniform(0.08, 0.27), 2)
        linhas.append([str(10000 + i), nome(r), r.choice(["Analista", "Assistente", "Coordenador", "Gerente", "Técnico"]),
                       r.choice(["Comercial", "Financeiro", "TI", "Operações", "Pessoas"]), br(base), br(he), br(desc), br(base + he - desc),
                       f"{r.randint(1, 12):02d}/2024"])
    return linhas


def turnover(r: random.Random, n: int = 150) -> list[list[str]]:
    linhas = [["ID Funcionário", "Data de Admissão", "Data de Desligamento", "Motivo do Desligamento", "Área", "Gestor", "Tempo de Casa (meses)"]]
    for i in range(n):
        adm = dia(r, date(2018, 1, 1), 2000)
        saiu = r.random() < 0.4
        desl = adm + timedelta(days=r.randint(60, 1500))
        linhas.append([f"F{3000 + i}", adm.isoformat(), desl.isoformat() if saiu else "", r.choice(["Pedido de demissão", "Dispensa", "Fim de contrato"]) if saiu else "",
                       r.choice(["Vendas", "Tecnologia", "Logística", "Financeiro"]), nome(r), str(r.randint(2, 80))])
    return linhas


# --- Estoque ------------------------------------------------------------------------------------------------
def movimentacao(r: random.Random, n: int = 500) -> list[list[str]]:
    linhas = [["Data", "SKU", "Produto", "Tipo de Movimento", "Quantidade", "Armazém", "Lote", "Validade"]]
    for _ in range(n):
        d = dia(r, date(2024, 1, 1), 300)
        linhas.append([d.isoformat(), f"SKU-{r.randint(100, 160)}", r.choice(["Parafuso 5mm", "Cabo 2m", "Tinta branca 18L", "Luva nitrílica", "Fita isolante"]),
                       r.choice(["Entrada", "Saída", "Saída", "Ajuste"]), str(r.randint(1, 300)), r.choice(["CD Sul", "CD Norte", "Loja 01"]),
                       f"L{r.randint(100, 999)}", (d + timedelta(days=r.randint(90, 720))).isoformat()])
    return linhas


def inventario_en(r: random.Random, n: int = 120) -> list[list[str]]:
    linhas = [["Item Code", "Description", "On Hand", "Reorder Point", "Unit Cost", "Warehouse", "Supplier", "Last Count"]]
    for i in range(n):
        linhas.append([f"IT-{4000 + i}", f"Part model {chr(65 + i % 26)}{i}", str(r.randint(0, 900)), str(r.choice([20, 50, 100])),
                       f"{r.uniform(1, 250):.2f}", r.choice(["WH-A", "WH-B"]), r.choice(["Acme Corp", "Globex", "Initech"]),
                       dia(r, date(2024, 6, 1), 90).isoformat()])
    return linhas


# --- Marketing ----------------------------------------------------------------------------------------------
def campanhas(r: random.Random, n: int = 300) -> list[list[str]]:
    linhas = [["Data", "Campanha", "Canal", "Investimento", "Impressões", "Cliques", "Conversões", "Receita Atribuída"]]
    for _ in range(n):
        imp = r.randint(2000, 90000)
        cli = int(imp * r.uniform(0.005, 0.05))
        conv = int(cli * r.uniform(0.01, 0.12))
        linhas.append([dia(r, date(2024, 1, 1), 300).strftime("%d/%m/%Y"), r.choice(["Black Friday", "Dia das Mães", "Volta às Aulas", "Institucional"]),
                       r.choice(["Google Ads", "Meta Ads", "E-mail", "TikTok"]), br(r.uniform(100, 5000)), str(imp), str(cli), str(conv), br(conv * r.uniform(80, 400))])
    return linhas


def leads(r: random.Random, n: int = 400) -> list[list[str]]:
    linhas = [["Data de Captura", "utm_source", "utm_campaign", "Lead ID", "Status do Lead", "Lead Score"]]
    for i in range(n):
        linhas.append([dia(r, date(2024, 3, 1), 200).isoformat(), r.choice(["google", "instagram", "newsletter", "linkedin"]),
                       r.choice(["promo_outono", "webinar_dados", "ebook_bi"]), f"LD-{9000 + i}", r.choice(["Novo", "Qualificado", "Oportunidade", "Perdido"]),
                       str(r.randint(0, 100))])
    return linhas


# --- Atendimento ------------------------------------------------------------------------------------------
def tickets(r: random.Random, n: int = 350) -> list[list[str]]:
    linhas = [["Ticket", "Abertura", "Fechamento", "Prioridade", "Categoria", "Agente", "Status", "CSAT", "Tempo de Primeira Resposta (min)"]]
    for i in range(n):
        ab = datetime(2024, 1, 1) + timedelta(minutes=r.randint(0, 400000))
        fechado = r.random() < 0.8
        linhas.append([f"TK-{20000 + i}", ab.strftime("%d/%m/%Y %H:%M"), (ab + timedelta(hours=r.randint(1, 96))).strftime("%d/%m/%Y %H:%M") if fechado else "",
                       r.choice(["Baixa", "Média", "Alta", "Urgente"]), r.choice(["Cobrança", "Acesso", "Bug", "Dúvida"]), r.choice(["Ana", "Bruno", "Carla", "Diego"]),
                       "Resolvido" if fechado else r.choice(["Aberto", "Em andamento"]), str(r.randint(1, 5)) if fechado else "", str(r.randint(1, 600))])
    return linhas


# --- Educação -------------------------------------------------------------------------------------------------
def notas_turma(r: random.Random, n: int = 300) -> list[list[str]]:
    linhas = [["Matrícula do Aluno", "Turma", "Disciplina", "Nota 1", "Nota 2", "Média", "Faltas", "Frequência (%)", "Situação"]]
    for i in range(n):
        n1, n2 = round(r.uniform(2, 10), 1), round(r.uniform(2, 10), 1)
        m = round((n1 + n2) / 2, 1)
        linhas.append([f"A{2024000 + i}", r.choice(["1º A", "1º B", "2º A", "3º A"]), r.choice(["Matemática", "Português", "História", "Física"]),
                       br(n1, 1), br(n2, 1), br(m, 1), str(r.randint(0, 20)), str(r.randint(60, 100)), "Aprovado" if m >= 6 else "Recuperação"])
    return linhas


# --- Saúde --------------------------------------------------------------------------------------------------
def clinica(r: random.Random, n: int = 400) -> list[list[str]]:
    linhas = [["Paciente", "CPF do Paciente", "Data da Consulta", "Especialidade", "Médico", "Procedimento", "CID", "Convênio", "Valor da Consulta", "Retorno"]]
    for _ in range(n):
        linhas.append([nome(r), cpf(r), dia(r, date(2024, 1, 1), 330).strftime("%d/%m/%Y"), r.choice(["Cardiologia", "Pediatria", "Dermatologia", "Ortopedia"]),
                       f"Dr(a). {r.choice(SOBRENOMES)}", r.choice(["Consulta", "Retorno", "Eletrocardiograma", "Curativo"]),
                       r.choice(["I10", "J06.9", "L20.9", "M54.5", "E11.9"]), r.choice(["Particular", "Unimed", "Bradesco Saúde", "SUS"]),
                       br(r.uniform(90, 600)), r.choice(["Sim", "Não"])])
    return linhas


def exames(r: random.Random, n: int = 300) -> list[list[str]]:
    linhas = [["ID Paciente", "Data de Coleta", "Exame", "Resultado", "Unidade", "Valor de Referência", "Laboratório"]]
    for _ in range(n):
        ex, un, ref = r.choice([("Glicemia", "mg/dL", "70-99"), ("Colesterol total", "mg/dL", "<190"), ("Hemoglobina", "g/dL", "12-17")])
        linhas.append([f"P{r.randint(100, 260)}", dia(r, date(2024, 2, 1), 200).isoformat(), ex, f"{r.uniform(60, 250):.1f}", un, ref,
                       r.choice(["Lab Central", "Lab Vida"])])
    return linhas


# --- Genérico -----------------------------------------------------------------------------------------------
def sensores(r: random.Random, n: int = 400) -> list[list[str]]:
    linhas = [["Timestamp", "Sensor", "Temperatura", "Umidade", "Bateria (%)"]]
    for _ in range(n):
        t = datetime(2024, 5, 1) + timedelta(minutes=r.randint(0, 60000))
        linhas.append([t.strftime("%Y-%m-%d %H:%M"), r.choice(["S-01", "S-02", "S-03"]), f"{r.uniform(15, 32):.1f}", f"{r.uniform(30, 90):.0f}", str(r.randint(10, 100))])
    return linhas


def livros(r: random.Random, n: int = 150) -> list[list[str]]:
    linhas = [["Título", "Autor", "Ano", "Páginas", "Gênero", "Lido"]]
    for i in range(n):
        linhas.append([f"Livro {i}", f"{r.choice(NOMES)} {r.choice(SOBRENOMES)}", str(r.randint(1950, 2024)), str(r.randint(90, 900)),
                       r.choice(["Romance", "Ficção científica", "Biografia", "Poesia"]), r.choice(["Sim", "Não"])])
    return linhas


PLANILHAS = {
    # arquivo: (função, tema esperado, separador)
    "pedidos_loja_virtual.csv": (pedidos_loja, "vendas", ";"),
    "fluxo_caixa.csv": (fluxo_caixa, "financeiro", ";"),
    "contas_a_pagar.csv": (contas_pagar, "financeiro", ","),
    "folha_pagamento.csv": (folha, "rh", ";"),
    "turnover.csv": (turnover, "rh", ","),
    "movimentacao_estoque.csv": (movimentacao, "estoque", ","),
    "inventory_en.csv": (inventario_en, "estoque", ","),
    "campanhas_marketing.csv": (campanhas, "marketing", ";"),
    "leads.csv": (leads, "marketing", ","),
    "tickets_suporte.csv": (tickets, "atendimento", ","),
    "notas_turma.csv": (notas_turma, "educacao", ";"),
    "atendimentos_clinica.csv": (clinica, "saude", ";"),
    "exames_laboratorio.csv": (exames, "saude", ","),
    "leituras_sensores.csv": (sensores, "generico", ","),
    "biblioteca_pessoal.csv": (livros, "generico", ","),
}

# Planilhas da Fase 5 que também entram na avaliação de tema (o tema esperado foi escrito aqui, antes do detector).
TEMAS_FASE5 = {
    "vendas_br.csv": "vendas", "clientes.csv": "vendas", "financeiro_titulo_total.csv": "financeiro", "financeiro_titulo_total.xlsx": "financeiro",
    "rh_ficticio.csv": "rh", "estoque.tsv": "estoque", "baguncada.csv": "vendas", "cega_escola.csv": "educacao", "cega_chamados.csv": "atendimento",
    "cega_vendas_en.csv": "vendas",
}

EXEMPLOS_TELA_INICIAL = {
    "vendas": "pedidos_loja_virtual.csv", "financeiro": "fluxo_caixa.csv", "rh": "folha_pagamento.csv", "estoque": "movimentacao_estoque.csv",
    "marketing": "campanhas_marketing.csv", "atendimento": "tickets_suporte.csv", "educacao": "notas_turma.csv", "saude": "atendimentos_clinica.csv",
}


def main() -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    EXEMPLOS.mkdir(parents=True, exist_ok=True)
    r = random.Random(20240927)
    esperado: dict[str, dict[str, str]] = {}
    for arquivo, (funcao, tema, sep) in PLANILHAS.items():
        escrever_csv(PASTA / arquivo, funcao(r), sep=sep)
        esperado[f"temas/{arquivo}"] = {"tema": tema}
    for arquivo, tema in TEMAS_FASE5.items():
        esperado[arquivo] = {"tema": tema}
    (PASTA / "esperado_temas.json").write_text(json.dumps(esperado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for tema, arquivo in EXEMPLOS_TELA_INICIAL.items():
        shutil.copyfile(PASTA / arquivo, EXEMPLOS / f"exemplo_{tema}.csv")
    print(f"{len(PLANILHAS)} planilhas por tema + {len(TEMAS_FASE5)} da Fase 5 com tema esperado; {len(EXEMPLOS_TELA_INICIAL)} exemplos em public/exemplos/")


if __name__ == "__main__":
    main()
