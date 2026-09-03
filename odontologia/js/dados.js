/* ============================================================================
   FONTE ÚNICA DE DADOS DO SITE
   ----------------------------------------------------------------------------
   Tudo que é FATO sobre a clínica mora aqui. O site inteiro (textos de contato,
   horários, mapa, depoimentos, SEO/JSON-LD) é montado a partir deste arquivo.

   REGRA IMPORTANTE:
   Campos ainda não confirmados ficam com o valor PENDENTE. O site detecta esse
   valor e, em vez de exibir informação falsa, mostra um aviso visível de
   "[A CONFIRMAR COM O CLIENTE]" e OMITE o campo dos dados estruturados de SEO.
   Nunca substitua PENDENTE por um valor "aproximado" — preencha só com o dado
   real extraído do Google Maps / site oficial.
   ========================================================================== */

const PENDENTE = "[A CONFIRMAR COM O CLIENTE]";

window.DADOS = {
  pendente: PENDENTE,

  /* --- Identidade ------------------------------------------------------- */
  negocio: {
    nome: PENDENTE,               // Nome oficial no Google Maps
    nomeCurto: PENDENTE,          // Como aparece no cabeçalho/logo
    categoria: PENDENTE,          // Ex.: "Clínica odontológica", "Dentista"
    tagline: PENDENTE,            // Frase de posicionamento (1 linha, do hero)
    descricao: PENDENTE,          // Bio/descrição real do Google ou site oficial
    faixaPreco: PENDENTE,         // Ex.: "R$$" — como o Google exibe
    responsavelTecnico: PENDENTE, // Dentista responsável + CRO (exigência CFO)
    cro: PENDENTE                 // Nº do CRO da clínica/responsável
  },

  /* --- Contato ---------------------------------------------------------- */
  contato: {
    telefone: PENDENTE,           // Formato exibido: "(17) 3XXX-XXXX"
    telefoneE164: PENDENTE,       // Formato para tel: "+551732XXXXXX"
    whatsapp: PENDENTE,           // Só dígitos, com DDI: "5517988382764"
    whatsappMensagem: "Olá! Vim pelo site e gostaria de agendar uma avaliação.",
    email: PENDENTE,
    site: PENDENTE                // Site oficial, se existir
  },

  /* --- Endereço e geolocalização --------------------------------------- */
  local: {
    logradouro: PENDENTE,         // "Rua Exemplo, 123 - Sala 4"
    bairro: PENDENTE,
    cidade: PENDENTE,
    estado: PENDENTE,             // Sigla: "SP"
    cep: PENDENTE,
    pais: "BR",
    lat: null,                    // Número. Ex.: -20.8113
    lng: null,                    // Número. Ex.: -49.3758
    linkMaps: PENDENTE            // URL do perfil no Google Maps
  },

  /* --- Horários --------------------------------------------------------- */
  /* Cada dia: { abre: "08:00", fecha: "18:00" } ou null para fechado.
     Use array para intervalos (almoço): [{abre,fecha},{abre,fecha}].
     Deixe `confirmado: false` enquanto os horários não vierem do Maps.       */
  horarios: {
    confirmado: false,
    fuso: "America/Sao_Paulo",
    dias: {
      1: null, // segunda
      2: null, // terça
      3: null, // quarta
      4: null, // quinta
      5: null, // sexta
      6: null, // sábado
      0: null  // domingo
    }
  },

  /* --- Reputação no Google --------------------------------------------- */
  reputacao: {
    nota: null,                   // Ex.: 4.9  (número, não texto)
    totalAvaliacoes: null         // Ex.: 137  (número inteiro)
  },

  /* --- Depoimentos reais ------------------------------------------------
     SOMENTE avaliações realmente publicadas no Google. Copie o texto na
     íntegra. Nome abreviado ("João S.") para preservar privacidade.
     Enquanto o array estiver vazio, a seção exibe um aviso — nunca invente. */
  depoimentos: [
    // { nome: "João S.", nota: 5, data: "2026-07", texto: "..." },
  ],

  /* --- Serviços ---------------------------------------------------------
     Extraídos do site oficial ou da lista de serviços do Google Maps.
     Enquanto vazio, a seção exibe aviso de pendência.                       */
  servicos: [
    // { titulo: "Implantes", descricao: "...", icone: "implante" },
  ],

  /* --- Comodidades listadas no Maps ------------------------------------- */
  comodidades: [
    // { rotulo: "Estacionamento no local", icone: "estacionamento" },
  ],

  /* --- Galeria ----------------------------------------------------------
     Fotos reais. Sem fotos, a seção renderiza um bloco cromático da marca.  */
  galeria: [
    // { src: "assets/fachada.jpg", alt: "Fachada da clínica" },
  ],

  /* --- Redes sociais ---------------------------------------------------- */
  redes: {
    instagram: PENDENTE,
    facebook: PENDENTE
  },

  /* --- SEO -------------------------------------------------------------- */
  seo: {
    urlCanonica: PENDENTE,        // "https://www.suaclinica.com.br/"
    imagemOg: "assets/og.jpg"
  }
};

/* Rótulos dos dias, na ordem em que a tabela é exibida. */
window.DIAS_SEMANA = [
  { n: 1, nome: "Segunda-feira", curto: "Seg", schema: "Monday" },
  { n: 2, nome: "Terça-feira",   curto: "Ter", schema: "Tuesday" },
  { n: 3, nome: "Quarta-feira",  curto: "Qua", schema: "Wednesday" },
  { n: 4, nome: "Quinta-feira",  curto: "Qui", schema: "Thursday" },
  { n: 5, nome: "Sexta-feira",   curto: "Sex", schema: "Friday" },
  { n: 6, nome: "Sábado",        curto: "Sáb", schema: "Saturday" },
  { n: 0, nome: "Domingo",       curto: "Dom", schema: "Sunday" }
];
