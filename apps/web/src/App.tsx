import { Fragment, useCallback, useEffect, useState } from "react";
import { Mascot } from "./Mascot";
import { type Session, api } from "./api";
import { MarketingSite } from "./marketing/MarketingSite";
import { t } from "./marketing/copy";
import { detectLocale, href, navigate, parseRoute } from "./marketing/route";

type Page = "inbox" | "moderation" | "channels";

type DisplayStatus = "hidden" | "allowed" | "review" | "pending" | "failed";

const displayLabels: Record<DisplayStatus, string> = {
  hidden: "Hidden",
  allowed: "Allowed",
  review: "Needs review",
  pending: "Pending",
  failed: "Failed",
};

function displayStatus(item: {
  moderationStatus: string;
  commentStatus?: string | null;
  finalAction?: string | null;
}): DisplayStatus {
  if (item.moderationStatus === "ACTION_FAILED") {
    return "failed";
  }
  const hidden =
    item.commentStatus === "hidden" ||
    item.commentStatus === "deleted" ||
    item.finalAction === "HIDE" ||
    item.moderationStatus === "AUTO_HIDDEN";
  if (hidden) {
    return "hidden";
  }
  if (item.moderationStatus === "REVIEW_REQUIRED") {
    return "review";
  }
  if (item.moderationStatus === "PENDING") {
    return "pending";
  }
  return "allowed";
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second =
    parts.length > 1 ? (parts[1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

function accountHandle(externalAccountId: string): string {
  const withoutOrg = externalAccountId.replace(/^org:[^:]+:/, "");
  if (withoutOrg.length > 22) {
    return `${withoutOrg.slice(0, 10)}…${withoutOrg.slice(-4)}`;
  }
  return withoutOrg;
}

function providerLabel(provider: string): string {
  if (provider === "instagram") {
    return "Instagram";
  }
  if (provider === "facebook") {
    return "Facebook";
  }
  if (provider === "mock") {
    return "Mock";
  }
  return provider;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guatemala",
    timeZoneName: "short",
  }).format(date);
}

function BrandLockup({ light = false }: { light?: boolean }) {
  return (
    <div className={light ? "brand-lockup brand-lockup-light" : "brand-lockup"}>
      <img className="brand-mark" src="/brand/mark.png" alt="" />
      <div>
        <p className="brand-wordmark">socio</p>
        <p className="brand-tagline">Social AI Platform</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DisplayStatus | string }) {
  const resolved =
    status === "hidden" ||
    status === "allowed" ||
    status === "review" ||
    status === "pending" ||
    status === "failed"
      ? status
      : displayStatus({ moderationStatus: status });
  return (
    <span className={`badge badge-${resolved}`}>{displayLabels[resolved]}</span>
  );
}

function AuthorAvatar({ name }: { name: string | null | undefined }) {
  return (
    <div className="author-avatar" aria-hidden>
      {initials(name)}
    </div>
  );
}

function PostThumb({
  postId,
  permalink,
}: {
  postId: string | null | undefined;
  permalink?: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  if (!postId || hidden) {
    return null;
  }
  const image = (
    <img
      className="post-thumb"
      src={`/api/v1/posts/${postId}/preview`}
      alt="Post"
      onError={() => setHidden(true)}
    />
  );
  if (permalink) {
    return (
      <a
        className="post-thumb-link"
        href={permalink}
        target="_blank"
        rel="noreferrer"
      >
        {image}
      </a>
    );
  }
  return image;
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <title>Inbox</title>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4 8.5 12 13l8-4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <title>Moderation</title>
      <path
        d="M12 3.5 19 6.5v5.2c0 4.1-2.8 7.7-7 8.8-4.2-1.1-7-4.7-7-8.8V6.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 12.1 11.1 14l3.7-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <title>Channels</title>
      <circle cx="7" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle
        cx="12"
        cy="16.2"
        r="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.8 9.4 10.6 14.4M15.2 9.4 13.4 14.4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ProviderMark({ provider }: { provider: string }) {
  const label = providerLabel(provider);
  if (provider === "instagram") {
    return (
      <div className="provider-mark provider-instagram" title={label}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>Instagram</title>
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="5"
            stroke="#fff"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="4.1" stroke="#fff" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1" fill="#fff" />
        </svg>
      </div>
    );
  }
  if (provider === "facebook") {
    return (
      <div className="provider-mark provider-facebook" title={label}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>Facebook</title>
          <path
            d="M14.2 20v-7.1h2.4l.4-2.8h-2.8V8.4c0-.8.2-1.4 1.4-1.4h1.5V4.5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.2H8.6v2.8h2.4V20h3.2Z"
            fill="#fff"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="provider-mark provider-mock" title={label}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <title>Mock</title>
        <rect
          x="6"
          y="8"
          width="12"
          height="10"
          rx="3"
          stroke="#fff"
          strokeWidth="1.7"
        />
        <circle cx="10" cy="13" r="1" fill="#fff" />
        <circle cx="14" cy="13" r="1" fill="#fff" />
        <path
          d="M9 6.5 12 8l3-1.5"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function accountFilterKey(organizationId: string): string {
  return `socio:accountFilter:${organizationId}`;
}

function readStoredAccountId(organizationId: string): string {
  try {
    return sessionStorage.getItem(accountFilterKey(organizationId)) ?? "";
  } catch {
    return "";
  }
}

function storeAccountId(organizationId: string, accountId: string): void {
  try {
    if (accountId) {
      sessionStorage.setItem(accountFilterKey(organizationId), accountId);
    } else {
      sessionStorage.removeItem(accountFilterKey(organizationId));
    }
  } catch {
    // Ignore storage failures in private browsing.
  }
}

type ChannelOption = Awaited<
  ReturnType<typeof api.channels>
>["channels"][number];

type AccountGroup = {
  key: string;
  label: string;
  primaryAccountId: string;
  accountIds: string[];
};

function groupChannels(channels: ChannelOption[]): AccountGroup[] {
  const byPage = new Map<string, ChannelOption[]>();
  const singles: ChannelOption[] = [];

  for (const channel of channels) {
    if (channel.pageId) {
      const bucket = byPage.get(channel.pageId) ?? [];
      bucket.push(channel);
      byPage.set(channel.pageId, bucket);
      continue;
    }
    singles.push(channel);
  }

  const groups: AccountGroup[] = [];
  for (const [pageId, members] of byPage) {
    const facebook = members.find((item) => item.provider === "facebook");
    const primary = facebook ?? members[0];
    if (!primary) {
      continue;
    }
    groups.push({
      key: pageId,
      label: facebook?.displayName ?? primary.displayName,
      primaryAccountId: primary.id,
      accountIds: members.map((item) => item.id),
    });
  }
  for (const channel of singles) {
    groups.push({
      key: channel.id,
      label: channel.displayName,
      primaryAccountId: channel.id,
      accountIds: [channel.id],
    });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

function selectedGroup(
  groups: AccountGroup[],
  accountId: string,
): AccountGroup | undefined {
  if (!accountId) {
    return undefined;
  }
  return groups.find(
    (group) =>
      group.primaryAccountId === accountId ||
      group.accountIds.includes(accountId),
  );
}

function AccountSwitcher({
  groups,
  value,
  onChange,
}: {
  groups: AccountGroup[];
  value: string;
  onChange: (accountId: string) => void;
}) {
  if (groups.length === 0) {
    return null;
  }
  const active = selectedGroup(groups, value);
  return (
    <div
      className="account-switcher"
      role="tablist"
      aria-label="Social account"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!active}
        className={!active ? "active" : ""}
        onClick={() => onChange("")}
      >
        All accounts
      </button>
      {groups.map((group) => {
        const isActive = active?.key === group.key;
        return (
          <button
            key={group.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "active" : ""}
            onClick={() => onChange(group.primaryAccountId)}
          >
            {group.label}
          </button>
        );
      })}
    </div>
  );
}

function AccountBadge({
  accountDisplayName,
  brandName,
  provider,
}: {
  accountDisplayName?: string | null;
  brandName?: string | null;
  provider?: string | null;
}) {
  if (!accountDisplayName) {
    return null;
  }
  const label = brandName
    ? `${accountDisplayName} · ${brandName}`
    : accountDisplayName;
  return (
    <span className="account-badge" title={provider ?? undefined}>
      {label}
    </span>
  );
}

function formatRationale(rationale: string | null | undefined): string | null {
  if (!rationale) {
    return null;
  }
  if (
    /api key|http 401|openai http|anthropic http|ai unavailable/i.test(
      rationale,
    )
  ) {
    return "AI could not classify this comment. Review it manually or sync again.";
  }
  return rationale
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ActionButtons({
  status,
  onAllow,
  onHide,
  onRestore,
  onReply,
  replyOpen,
}: {
  status: DisplayStatus;
  onAllow: () => void;
  onHide: () => void;
  onRestore: () => void;
  onReply: () => void;
  replyOpen: boolean;
}) {
  const hidden = status === "hidden";
  const allowed = status === "allowed";
  return (
    <div className="actions" aria-label="Moderation actions">
      <button
        type="button"
        className={allowed ? "is-current is-allow" : ""}
        aria-pressed={allowed}
        disabled={allowed}
        onClick={onAllow}
      >
        Allow
      </button>
      <button
        type="button"
        className={hidden ? "is-current is-hide" : ""}
        aria-pressed={hidden}
        disabled={hidden}
        onClick={onHide}
      >
        Hide
      </button>
      <button
        type="button"
        className={hidden ? "is-restore" : ""}
        disabled={!hidden}
        onClick={onRestore}
      >
        Restore
      </button>
      <button
        type="button"
        className={replyOpen ? "is-reply is-current" : "is-reply"}
        aria-pressed={replyOpen}
        onClick={onReply}
      >
        Reply
      </button>
    </div>
  );
}

function ReplyComposer({
  replyText,
  onReplyText,
  onSendReply,
  onCancelReply,
  onSuggest,
  replyBusy,
  suggestBusy,
  title = "Public reply",
  hint = "Suggest with AI, edit if needed, then send.",
  placeholder = "Write a public reply…",
}: {
  replyText: string;
  onReplyText: (value: string) => void;
  onSendReply: () => void;
  onCancelReply: () => void;
  onSuggest: () => void;
  replyBusy: boolean;
  suggestBusy: boolean;
  title?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="reply-panel">
      <div className="reply-panel-copy">
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
      </div>
      <textarea
        value={replyText}
        onChange={(event) => onReplyText(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={2000}
        disabled={replyBusy || suggestBusy}
      />
      <div className="reply-panel-actions">
        <button
          type="button"
          className="suggest"
          disabled={replyBusy || suggestBusy}
          onClick={onSuggest}
        >
          {suggestBusy ? "Suggesting…" : "Suggest with AI"}
        </button>
        <button
          type="button"
          disabled={replyBusy || suggestBusy || !replyText.trim()}
          onClick={onSendReply}
        >
          {replyBusy ? "Sending…" : "Send reply"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={replyBusy || suggestBusy}
          onClick={onCancelReply}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [page, setPage] = useState<Page>("moderation");
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState(
    () => window.location.pathname + window.location.search,
  );

  const organizationId = session?.memberships[0]?.organizationId;
  const pathname = path.split("?")[0] ?? "/";
  const route = parseRoute(pathname, navigator.language);
  const locale = detectLocale(navigator.language);

  useEffect(() => {
    const onPop = () =>
      setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    void api
      .me()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (route.kind === "redirect") {
      window.history.replaceState({}, "", route.to);
      setPath(route.to);
    }
  }, [route]);

  useEffect(() => {
    if (route.kind === "login" && session) {
      navigate("/app");
    }
    if (route.kind === "app" && session === null) {
      navigate("/login");
    }
  }, [route.kind, session]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meta = params.get("meta");
    const metaError = params.get("meta_error");
    if (meta === "connected") {
      setPage("channels");
    }
    if (meta === "error" && metaError) {
      setError(metaError);
      setPage("channels");
    }
    if (meta) {
      window.history.replaceState({}, "", window.location.pathname);
      setPath(window.location.pathname);
    }
  }, []);

  if (route.kind === "redirect") {
    return (
      <main className="boot">
        <div>
          <img src="/brand/mascot.png" alt="" />
          <p>socio</p>
        </div>
      </main>
    );
  }

  if (route.kind === "marketing") {
    return (
      <MarketingSite
        locale={route.locale}
        page={route.page}
        slug={route.slug}
        session={session}
      />
    );
  }

  if (route.kind === "login") {
    return (
      <AuthScreen
        locale={locale}
        onAuthed={(next) => {
          setSession(next);
          navigate("/app");
        }}
        error={error}
        setError={setError}
      />
    );
  }

  if (session === undefined) {
    return (
      <main className="boot">
        <div>
          <img src="/brand/mascot.png" alt="" />
          <p>socio</p>
        </div>
      </main>
    );
  }

  if (session === null) {
    return (
      <AuthScreen
        locale={locale}
        onAuthed={(next) => {
          setSession(next);
          navigate("/app");
        }}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <div className="shell">
      <aside>
        <BrandLockup />
        <nav>
          <button
            type="button"
            className={page === "moderation" ? "active" : ""}
            onClick={() => setPage("moderation")}
          >
            <ShieldIcon />
            Moderation
          </button>
          <button
            type="button"
            className={page === "inbox" ? "active" : ""}
            onClick={() => setPage("inbox")}
          >
            <InboxIcon />
            Inbox
          </button>
          <button
            type="button"
            className={page === "channels" ? "active" : ""}
            onClick={() => setPage("channels")}
          >
            <ChannelIcon />
            Channels
          </button>
        </nav>
        <div className="account">
          <p>{session.user.name}</p>
          <p className="muted">{session.memberships[0]?.organizationName}</p>
          <button
            type="button"
            onClick={() => {
              void api.logout().then(() => setSession(null));
            }}
          >
            Sign out
          </button>
          <p className="account-legal">
            <a href="/privacy">Privacy Policy</a>
            {" · "}
            <a href="/terms">Terms of Service</a>
            {" · "}
            <a href="/data-deletion">Data deletion</a>
          </p>
        </div>
      </aside>
      <section className="content">
        {error ? <p className="error">{error}</p> : null}
        {page === "moderation" && organizationId ? (
          <ModerationPage organizationId={organizationId} setError={setError} />
        ) : null}
        {page === "inbox" && organizationId ? (
          <InboxPage organizationId={organizationId} setError={setError} />
        ) : null}
        {page === "channels" && organizationId ? (
          <ChannelsPage organizationId={organizationId} setError={setError} />
        ) : null}
      </section>
    </div>
  );
}

function AuthScreen({
  locale,
  onAuthed,
  error,
  setError,
}: {
  locale: "es" | "en" | "pt";
  onAuthed: (session: Session) => void;
  error: string | null;
  setError: (value: string | null) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const text = t(locale);

  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <p className="auth-kicker">Social AI Platform</p>
        <Mascot alt="Mascota de socio" />
        <h1>
          Your Social <span>AI Team.</span>
        </h1>
        <p>
          Monitor. Moderate. Protect. All your social channels in one place —
          hide offensive comments and keep humans in control.
        </p>
      </section>
      <section className="auth-panel">
        <p className="muted">
          <a
            href={href(locale)}
            onClick={(event) => {
              event.preventDefault();
              navigate(href(locale));
            }}
          >
            ← {text.auth.back}
          </a>
        </p>
        <BrandLockup light />
        <p className="muted">Smarter conversations. Safer communities.</p>
        <div className="tabs">
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Create workspace
          </button>
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const run =
              mode === "register"
                ? api.register({ email, password, name, organizationName })
                : api.login({ email, password });
            void run
              .then(onAuthed)
              .catch((err: Error) => setError(err.message));
          }}
        >
          {mode === "register" ? (
            <>
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label>
                Workspace
                <input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />
              </label>
            </>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">
            {mode === "register" ? "Let AI do the hard work →" : "Sign in"}
          </button>
        </form>
        <p className="auth-legal">
          {mode === "register" ? (
            <>
              By creating a workspace you agree to the{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </>
          ) : (
            <>
              <a href="/privacy">Privacy Policy</a>
              {" · "}
              <a href="/terms">Terms of Service</a>
            </>
          )}
        </p>
      </section>
    </main>
  );
}

type QueueSortField =
  | "createdAt"
  | "severity"
  | "confidence"
  | "status"
  | "author";

type QueueStatusFilter = "" | "review" | "hidden" | "allowed" | "failed";

const STATUS_FILTERS: { id: QueueStatusFilter; label: string }[] = [
  { id: "", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "hidden", label: "Hidden" },
  { id: "allowed", label: "Allowed" },
  { id: "failed", label: "Failed" },
];

const SEVERITY_FILTERS = [
  "",
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

function ModerationPage({
  organizationId,
  setError,
}: {
  organizationId: string;
  setError: (value: string | null) => void;
}) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.queue>>["items"]
  >([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [accountId, setAccountId] = useState(() =>
    readStoredAccountId(organizationId),
  );
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QueueSortField>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [autoReplyBusy, setAutoReplyBusy] = useState(false);
  const groups = groupChannels(channels);

  const activeGroup = selectedGroup(groups, accountId);
  const autoReplyEnabled = Boolean(
    activeGroup &&
      channels.some(
        (channel) =>
          activeGroup.accountIds.includes(channel.id) &&
          channel.autoReplyEnabled,
      ),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const reload = useCallback(() => {
    void api
      .queue(organizationId, {
        socialAccountId: accountId || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        q: search || undefined,
        sort,
        order,
        page,
        pageSize,
      })
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (data.page !== page) {
          setPage(data.page);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [
    organizationId,
    accountId,
    statusFilter,
    severityFilter,
    search,
    sort,
    order,
    page,
    pageSize,
    setError,
  ]);

  useEffect(() => {
    void api
      .channels(organizationId)
      .then((data) => {
        setChannels(data.channels);
        const nextGroups = groupChannels(data.channels);
        if (accountId && !selectedGroup(nextGroups, accountId)) {
          setAccountId("");
          storeAccountId(organizationId, "");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, accountId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const sync = (showBusy: boolean) => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      if (showBusy) {
        setSyncing(true);
      }
      void api
        .syncComments(organizationId)
        .then(() => {
          if (!cancelled) {
            reload();
          }
        })
        .catch((err: Error) => {
          if (!cancelled && showBusy) {
            setError(err.message);
          }
        })
        .finally(() => {
          inFlight = false;
          if (!cancelled && showBusy) {
            setSyncing(false);
          }
        });
    };
    sync(true);
    const timer = window.setInterval(() => sync(false), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId, reload, setError]);

  const activeLabel = selectedGroup(groups, accountId)?.label ?? "All accounts";

  const setAutoReply = (enabled: boolean) => {
    if (!activeGroup) {
      setError("Select an account to configure automatic mode.");
      return;
    }
    setAutoReplyBusy(true);
    void api
      .setChannelAutoReply(organizationId, activeGroup.primaryAccountId, {
        enabled,
        siblingIds: activeGroup.accountIds.filter(
          (id) => id !== activeGroup.primaryAccountId,
        ),
      })
      .then(() => api.channels(organizationId))
      .then((data) => setChannels(data.channels))
      .catch((err: Error) => setError(err.message))
      .finally(() => setAutoReplyBusy(false));
  };

  const toggleSort = (field: QueueSortField) => {
    if (sort === field) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const sortLabel = (field: QueueSortField, label: string) => {
    if (sort !== field) {
      return label;
    }
    return `${label} ${order === "asc" ? "↑" : "↓"}`;
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <header>
        <h1>Moderation</h1>
        <p className="muted">
          AI proposes. Policy decides. You can override. Viewing {activeLabel}.
        </p>
        <div className="auto-reply-bar">
          <label
            className={`auto-reply-toggle ${!activeGroup ? "is-disabled" : ""}`}
          >
            <input
              type="checkbox"
              role="switch"
              aria-checked={autoReplyEnabled}
              checked={autoReplyEnabled}
              disabled={!activeGroup || autoReplyBusy}
              onChange={(event) => setAutoReply(event.target.checked)}
            />
            <span className="auto-reply-track" aria-hidden>
              <span className="auto-reply-thumb" />
            </span>
            <span className="auto-reply-copy">
              <strong>Modo automático</strong>
              <span className="muted">
                {activeGroup
                  ? autoReplyEnabled
                    ? `AI replies publicly on ${activeGroup.label}`
                    : `Off for ${activeGroup.label}`
                  : "Select an account to enable per-account auto replies"}
              </span>
            </span>
          </label>
        </div>
        <AccountSwitcher
          groups={groups}
          value={accountId}
          onChange={(next) => {
            setAccountId(next);
            storeAccountId(organizationId, next);
            setPage(1);
            setReplyFor(null);
            setReplyText("");
          }}
        />
        <div className="moderation-toolbar">
          <div className="status-filter" role="tablist" aria-label="Status">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.id || "all"}
                type="button"
                role="tab"
                aria-selected={statusFilter === item.id}
                className={statusFilter === item.id ? "active" : undefined}
                onClick={() => {
                  setStatusFilter(item.id);
                  setPage(1);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              type="button"
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                void api
                  .syncComments(organizationId)
                  .then(reload)
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setSyncing(false));
              }}
            >
              {syncing ? "Syncing Instagram…" : "Sync Instagram comments"}
            </button>
          </div>
        </div>
        <div className="moderation-controls">
          <label className="moderation-search">
            <span className="sr-only">Search comments</span>
            <input
              type="search"
              value={searchInput}
              placeholder="Search comment, author, account…"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="moderation-select">
            <span className="sr-only">Severity</span>
            <select
              value={severityFilter}
              onChange={(event) => {
                setSeverityFilter(event.target.value);
                setPage(1);
              }}
            >
              {SEVERITY_FILTERS.map((value) => (
                <option key={value || "any"} value={value}>
                  {value ? `Severity: ${value}` : "Any severity"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="panel empty">
          <img src="/brand/icon.png" alt="" />
          <p>
            {total === 0 && (search || statusFilter || severityFilter)
              ? "No comments match these filters."
              : "Nothing to hide… yet."}
          </p>
          <p className="muted">
            {total === 0 && (search || statusFilter || severityFilter)
              ? "Clear search or filters to see the full queue."
              : "Connect a channel and sync comments. Socio will queue what needs a human."}
          </p>
        </div>
      ) : (
        <div className="panel">
          <table className="moderation-table">
            <thead>
              <tr>
                <th>Comment</th>
                <th>Account</th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("createdAt")}
                  >
                    {sortLabel("createdAt", "When")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("status")}
                  >
                    {sortLabel("status", "Status")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("severity")}
                  >
                    {sortLabel("severity", "Severity")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("confidence")}
                  >
                    {sortLabel("confidence", "Confidence")}
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = displayStatus(item);
                const rationale = formatRationale(item.rationale);
                const replyOpen = replyFor === item.commentId;
                return (
                  <Fragment key={item.decisionId}>
                    <tr className={replyOpen ? "is-replying" : undefined}>
                      <td>
                        <div className="comment-cell">
                          <AuthorAvatar name={item.authorDisplayName} />
                          <div>
                            <strong>
                              {item.authorDisplayName ?? "Unknown"}
                            </strong>
                            <div>{item.body}</div>
                            {rationale ? (
                              <div className="ai-note">{rationale}</div>
                            ) : null}
                          </div>
                          <PostThumb
                            postId={item.postId}
                            permalink={item.postPermalink}
                          />
                        </div>
                      </td>
                      <td>
                        <AccountBadge
                          accountDisplayName={item.accountDisplayName}
                          brandName={item.brandName}
                          provider={item.provider}
                        />
                      </td>
                      <td className="muted when">
                        {formatWhen(item.createdAt)}
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td>{item.severity ?? "—"}</td>
                      <td>
                        {item.confidence !== null
                          ? `${Math.round(item.confidence * 100)}%`
                          : "—"}
                      </td>
                      <td>
                        <ActionButtons
                          status={status}
                          onAllow={() => {
                            void api
                              .allow(organizationId, item.decisionId)
                              .then(reload)
                              .catch((err: Error) => setError(err.message));
                          }}
                          onHide={() => {
                            void api
                              .hide(organizationId, item.decisionId)
                              .then(reload)
                              .catch((err: Error) => setError(err.message));
                          }}
                          onRestore={() => {
                            void api
                              .restore(organizationId, item.decisionId)
                              .then(reload)
                              .catch((err: Error) => setError(err.message));
                          }}
                          replyOpen={replyOpen}
                          onReply={() => {
                            setReplyFor((current) =>
                              current === item.commentId
                                ? null
                                : item.commentId,
                            );
                            setReplyText("");
                          }}
                        />
                      </td>
                    </tr>
                    {replyOpen ? (
                      <tr className="reply-row">
                        <td colSpan={7}>
                          <ReplyComposer
                            replyText={replyText}
                            onReplyText={setReplyText}
                            replyBusy={replyBusy}
                            suggestBusy={suggestBusy}
                            onCancelReply={() => {
                              setReplyFor(null);
                              setReplyText("");
                            }}
                            onSuggest={() => {
                              setSuggestBusy(true);
                              void api
                                .suggestReply(organizationId, item.commentId)
                                .then((data) => {
                                  setReplyText(data.suggestion.text);
                                  setError(null);
                                })
                                .catch((err: Error) => setError(err.message))
                                .finally(() => setSuggestBusy(false));
                            }}
                            onSendReply={() => {
                              setReplyBusy(true);
                              void api
                                .replyToComment(
                                  organizationId,
                                  item.commentId,
                                  replyText,
                                )
                                .then(() => {
                                  setReplyFor(null);
                                  setReplyText("");
                                  setError(null);
                                  reload();
                                })
                                .catch((err: Error) => setError(err.message))
                                .finally(() => setReplyBusy(false));
                            }}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="table-footer">
            <p className="muted">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="pager">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InboxPage({
  organizationId,
  setError,
}: {
  organizationId: string;
  setError: (value: string | null) => void;
}) {
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof api.conversations>>["conversations"]
  >([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [accountId, setAccountId] = useState(() =>
    readStoredAccountId(organizationId),
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [threadMessages, setThreadMessages] = useState<
    Awaited<ReturnType<typeof api.conversationMessages>>["messages"]
  >([]);
  const [dmReplyText, setDmReplyText] = useState("");
  const [dmReplyBusy, setDmReplyBusy] = useState(false);
  const [dmSuggestBusy, setDmSuggestBusy] = useState(false);
  const groups = groupChannels(channels);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void api
      .channels(organizationId)
      .then((data) => {
        setChannels(data.channels);
        const nextGroups = groupChannels(data.channels);
        if (accountId && !selectedGroup(nextGroups, accountId)) {
          setAccountId("");
          storeAccountId(organizationId, "");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, accountId, setError]);

  const reloadConversations = useCallback(() => {
    void api
      .conversations(organizationId, {
        socialAccountId: accountId || undefined,
        q: search || undefined,
        order: "desc",
        page,
        pageSize,
      })
      .then((data) => {
        setConversations(data.conversations);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (data.page !== page) {
          setPage(data.page);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, accountId, search, page, pageSize, setError]);

  useEffect(() => {
    reloadConversations();
  }, [reloadConversations]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const sync = (showBusy: boolean) => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      if (showBusy) {
        setSyncing(true);
      }
      void api
        .syncMessages(organizationId)
        .then((result) => {
          if (!cancelled) {
            setSyncWarnings(result.warnings ?? []);
            reloadConversations();
          }
        })
        .catch((err: Error) => {
          if (!cancelled && showBusy) {
            setError(err.message);
          }
        })
        .finally(() => {
          inFlight = false;
          if (!cancelled && showBusy) {
            setSyncing(false);
          }
        });
    };
    sync(true);
    const timer = window.setInterval(() => sync(false), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId, reloadConversations, setError]);

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setDmReplyText("");
    void api
      .conversationMessages(organizationId, conversationId)
      .then((data) => setThreadMessages(data.messages))
      .catch((err: Error) => setError(err.message));
  };

  const activeLabel = selectedGroup(groups, accountId)?.label ?? "All accounts";
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <header>
        <h1>Inbox</h1>
        <p className="muted">
          Direct messages for {activeLabel}. Newest first.
        </p>
        <AccountSwitcher
          groups={groups}
          value={accountId}
          onChange={(next) => {
            setAccountId(next);
            storeAccountId(organizationId, next);
            setPage(1);
            setActiveConversationId(null);
          }}
        />
        <div className="moderation-toolbar">
          <div className="button-row">
            <button
              type="button"
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                void api
                  .syncMessages(organizationId)
                  .then((result) => {
                    setSyncWarnings(result.warnings ?? []);
                    reloadConversations();
                  })
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setSyncing(false));
              }}
            >
              {syncing ? "Syncing messages…" : "Sync messages"}
            </button>
          </div>
          <p className="muted sync-hint">
            Instagram must allow Connected tools access to messages before DMs
            can sync.
          </p>
        </div>
        {syncWarnings.length > 0 ? (
          <output className="sync-warnings">
            {syncWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </output>
        ) : null}
        <div className="moderation-controls">
          <label className="moderation-search">
            <span className="sr-only">Search messages</span>
            <input
              type="search"
              value={searchInput}
              placeholder="Search contact or message…"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
        </div>
      </header>

      {conversations.length === 0 ? (
        <div className="empty">
          <img src="/brand/icon.png" alt="" />
          <p>No direct messages yet.</p>
          <p className="muted">
            Hit Sync messages to pull Instagram and Facebook DMs from Meta.
            Instagram customer DMs need Advanced Access for
            instagram_manage_messages (or the sender must be a Meta App Tester).
            Also enable Connected tools → Allow access to messages on the IG
            account.
          </p>
        </div>
      ) : (
        <>
          <ul className="feed">
            {conversations.map((item) => (
              <li key={item.id}>
                <div className="row">
                  <strong>{item.contactName ?? "Unknown"}</strong>
                  <span className="muted">
                    {formatWhen(item.lastMessageAt)}
                    {item.unread ? " · unread" : ""}
                  </span>
                </div>
                <AccountBadge
                  accountDisplayName={item.accountDisplayName}
                  brandName={item.brandName}
                  provider={item.provider}
                />
                {item.lastMessageBody ? <p>{item.lastMessageBody}</p> : null}
                <div className="button-row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => openConversation(item.id)}
                  >
                    {activeConversationId === item.id ? "Open" : "Reply"}
                  </button>
                </div>
                {activeConversationId === item.id ? (
                  <div className="inbox-thread">
                    <ul className="feed thread-messages">
                      {threadMessages.map((message) => (
                        <li key={message.id}>
                          <div className="row">
                            <strong>
                              {message.direction === "inbound"
                                ? (item.contactName ?? "Contact")
                                : "You"}
                            </strong>
                            <span className="muted">
                              {formatWhen(message.createdAt)}
                            </span>
                          </div>
                          <p>{message.body}</p>
                        </li>
                      ))}
                    </ul>
                    <ReplyComposer
                      title="Direct message"
                      hint="Suggest with AI, edit if needed, then send."
                      placeholder="Write a private reply…"
                      replyText={dmReplyText}
                      onReplyText={setDmReplyText}
                      replyBusy={dmReplyBusy}
                      suggestBusy={dmSuggestBusy}
                      onCancelReply={() => {
                        setActiveConversationId(null);
                        setDmReplyText("");
                      }}
                      onSuggest={() => {
                        setDmSuggestBusy(true);
                        void api
                          .suggestConversationReply(organizationId, item.id)
                          .then((data) => setDmReplyText(data.suggestion.text))
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setDmSuggestBusy(false));
                      }}
                      onSendReply={() => {
                        setDmReplyBusy(true);
                        void api
                          .replyToConversation(
                            organizationId,
                            item.id,
                            dmReplyText,
                          )
                          .then(() =>
                            api.conversationMessages(organizationId, item.id),
                          )
                          .then((data) => {
                            setThreadMessages(data.messages);
                            setDmReplyText("");
                            reloadConversations();
                          })
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setDmReplyBusy(false));
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="moderation-pager">
            <span className="muted">
              {total === 0
                ? "No messages"
                : `${rangeStart}–${rangeEnd} of ${total}`}
            </span>
            <div className="button-row">
              <button
                type="button"
                className="ghost"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ChannelsPage({
  organizationId,
  setError,
}: {
  organizationId: string;
  setError: (value: string | null) => void;
}) {
  const [channels, setChannels] = useState<
    Awaited<ReturnType<typeof api.channels>>["channels"]
  >([]);
  const [brandId, setBrandId] = useState<string>("");
  const [body, setBody] = useState("This product is a scam");
  const [metaConfigured, setMetaConfigured] = useState(false);

  const reload = useCallback(() => {
    void Promise.all([api.channels(organizationId), api.brands(organizationId)])
      .then(([channelData, brandData]) => {
        setChannels(channelData.channels);
        const first = brandData.brands[0];
        if (first) {
          setBrandId(first.id);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    void fetch("/health")
      .then(
        (response) => response.json() as Promise<{ metaConfigured?: boolean }>,
      )
      .then((data) => setMetaConfigured(Boolean(data.metaConfigured)))
      .catch(() => setMetaConfigured(false));
  }, []);

  const mockChannel = channels.find((item) => item.provider === "mock");

  return (
    <>
      <header>
        <h1>Channels</h1>
        <p className="muted">
          Connect Meta (Instagram + Facebook) or use the local mock. Tokens
          never leave the API.
        </p>
        <p className="muted">
          Real-time Instagram comment webhooks need the Meta app in{" "}
          <strong>Live</strong> mode and <strong>Advanced Access</strong> for
          comments. In Development, Meta only pushes comments from app roles —
          Socio still catches everyone via Sync / background poll.
        </p>
      </header>
      {channels.length > 0 ? (
        <ul className="account-list">
          {channels.map((item) => (
            <li key={item.id} className="account-card">
              <ProviderMark provider={item.provider} />
              <div className="account-copy">
                <strong>{item.displayName}</strong>
                <p className="muted">
                  {providerLabel(item.provider)} ·{" "}
                  {accountHandle(item.externalAccountId)}
                </p>
              </div>
              <span
                className={`badge ${item.status === "active" ? "badge-allowed" : "badge-pending"}`}
              >
                {item.status}
              </span>
              <button
                type="button"
                className="disconnect"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Disconnect ${item.displayName}? Inbound events for this account will stop.`,
                    )
                  ) {
                    return;
                  }
                  void api
                    .disconnectChannel(organizationId, item.id)
                    .then(reload)
                    .catch((err: Error) => setError(err.message));
                }}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <img src="/brand/icon.png" alt="" />
          <p>No channels connected yet.</p>
        </div>
      )}
      <div className="button-row">
        <button
          type="button"
          onClick={() => {
            if (!brandId) {
              return;
            }
            void api
              .connectMock(organizationId, {
                brandId,
                displayName: "Demo Instagram",
                externalAccountId: `demo-ig-${organizationId.slice(0, 8)}`,
              })
              .then(reload)
              .catch((err: Error) => setError(err.message));
          }}
        >
          Connect mock Instagram
        </button>
        <button
          type="button"
          onClick={() => {
            if (!brandId) {
              return;
            }
            void api
              .connectMeta(organizationId, { brandId })
              .then((data) => {
                window.location.href = data.authorizationUrl;
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          Connect Meta
        </button>
      </div>
      <p className="muted">
        Connect Meta links every Facebook Page (and linked Instagram) your
        Facebook user can manage — including Disruptorxs if you are a Page
        admin. Disconnect any account you do not want in this workspace.
      </p>
      {metaConfigured ? null : (
        <p className="muted">
          Meta OAuth needs META_APP_ID, META_APP_SECRET, and META_VERIFY_TOKEN
          in `.env`, plus a public HTTPS webhook URL.
        </p>
      )}
      {mockChannel ? (
        <form
          className="simulate panel"
          onSubmit={(event) => {
            event.preventDefault();
            void api
              .simulate({
                externalEventId: crypto.randomUUID(),
                accountId: mockChannel.externalAccountId,
                comment: {
                  externalCommentId: crypto.randomUUID(),
                  externalPostId: "demo-post",
                  authorExternalId: "commenter-1",
                  authorDisplayName: "Alex",
                  body,
                },
                post: { body: "We just launched." },
              })
              .then(() => {
                setError(null);
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          <h2>Simulate inbound comment</h2>
          <p className="muted">
            Sends a mock webhook into {mockChannel.displayName}. Use this to try
            hide / allow without Instagram.
          </p>
          <label>
            Comment body
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </label>
          <button type="submit">Send webhook</button>
        </form>
      ) : null}
    </>
  );
}
