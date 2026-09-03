/* ==========================================================================
   Motor do site. Lê js/dados.js e monta conteúdo, SEO e interações.
   Nenhum dado é inventado: campos com o marcador PENDENTE viram avisos
   visíveis e são omitidos dos dados estruturados.
   ========================================================================== */
(() => {
  "use strict";

  const D = window.DADOS;
  const PENDENTE = D.pendente;

  /* ---------- utilidades ------------------------------------------------ */

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const slot = (n) => $(`[data-slot="${n}"]`);

  /** Um valor só é usável se existir e não for o marcador de pendência. */
  const ok = (v) => v !== null && v !== undefined && v !== "" && v !== PENDENTE;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  const icone = (id, cls = "icone") =>
    `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"></use></svg>`;

  const aviso = (titulo, texto) =>
    `<p class="aviso"><strong>${esc(titulo)}</strong>${esc(texto)}</p>`;

  /* ---------- links de contato ------------------------------------------ */

  const linkWhats = ok(D.contato.whatsapp)
    ? `https://wa.me/${String(D.contato.whatsapp).replace(/\D/g, "")}` +
      `?text=${encodeURIComponent(D.contato.whatsappMensagem)}`
    : null;

  const linkTel = ok(D.contato.telefoneE164)
    ? `tel:${String(D.contato.telefoneE164).replace(/[^\d+]/g, "")}`
    : null;

  /* ---------- endereço --------------------------------------------------- */

  const L = D.local;
  const temCoordenadas = typeof L.lat === "number" && typeof L.lng === "number";

  const enderecoLinha = [
    ok(L.logradouro) ? L.logradouro : null,
    ok(L.bairro) ? L.bairro : null,
    ok(L.cidade) && ok(L.estado) ? `${L.cidade} - ${L.estado}` : (ok(L.cidade) ? L.cidade : null),
    ok(L.cep) ? `CEP ${L.cep}` : null
  ].filter(Boolean).join(", ");

  const alvoMapa = temCoordenadas ? `${L.lat},${L.lng}` : (enderecoLinha || null);

  /* ---------- horários ---------------------------------------------------- */

  const H = D.horarios;
  /** Normaliza um dia em lista de faixas [{abre,fecha}]. */
  const faixas = (dia) => (dia == null ? [] : (Array.isArray(dia) ? dia : [dia]));
  const emMinutos = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  };

  /** Data/hora corrente no fuso da clínica. */
  function agoraNoFuso() {
    const partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: H.fuso, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
    const mapa = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6 };
    const chave = p.weekday.toLowerCase().replace(".", "").slice(0, 3);
    return { dia: mapa[chave], minutos: Number(p.hour) * 60 + Number(p.minute) };
  }

  /** { aberto, texto } — só responde se os horários forem confirmados. */
  function estadoAgora() {
    if (!H.confirmado) return null;
    const { dia, minutos } = agoraNoFuso();
    if (dia === undefined) return null;

    const hoje = faixas(H.dias[dia]);
    for (const f of hoje) {
      if (minutos >= emMinutos(f.abre) && minutos < emMinutos(f.fecha)) {
        return { aberto: true, texto: `Aberto agora · até ${f.fecha}` };
      }
    }
    const proxima = hoje.find((f) => minutos < emMinutos(f.abre));
    if (proxima) return { aberto: false, texto: `Fechado · abre às ${proxima.abre}` };

    for (let i = 1; i <= 7; i++) {
      const d = (dia + i) % 7;
      const f = faixas(H.dias[d])[0];
      if (f) {
        const nome = window.DIAS_SEMANA.find((x) => x.n === d).nome.toLowerCase();
        return { aberto: false, texto: i === 1 ? `Fechado · abre amanhã às ${f.abre}` : `Fechado · abre ${nome} às ${f.abre}` };
      }
    }
    return { aberto: false, texto: "Fechado" };
  }

  /* ======================================================================
     RENDERIZAÇÃO
     ====================================================================== */

  /* --- textos simples ligados por data-bind ----------------------------- */
  function ligarTextos() {
    const valores = {
      nome: D.negocio.nome,
      nomeCurto: ok(D.negocio.nomeCurto) ? D.negocio.nomeCurto : D.negocio.nome,
      categoria: D.negocio.categoria,
      tagline: D.negocio.tagline,
      descricao: D.negocio.descricao,
      telefone: D.contato.telefone,
      nota: ok(D.reputacao.nota) ? String(D.reputacao.nota).replace(".", ",") : null,
      totalAvaliacoes: ok(D.reputacao.totalAvaliacoes)
        ? `· ${D.reputacao.totalAvaliacoes} avaliações no Google` : null
    };

    $$("[data-bind]").forEach((el) => {
      const v = valores[el.dataset.bind];
      if (ok(v)) { el.textContent = v; return; }
      el.innerHTML = `<span class="pendente">${esc(PENDENTE)}</span>`;
    });
  }

  /* --- links de ação (WhatsApp, telefone, rotas) ------------------------ */
  function ligarAcoes() {
    $$('[data-acao="whatsapp"]').forEach((el) => {
      if (!linkWhats) { el.setAttribute("aria-disabled", "true"); el.title = PENDENTE; return; }
      el.href = linkWhats;
      el.target = "_blank";
      el.rel = "noopener";
      el.hidden = false;
    });

    $$('[data-acao="telefone"]').forEach((el) => {
      if (!linkTel) { el.setAttribute("aria-disabled", "true"); el.title = PENDENTE; return; }
      el.href = linkTel;
    });

    const rotas = $('[data-acao="rotas"]');
    if (rotas && alvoMapa) {
      rotas.href = ok(L.linkMaps)
        ? L.linkMaps
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(alvoMapa)}`;
      rotas.target = "_blank";
      rotas.rel = "noopener";
      rotas.hidden = false;
    }
  }

  /* --- estrelas --------------------------------------------------------- */
  function estrelas(nota) {
    const cheias = Math.round(Number(nota));
    return Array.from({ length: 5 }, (_, i) =>
      `<svg class="${i < cheias ? "" : "vazia"}" aria-hidden="true" focusable="false"><use href="#i-estrela"></use></svg>`
    ).join("");
  }

  function renderReputacao() {
    const temNota = ok(D.reputacao.nota);
    const bloco = slot("reputacao-hero");
    if (bloco && temNota) {
      slot("estrelas-hero").innerHTML = estrelas(D.reputacao.nota);
      bloco.hidden = false;
    }

    const resumo = slot("reputacao-resumo");
    if (!resumo) return;
    resumo.textContent = temNota && ok(D.reputacao.totalAvaliacoes)
      ? `Nota ${String(D.reputacao.nota).replace(".", ",")} em ${D.reputacao.totalAvaliacoes} avaliações publicadas no Google.`
      : "";
  }

  /* --- fatos do "Sobre" -------------------------------------------------- */
  function renderFatos() {
    const alvo = slot("fatos");
    if (!alvo) return;
    const linhas = [
      ["Especialidade", D.negocio.categoria],
      ["Responsável técnico", D.negocio.responsavelTecnico],
      ["CRO", D.negocio.cro],
      ["Faixa de preço", D.negocio.faixaPreco]
    ];
    alvo.innerHTML = linhas.map(([rot, val]) => `
      <div>
        <dt>${esc(rot)}</dt>
        <dd>${ok(val) ? esc(val) : `<span class="pendente">${esc(PENDENTE)}</span>`}</dd>
      </div>`).join("");
  }

  /* --- serviços ---------------------------------------------------------- */
  function renderServicos() {
    const alvo = slot("servicos");
    if (!alvo) return;

    if (!D.servicos.length) {
      alvo.innerHTML = aviso(
        "Lista de tratamentos pendente",
        "Os serviços ainda não foram extraídos do Google Maps nem do site oficial. " +
        "Preencha o array `servicos` em js/dados.js e os cartões aparecem automaticamente."
      );
      return;
    }

    alvo.innerHTML = D.servicos.map((s) => `
      <article class="cartao revelar">
        <div class="cartao__icone">${icone("i-check")}</div>
        <h3 class="cartao__titulo">${esc(s.titulo)}</h3>
        ${s.descricao ? `<p class="cartao__texto">${esc(s.descricao)}</p>` : ""}
      </article>`).join("");
  }

  /* --- galeria ----------------------------------------------------------- */
  function renderGaleria() {
    const alvo = slot("galeria");
    if (!alvo) return;

    if (D.galeria.length) {
      alvo.className = "galeria";
      alvo.innerHTML = D.galeria.map((f, i) => `
        <figure class="galeria__item revelar">
          <img src="${esc(f.src)}" alt="${esc(f.alt || "")}"
               loading="${i < 2 ? "eager" : "lazy"}" decoding="async">
        </figure>`).join("");
      return;
    }

    /* Sem fotos reais: bloco cromático da marca, sem legendas inventadas. */
    alvo.className = "galeria galeria--cromatica";
    alvo.innerHTML = Array.from({ length: 6 }, () => `
      <div class="galeria__item revelar" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="46" height="46" style="opacity:.35">
          <path fill="currentColor" d="M16 8c-3 0-4-1.2-6 0-2.4 1.4-2.4 5-1.4 8.4C9.4 19.4 10.6 24 12.6 24c1.6 0 1.8-2.6 3.4-2.6s1.8 2.6 3.4 2.6c2 0 3.2-4.6 4-7.6 1-3.4 1-7-1.4-8.4-2-1.2-3 0-6 0z"/>
        </svg>
      </div>`).join("");

    alvo.insertAdjacentHTML("beforebegin", aviso(
      "Fotos reais pendentes",
      "Enquanto as imagens do local não forem enviadas, esta faixa exibe o padrão cromático da marca. " +
      "Adicione os arquivos em assets/ e liste-os no array `galeria` de js/dados.js."
    ));
  }

  /* --- depoimentos -------------------------------------------------------- */
  function renderDepoimentos() {
    const alvo = slot("depoimentos");
    if (!alvo) return;

    if (!D.depoimentos.length) {
      alvo.removeAttribute("role");
      alvo.removeAttribute("tabindex");
      alvo.style.display = "block";
      alvo.innerHTML = aviso(
        "Avaliações reais pendentes",
        "Nenhum depoimento é exibido até que as avaliações publicadas no Google sejam informadas. " +
        "Depoimentos não podem ser inventados — preencha o array `depoimentos` em js/dados.js."
      );
      return;
    }

    alvo.innerHTML = D.depoimentos.map((d) => {
      const data = d.data
        ? new Date(`${d.data}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        : "";
      return `
      <article class="depoimento revelar">
        ${ok(d.nota) ? `<div class="estrelas" role="img" aria-label="${esc(d.nota)} de 5 estrelas">${estrelas(d.nota)}</div>` : ""}
        <p class="depoimento__texto">${esc(d.texto)}</p>
        <div class="depoimento__rodape">
          <p class="depoimento__nome">${esc(d.nome)}
            ${data ? `<span class="depoimento__data">${esc(data)}</span>` : ""}
          </p>
          <span class="depoimento__data">via Google</span>
        </div>
      </article>`;
    }).join("");

    if (D.depoimentos.length > 1) slot("setas").hidden = false;

    /* O trilho só deve receber foco de teclado quando realmente rola
       (mobile); na grade de desktop um contêiner focável seria ruído. */
    const ajustaFoco = () => {
      const rola = alvo.scrollWidth > alvo.clientWidth + 1;
      if (rola) alvo.setAttribute("tabindex", "0");
      else alvo.removeAttribute("tabindex");
    };
    ajustaFoco();
    window.addEventListener("resize", ajustaFoco);
  }

  /* --- horários ------------------------------------------------------------ */
  function renderHorarios() {
    const alvo = slot("horarios");
    if (!alvo) return;

    if (!H.confirmado) {
      alvo.innerHTML = aviso(
        "Horário de funcionamento pendente",
        "A tabela e o indicador de “aberto agora” só aparecem com os horários reais do Google Maps. " +
        "Preencha `horarios.dias` e marque `horarios.confirmado: true` em js/dados.js."
      );
      return;
    }

    const hoje = agoraNoFuso().dia;
    const linhas = window.DIAS_SEMANA.map((d) => {
      const fs = faixas(H.dias[d.n]);
      const texto = fs.length
        ? fs.map((f) => `${f.abre} – ${f.fecha}`).join(" · ")
        : `<span class="fechado">Fechado</span>`;
      return `<tr class="${d.n === hoje ? "hoje" : ""}">
        <th scope="row">${esc(d.nome)}</th><td>${texto}</td></tr>`;
    }).join("");

    alvo.innerHTML = `<table>
      <caption>Fuso: horário de Brasília</caption>
      <tbody>${linhas}</tbody>
    </table>`;
  }

  function renderSeloHorario() {
    const estado = estadoAgora();
    [["selo-horario", "selo-texto"], ["selo-horario-2", "selo-texto-2"]].forEach(([caixa, txt]) => {
      const el = slot(caixa);
      if (!el || !estado) return;
      el.classList.add(estado.aberto ? "aberto" : "fechado");
      slot(txt).textContent = estado.texto;
      el.hidden = false;
    });
  }

  /* --- localização ---------------------------------------------------------- */
  function renderLocalizacao() {
    const ficha = slot("endereco");
    if (ficha) {
      ficha.innerHTML = enderecoLinha
        ? [
            ok(L.logradouro) ? `<span class="destaque">${esc(L.logradouro)}</span>` : "",
            ok(L.bairro) ? `<span>${esc(L.bairro)}</span>` : "",
            ok(L.cidade) ? `<span>${esc(L.cidade)}${ok(L.estado) ? " - " + esc(L.estado) : ""}</span>` : "",
            ok(L.cep) ? `<span>CEP ${esc(L.cep)}</span>` : ""
          ].join("")
        : `<span class="pendente">${esc(PENDENTE)}</span>`;
    }

    const mapa = slot("mapa");
    if (!mapa) return;
    if (!alvoMapa) {
      mapa.innerHTML = aviso(
        "Mapa pendente",
        "O iframe do Google Maps é gerado com as coordenadas reais. " +
        "Preencha `local.lat` e `local.lng` (ou o endereço completo) em js/dados.js."
      );
      return;
    }

    const q = encodeURIComponent(alvoMapa);
    mapa.innerHTML = `<iframe title="Mapa com a localização da clínica"
      src="https://www.google.com/maps?q=${q}&hl=pt-BR&z=16&output=embed"
      loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      allowfullscreen></iframe>`;
  }

  /* --- comodidades ------------------------------------------------------------ */
  function renderComodidades() {
    const alvo = slot("comodidades");
    if (!alvo) return;
    if (!D.comodidades.length) { alvo.hidden = true; return; }
    alvo.innerHTML = D.comodidades
      .map((c) => `<li>${icone("i-check")}${esc(c.rotulo)}</li>`).join("");
  }

  /* --- redes sociais e rodapé --------------------------------------------------- */
  function renderRedes() {
    const itens = [
      ["instagram", "i-insta", "Instagram"],
      ["facebook", "i-face", "Facebook"]
    ].filter(([k]) => ok(D.redes[k]));

    const alvo = slot("redes");
    if (alvo) {
      alvo.innerHTML = itens.map(([k, ic, rot]) =>
        `<li><a href="${esc(D.redes[k])}" target="_blank" rel="noopener me">
           ${icone(ic)}<span class="sr">${rot}</span></a></li>`).join("");
      alvo.hidden = itens.length === 0;
    }

    const rodape = slot("rodape-redes");
    if (rodape) {
      rodape.innerHTML = itens.length
        ? itens.map(([k, ic, rot]) =>
            `<li><a href="${esc(D.redes[k])}" target="_blank" rel="noopener me">${icone(ic)}${rot}</a></li>`).join("")
        : `<li><span class="pendente">${esc(PENDENTE)}</span></li>`;
    }
  }

  function renderRodape() {
    const contato = slot("rodape-contato");
    if (contato) {
      const linhas = [];
      if (linkWhats) linhas.push(`<li><a href="${linkWhats}" target="_blank" rel="noopener">${icone("i-whats")}WhatsApp</a></li>`);
      if (linkTel) linhas.push(`<li><a href="${linkTel}">${icone("i-fone")}${esc(D.contato.telefone)}</a></li>`);
      if (ok(D.contato.site)) linhas.push(`<li><a href="${esc(D.contato.site)}" target="_blank" rel="noopener">${icone("i-pin")}Site oficial</a></li>`);
      contato.innerHTML = linhas.length ? linhas.join("") : `<li><span class="pendente">${esc(PENDENTE)}</span></li>`;
    }

    const end = slot("rodape-endereco");
    if (end) end.innerHTML = enderecoLinha ? esc(enderecoLinha) : `<span class="pendente">${esc(PENDENTE)}</span>`;

    const resp = slot("responsavel");
    if (resp && (ok(D.negocio.responsavelTecnico) || ok(D.negocio.cro))) {
      resp.textContent = `Responsável técnico: ${ok(D.negocio.responsavelTecnico) ? D.negocio.responsavelTecnico : PENDENTE}` +
        (ok(D.negocio.cro) ? ` — CRO ${D.negocio.cro}` : "");
    }

    const ano = slot("ano");
    if (ano) ano.textContent = new Date().getFullYear();
  }

  /* ---------- SEO: metatags e JSON-LD ------------------------------------------ */

  function renderSeo() {
    const nome = ok(D.negocio.nome) ? D.negocio.nome : null;
    const cidade = ok(L.cidade) ? L.cidade : null;
    if (!nome) return;

    const titulo = [nome, ok(D.negocio.categoria) ? D.negocio.categoria : null, cidade]
      .filter(Boolean).join(" | ");
    const descricao = ok(D.negocio.descricao)
      ? String(D.negocio.descricao).slice(0, 155)
      : (ok(D.negocio.tagline) ? D.negocio.tagline : null);

    document.title = titulo;
    const set = (sel, attr, val) => { const el = $(sel); if (el && val) el.setAttribute(attr, val); };
    set('[data-seo="description"]', "content", descricao);
    set('[data-seo="og:title"]', "content", titulo);
    set('[data-seo="og:description"]', "content", descricao);

    if (ok(D.seo.urlCanonica)) {
      const base = D.seo.urlCanonica.replace(/\/?$/, "/");
      set('[data-seo="canonical"]', "href", base);
      set('[data-seo="og:url"]', "content", base);
      set('[data-seo="og:image"]', "content", base + D.seo.imagemOg.replace(/^\//, ""));
    }

    document.head.appendChild(Object.assign(document.createElement("script"), {
      type: "application/ld+json",
      textContent: JSON.stringify(montarJsonLd(nome), null, 2)
    }));
  }

  /** Monta o LocalBusiness/Dentist somente com o que foi confirmado. */
  function montarJsonLd(nome) {
    const j = { "@context": "https://schema.org", "@type": ["LocalBusiness", "Dentist"], name: nome };

    if (ok(D.negocio.descricao)) j.description = D.negocio.descricao;
    if (ok(D.contato.telefoneE164)) j.telephone = D.contato.telefoneE164;
    if (ok(D.contato.email)) j.email = D.contato.email;
    if (ok(D.negocio.faixaPreco)) j.priceRange = D.negocio.faixaPreco;
    if (ok(D.seo.urlCanonica)) j.url = D.seo.urlCanonica;

    const endereco = {};
    if (ok(L.logradouro)) endereco.streetAddress = L.logradouro;
    if (ok(L.bairro)) endereco.addressLocality = L.bairro;
    if (ok(L.cidade)) endereco.addressRegion = ok(L.estado) ? `${L.cidade}, ${L.estado}` : L.cidade;
    if (ok(L.cep)) endereco.postalCode = L.cep;
    if (Object.keys(endereco).length) {
      j.address = { "@type": "PostalAddress", addressCountry: L.pais, ...endereco };
    }

    if (temCoordenadas) j.geo = { "@type": "GeoCoordinates", latitude: L.lat, longitude: L.lng };

    const perfis = [D.redes.instagram, D.redes.facebook, L.linkMaps].filter(ok);
    if (perfis.length) j.sameAs = perfis;

    if (H.confirmado) {
      const horas = window.DIAS_SEMANA.flatMap((d) =>
        faixas(H.dias[d.n]).map((f) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${d.schema}`,
          opens: f.abre, closes: f.fecha
        })));
      if (horas.length) j.openingHoursSpecification = horas;
    }

    if (ok(D.reputacao.nota) && ok(D.reputacao.totalAvaliacoes)) {
      j.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: D.reputacao.nota,
        reviewCount: D.reputacao.totalAvaliacoes,
        bestRating: 5
      };
    }

    if (D.depoimentos.length) {
      j.review = D.depoimentos.map((d) => ({
        "@type": "Review",
        author: { "@type": "Person", name: d.nome },
        reviewBody: d.texto,
        ...(ok(d.data) ? { datePublished: d.data } : {}),
        ...(ok(d.nota) ? { reviewRating: { "@type": "Rating", ratingValue: d.nota, bestRating: 5 } } : {})
      }));
    }

    if (D.servicos.length) {
      j.hasOfferCatalog = {
        "@type": "OfferCatalog",
        name: "Tratamentos",
        itemListElement: D.servicos.map((s) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: s.titulo }
        }))
      };
    }

    return j;
  }

  /* ---------- interações --------------------------------------------------------- */

  function menuMovel() {
    const botao = $("#menu-botao");
    const menu = $("#menu-principal");
    if (!botao || !menu) return;

    const fechar = () => { menu.classList.remove("aberto"); botao.setAttribute("aria-expanded", "false"); };

    botao.addEventListener("click", () => {
      const aberto = menu.classList.toggle("aberto");
      botao.setAttribute("aria-expanded", String(aberto));
    });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) fechar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    window.addEventListener("resize", () => { if (window.innerWidth > 960) fechar(); });
  }

  function cabecalhoRolado() {
    const el = $("#cabecalho");
    if (!el) return;
    const atualiza = () => el.classList.toggle("rolado", window.scrollY > 8);
    atualiza();
    window.addEventListener("scroll", atualiza, { passive: true });
  }

  function revelarNoScroll() {
    const alvos = $$(".secao, .revelar, .hero__arte");
    if (!("IntersectionObserver" in window) ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) {
      alvos.forEach((el) => el.classList.add("visivel"));
      return;
    }
    alvos.forEach((el) => el.classList.add("revelar"));
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("visivel");
        obs.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.06 });
    alvos.forEach((el) => obs.observe(el));
  }

  function navegacaoAtiva() {
    const links = $$(".menu__lista a");
    const secoes = links
      .map((a) => ({ a, sec: $(a.getAttribute("href")) }))
      .filter((x) => x.sec);
    if (!secoes.length || !("IntersectionObserver" in window)) return;

    /* Mais de uma seção pode cruzar a faixa ao mesmo tempo; marca-se só a
       primeira na ordem do documento, para nunca haver dois itens ativos. */
    const visiveis = new Set();
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) visiveis.add(e.target); else visiveis.delete(e.target);
      });
      const ativa = secoes.find((x) => visiveis.has(x.sec));
      secoes.forEach((x) => x.a.setAttribute("aria-current", String(x === ativa)));
    }, { rootMargin: "-45% 0px -50% 0px" });
    secoes.forEach((x) => obs.observe(x.sec));
  }

  function setasDepoimentos() {
    const trilho = slot("depoimentos");
    if (!trilho) return;
    $$("[data-trilho]").forEach((b) => b.addEventListener("click", () => {
      const passo = trilho.firstElementChild?.getBoundingClientRect().width ?? 300;
      trilho.scrollBy({ left: b.dataset.trilho === "proximo" ? passo + 20 : -(passo + 20), behavior: "smooth" });
    }));
  }

  /* ---------- boot ------------------------------------------------------------------ */

  ligarTextos();
  ligarAcoes();
  renderReputacao();
  renderFatos();
  renderServicos();
  renderGaleria();
  renderDepoimentos();
  renderHorarios();
  renderSeloHorario();
  renderLocalizacao();
  renderComodidades();
  renderRedes();
  renderRodape();
  renderSeo();

  menuMovel();
  cabecalhoRolado();
  revelarNoScroll();
  navegacaoAtiva();
  setasDepoimentos();

  /* Reavalia "aberto agora" a cada minuto, sem recarregar a página. */
  setInterval(renderSeloHorario, 60_000);
})();
