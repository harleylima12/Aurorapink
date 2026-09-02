# Imagens do site — Dra. Isadora Alves

Coloque os arquivos nesta pasta (`assets/img/`) com **exatamente** estes nomes.
Enquanto um arquivo não existe, o site mostra o nome dele e a proporção esperada
no lugar da foto. O layout não quebra e não pula quando a imagem chega.

Formato: JPG com qualidade 80–85 (exceto o ícone Apple, que é PNG).
Recorte na proporção indicada **antes** de subir — o CSS usa `object-fit: cover`
e vai cortar o que sobrar pelo centro.

---

## Hero

| Arquivo | Proporção | Mínimo | Onde aparece |
|---|---|---|---|
| `hero-isadora.jpg` | 4:5 | 880 × 1100 px | Retrato principal, sangra na borda direita |

**Alt escrito:** "Dra. Isadora Alves, dentista, de jaleco, em fundo claro."

Observação: esta é a única imagem com `fetchpriority="high"` — ela carrega primeiro.
O terço superior do enquadramento aparece atrás do header; deixe respiro em cima.

---

## Sobre

| Arquivo | Proporção | Mínimo | Onde aparece |
|---|---|---|---|
| `sobre-isadora.jpg` | 3:4 | 900 × 1200 px | Seção "Sobre a Dra. Isadora", coluna direita |

**Alt escrito:** "Dra. Isadora Alves atendendo no consultório, durante uma consulta."

---

## Antes e depois

Quatro pares. **O par precisa do mesmo enquadramento, mesma distância, mesma
altura de câmera e mesma iluminação** — o slider sobrepõe uma imagem na outra, e
qualquer diferença de recorte faz a comparação parecer torta. O CSS já força
`object-fit: cover` idêntico nas duas camadas, mas isso não corrige foto tirada
de ângulo diferente.

| Arquivo | Proporção | Mínimo | Onde aparece |
|---|---|---|---|
| `antes-01.jpg` | 1:1 | 1200 × 1200 px | Caso 1 — lentes em resina, camada de cima |
| `depois-01.jpg` | 1:1 | 1200 × 1200 px | Caso 1 — lentes em resina, camada de baixo |
| `antes-02.jpg` | 1:1 | 1200 × 1200 px | Caso 2 — clareamento |
| `depois-02.jpg` | 1:1 | 1200 × 1200 px | Caso 2 — clareamento |
| `antes-03.jpg` | 1:1 | 1200 × 1200 px | Caso 3 |
| `depois-03.jpg` | 1:1 | 1200 × 1200 px | Caso 3 |
| `antes-04.jpg` | 1:1 | 1200 × 1200 px | Caso 4 |
| `depois-04.jpg` | 1:1 | 1200 × 1200 px | Caso 4 |

**Alt escrito (antes):** "Sorriso do paciente antes do tratamento."
**Alt escrito (depois):** "Sorriso do paciente depois do tratamento, mesmo enquadramento da foto anterior."

Os casos 1 e 2 correspondem aos pares que já existiam no site anterior (lentes em resina e
clareamento). Os casos 3 e 4 ainda não têm par definido — se você só tiver dois, me avise que
eu reduzo o seletor para dois botões.

⚠️ Só publique par de antes/depois com autorização escrita do paciente. A legenda
de conformidade já está fixa no HTML e não deve ser removida.

---

## Consultório

| Arquivo | Proporção | Mínimo | Onde aparece |
|---|---|---|---|
| `consultorio-01.jpg` | 3:2 (recortada em 2:1 no desktop) | 1500 × 1000 px | Primeira da grade, ocupa 4 colunas |
| `consultorio-02.jpg` | 3:2 | 1500 × 1000 px | Grade, 2 colunas |
| `consultorio-03.jpg` | 3:2 | 1500 × 1000 px | Grade, 2 colunas |
| `consultorio-04.jpg` | 3:2 | 1500 × 1000 px | Grade, 2 colunas |
| `consultorio-05.jpg` | 3:2 | 1500 × 1000 px | Grade, 2 colunas |
| `consultorio-06.jpg` | 3:2 (recortada em 3:1 no desktop) | 1800 × 1200 px | Faixa larga no fim da grade |

**Alt escrito:**
- 01 — "Recepção do consultório, com poltronas e balcão de atendimento."
- 02 — "Sala de atendimento com cadeira odontológica e equipamento."
- 03 — "Corredor de acesso às salas de atendimento."
- 04 — "Detalhe do instrumental organizado sobre a bancada."
- 05 — "Área de espera vista da entrada do consultório."
- 06 — "Fachada do prédio onde fica o consultório."

Como a 01 e a 06 são recortadas mais baixas no desktop, mantenha o assunto
principal centralizado na vertical nessas duas.

---

## Compartilhamento e ícones

| Arquivo | Dimensão | Onde aparece |
|---|---|---|
| `og-cover.jpg` | 1200 × 630 px | Prévia no WhatsApp, Facebook, Instagram e Twitter |
| `apple-touch-icon.png` | 180 × 180 px | Ícone ao salvar o site na tela inicial do iPhone |

**Alt do og-cover:** "Dra. Isadora Alves em seu consultório em Fernandópolis."

No `og-cover.jpg`, deixe o rosto fora dos 100 px das bordas — vários apps cortam
a prévia. Não coloque texto pequeno: ele fica ilegível na miniatura.

`assets/icons/favicon.svg` já existe como **marca provisória** (um símbolo
neutro no marrom da paleta). Substitua pelo símbolo real da marca quando houver.

---

## Resumo do que enviar

```
hero-isadora.jpg        4:5     880 × 1100
sobre-isadora.jpg       3:4     900 × 1200
antes-01..04.jpg        1:1    1200 × 1200   (4 arquivos)
depois-01..04.jpg       1:1    1200 × 1200   (4 arquivos)
consultorio-01..06.jpg  3:2    1500 × 1000   (6 arquivos, 01 e 06 maiores)
og-cover.jpg            —      1200 × 630
apple-touch-icon.png    —       180 × 180
```

Total: **20 arquivos.**
