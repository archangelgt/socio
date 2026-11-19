import { useCallback, useEffect, useState } from "react";
import { type Session, api } from "./api";

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
