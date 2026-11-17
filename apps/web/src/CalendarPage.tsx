import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function CalendarPage({
  organizationId,
  clientId,
  setError,
}: {
  organizationId: string;
  clientId: string;
  setError: (value: string | null) => void;
}) {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [pieces, setPieces] = useState<
    {
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
      currentVersion: number;
    }[]
  >([]);
  const [title, setTitle] = useState("");
  const [copyText, setCopyText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const reload = useCallback(() => {
    void api
      .calendarPieces(organizationId, clientId, yearMonth)
      .then((data) => setPieces(data.pieces))
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, yearMonth, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <header className="page-header-row">
        <div>
          <h1>Calendar</h1>
          <p className="muted">
            Pieces for this client folder. Share a month link for guest feedback
            (no account).
          </p>
        </div>
        <label>
          Month
          <input
            type="month"
            value={yearMonth}
            onChange={(event) => setYearMonth(event.target.value)}
          />
        </label>
      </header>

      <section className="panel team-panel">
        <h2>New piece</h2>
        <form
          className="team-form"
          onSubmit={(event) => {
            event.preventDefault();
            void api
              .createPiece(organizationId, {
                clientId,
                title,
                copyText,
                scheduledAt: scheduledAt
                  ? new Date(scheduledAt).toISOString()
                  : undefined,
              })
              .then(() => {
                setTitle("");
                setCopyText("");
                setScheduledAt("");
                setError(null);
                reload();
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          <label>
            Title
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Copy
            <textarea
              rows={3}
              value={copyText}
              onChange={(event) => setCopyText(event.target.value)}
            />
          </label>
          <label>
            Scheduled
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <button type="submit">Create piece</button>
        </form>
      </section>

      <section className="panel team-panel">
        <div className="page-header-row">
          <h2>Month pieces</h2>
          <button
            type="button"
            onClick={() => {
              void api
                .createShareLink(organizationId, { clientId, yearMonth })
                .then((data) => {
                  const url = `${window.location.origin}/share/${data.link.token}`;
                  setShareUrl(url);
                  setError(null);
                })
                .catch((err: Error) => setError(err.message));
            }}
          >
            Share month link
          </button>
        </div>
        {shareUrl ? (
          <p className="muted">
            Guest link: <a href={shareUrl}>{shareUrl}</a>
          </p>
        ) : null}
        {pieces.length === 0 ? (
          <p className="muted">No pieces scheduled this month.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.id}>
                    <td>{piece.title}</td>
                    <td>
                      {piece.scheduledAt
                        ? new Intl.DateTimeFormat("es-GT", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "America/Guatemala",
                          }).format(new Date(piece.scheduledAt))
                        : "—"}
                    </td>
                    <td>
                      <select
                        value={piece.status}
                        onChange={(event) => {
                          void api
                            .updatePieceStatus(
                              organizationId,
                              piece.id,
                              event.target.value,
                            )
                            .then(() => {
                              setError(null);
                              reload();
                            })
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        <option value="draft">draft</option>
                        <option value="internal_review">internal_review</option>
                        <option value="client_review">client_review</option>
                        <option value="changes_requested">
                          changes_requested
                        </option>
                        <option value="approved">approved</option>
                      </select>
                    </td>
                    <td>v{piece.currentVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
