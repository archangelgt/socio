import { useCallback, useEffect, useState } from "react";
import { type Session, api } from "./api";

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

function ActionButtons({
  status,
  onAllow,
  onHide,
  onRestore,
}: {
  status: DisplayStatus;
  onAllow: () => void;
  onHide: () => void;
  onRestore: () => void;
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
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [page, setPage] = useState<Page>("moderation");
  const [error, setError] = useState<string | null>(null);

  const organizationId = session?.memberships[0]?.organizationId;

  useEffect(() => {
    void api
      .me()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

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
    }
  }, []);

  if (session === undefined) {
    return (
      <main className="boot">
        <div>
          <img src="/brand/mascot.jpg" alt="" />
          <p>socio</p>
        </div>
      </main>
    );
  }

  if (session === null) {
    return (
      <AuthScreen onAuthed={setSession} error={error} setError={setError} />
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
  onAuthed,
  error,
  setError,
}: {
  onAuthed: (session: Session) => void;
  error: string | null;
  setError: (value: string | null) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <p className="auth-kicker">Social AI Platform</p>
        <img src="/brand/mascot.jpg" alt="Mascota de socio" />
        <h1>
          Your Social <span>AI Team.</span>
        </h1>
        <p>
          Monitor. Moderate. Protect. All your social channels in one place —
          hide offensive comments and keep humans in control.
        </p>
      </section>
      <section className="auth-panel">
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
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(() => {
    void api
      .queue(organizationId)
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message));
  }, [organizationId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <header>
        <h1>Moderation</h1>
        <p className="muted">AI proposes. Policy decides. You can override.</p>
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
      </header>
      {items.length === 0 ? (
        <div className="panel empty">
          <img src="/brand/icon.png" alt="" />
          <p>Nothing to hide… yet.</p>
          <p className="muted">
            Connect a channel and sync comments. Socio will queue what needs a
            human.
          </p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Comment</th>
                <th>When</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = displayStatus(item);
                return (
                  <tr key={item.decisionId}>
                    <td>
                      <div className="comment-cell">
                        <AuthorAvatar name={item.authorDisplayName} />
                        <div>
                          <strong>{item.authorDisplayName ?? "Unknown"}</strong>
                          <div>{item.body}</div>
                          {item.rationale ? (
                            <div className="muted">{item.rationale}</div>
                          ) : null}
                        </div>
                        <PostThumb
                          postId={item.postId}
                          permalink={item.postPermalink}
                        />
                      </div>
                    </td>
                    <td className="muted when">{formatWhen(item.createdAt)}</td>
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
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  const [comments, setComments] = useState<
    Awaited<ReturnType<typeof api.comments>>["comments"]
  >([]);
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof api.conversations>>["conversations"]
  >([]);

  useEffect(() => {
    void Promise.all([
      api.comments(organizationId),
      api.conversations(organizationId),
    ])
      .then(([commentData, conversationData]) => {
        setComments(commentData.comments);
        setConversations(conversationData.conversations);
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, setError]);

  return (
    <>
      <header>
        <h1>Inbox</h1>
        <p className="muted">
          Comments and messages across connected accounts.
        </p>
      </header>
      {conversations.length > 0 ? (
        <>
          <h2>Messages</h2>
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
                {item.lastMessageBody ? <p>{item.lastMessageBody}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h2>Comments</h2>
      {comments.length === 0 ? (
        <div className="empty">
          <img src="/brand/icon.png" alt="" />
          <p>All your channels, one inbox.</p>
          <p className="muted">No comments yet. Sync Instagram to fill this.</p>
        </div>
      ) : (
        <ul className="feed">
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="comment-cell">
                <AuthorAvatar name={comment.authorDisplayName} />
                <div>
                  <div className="row">
                    <strong>{comment.authorDisplayName ?? "Unknown"}</strong>
                    <span className="muted">
                      {formatWhen(comment.createdAt)}
                    </span>
                  </div>
                  <p>{comment.body}</p>
                  <StatusBadge
                    status={displayStatus({
                      moderationStatus: comment.moderationStatus,
                      commentStatus: comment.status,
                    })}
                  />
                  {comment.postBody ? (
                    <p className="muted">On: {comment.postBody}</p>
                  ) : null}
                </div>
                <PostThumb
                  postId={comment.postId}
                  permalink={comment.postPermalink}
                />
              </div>
            </li>
          ))}
        </ul>
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
          never leave the API. Instagram comment webhooks often skip your own
          comments and Development-mode apps; use Sync Instagram comments.
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
