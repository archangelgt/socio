export const LOCALES = ["es", "en", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export type MarketingPage =
  | "home"
  | "product"
  | "pricing"
  | "posts"
  | "post"
  | "checkout";

export type AppRoute =
  | { kind: "redirect"; to: string }
  | { kind: "login" }
  | { kind: "app" }
  | {
      kind: "marketing";
      locale: Locale;
      page: MarketingPage;
      slug?: string;
    };

export function detectLocale(language = "es"): Locale {
  const lower = language.toLowerCase();
  if (lower.startsWith("pt")) {
    return "pt";
  }
  if (lower.startsWith("en")) {
    return "en";
  }
  return "es";
}

export function parseRoute(pathname: string, language = "es"): AppRoute {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/login") {
    return { kind: "login" };
  }
  if (clean === "/app") {
    return { kind: "app" };
  }
  if (clean === "/") {
    return { kind: "redirect", to: `/${detectLocale(language)}` };
  }

  const parts = clean.split("/").filter(Boolean);
  const locale = LOCALES.find((item) => item === parts[0]);
  if (!locale) {
    return {
      kind: "redirect",
      to: `/${detectLocale(language)}${clean.startsWith("/") ? clean : `/${clean}`}`,
    };
  }

  const rest = parts.slice(1);
  if (rest.length === 0) {
    return { kind: "marketing", locale, page: "home" };
  }
  const [section, slug] = rest;
  if (section === "product" && !slug) {
    return { kind: "marketing", locale, page: "product" };
  }
  if (section === "pricing" && !slug) {
    return { kind: "marketing", locale, page: "pricing" };
  }
  if (section === "checkout" && !slug) {
    return { kind: "marketing", locale, page: "checkout" };
  }
  if (section === "posts" && slug) {
    return { kind: "marketing", locale, page: "post", slug };
  }
  if (section === "posts") {
    return { kind: "marketing", locale, page: "posts" };
  }
  return { kind: "redirect", to: `/${locale}` };
}

export function href(
  locale: Locale,
  page: MarketingPage | "login" | "app" = "home",
  slug?: string,
): string {
  if (page === "login" || page === "app") {
    return `/${page}`;
  }
  if (page === "home") {
    return `/${locale}`;
  }
  if (page === "post" && slug) {
    return `/${locale}/posts/${slug}`;
  }
  return `/${locale}/${page}`;
}

export function navigate(to: string) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
