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
| 2. Base | ✅ dashboard de 3 páginas, compilador spec→SQL, CSP; prints em [`docs/prints/fase2`](docs/prints/fase2) |
| 3. Modo Rápido | ✅ perguntas em PT-BR respondidas sem IA em < 100 ms (p95); prints em [`docs/prints/fase3`](docs/prints/fase3) |
| 4. IA local | ✅ na nuvem (sem GPU): planejador + narrador validados com motor falso; **modelo real a validar no PC**; prints em [`docs/prints/fase4`](docs/prints/fase4) |
| 5. Modo Universal | ✅ arraste um CSV em `/planilha`: limpeza, perfil das colunas, tela "Entendi assim" e dashboard automático; Excel via SheetJS; prints em [`docs/prints/fase5`](docs/prints/fase5) |
| 6. Privacidade | ✅ firewall (Service Worker) com contador de requisições externas, offline, "Apagar dados locais", proteção de dados sensíveis; ver [`docs/PRIVACIDADE.md`](docs/PRIVACIDADE.md) |
| 7 e 8 | a fazer |

## Fase 1: preparar os dados

Requer Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate             # Windows (PowerShell): .venv\Scripts\Activate.ps1
pip install -r scripts/requirements.txt
python scripts/baixar_dados.py        # baixa o que faltar em ./dados e confere o SHA-256 (--verificar só confere)
python scripts/preparar_dados.py      # gera public/data/*.parquet, meta.json e dados/validacao.md
python -m pytest tests/dados -q       # 57 testes
```

O `preparar_dados.py` termina com erro se os totais não baterem com o Power BI (faturamento R$ 13.494.400,74 ·
98.199 pedidos · ticket médio R$ 137,42 · 94.983 clientes únicos).

## Fase 2: rodar o dashboard

Requer Node 22.12+.

```bash
npm ci
npm run baixar-extensoes      # caminho final: leitor de Parquet servido pelo app (precisa de extensions.duckdb.org uma vez)
npm run dev                   # http://localhost:5173
npm test                      # testes unitários (Vitest) + suíte da Camada 0 (evals/perguntas.json)
npx playwright install chromium && npx playwright test   # e2e no build de produção
```

Sem `npm run baixar-extensoes`, o app usa um arquivo `.duckdb` provisório com os mesmos dados
(`python scripts/gerar_duckdb_provisorio.py`) e avisa no rodapé. Ver `docs/DECISOES.md` (D15 e D17).

## Fase 4: IA local (WebLLM)

A IA só é baixada quando você clica em **Ativar IA local** no painel ✨ Modo IA (precisa de WebGPU: Chrome/Edge
recentes). Ela só entra quando o Modo Rápido não entende a pergunta; o modelo devolve um QuerySpec (nunca SQL nem
números), e o texto que ele escreve só aparece se passar no validador.

```bash
npm run baixar-modelo -- --so-libs    # model_lib (.wasm) servida pelo próprio site: obrigatório nos dois modos
npm run dev                           # modo demo: pesos do Hugging Face (único domínio externo, explícito na CSP)

npm run baixar-modelo -- --modelo Qwen2.5-1.5B-Instruct-q4f16_1-MLC   # modo local: pesos em public/models
VITE_MODEL_SOURCE=local npm run dev   # nenhum domínio externo (PowerShell: $env:VITE_MODEL_SOURCE="local"; npm run dev)
```

`VITE_MODELO=<model_id>` força um modelo. Detalhes e números: `docs/DECISOES.md` (D28 a D35) e `docs/BENCHMARK.md`.

## Fase 5: Modo Universal (sua planilha)

Abra `/planilha` (ou "📂 Sua planilha" na barra lateral) e arraste um ou mais CSVs. O app detecta codificação,
separador e cabeçalho, remove linhas vazias e de total, classifica cada coluna (data, dinheiro, %, categoria, UF,
dado pessoal…), mostra a tela **Entendi assim** para revisão e gera o dashboard e o Modo IA sobre a planilha.
Nada é enviado: tudo roda no navegador. Planilhas de teste em `evals/planilhas/` (`npm run gerar-planilhas-teste`).

## Dados e licença

Os dados são do [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
(também em [olist/work-at-olist-data](https://github.com/olist/work-at-olist-data)), licença
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): uso não comercial, com atribuição, e obras
derivadas sob a mesma licença. Os arquivos de `public/data/` são uma derivação desses dados e seguem a mesma licença.
Os CSVs originais não são versionados. A lista de municípios usada para pôr acento nas cidades vem do IBGE, via
[kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (MIT).
