# Site — Dra. Isadora Alves, dentista em Fernandópolis/SP

HTML, CSS e JavaScript puros. Sem framework, sem build step, sem dependência.
São três arquivos: `index.html`, `styles.css` e `main.js`.

**Dados preenchidos** a partir do site anterior e do perfil do Instagram
(@dra_isadoraalves). O que não veio de fonte continua marcado como
`A CONFIRMAR` — 6 ocorrências, visíveis na página. Nada foi inventado.

---

## Rodar local

```bash
python3 -m http.server 5173      # ou: npx serve .
```

Abra `http://localhost:5173`.

---

## Deploy na Vercel

Estático puro: sem framework, sem build command, sem output directory.

```bash
npm i -g vercel
cd dra-isadora
vercel            # prévia
vercel --prod     # produção
```

Se a Vercel perguntar o framework, responda **Other**, deixe o build command
vazio e o output directory como `.`. Pelo painel: **Add New → Project**, aponte
o *Root Directory* para `dra-isadora/`.

---

## O que já está preenchido

| Dado | Valor | Onde aparece |
|---|---|---|
| Nome | Dra. Isadora Alves | title, wordmark, JSON-LD, rodapé |
| CRO | CRO/SP 163572 | hero, faixa de credenciais, sobre, rodapé |
| Formação | Especialização em Clínico Geral | faixa de credenciais, sobre |
| WhatsApp | 5517996213222 | 13 links, um por contexto |
| Telefone | (17) 99621-3222 | FAQ, rodapé |
| Endereço | Rua Bahia, 888 — Centro, Fernandópolis/SP, 15600-070 | seção, rodapé, JSON-LD |
| Horário | Segunda a sábado, 8h30 às 18h | tabela, faixa, rodapé, JSON-LD |
| Instagram | @dra_isadoraalves | rodapé, `sameAs` |
| Linktree | linktr.ee/draisadoraalves | rodapé, `sameAs` |
| Tratamentos | 4, com os textos dela | seção Tratamentos |
| Depoimentos | 3, texto integral | seção Depoimentos |

---

## O que ainda falta (`A CONFIRMAR`)

Procure por `A CONFIRMAR` no `index.html`. Cada um está marcado visualmente na
página, com fundo e sublinhado.

1. **Domínio** — `SEU-DOMINIO.com.br` aparece 6 vezes: canonical, Open Graph,
   Twitter, JSON-LD (`url` e `image`), `robots.txt` e `sitemap.xml`.
2. **Coordenadas (lat, lng)** — o JSON-LD está **sem** o bloco `geo`, de
   propósito. Pegue no Google Maps (botão direito sobre o ponto) e acrescente:
   ```json
   "geo": { "@type": "GeoCoordinates", "latitude": -20.284, "longitude": -50.246 }
   ```
   (os números acima são só o formato — use os reais.)
3. **Mapa** — o `<iframe>` está em `about:blank`. No Google Maps:
   **Compartilhar → Incorporar um mapa**, copie o valor do `src`, mantenha o
   `loading="lazy"` e apague o parágrafo `map__ph`.
4. **Nota média e nº de avaliações do Google** + link do perfil.
   **Não preencha `aggregateRating` com número estimado** — só entra se for
   exatamente o que está no Google, e a fonte precisa ser citada no HTML.
5. **Convênios** e **formas de pagamento / parcelamento** — duas perguntas do FAQ.
6. **Estacionamento e acessibilidade** — seção "Como chegar".
7. **Tempo de atuação** — seção "Sobre".
8. **As 20 imagens** — ver `assets/img/IMAGENS.md`.

Também pendente: `og-cover.jpg` e `apple-touch-icon.png`. O
`assets/icons/favicon.svg` é uma marca provisória.

---

## Onde trocar cada informação

### WhatsApp

O número aparece como `5517996213222` em 13 links. Para trocar tudo:

```bash
sed -i 's/5517996213222/55DDNOVONUMERO/g' index.html   # Linux
sed -i '' 's/5517996213222/55DDNOVONUMERO/g' index.html # macOS
```

As **mensagens pré-preenchidas** ficam no `?text=` de cada link, codificadas em
URL, e são diferentes por seção — o link do clareamento já abre o WhatsApp
escrito "Vi o tratamento Clareamento dental no site e gostaria de saber mais".
Ao editar, lembre de codificar (espaço = `%20`, `ç` = `%C3%A7`, `!` = `%21`).

### Horário

Na tabela da seção "Horário de atendimento", cada `<tr>` tem `data-h`:

```html
<tr data-d="1" data-h="08:30-18:00"><th scope="row">Segunda</th><td>8h30 às 18h</td></tr>
<tr data-d="0" data-h="fechado"><th scope="row">Domingo</th><td>Fechado</td></tr>
```

`data-d` é o dia (0 = domingo … 6 = sábado). Use vírgula para intervalo de
almoço: `data-h="08:30-12:00,13:30-18:00"`. O `<td>` é o texto que o paciente lê.

**O selo "aberto agora" já está ativo** e calcula no fuso `America/Sao_Paulo`,
independente do fuso do aparelho de quem acessa. Se qualquer dia ficar sem
`data-h`, o selo se esconde sozinho — melhor omitir do que informar errado.

Ao mudar o horário, atualize também o `openingHoursSpecification` do JSON-LD e
os textos em: faixa de credenciais do hero, FAQ e rodapé.

### Endereço

Quatro lugares: `<address>` da seção "Como chegar", rodapé, o `address` do
JSON-LD, e o `destination=` do botão "Como chegar".

---

## Notas técnicas

**Paleta.** As custom properties no topo do `styles.css` são a paleta da marca.
Há um degrau adicionado a pedido: `--muted-700: #686765`, com **5,13:1** sobre
`--bg` e **4,56:1** sobre `--surface` — os dois passam WCAG AA. Ele é o texto de
apoio abaixo de 24px. O `--muted` original (4,18:1) reprova no AA a 15px e ficou
reservado a texto de 24px ou mais. No rodapé escuro o apoio usa `--line`
(8,78:1). Nenhuma cor foi substituída.

**Faixa de credenciais.** Ancorada na base do retrato, fechando o hero, em vez
de seção separada — ela responde "posso confiar nela?" no momento em que o rosto
é lido. O `padding-bottom` do hero é 0 justamente para a faixa encostar.

**Contador.** O mecanismo existe em `main.js` (`data-count` num elemento
`.num`), mas nenhum número da faixa é numérico hoje. Se um dia entrar
"8 anos de atuação", basta `<span class="num" data-count="8">8</span>`.

**Movimento.** O hero anima uma vez no load. Reveal por scroll só em três
lugares: credenciais, antes/depois e depoimentos. Tudo respeita
`prefers-reduced-motion`.

**Antes/depois.** `input[type=range]` invisível sobre o quadro: setas do teclado
funcionam sem código extra (1% por toque). O arraste é tratado à parte, com
valor fracionário, para seguir o cursor sem degrau. A posição inicial se alinha
à linha vertical que percorre a página.

**Sem `!important`** fora do bloco de `prefers-reduced-motion`. Espaçamento
vertical vem só das classes de seção (`.s-hero`, `.s-ba`, `.s-trat`, `.s-def`).

---

## Estrutura

```
dra-isadora/
├── index.html
├── styles.css
├── main.js
├── assets/
│   ├── img/          (vazio — ver IMAGENS.md)
│   └── icons/favicon.svg
├── robots.txt
├── sitemap.xml
└── README.md
```
