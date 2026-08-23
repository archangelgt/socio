import {
  type BillingInterval,
  PLANS,
  type PlanId,
  formatUsd,
  getPlan,
  isBillingInterval,
  planAmountCents,
} from "@social-ai/domain";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Mascot } from "../Mascot";
import { type Session, api } from "../api";
import { t } from "./copy";
import "./marketing.css";
import { POSTS, postBySlug } from "./posts";
import { type Locale, type MarketingPage, href, navigate } from "./route";

function Link({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function Brand({ locale }: { locale: Locale }) {
  return (
    <Link to={href(locale)} className="m-brand">
      <img src="/brand/mark.png" alt="" />
      <span>socio</span>
    </Link>
  );
}

export function MarketingSite({
  locale,
  page,
  slug,
  session,
}: {
  locale: Locale;
  page: MarketingPage;
  slug?: string;
  session: Session | null | undefined;
}) {
  const text = t(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="m-site">
      <header className="m-nav">
        <Brand locale={locale} />
        <nav>
          <Link to={href(locale, "product")}>{text.nav.product}</Link>
          <Link to={href(locale, "posts")}>{text.nav.posts}</Link>
          <Link to={href(locale, "pricing")}>{text.nav.pricing}</Link>
        </nav>
        <div className="m-nav-end">
          <LangSwitch locale={locale} page={page} slug={slug} />
          {session ? (
            <Link to="/app" className="m-btn m-btn-ghost">
              {text.nav.workspace}
            </Link>
          ) : (
            <Link to="/login" className="m-btn m-btn-ghost">
              {text.nav.login}
            </Link>
          )}
          <Link to={href(locale, "pricing")} className="m-btn m-btn-primary">
            {text.nav.buy}
          </Link>
        </div>
      </header>
      {page === "home" ? <HomePage locale={locale} /> : null}
      {page === "product" ? <ProductPage locale={locale} /> : null}
      {page === "pricing" ? <PricingPage locale={locale} /> : null}
      {page === "posts" ? <PostsPage locale={locale} /> : null}
      {page === "post" ? <PostPage locale={locale} slug={slug} /> : null}
      {page === "checkout" ? (
        <CheckoutPage locale={locale} session={session} />
      ) : null}
      <footer className="m-footer">
        <Brand locale={locale} />
        <div>
          <p>{text.footer.product}</p>
          <Link to={href(locale, "product")}>{text.nav.product}</Link>
          <Link to={href(locale, "pricing")}>{text.nav.pricing}</Link>
          <Link to={href(locale, "posts")}>{text.nav.posts}</Link>
        </div>
        <div>
          <p>{text.footer.legal}</p>
          <a href="/privacy">{text.footer.privacy}</a>
          <a href="/terms">{text.footer.terms}</a>
          <a href="/data-deletion">{text.footer.deletion}</a>
        </div>
      </footer>
    </div>
  );
}

function LangSwitch({
  locale,
  page,
  slug,
}: {
  locale: Locale;
  page: MarketingPage;
  slug?: string;
}) {
  return (
    <nav className="m-langs" aria-label="Language">
      {(["es", "en", "pt"] as const).map((item) => (
        <Link
          key={item}
          to={`${href(item, page, slug)}${page === "checkout" ? window.location.search : ""}`}
          className={item === locale ? "active" : undefined}
        >
          {item.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  const text = t(locale);
  return (
    <>
      <section className="m-hero">
        <p className="m-kicker">{text.hero.kicker}</p>
        <h1>
          {text.hero.title} <span>{text.hero.titleAccent}</span>
        </h1>
        <p className="m-lead">{text.hero.body}</p>
        <div className="m-hero-actions">
          <Link to={href(locale, "checkout")} className="m-btn m-btn-primary">
            {text.hero.primary}
          </Link>
          <Link to={href(locale, "pricing")} className="m-btn m-btn-ghost">
            {text.hero.secondary}
          </Link>
        </div>
        <p className="m-note">{text.hero.note}</p>
        <Mascot className="m-hero-art" />
      </section>
      <p className="m-logos">{text.logos}</p>
      <section className="m-section">
        <h2>{text.featuresTitle}</h2>
        <p className="m-lead">{text.featuresBody}</p>
        <div className="m-grid">
          {text.features.map((item) => (
            <article key={item.title} className="m-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="m-section m-section-alt">
        <h2>{text.stepsTitle}</h2>
        <ol className="m-steps">
          {text.steps.map((item, index) => (
            <li key={item.title}>
              <span>{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="m-section">
        <h2>{text.usesTitle}</h2>
        <div className="m-grid m-grid-3">
          {text.uses.map((item) => (
            <article key={item.title} className="m-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <PostsTeaser locale={locale} />
      <PricingGrid locale={locale} />
      <Faq locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}

function ProductPage({ locale }: { locale: Locale }) {
  const text = t(locale);
  return (
    <section className="m-section m-page">
      <h1>{text.product.title}</h1>
      <p className="m-lead">{text.product.body}</p>
      <div className="m-grid">
        {text.product.blocks.map((item) => (
          <article key={item.title} className="m-card">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PricingPage({ locale }: { locale: Locale }) {
  return (
    <section className="m-section m-page">
      <PricingGrid locale={locale} />
      <Faq locale={locale} />
    </section>
  );
}

function PricingGrid({ locale }: { locale: Locale }) {
  const text = t(locale);
  const [interval, setInterval] = useState<BillingInterval>("annual");
  return (
    <div>
      <h2>{text.pricing.title}</h2>
      <p className="m-lead">{text.pricing.body}</p>
      <div className="m-toggle">
        <button
          type="button"
          className={interval === "monthly" ? "active" : ""}
          onClick={() => setInterval("monthly")}
        >
          {text.pricing.monthly}
        </button>
        <button
          type="button"
          className={interval === "annual" ? "active" : ""}
          onClick={() => setInterval("annual")}
        >
          {text.pricing.annual}
        </button>
      </div>
      <div className="m-grid m-grid-3">
        {PLANS.map((plan) => {
          const amount = planAmountCents(plan.id, interval);
          const popular = plan.id === "team";
          return (
            <article
              key={plan.id}
              className={popular ? "m-card m-plan popular" : "m-card m-plan"}
            >
              {popular ? (
                <p className="m-badge">{text.pricing.popular}</p>
              ) : null}
              <h3>{text.pricing.names[plan.id]}</h3>
              <p className="m-price">
                {formatUsd(interval === "annual" ? amount / 10 : amount)}
                <small>/{text.pricing.monthly.toLowerCase()}</small>
              </p>
              {interval === "annual" ? (
                <p className="m-note">
                  {formatUsd(amount)} {text.pricing.billedAnnual}
                </p>
              ) : null}
              <p>{text.pricing.blurbs[plan.id]}</p>
              <p>
                {plan.profiles} {text.pricing.profiles} · {plan.seats}{" "}
                {text.pricing.seats}
              </p>
              <ul>
                {text.pricing.included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link
                to={`${href(locale, "checkout")}?plan=${plan.id}&interval=${interval}`}
                className="m-btn m-btn-primary"
              >
                {text.pricing.cta}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PostsTeaser({ locale }: { locale: Locale }) {
  const text = t(locale);
  return (
    <section className="m-section m-section-alt">
      <h2>{text.posts.title}</h2>
      <p className="m-lead">{text.posts.body}</p>
      <div className="m-grid m-grid-3">
        {POSTS.map((post) => (
          <article key={post.slug} className="m-card">
            <p className="m-note">{post.date}</p>
            <h3>{post.title[locale]}</h3>
            <p>{post.excerpt[locale]}</p>
            <Link to={href(locale, "post", post.slug)}>{text.posts.read}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function PostsPage({ locale }: { locale: Locale }) {
  return (
    <section className="m-section m-page">
      <PostsTeaser locale={locale} />
    </section>
  );
}

function PostPage({ locale, slug }: { locale: Locale; slug?: string }) {
  const post = slug ? postBySlug(slug) : undefined;
  const text = t(locale);
  if (!post) {
    return (
      <section className="m-section m-page">
        <p>{text.posts.title}</p>
        <Link to={href(locale, "posts")}>{text.posts.read}</Link>
      </section>
    );
  }
  return (
    <article className="m-section m-page m-article">
      <p className="m-note">{post.date}</p>
      <h1>{post.title[locale]}</h1>
      {post.paragraphs[locale].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </article>
  );
}

function Faq({ locale }: { locale: Locale }) {
  const text = t(locale);
  return (
    <section className="m-section">
      <h2>{text.faqTitle}</h2>
      <div className="m-faq">
        {text.faq.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ locale }: { locale: Locale }) {
  const text = t(locale);
  return (
    <section className="m-cta">
      <h2>{text.cta.title}</h2>
      <p>{text.cta.body}</p>
      <Link to={href(locale, "checkout")} className="m-btn m-btn-primary">
        {text.cta.button}
      </Link>
    </section>
  );
}

function CheckoutPage({
  locale,
  session,
}: {
  locale: Locale;
  session: Session | null | undefined;
}) {
  const text = t(locale);
  const params = new URLSearchParams(window.location.search);
  const planId = (params.get("plan") ?? "team") as PlanId;
  const interval = isBillingInterval(params.get("interval") ?? "")
    ? (params.get("interval") as BillingInterval)
    : "annual";
  const plan = getPlan(
    planId === "start" || planId === "team" || planId === "agency"
      ? planId
      : "team",
  );
  const amount = planAmountCents(plan.id, interval);
  const [name, setName] = useState(session?.user.name ?? "");
  const [organizationName, setOrganizationName] = useState(
    session?.memberships[0]?.organizationName ?? "",
  );
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<{
    provider: string;
    configured: boolean;
  } | null>(null);

  useEffect(() => {
    void api
      .checkoutConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const providerLabel = useMemo(() => {
    if (!config) {
      return text.checkout.mock;
    }
    if (config.provider === "tilopay" && config.configured) {
      return text.checkout.tilopay;
    }
    if (config.provider === "tilopay") {
      return text.checkout.unconfigured;
    }
    return text.checkout.mock;
  }, [config, text]);

  return (
    <section className="m-section m-page m-checkout">
      <div>
        <h1>{text.checkout.title}</h1>
        <p className="m-lead">{text.checkout.body}</p>
        <article className="m-card">
          <h3>{text.pricing.names[plan.id]}</h3>
          <p className="m-price">{formatUsd(amount)}</p>
          <p>{text.pricing.blurbs[plan.id]}</p>
          <p className="m-note">{providerLabel}</p>
        </article>
      </div>
      <form
        className="m-card"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          const origin = window.location.origin;
          const successUrl = `${origin}/app`;
          const cancelUrl = `${origin}${href(locale, "checkout")}?plan=${plan.id}&interval=${interval}`;
          const ensureSession = session
            ? Promise.resolve()
            : api.register({ email, password, name, organizationName });
          void ensureSession
            .then(() =>
              api.createCheckout({
                planId: plan.id,
                interval,
                email,
                organizationName:
                  organizationName ||
                  session?.memberships[0]?.organizationName ||
                  "",
                successUrl,
                cancelUrl,
              }),
            )
            .then((result) => {
              window.location.assign(result.url);
            })
            .catch((err: Error) => {
              setError(err.message);
              setBusy(false);
            });
        }}
      >
        {session ? null : (
          <>
            <label>
              {text.checkout.name}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label>
              {text.checkout.workspace}
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
              />
            </label>
            <label>
              {text.checkout.email}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              {text.checkout.password}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
        <button className="m-btn m-btn-primary" type="submit" disabled={busy}>
          {text.checkout.pay}
        </button>
      </form>
    </section>
  );
}
