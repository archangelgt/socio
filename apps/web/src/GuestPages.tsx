import { useCallback, useEffect, useState } from "react";
import { type Session, api } from "./api";
import { navigate } from "./marketing/route";

export function ForgotPasswordPage({
  onDone,
}: {
  onDone?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <main className="auth-screen">
      <section className="auth-panel" style={{ margin: "auto" }}>
        <h1>Forgot password</h1>
        <p className="muted">
          Enter your email and we will send a reset link if an account exists.
        </p>
        {error ? <p className="error">{error}</p> : null}
        {sent ? (
          <>
            <p>Check your inbox for a reset link (valid 48 hours).</p>
            <button type="button" onClick={() => navigate("/login")}>
              Back to sign in
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              void api
                .forgotPassword({ email })
                .then(() => {
                  setSent(true);
                  onDone?.();
                })
                .catch((err: Error) => setError(err.message));
            }}
          >
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit">Send reset link</button>
          </form>
        )}
        <p className="muted">
          <a href="/login">← Sign in</a>
        </p>
      </section>
    </main>
  );
}

export function SetPasswordPage({
  token,
  onAuthed,
}: {
  token: string;
  onAuthed: (session: Session) => void;
}) {
  const [preview, setPreview] = useState<{
    purpose: string;
    email: string;
    name: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .previewPasswordToken(token)
      .then((data) => setPreview(data.token))
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const title =
    preview?.purpose === "welcome_set_password"
      ? "Welcome — set your password"
      : "Set a new password";

  return (
    <main className="auth-screen">
      <section className="auth-panel" style={{ margin: "auto" }}>
        <h1>{title}</h1>
        {preview ? (
          <p className="muted">
            {preview.name} · {preview.email}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {preview ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              if (password !== confirm) {
                setError("Passwords do not match.");
                return;
              }
              void api
                .setPassword({ token, password })
                .then(onAuthed)
                .catch((err: Error) => setError(err.message));
            }}
          >
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit">Save password and continue</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export function InvitePage({
  token,
  session,
  onAccepted,
}: {
  token: string;
  session: Session | null | undefined;
  onAccepted: (session: Session) => void;
}) {
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void api
      .previewInvitation(token)
      .then((data) => {
        setEmail(data.invitation.email);
        setRole(data.invitation.role);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  return (
    <main className="auth-screen">
      <section className="auth-panel" style={{ margin: "auto" }}>
        <h1>Workspace invite</h1>
        {error ? <p className="error">{error}</p> : null}
        {done ? (
          <p>You joined the workspace. Opening the app…</p>
        ) : (
          <>
            <p className="muted">
              Invited as <strong>{role || "…"}</strong> for{" "}
              <strong>{email || "…"}</strong>
            </p>
            {!session ? (
              <p className="muted">
                <a href="/login">Sign in</a> with that email, then open this
                link again.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void api
                    .acceptInvitation(token)
                    .then(async () => {
                      const next = await api.me();
                      if (next) {
                        setDone(true);
                        onAccepted(next);
                      }
                    })
                    .catch((err: Error) => setError(err.message));
                }}
              >
                Accept invite
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export function ShareMonthPage({ token }: { token: string }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.sharedMonth>
  > | null>(null);
  const [guestName, setGuestName] = useState("");
  const [body, setBody] = useState("");
  const [pieceId, setPieceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reload = useCallback(() => {
    void api
      .sharedMonth(token)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <main className="auth-screen">
      <section className="auth-panel" style={{ margin: "auto", maxWidth: 640 }}>
        <h1>Shared month</h1>
        {error ? <p className="error">{error}</p> : null}
        {data ? (
          <>
            <p className="muted">
              {data.label || data.yearMonth} · guest review (name only)
            </p>
            <ul className="account-list">
              {data.pieces.map((piece) => (
                <li key={piece.id} className="account-card">
                  <div className="account-copy">
                    <strong>{piece.title}</strong>
                    <p className="muted">{piece.status}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="team-form"
              onSubmit={(event) => {
                event.preventDefault();
                void api
                  .shareFeedback(token, {
                    guestName,
                    body,
                    contentPieceId: pieceId || undefined,
                  })
                  .then(() => {
                    setSent(true);
                    setBody("");
                    setError(null);
                    reload();
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              <h2>Leave feedback</h2>
              <label>
                Your name
                <input
                  required
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>
              <label>
                Piece (optional)
                <select
                  value={pieceId}
                  onChange={(event) => setPieceId(event.target.value)}
                >
                  <option value="">General</option>
                  {data.pieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comment
                <textarea
                  required
                  rows={3}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <button type="submit">Send feedback</button>
              {sent ? (
                <p className="muted">Thanks — feedback recorded.</p>
              ) : null}
            </form>
            {data.feedback.length > 0 ? (
              <section>
                <h2>Feedback</h2>
                {data.feedback.map((item) => (
                  <p key={item.id}>
                    <strong>{item.guestName}:</strong> {item.body}
                  </p>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
