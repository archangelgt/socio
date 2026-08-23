import type { Locale } from "./route";

export type Localized = Record<Locale, string>;

export type MarketingPost = {
  slug: string;
  date: string;
  title: Localized;
  excerpt: Localized;
  paragraphs: Record<Locale, string[]>;
};

export const POSTS: MarketingPost[] = [
  {
    slug: "ia-antes-de-ocultar",
    date: "2026-08-20",
    title: {
      es: "La IA recomienda. La política oculta.",
      en: "AI recommends. Policy hides.",
      pt: "A IA recomenda. A política esconde.",
    },
    excerpt: {
      es: "Por qué socio no deja que un modelo llame a Instagram directo.",
      en: "Why socio never lets a model call Instagram directly.",
      pt: "Porque o socio não deixa um modelo chamar o Instagram diretamente.",
    },
    paragraphs: {
      es: [
        "Un comentario ofensivo no debería depender del humor de un modelo. socio clasifica, valida el esquema, aplica la política de la organización y recién entonces encola un hide.",
        "Si la confianza es baja, el comentario entra a revisión humana. Si Graph rechaza el hide, el estado queda en fallido y el texto sigue visible — no fingimos que Instagram obedeció.",
        "Eso es V1: menos magia, más control. El publisher y el Brand Brain esperan su fase.",
      ],
      en: [
        "An abusive comment should not depend on a model's mood. socio classifies, validates the schema, applies organization policy, and only then enqueues a hide.",
        "Low confidence goes to human review. If Graph rejects the hide, the state is failed and the comment stays visible — we do not pretend Instagram complied.",
        "That is V1: less magic, more control. Publisher and Brand Brain wait for their phase.",
      ],
      pt: [
        "Um comentário ofensivo não deveria depender do humor de um modelo. O socio classifica, valida o esquema, aplica a política da organização e só então enfileira um hide.",
        "Se a confiança é baixa, o comentário vai a revisão humana. Se o Graph rejeita o hide, o estado fica falhado e o texto segue visível.",
        "Isto é V1: menos magia, mais controlo. Publisher e Brand Brain esperam a sua fase.",
      ],
    },
  },
  {
    slug: "inbox-meta-unificada",
    date: "2026-08-18",
    title: {
      es: "Una cola para comentarios y mensajes",
      en: "One queue for comments and messages",
      pt: "Uma fila para comentários e mensagens",
    },
    excerpt: {
      es: "Instagram y Facebook entran por el mismo adaptador de canal.",
      en: "Instagram and Facebook arrive through the same channel adapter.",
      pt: "Instagram e Facebook entram pelo mesmo adaptador de canal.",
    },
    paragraphs: {
      es: [
        "El inbox de socio lista comentarios en posts y mensajes directos sin convertir la herramienta en un CRM. No hay deals ni contactos de ventas: hay conversaciones sociales.",
        "Cada evento inbound se verifica, se guarda en crudo y se normaliza. Si Meta manda el mismo comentario dos veces, la idempotencia evita duplicados.",
        "Cuando conectas una cuenta, el webhook apunta a socio. El navegador nunca habla con Graph.",
      ],
      en: [
        "socio lists comments on posts and direct messages without turning the product into a CRM. No deals, no sales contacts: social conversations.",
        "Each inbound event is verified, stored raw, then normalized. If Meta sends the same comment twice, idempotency drops the duplicate.",
        "When you connect an account, the webhook points at socio. The browser never talks to Graph.",
      ],
      pt: [
        "O inbox do socio lista comentários em posts e mensagens diretas sem virar um CRM. Não há deals: há conversas sociais.",
        "Cada evento inbound é verificado, guardado em cru e normalizado. Se o Meta mandar o mesmo comentário duas vezes, a idempotência evita duplicados.",
        "Quando liga uma conta, o webhook aponta para o socio. O browser nunca fala com o Graph.",
      ],
    },
  },
  {
    slug: "pagar-desde-latam",
    date: "2026-08-16",
    title: {
      es: "Listo para cobrar en la región",
      en: "Ready to charge in the region",
      pt: "Pronto para cobrar na região",
    },
    excerpt: {
      es: "Tilopay por defecto. Otra pasarela cuando la decidas.",
      en: "Tilopay by default. Another gateway when you pick one.",
      pt: "Tilopay por defeito. Outra gateway quando decidir.",
    },
    paragraphs: {
      es: [
        "El sitio público vende planes Start, Team y Agency. El cobro no vive pegado a un proveedor: un adaptador crea la sesión de checkout.",
        "Hoy el adaptador habla Tilopay si hay llaves, o deja entrar en modo prueba si no. Cambiar de pasarela es cambiar el proveedor, no rehacer precios ni idiomas.",
        "La facturación completa (límites, usage, invoices) es una fase posterior. Comprar el plan no espera esa fase para existir en la web.",
      ],
      en: [
        "The public site sells Start, Team, and Agency. Charging is not glued to one vendor: an adapter creates the checkout session.",
        "Today the adapter talks to Tilopay when keys exist, or enters trial mode when they do not. Switching gateways changes the provider, not prices or languages.",
        "Full billing (limits, usage, invoices) is a later phase. Buying a plan on the site does not wait for that phase.",
      ],
      pt: [
        "O site público vende Start, Team e Agency. A cobrança não fica colada a um fornecedor: um adaptador cria a sessão de checkout.",
        "Hoje o adaptador fala com Tilopay se houver chaves, ou entra em modo de teste se não houver. Trocar de gateway não refaz preços nem idiomas.",
        "A faturação completa é uma fase posterior. Comprar o plano no site não espera por essa fase.",
      ],
    },
  },
];

export function postBySlug(slug: string): MarketingPost | undefined {
  return POSTS.find((item) => item.slug === slug);
}
