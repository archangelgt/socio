import type { Locale } from "./route";

type Copy = {
  nav: {
    product: string;
    pricing: string;
    posts: string;
    login: string;
    workspace: string;
    buy: string;
  };
  hero: {
    kicker: string;
    title: string;
    titleAccent: string;
    body: string;
    primary: string;
    secondary: string;
    note: string;
  };
  logos: string;
  featuresTitle: string;
  featuresBody: string;
  features: Array<{ title: string; body: string }>;
  stepsTitle: string;
  steps: Array<{ title: string; body: string }>;
  usesTitle: string;
  uses: Array<{ title: string; body: string }>;
  product: {
    title: string;
    body: string;
    blocks: Array<{ title: string; body: string }>;
  };
  pricing: {
    title: string;
    body: string;
    monthly: string;
    annual: string;
    billedAnnual: string;
    profiles: string;
    seats: string;
    cta: string;
    popular: string;
    included: string[];
    names: Record<"start" | "team" | "agency", string>;
    blurbs: Record<"start" | "team" | "agency", string>;
  };
  posts: { title: string; body: string; read: string };
  faqTitle: string;
  faq: Array<{ q: string; a: string }>;
  cta: { title: string; body: string; button: string };
  footer: {
    product: string;
    legal: string;
    privacy: string;
    terms: string;
    deletion: string;
  };
  checkout: {
    title: string;
    body: string;
    name: string;
    workspace: string;
    email: string;
    password: string;
    pay: string;
    mock: string;
    tilopay: string;
    unconfigured: string;
  };
  auth: { back: string };
};

export const copy: Record<Locale, Copy> = {
  es: {
    nav: {
      product: "Producto",
      pricing: "Precios",
      posts: "Blog",
      login: "Entrar",
      workspace: "Workspace",
      buy: "Comprar",
    },
    hero: {
      kicker: "Moderación social con IA",
      title: "Oculta el odio.",
      titleAccent: "Deja lo humano.",
      body: "socio conecta Instagram y Facebook, junta comentarios y mensajes, y deja que la IA oculte abuso con políticas tuyas y revisión humana.",
      primary: "Empezar ahora",
      secondary: "Ver precios",
      note: "V1 en Meta. Sin tarjeta si usas el modo prueba.",
    },
    logos: "Hecho para marcas, agencias y community managers en Latinoamérica.",
    featuresTitle: "Lo que hace socio hoy",
    featuresBody:
      "Inbox unificada y moderación de comentarios. El resto del producto llega por fases, no como promesas vacías.",
    features: [
      {
        title: "Inbox Meta",
        body: "Comentarios y mensajes de Instagram y Facebook en un solo lugar, con el post de contexto.",
      },
      {
        title: "Moderación con IA",
        body: "Clasifica, mide confianza y oculta cuando la política lo permite. Lo dudoso va a revisión.",
      },
      {
        title: "Humanos al mando",
        body: "Un moderador puede confirmar, deshacer y dejar auditoría. La IA no llama a Instagram sola.",
      },
      {
        title: "Multi-tenant",
        body: "Organizaciones, marcas y roles desde el día uno. Cada cuenta social vive en un solo workspace.",
      },
    ],
    stepsTitle: "Cómo entra un comentario",
    steps: [
      {
        title: "Conecta la cuenta",
        body: "OAuth de Meta. El webhook llega a socio, no a un script suelto.",
      },
      {
        title: "La IA recomienda",
        body: "Taxonomía fija, política de la organización, y cola de salida.",
      },
      {
        title: "Instagram oculta",
        body: "Hide reversible cuando Graph lo permite. Todo queda en auditoría.",
      },
    ],
    usesTitle: "Para quién es",
    uses: [
      {
        title: "Marca",
        body: "Protege la comunidad de la página sin vivir pegado al celular.",
      },
      {
        title: "Agencia",
        body: "Varias marcas en una organización, con roles y un registro de qué se ocultó.",
      },
      {
        title: "Community",
        body: "Cola de revisión clara: oculto, permitido, fallido o pendiente de humano.",
      },
    ],
    product: {
      title: "Producto V1",
      body: "socio no es un CRM ni un publisher. El corte actual es inbox Meta más moderación automática de comentarios.",
      blocks: [
        {
          title: "Comentarios y mensajes",
          body: "Lista unificada, estado de lectura, autor, red y preview del post cuando Graph lo entrega.",
        },
        {
          title: "Política antes que el modelo",
          body: "La IA no autoriza. Clasifica. La política decide hide, revisión o dejar pasar.",
        },
        {
          title: "Auditoría",
          body: "Cada decisión queda registrada: origen, acción, y si el canal pudo ejecutarla.",
        },
      ],
    },
    pricing: {
      title: "Precios claros",
      body: "Paga mensual o anual (dos meses incluidos). El cobro sale por Tilopay u otra pasarela cuando la configures.",
      monthly: "Mensual",
      annual: "Anual",
      billedAnnual: "facturados ahora (10 meses)",
      profiles: "perfiles sociales",
      seats: "asientos",
      cta: "Comprar este plan",
      popular: "Recomendado",
      included: [
        "Inbox Instagram y Facebook",
        "Moderación de comentarios con IA",
        "Revisión humana y deshacer",
        "Auditoría de acciones",
      ],
      names: { start: "Start", team: "Team", agency: "Agency" },
      blurbs: {
        start: "Una marca, un perfil, empezar a ocultar abuso.",
        team: "El plan de trabajo: varios perfiles y asientos.",
        agency: "Varias marcas y más volumen de comentarios.",
      },
    },
    posts: {
      title: "Blog",
      body: "Notas de producto y operación social.",
      read: "Leer",
    },
    faqTitle: "Preguntas",
    faq: [
      {
        q: "¿Necesito tarjeta para probar?",
        a: "No. Sin pasarela configurada el checkout crea el workspace en modo prueba. Con Tilopay, el cobro es real.",
      },
      {
        q: "¿Qué redes hay hoy?",
        a: "Instagram y Facebook (Meta). No hay TikTok, LinkedIn ni publisher en V1.",
      },
      {
        q: "¿La IA oculta sola?",
        a: "Solo si la política de la organización lo permite y la confianza es alta. Si no, entra a revisión humana.",
      },
      {
        q: "¿Cómo pago?",
        a: "Checkout en socio. El proveedor por defecto es Tilopay; se puede cambiar a otra pasarela sin rehacer el sitio.",
      },
    ],
    cta: {
      title: "Pon la moderación en piloto automático.",
      body: "Conecta Meta, deja la política escrita, y que socio oculte lo que no debe verse.",
      button: "Crear workspace",
    },
    footer: {
      product: "Producto",
      legal: "Legal",
      privacy: "Privacidad",
      terms: "Términos",
      deletion: "Borrado de datos",
    },
    checkout: {
      title: "Comprar socio",
      body: "Crea el workspace y paga el plan. Si Tilopay no está configurado, entras en modo prueba.",
      name: "Nombre",
      workspace: "Workspace",
      email: "Email",
      password: "Contraseña",
      pay: "Pagar y entrar",
      mock: "Modo prueba (sin cobro)",
      tilopay: "Pago con Tilopay",
      unconfigured: "Tilopay aún no tiene llaves. El workspace se crea igual.",
    },
    auth: { back: "Volver al sitio" },
  },
  en: {
    nav: {
      product: "Product",
      pricing: "Pricing",
      posts: "Blog",
      login: "Sign in",
      workspace: "Workspace",
      buy: "Buy",
    },
    hero: {
      kicker: "AI social moderation",
      title: "Hide the abuse.",
      titleAccent: "Keep the humans.",
      body: "socio connects Instagram and Facebook, collects comments and messages, and lets AI hide abuse under your policies — with humans still in control.",
      primary: "Get started",
      secondary: "See pricing",
      note: "V1 is Meta only. No card required in trial mode.",
    },
    logos: "Built for brands, agencies, and community teams in Latin America.",
    featuresTitle: "What socio does now",
    featuresBody:
      "Unified inbox and comment moderation. Later phases stay later — we do not sell a publisher we have not built.",
    features: [
      {
        title: "Meta inbox",
        body: "Instagram and Facebook comments and messages in one queue, with post context.",
      },
      {
        title: "AI moderation",
        body: "Classify, score confidence, and hide when policy allows. Uncertain cases go to review.",
      },
      {
        title: "Humans in control",
        body: "A moderator can confirm, undo, and read the audit. The model never calls Instagram directly.",
      },
      {
        title: "Multi-tenant",
        body: "Organizations, brands, and roles from day one. Each social account belongs to one workspace.",
      },
    ],
    stepsTitle: "How a comment is handled",
    steps: [
      {
        title: "Connect the account",
        body: "Meta OAuth. The webhook hits socio, not a one-off script.",
      },
      {
        title: "AI recommends",
        body: "Fixed taxonomy, organization policy, then the outbound queue.",
      },
      {
        title: "Instagram hides it",
        body: "Reversible hide when Graph allows it. Every action is audited.",
      },
    ],
    usesTitle: "Who it is for",
    uses: [
      {
        title: "Brand",
        body: "Protect the page community without living inside the native apps.",
      },
      {
        title: "Agency",
        body: "Several brands in one organization, with roles and a record of what was hidden.",
      },
      {
        title: "Community",
        body: "A clear queue: hidden, allowed, failed, or waiting on a human.",
      },
    ],
    product: {
      title: "V1 product",
      body: "socio is not a CRM and not a publisher. The current cut is a Meta inbox plus automatic comment moderation.",
      blocks: [
        {
          title: "Comments and messages",
          body: "Unified list, read state, author, network, and a post preview when Graph provides one.",
        },
        {
          title: "Policy before the model",
          body: "AI does not authorize. It classifies. Policy decides hide, review, or leave visible.",
        },
        {
          title: "Audit",
          body: "Every decision is stored: source, action, and whether the channel could execute it.",
        },
      ],
    },
    pricing: {
      title: "Straightforward pricing",
      body: "Pay monthly or annually (two months included). Charges go through Tilopay or another gateway when you configure it.",
      monthly: "Monthly",
      annual: "Annual",
      billedAnnual: "billed now (10 months)",
      profiles: "social profiles",
      seats: "seats",
      cta: "Buy this plan",
      popular: "Recommended",
      included: [
        "Instagram and Facebook inbox",
        "AI comment moderation",
        "Human review and undo",
        "Action audit trail",
      ],
      names: { start: "Start", team: "Team", agency: "Agency" },
      blurbs: {
        start: "One brand, one profile, start hiding abuse.",
        team: "The working plan: several profiles and seats.",
        agency: "More brands and higher comment volume.",
      },
    },
    posts: {
      title: "Blog",
      body: "Product notes and social operations.",
      read: "Read",
    },
    faqTitle: "Questions",
    faq: [
      {
        q: "Do I need a card to try it?",
        a: "No. Without a configured gateway, checkout creates the workspace in trial mode. With Tilopay, the charge is real.",
      },
      {
        q: "Which networks ship today?",
        a: "Instagram and Facebook (Meta). No TikTok, LinkedIn, or publisher in V1.",
      },
      {
        q: "Does AI hide on its own?",
        a: "Only when organization policy allows it and confidence is high. Otherwise a human reviews it.",
      },
      {
        q: "How do I pay?",
        a: "Checkout inside socio. Tilopay is the default provider; another gateway can replace it without rebuilding the site.",
      },
    ],
    cta: {
      title: "Put moderation on rails.",
      body: "Connect Meta, write the policy, and let socio hide what should not stay public.",
      button: "Create workspace",
    },
    footer: {
      product: "Product",
      legal: "Legal",
      privacy: "Privacy",
      terms: "Terms",
      deletion: "Data deletion",
    },
    checkout: {
      title: "Buy socio",
      body: "Create the workspace and pay for the plan. If Tilopay is not configured, you enter trial mode.",
      name: "Name",
      workspace: "Workspace",
      email: "Email",
      password: "Password",
      pay: "Pay and enter",
      mock: "Trial mode (no charge)",
      tilopay: "Pay with Tilopay",
      unconfigured: "Tilopay keys are missing. The workspace is still created.",
    },
    auth: { back: "Back to the site" },
  },
  pt: {
    nav: {
      product: "Produto",
      pricing: "Preços",
      posts: "Blog",
      login: "Entrar",
      workspace: "Workspace",
      buy: "Comprar",
    },
    hero: {
      kicker: "Moderação social com IA",
      title: "Esconda o abuso.",
      titleAccent: "Mantenha o humano.",
      body: "O socio conecta Instagram e Facebook, junta comentários e mensagens, e deixa a IA esconder abuso com as suas políticas — com revisão humana.",
      primary: "Começar agora",
      secondary: "Ver preços",
      note: "V1 só no Meta. Sem cartão no modo de teste.",
    },
    logos:
      "Feito para marcas, agências e community managers na América Latina.",
    featuresTitle: "O que o socio faz hoje",
    featuresBody:
      "Inbox unificada e moderação de comentários. O resto do produto chega por fases.",
    features: [
      {
        title: "Inbox Meta",
        body: "Comentários e mensagens de Instagram e Facebook num só sítio, com o post de contexto.",
      },
      {
        title: "Moderação com IA",
        body: "Classifica, mede confiança e esconde quando a política permite. O duvidoso vai a revisão.",
      },
      {
        title: "Humanos no comando",
        body: "Um moderador confirma, desfaz e lê a auditoria. A IA não chama o Instagram sozinha.",
      },
      {
        title: "Multi-tenant",
        body: "Organizações, marcas e papéis desde o primeiro dia. Cada conta social vive num workspace.",
      },
    ],
    stepsTitle: "Como entra um comentário",
    steps: [
      {
        title: "Ligue a conta",
        body: "OAuth do Meta. O webhook chega ao socio, não a um script solto.",
      },
      {
        title: "A IA recomenda",
        body: "Taxonomia fixa, política da organização e fila de saída.",
      },
      {
        title: "O Instagram esconde",
        body: "Hide reversível quando o Graph deixa. Tudo fica na auditoria.",
      },
    ],
    usesTitle: "Para quem é",
    uses: [
      {
        title: "Marca",
        body: "Proteja a comunidade da página sem viver colado ao telemóvel.",
      },
      {
        title: "Agência",
        body: "Várias marcas numa organização, com papéis e registo do que foi escondido.",
      },
      {
        title: "Community",
        body: "Fila clara: escondido, permitido, falhado ou à espera de humano.",
      },
    ],
    product: {
      title: "Produto V1",
      body: "O socio não é um CRM nem um publisher. O corte atual é inbox Meta mais moderação automática de comentários.",
      blocks: [
        {
          title: "Comentários e mensagens",
          body: "Lista unificada, estado de leitura, autor, rede e preview do post quando o Graph entrega.",
        },
        {
          title: "Política antes do modelo",
          body: "A IA não autoriza. Classifica. A política decide hide, revisão ou deixar passar.",
        },
        {
          title: "Auditoria",
          body: "Cada decisão fica registada: origem, ação e se o canal conseguiu executá-la.",
        },
      ],
    },
    pricing: {
      title: "Preços claros",
      body: "Pague mensal ou anual (dois meses incluídos). A cobrança sai pelo Tilopay ou outra gateway quando configurar.",
      monthly: "Mensal",
      annual: "Anual",
      billedAnnual: "cobrados agora (10 meses)",
      profiles: "perfis sociais",
      seats: "lugares",
      cta: "Comprar este plano",
      popular: "Recomendado",
      included: [
        "Inbox Instagram e Facebook",
        "Moderação de comentários com IA",
        "Revisão humana e desfazer",
        "Auditoria de ações",
      ],
      names: { start: "Start", team: "Team", agency: "Agency" },
      blurbs: {
        start: "Uma marca, um perfil, começar a esconder abuso.",
        team: "O plano de trabalho: vários perfis e lugares.",
        agency: "Mais marcas e mais volume de comentários.",
      },
    },
    posts: {
      title: "Blog",
      body: "Notas de produto e operação social.",
      read: "Ler",
    },
    faqTitle: "Perguntas",
    faq: [
      {
        q: "Preciso de cartão para testar?",
        a: "Não. Sem gateway configurada, o checkout cria o workspace em modo de teste. Com Tilopay, a cobrança é real.",
      },
      {
        q: "Que redes existem hoje?",
        a: "Instagram e Facebook (Meta). Não há TikTok, LinkedIn nem publisher no V1.",
      },
      {
        q: "A IA esconde sozinha?",
        a: "Só se a política da organização permitir e a confiança for alta. Caso contrário, vai a revisão humana.",
      },
      {
        q: "Como pago?",
        a: "Checkout no socio. O fornecedor padrão é Tilopay; pode trocar de gateway sem refazer o site.",
      },
    ],
    cta: {
      title: "Ponha a moderação em piloto automático.",
      body: "Ligue o Meta, escreva a política, e deixe o socio esconder o que não deve ficar público.",
      button: "Criar workspace",
    },
    footer: {
      product: "Produto",
      legal: "Legal",
      privacy: "Privacidade",
      terms: "Termos",
      deletion: "Apagar dados",
    },
    checkout: {
      title: "Comprar socio",
      body: "Crie o workspace e pague o plano. Se o Tilopay não estiver configurado, entra em modo de teste.",
      name: "Nome",
      workspace: "Workspace",
      email: "Email",
      password: "Palavra-passe",
      pay: "Pagar e entrar",
      mock: "Modo de teste (sem cobrança)",
      tilopay: "Pagar com Tilopay",
      unconfigured:
        "Ainda não há chaves Tilopay. O workspace é criado na mesma.",
    },
    auth: { back: "Voltar ao site" },
  },
};

export function t(locale: Locale): Copy {
  return copy[locale];
}
