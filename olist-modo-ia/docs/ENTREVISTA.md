# Roteiro de entrevista

Para explicar o projeto em 5 minutos e responder às perguntas mais prováveis. Os números são os medidos
(`docs/BENCHMARK.md`). Tenha o site aberto: **olist-modo-ia.vercel.app**.

## Roteiro de 5 minutos

**1. O problema (30 s)**
> "Todo mundo quer 'conversar com os dados', mas isso costuma significar mandar a planilha da empresa para um
> servidor e confiar num modelo que às vezes inventa números. Eu quis ver se dava para fazer isso inteiro no
> navegador, sem mandar nada para fora, e sem a IA poder inventar número."

**2. Demonstração (2 min)**
1. Abra o dashboard. "É a base pública da Olist, 98 mil pedidos. Os totais batem com o meu Power BI no centavo."
2. Aponte o rodapé: **"Requisições externas: 0"**. "Isso é um Service Worker que conta tudo o que sai da página."
3. Abra o ✨ Modo IA e pergunte "top 5 categorias em 2018". Depois, "e só em SP?". "Ele entende o follow-up."
4. Abra **"Como calculei"**. "Aqui está o SQL de verdade e quanto tempo levou. Nada é caixa-preta."
5. Vá em "📂 Sua planilha" e clique no exemplo **Vendas**. "Ele descobriu sozinho que é uma planilha de vendas,
   diz por quê, e me pergunta o objetivo e quem vai ver." Gere o dashboard.
6. Abra **/avaliacao** e clique em "Rodar". "São 102 perguntas testadas aqui no navegador, com a latência."

**3. Como funciona (1 min 30 s)**
> "A ideia central: **o modelo de linguagem nunca faz conta**. Ele só preenche um formulário, um JSON que eu
> chamo de QuerySpec, dizendo 'quero faturamento, por categoria, em 2018'. Esse JSON é validado; um compilador
> meu transforma em SQL; e o DuckDB, que roda dentro do navegador, calcula. Na maioria das perguntas nem precisa
> de IA: umas regras resolvem em milissegundos. A IA só entra quando as regras não entendem. E quando a IA
> escreve o texto, ela usa marcadores no lugar dos números; se aparecer um número que não veio do banco, o texto
> é recusado e fica o texto padrão."

**4. Resultado e limites (1 min)**
> "Medi tudo. No Modo Rápido, 88 milissegundos no pior caso típico (p95). Criei um lote de 26 perguntas novas e
> commitei as respostas esperadas ANTES de rodar, para não me enganar: acertou 80,8% na primeira rodada. Corrigi
> as causas gerais e documentei tudo. O limite honesto: a IA de verdade precisa de GPU, e eu ainda vou medir a
> qualidade dela no meu PC; aqui ela foi testada com um motor falso que imita os erros típicos."

## 10 perguntas prováveis

**1. Por que não usar a API do ChatGPT?**
Privacidade e custo. Com uma API, a planilha sai do computador e cada pergunta custa. Aqui o modelo roda no
navegador (WebLLM + WebGPU), e dá para provar que nada sai: CSP no cabeçalho, um Service Worker que conta e
bloqueia, e testes automáticos que falham se aparecer um domínio externo. A troca é que o modelo local é
pequeno, por isso ele só faz a parte fácil para ele: entender a pergunta.

**2. Como você garante que a IA não inventa números?**
Três barreiras.
- **Formulário, não SQL:** ela só devolve um JSON validado com Zod contra as métricas que existem. Valor de filtro
  que não existe na base vira pergunta de volta.
- **Quem calcula é o banco:** o compilador gera o SQL e o DuckDB faz a conta.
- **Texto conferido:** no texto, ela escreve marcadores como `{{lider}}`, o app troca pelos números do banco, e
  um validador recusa qualquer dígito fora de marcador. Há testes com um "motor falso" que tenta inventar número
  de propósito.

**3. O que é o DuckDB e por que no navegador?**
É um banco de dados analítico, tipo um SQLite feito para agregação. Existe uma versão em WebAssembly que roda
dentro do navegador, num worker (uma thread separada). Assim o cálculo é local e rápido: a troca de filtro leva
cerca de 0,2 s, com 11 consultas.

**4. O que acontece com uma pergunta que ele não entende?**
Depende. Se as regras não entendem e a IA local está ligada, ela tenta. Se ninguém tem certeza, o app **pergunta
de volta** com 3 opções clicáveis, em vez de chutar. E se a pergunta pede um dado que a base não tem (lucro,
estoque), ele responde que não tem e sugere o que dá para mostrar. Na suíte, 11 de 11 perguntas fora do escopo
foram recusadas corretamente.

**5. Como funciona o Modo Universal com uma planilha qualquer?**
- **Leitura:** descobre a codificação (UTF-8 ou Latin-1), o separador, onde está o cabeçalho, e tira linhas
  vazias e de "Total".
- **Tipos:** classifica cada coluna em 11 tipos, olhando nome e valores. CPF, e-mail e telefone saem mascarados.
- **Tema:** acha o tema por pontos (nomes, valores como "Entrada/Saída", tipos) e monta o dashboard com uma
  "receita" daquele tema.
- **Revisão:** tudo aparece na tela "Entendi assim" para corrigir.

Nas planilhas de teste, acertou 88 de 88 tipos e 24 de 25 temas na primeira rodada.

**6. E se a planilha não tiver a coluna que o dashboard precisa?**
O painel some e a tela explica: "Produtos campeões: não achei a coluna de produto". Algumas contas têm plano B,
por exemplo faturamento = preço × quantidade quando não existe coluna de total. Nunca invento um número para
preencher o espaço.

**7. Como você mediu a qualidade sem se enganar?**
- **Lote cego:** escrevi as perguntas e as respostas esperadas, fiz o commit e só depois rodei. A 1ª rodada
  (80,8% nas perguntas novas, 96% nos temas) ficou registrada antes de qualquer ajuste.
- **Onde ver:** a página `/avaliacao` roda tudo de novo no navegador de quem quiser conferir.
- **O que não conta:** o 100% da suíte antiga não mede generalização, porque ela foi escrita junto com as regras.

**8. E dados sensíveis, como salários ou saúde?**
Quando a planilha tem dado pessoal ou é de RH, educação ou saúde, liga uma regra no compilador SQL: nenhum
grupo com menos de 5 pessoas aparece, nem em gráfico, nem em KPI, nem na resposta da IA, nem filtrando. A tabela
linha a linha some. Como está no compilador, vale para tudo ao mesmo tempo.

**9. Qual foi a parte mais difícil?**
Um bom exemplo é a performance. Medi a abertura em etapas e vi que o Service Worker esperava gravar o arquivo
de 34 MB do banco no cache ANTES de entregá-lo. O navegador não conseguia compilar enquanto baixava. Mudei para
gravar em segundo plano e a abertura ficou 7% mais rápida. Isso só apareceu porque medi em vez de supor.

**10. O que você faria diferente ou a seguir?**
Medir a IA real no meu PC com GPU (tempo e acerto por categoria, já está tudo pronto na página de avaliação).
Depois, reduzir o tempo de compilar o motor do banco, que ainda é o maior bloco da abertura (~1,7 s aqui). E
testar com planilhas reais de usuários, porque as minhas planilhas de teste, mesmo "bagunçadas", eu que fiz.

## Frases curtas para lembrar

- "O modelo não faz conta: ele preenche um formulário; quem calcula é o banco."
- "Toda resposta mostra o SQL e o tempo."
- "Zero requisições externas, e o contador está na tela."
- "Medi antes de ajustar, e deixei a primeira rodada registrada."
