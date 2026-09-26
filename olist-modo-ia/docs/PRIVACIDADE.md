# Privacidade: as 4 perguntas, com evidência

O post do LinkedIn que inspirou este projeto (dashboard de RH com "Modo IA" no navegador) recebeu 4 dúvidas nos
comentários. Aqui estão as respostas deste app, cada uma com o teste automático ou o print que prova.

Testes citados: `npm test` (Vitest) e `npx playwright test` (Chromium, build de produção). Prints em `docs/prints/`.

---

## a) O modelo pode inventar números ou explicações?

**Números: não, por construção.** A IA nunca calcula nem escreve SQL (P1/P2):

1. **Planejador:** a IA devolve só um "pedido de consulta" (QuerySpec) em JSON, preso a um JSON Schema com as
   métricas e dimensões que existem. Depois, o Zod valida de novo e cada valor de filtro é conferido contra os
   valores reais da base. JSON quebrado, métrica inventada ou valor que não existe viram **pergunta de volta**,
   nunca consulta. Quem calcula é o DuckDB, com SQL gerado por um compilador determinístico.
2. **Narrador:** a IA recebe só os FATOS (sem os valores) e escreve com marcadores `{{id}}`; o app troca pelos
   números do DuckDB. O texto é **recusado** se tiver dígito fora de marcador, número por extenso, nome de mês ou
   afirmação de causa fora do campo "Hipótese:". Recusado = fica o texto do template.
3. **Validador numérico final:** todo número do texto precisa estar num fato.

**Explicações:** "por que caiu?" mostra ONDE a variação aconteceu (decomposição por segmento), nunca a causa; a IA
só pode sugerir causa marcada como "Hipótese:".

| Evidência | Onde |
|---|---|
| Planejador errando (JSON quebrado, métrica inventada, valor inexistente) vira pergunta de volta, 0 SQL | `tests/unit/ia.test.ts`, `tests/e2e/ia-local.spec.ts` |
| Narrador com número inventado, causa ou marcador falso é recusado | `tests/unit/ia.test.ts` ("narrador: validador"), print `docs/prints/fase4/5-narrador-rejeitado.png` |
| Nenhum texto das 76 perguntas da suíte cita número fora dos fatos | `tests/unit/modo-rapido.test.ts` |
| Totais batem com o Power BI no centavo; planilhas batem com o Python | `dados/validacao.md`, `tests/unit/universal.test.ts` |

**Limite honesto:** a QUALIDADE do planejador com o modelo real (ele entende a pergunta certa?) ainda precisa ser
medida no PC com GPU (D47). Se ele entender errado, a resposta é um número CERTO para a pergunta errada, e o bloco
"Como calculei" mostra exatamente o que foi calculado.

---

## b) Existe tráfego de rede escondido (pesos em CDN, telemetria de libs)?

**Não. Três barreiras, e um contador que mostra ao vivo:**

1. **CSP no cabeçalho HTTP** (vale para a página E para os workers). Modo local: `connect-src 'self'` (nenhum
   domínio externo). Modo demo: só `huggingface.co` e `*.hf.co`, os domínios dos pesos do modelo, **medidos**
   (D46), e só usados se você clicar em "Ativar IA local".
2. **Service Worker "firewall"** (`public/sw.js`): vê todas as requisições da página **e dos workers** (DuckDB e
   IA), conta as externas e, no modo local, bloqueia. Ele assume a página ANTES de o DuckDB começar, então até o
   worker da primeira visita nasce sob ele.
3. **Nada de CDN em runtime:** DuckDB-WASM, extensão parquet, ECharts, SheetJS e a `model_lib` da IA são servidos
   pelo próprio site, com SHA-256 fixado nos locks.

**Contador:** "🛡️ Requisições externas desde que você abriu: 0", no rodapé, no painel do Modo IA e na tela da
planilha, com a lista de cada requisição (host, quem pediu, bloqueada ou não).

| Evidência | Onde |
|---|---|
| Nenhuma violação de CSP e só o próprio site na rede (dashboard, Modo IA, IA com motor falso, planilhas) | `tests/e2e/seguranca.spec.ts`, `ia-local.spec.ts`, `universal.spec.ts` |
| Firewall ativo desde a 1ª visita, contador 0, e requisições feitas **de dentro do worker do DuckDB** passando por ele | `tests/e2e/privacidade.spec.ts` (1º teste), print `docs/prints/fase6/1-selo-privacidade-contador-0.png` |
| Com a CSP desligada de propósito, o Service Worker sozinho bloqueia `example.com/rastreador.js` e o contador marca "1 bloqueada" | `tests/e2e/privacidade.spec.ts` (2º teste), print `docs/prints/fase6/2-requisicao-bloqueada.png` |
| Nenhuma lib de analytics/telemetria nas dependências (busca por Sentry, GA, Segment, PostHog, Mixpanel, Amplitude: 0) | varredura em `node_modules` (Fase 6) |
| WebLLM só é baixado depois do clique em "Ativar IA local" | `tests/e2e/ia-local.spec.ts` ("sem clicar, nenhum byte do WebLLM") |

---

## c) O que fica salvo no navegador (cache dos pesos, IndexedDB)?

Tudo fica **neste navegador, neste computador**. Nada vai para servidor nenhum.

| Onde | O quê | Quando |
|---|---|---|
| Cache Storage (`olist-modo-ia-app-v1`) | código do app, DuckDB, dados da Olist, extensão parquet (~36 MB) | na 1ª visita (é o que faz funcionar offline) |
| Cache Storage (do WebLLM) | pesos do modelo de IA (427 a 840 MB, conforme o modelo) | só se você ativar a IA |
| localStorage (`olist-modo-ia:*`) | fixados, 👍/👎, textos da IA recusados pelo validador, "IA já ativada", modelos de planilha, preferência "lembrar planilha" | quando você usa cada função |
| IndexedDB (`olist-modo-ia`) | bytes da última planilha | **só se você ligar** "Lembrar a última planilha" (desligado por padrão) |
| OPFS | nada hoje | — |

**Botão "Apagar dados locais"** (rodapé do dashboard e tela de entrada da planilha): apaga Cache Storage, IndexedDB, OPFS e
localStorage/sessionStorage, e diz quanto apagou. O Service Worker continua registrado (a proteção não pode sumir).
Evidência: `tests/e2e/privacidade.spec.ts` (4º teste), print `docs/prints/fase6/4-apagar-dados-locais.png`
("Apagado: 35,6 MB em 1 cache · 1 banco IndexedDB · …").

---

## d) Quem controla o acesso aos dados, se a base vai junto com o HTML?

- **Base da Olist (demo):** é pública (CC BY-NC-SA 4.0) e vai junto com o site de propósito. Quem abre o site pode
  baixar o Parquet. Isso é aceitável porque os dados já são públicos. **Não publique uma base privada assim**: não
  existe login nem controle de acesso num site estático.
- **Sua planilha (Modo Universal):** é lida SÓ no seu navegador. Nada é enviado: não há servidor, e a rede está
  travada (item b). Fechou a aba, ela some (a não ser que você ligue "Lembrar a última planilha").
- **Dados pessoais na planilha:** CPF, e-mail, telefone e nome saem **mascarados já na tabela** ("***.***.***-12",
  "a***@dominio", "Yasmin S."), ficam fora do catálogo da IA (ela nunca vê) e não podem virar métrica nem dimensão.
- **Dados sensíveis (RH, saúde):** ligado por padrão quando a planilha tem dado pessoal ou salário: nenhum resultado
  sobre **menos de 5 registros** aparece em gráfico, KPI ou resposta da IA, nem por filtro, e a tabela linha a linha
  fica escondida. A regra está no compilador SQL, então vale para tudo.
  Evidência: `tests/unit/universal.test.ts` ("dados sensíveis"), `tests/e2e/universal.spec.ts` (RH).

**Limite honesto:** o app protege o que ELE mostra. Quem tem a planilha original já tem os dados; a proteção
serve para compartilhar a tela ou o dashboard sem expor pessoas.
