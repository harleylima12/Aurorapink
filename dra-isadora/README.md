# Site — Dra. Isadora, odontologia

HTML, CSS e JavaScript puros. Sem framework, sem build step, sem dependência.
São três arquivos: `index.html`, `styles.css` e `main.js`.

> **Estado atual: estrutura pronta, dados pendentes.**
> A fonte de dados (o link do perfil do Google) não pôde ser aberta neste
> ambiente. Nada foi inventado. Todo dado real aparece marcado como
> `A CONFIRMAR` — visualmente destacado na página e listado na seção
> "O que falta preencher", abaixo.

---

## Rodar local

Qualquer servidor estático serve. Abrir o `index.html` direto pelo `file://`
funciona, mas o mapa e as fontes se comportam melhor sob HTTP:

```bash
# Python (já vem no macOS e na maioria dos Linux)
python3 -m http.server 5173

# ou Node
npx serve .
```

Depois abra `http://localhost:5173`.

---

## Deploy na Vercel

O projeto é estático puro, então não há nada para configurar — sem framework,
sem comando de build, sem diretório de saída especial.

```bash
npm i -g vercel     # só na primeira vez
cd dra-isadora
vercel              # prévia
vercel --prod       # produção
```

Quando a Vercel perguntar o framework, responda **Other**. Deixe o build command
vazio e o output directory como `.`.

Pelo painel: **Add New → Project**, conecte o repositório, aponte o *Root
Directory* para `dra-isadora/` e faça o deploy.

---

## Onde trocar cada informação

### Telefone e WhatsApp

O número aparece como o texto literal `55DDDNUMERO` em **todos** os links.
Troque tudo de uma vez:

```bash
# formato: 55 + DDD + número, só dígitos. Ex.: 5511998765432
sed -i '' 's/55DDDNUMERO/5511998765432/g' index.html   # macOS
sed -i    's/55DDDNUMERO/5511998765432/g' index.html   # Linux
```

Isso cobre o botão do header, o CTA do hero, os links de cada tratamento, o CTA
final, o rodapé, o botão flutuante e a barra fixa do mobile.

O telefone fixo do rodapé é separado: procure por `tel:+55DDDNUMERO` e pelo
texto `(00) 0000-0000`.

**As mensagens pré-preenchidas** ficam no `?text=` de cada link, codificadas em
URL. Cada seção tem a sua — o link de clareamento já abre o WhatsApp escrito
"gostaria de saber sobre clareamento dental". Se for editar, lembre de codificar
(espaço vira `%20`, `ç` vira `%C3%A7`).

### Endereço

Três lugares:

1. `<address>` na seção "Como chegar" (`index.html`, busque por `loc__ad`)
2. Rodapé, bloco "Endereço"
3. JSON-LD no fim do arquivo — o objeto `address` e o objeto `geo`

No JSON-LD, `latitude` e `longitude` precisam das coordenadas reais em número,
não em texto. Pegue no Google Maps clicando com o botão direito sobre o ponto.

### Mapa

O `<iframe>` está com `src="about:blank"`. No Google Maps: **Compartilhar →
Incorporar um mapa → copiar HTML**, e use só o valor do `src`. Mantenha o
`loading="lazy"`. Depois apague o parágrafo `map__ph`, que é o aviso provisório.

O botão "Como chegar" aponta para `destination=ENDERECO_A_CONFIRMAR` — troque
pelo endereço com os espaços em `%20`, ou pelas coordenadas `lat,lng`.

### Horário

Na tabela da seção "Horário de atendimento", cada `<tr>` tem um `data-h` vazio.
Preencha no formato `HH:MM-HH:MM`, e use vírgula quando houver intervalo de
almoço:

```html
<tr data-d="1" data-h="09:00-12:00,13:30-18:00"><th scope="row">Segunda</th><td>09h–12h e 13h30–18h</td></tr>
<tr data-d="0" data-h="fechado"><th scope="row">Domingo</th><td>Fechado</td></tr>
```

O `data-d` é o dia da semana (0 = domingo … 6 = sábado) e já está correto.
A coluna visível (`<td>`) é o texto que o paciente lê — escreva como preferir.

**O selo "aberto agora" liga sozinho** assim que os sete dias tiverem `data-h`
preenchido. Ele calcula no fuso `America/Sao_Paulo`, independente do fuso do
celular de quem acessa. Enquanto faltar qualquer dia, o selo fica oculto de
propósito — é melhor não mostrar nada do que mostrar horário errado.

Preencha também o `openingHoursSpecification` do JSON-LD (hoje é uma lista
vazia), um objeto por dia:

```json
{ "@type": "OpeningHoursSpecification",
  "dayOfWeek": "Monday", "opens": "09:00", "closes": "18:00" }
```

### Redes sociais e perfil do Google

Instagram e Facebook aparecem no rodapé e no `sameAs` do JSON-LD. O link do
perfil do Google fica na seção de depoimentos (`SEU-PERFIL-GOOGLE`).

### Domínio

`SEU-DOMINIO.com.br` aparece no `canonical`, nas tags Open Graph e Twitter, no
JSON-LD, no `robots.txt` e no `sitemap.xml`. Troque em todos.

### Nota média e avaliações

**Não preencha `aggregateRating` no JSON-LD com número estimado.** Só inclua o
bloco se a nota e a contagem forem exatamente as que estão no Google, e cite a
fonte no HTML. Marcar nota inventada em dado de saúde é problema sério, não
detalhe de SEO.

Os depoimentos precisam do texto **integral** da avaliação, sem resumir e sem
corrigir, assinados com primeiro nome e inicial do sobrenome ("Marina S.").

---

## O que falta preencher

Procure por `A CONFIRMAR` no `index.html` — cada ocorrência está marcada também
visualmente na página, com fundo e sublinhado, para não passar batido.

- Nome oficial completo e CRO
- Cidade, estado, endereço, bairro, CEP e coordenadas
- Telefone e WhatsApp
- Horário dos sete dias
- Frase de posicionamento do hero e texto da seção "Sobre"
- Formação, especializações, anos de atuação, pacientes atendidos
- Lista real de tratamentos (a atual é estrutural)
- 8 a 12 avaliações reais, nota média e contagem
- Convênios, formas de pagamento e parcelamento
- Estacionamento, acessibilidade e referências de acesso
- Instagram, Facebook e link do perfil do Google
- As 20 imagens (ver `assets/img/IMAGENS.md`)

---

## Notas técnicas

**Paleta.** As custom properties no topo do `styles.css` são a paleta da marca e
não devem ser trocadas nem acrescidas. Um desvio: o texto de apoio usa `--ink`
(6,40:1) e não `--muted` (4,18:1), porque a 15px o `--muted` reprova no WCAG AA.
O `--muted` ficou só no texto de sistema dos slots de imagem, que some quando a
foto chega. Nenhuma cor nova foi introduzida.

**Movimento.** O hero anima uma vez no carregamento. Só três seções ganham
reveal por scroll: credenciais, antes/depois e depoimentos. O resto entra sem
animação, de propósito. Tudo respeita `prefers-reduced-motion`.

**Slider de antes/depois.** É um `input[type=range]` invisível sobre o quadro,
então funciona com as setas do teclado sem nenhum código extra. O arraste com o
mouse é tratado à parte para seguir o cursor a partir de qualquer ponto. A
posição inicial se alinha à linha vertical que percorre a página.

**Sem `!important`** fora do bloco de `prefers-reduced-motion`.
**Espaçamento vertical** vem só das classes de seção (`.s-hero`, `.s-ba`,
`.s-trat`, `.s-cred`, `.s-def`) — fonte única, sem regra de elemento competindo.

---

## Estrutura

```
dra-isadora/
├── index.html
├── styles.css
├── main.js
├── assets/
│   ├── img/          (vazio — ver IMAGENS.md)
│   └── icons/
│       └── favicon.svg
├── robots.txt
├── sitemap.xml
└── README.md
```
