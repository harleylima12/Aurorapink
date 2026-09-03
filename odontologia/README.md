# Site institucional — Clínica Odontológica

Site de página única, responsivo (mobile-first), em HTML/CSS/JS puro. Sem build,
sem dependências, sem framework: é só abrir o `index.html`.

> **Status:** a estrutura, o design e toda a engenharia estão prontos. Os dados
> reais do estabelecimento ainda não foram preenchidos — veja
> [Preencher os dados reais](#preencher-os-dados-reais).

---

## Estrutura

```
odontologia/
├── index.html          Marcação semântica das 10 seções + sprite de ícones
├── css/estilo.css      Design system completo (tokens, componentes, responsivo)
├── js/dados.js         ← FONTE ÚNICA DE DADOS. É o único arquivo a editar.
├── js/main.js          Motor: monta conteúdo, SEO/JSON-LD e interações
└── assets/             Fotos reais do local, favicon, imagem de Open Graph
```

### Por que os dados ficam num arquivo só

`js/main.js` lê `js/dados.js` e monta a partir dele: textos de contato, tabela de
horários, indicador de "aberto agora", depoimentos, mapa, links de WhatsApp e o
JSON-LD de SEO. Trocar um telefone é uma linha, num lugar só — nunca um
find-and-replace pelo HTML.

### A regra do dado não confirmado

Todo campo ainda não confirmado tem o valor `[A CONFIRMAR COM O CLIENTE]`. O site
detecta esse marcador e, em vez de exibir informação falsa:

- mostra o marcador em destaque amarelo na página, para não passar despercebido;
- **omite o campo do JSON-LD**, para nunca publicar dado inventado no Google;
- desativa o link (WhatsApp/telefone) em vez de apontar para um número errado.

Depoimentos e nota funcionam do mesmo jeito: enquanto o array `depoimentos`
estiver vazio, a seção exibe um aviso. **Nenhuma avaliação é gerada
automaticamente** — avaliações são conteúdo de terceiros e precisam ser fiéis ao
que está publicado no Google.

---

## Preencher os dados reais

Abra `js/dados.js` e substitua cada `PENDENTE` pelo valor real:

| Bloco | O que preencher |
|---|---|
| `negocio` | Nome oficial, categoria, frase de posicionamento, descrição, faixa de preço, responsável técnico e CRO |
| `contato` | Telefone exibido, telefone E.164 (`+5517...`), WhatsApp só com dígitos, e-mail, site oficial |
| `local` | Logradouro, bairro, cidade, UF, CEP, **`lat` e `lng` como números** e o link do perfil no Maps |
| `horarios` | Faixas de cada dia e `confirmado: true` |
| `reputacao` | `nota` (número) e `totalAvaliacoes` (inteiro) |
| `depoimentos` | Avaliações reais do Google, texto íntegro, nome abreviado |
| `servicos`, `comodidades`, `galeria`, `redes`, `seo` | Conforme os comentários do arquivo |

**Coordenadas:** no Google Maps, clique com o botão direito no ponto do
estabelecimento — o primeiro item do menu é `latitude, longitude`. O mapa
embutido e o botão "Como chegar" são gerados a partir daí.

**Horários com intervalo de almoço:**

```js
3: [{ abre: "08:00", fecha: "12:00" }, { abre: "13:30", fecha: "18:00" }],
```

**Fotos:** coloque os arquivos em `assets/` e liste-os em `galeria`. Enquanto
não houver fotos, a seção renderiza um bloco cromático da marca. Exporte em
WebP com largura máxima de ~1600 px; o carregamento já é `lazy` a partir da
terceira imagem.

---

## Ver localmente

Abrir o `index.html` direto no navegador funciona. Para um ambiente igual ao de
produção (caminhos absolutos, iframe do mapa), suba um servidor estático:

```bash
cd odontologia
python3 -m http.server 8080      # http://localhost:8080
# ou
npx serve .
```

---

## Publicar

O site é 100% estático — qualquer host serve. A pasta a publicar é `odontologia/`.

**Vercel**

```bash
npm i -g vercel
cd odontologia
vercel            # preview
vercel --prod     # produção
```

Pelo painel: *Add New → Project*, importe o repositório, defina **Root
Directory = `odontologia`**, Framework Preset = **Other**, sem build command,
Output Directory = `.`.

**Netlify**

```bash
npm i -g netlify-cli
cd odontologia
netlify deploy --dir . --prod
```

Pelo painel: arraste a pasta `odontologia/` para o *drop zone*, ou conecte o
repositório com base directory `odontologia`, sem build command e publish
directory `odontologia`.

**GitHub Pages** — em *Settings → Pages*, publique a branch e a pasta
`/odontologia`.

Depois de escolher o domínio, preencha `seo.urlCanonica` em `js/dados.js` e
coloque a imagem de compartilhamento em `assets/og.jpg` (1200×630).

---

## Decisões técnicas

**Design.** Petróleo `#0E4C57` (confiança, leitura clínica) com aqua `#35C4B5`
como acento, sobre areia quente `#F6F3EE`. Títulos em *Fraunces*, texto em
*Inter*. O motivo do arco (hero, ícone) referencia a curva dental sem recorrer
ao clichê de dente sorridente em stock photo.

**Acessibilidade.** Link "pular para o conteúdo"; foco visível em tudo que é
focável; menu móvel operável por teclado e fechável com `Esc`; `aria-current`
na navegação; ícones decorativos com `aria-hidden`; estrelas com rótulo textual.
Contrastes verificados: petróleo/branco 9,6:1, tinta/aqua 7,7:1,
WhatsApp `#128C7E`/branco 4,1:1 — todos acima do mínimo AA. O aqua nunca é
usado como cor de texto sobre branco (2,2:1); só como fundo ou detalhe.

**Performance.** Zero dependências de runtime. Uma folha de estilo, um script de
~11 KB e um sprite SVG inline (nenhuma requisição de ícone). Fontes com
`preconnect` e `display=swap`. Imagens com `loading="lazy"` e `decoding="async"`
a partir da terceira. O iframe do mapa é `lazy` e só é inserido quando há
coordenadas.

**Movimento.** Revelação no scroll via `IntersectionObserver` (não `scroll`), e
todo o movimento é desligado sob `prefers-reduced-motion: reduce`.

**SEO.** `title`, `meta description`, Open Graph, Twitter Card e JSON-LD
`["LocalBusiness","Dentist"]` com endereço, `geo`, `openingHoursSpecification`,
`aggregateRating`, `review` e catálogo de serviços — cada bloco incluído
**apenas** quando o dado correspondente foi confirmado.

**"Aberto agora".** Calculado no fuso `America/Sao_Paulo` via `Intl`,
independente do relógio do visitante, e reavaliado a cada minuto.
