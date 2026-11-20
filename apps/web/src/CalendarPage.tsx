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
  const [channels, setChannels] = useState<
    { id: string; displayName: string; provider: string; status: string }[]
  >([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [copyText, setCopyText] = useState("");
  const [notesInternal, setNotesInternal] = useState("");
  const [notesClient, setNotesClient] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<
    Record<
      string,
      {
        id: string;
        status: string;
        provider: string;
        displayName: string;
        permalink: string | null;
        lastError: string | null;
      }[]
    >
  >({});

  const reload = useCallback(() => {
    void api
      .calendarPieces(organizationId, clientId, yearMonth)
      .then((data) => setPieces(data.pieces))
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, yearMonth, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    void api
      .channels(organizationId, clientId)
      .then((data) => {
        const active = data.channels.filter((item) => item.status === "active");
        setChannels(active);
        setSelectedChannels(active.map((item) => item.id));
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, setError]);

  const loadDestinations = (pieceId: string) => {
    void api
      .pieceDestinations(organizationId, pieceId)
      .then((data) => {
        setDestinations((current) => ({
          ...current,
          [pieceId]: data.destinations,
        }));
      })
      .catch((err: Error) => setError(err.message));
  };

  return (
    <>
      <header className="page-header-row">
        <div>
          <h1>Calendar</h1>
          <p className="muted">
            Create pieces, approve them, then publish to connected channels.
            Instagram feed needs a public image URL; Facebook can post text.
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
                notesInternal: notesInternal || undefined,
                notesClient: notesClient || undefined,
                imageUrl: imageUrl || undefined,
                scheduledAt: scheduledAt
                  ? new Date(scheduledAt).toISOString()
                  : undefined,
              })
              .then(() => {
                setTitle("");
                setCopyText("");
                setNotesInternal("");
                setNotesClient("");
                setImageUrl("");
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
            Internal notes
            <textarea
              rows={2}
              value={notesInternal}
              onChange={(event) => setNotesInternal(event.target.value)}
            />
          </label>
          <label>
            Client notes
            <textarea
              rows={2}
              value={notesClient}
              onChange={(event) => setNotesClient(event.target.value)}
            />
          </label>
          <label>
            Image URL (required for Instagram publish)
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://…"
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
        <h2>Publish destinations</h2>
        <p className="muted">
          Select channels used when you click Publish on an approved piece.
        </p>
        <div className="scope-fieldset">
          {channels.length === 0 ? (
            <p className="muted">No active channels on this client.</p>
          ) : (
            channels.map((channel) => (
              <label key={channel.id} className="scope-option">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.id)}
                  onChange={(event) => {
                    setSelectedChannels((current) =>
                      event.target.checked
                        ? [...current, channel.id]
                        : current.filter((id) => id !== channel.id),
                    );
                  }}
                />
                {channel.displayName} ({channel.provider})
              </label>
            ))
          )}
        </div>
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
                  <th>Publish</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      {piece.title}
                      <div className="muted">v{piece.currentVersion}</div>
                      {(destinations[piece.id] ?? []).map((dest) => (
                        <div key={dest.id} className="muted">
                          {dest.displayName}: {dest.status}
                          {dest.permalink ? (
                            <>
                              {" · "}
                              <a
                                href={dest.permalink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                link
                              </a>
                            </>
                          ) : null}
                          {dest.lastError ? ` · ${dest.lastError}` : null}
                          {dest.status === "failed" ||
                          dest.status === "needs_mobile" ? (
                            <>
                              {" "}
                              <button
                                type="button"
                                className="disconnect"
                                onClick={() => {
                                  void api
                                    .retryDestination(organizationId, dest.id)
                                    .then(() => loadDestinations(piece.id))
                                    .catch((err: Error) =>
                                      setError(err.message),
                                    );
                                }}
                              >
                                Retry
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </td>
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
                    <td>
                      <button
                        type="button"
                        disabled={
                          piece.status !== "approved" ||
                          selectedChannels.length === 0
                        }
                        onClick={() => {
                          void api
                            .publishPiece(organizationId, piece.id, {
                              socialAccountIds: selectedChannels,
                              publishNow: true,
                            })
                            .then(() => {
                              setError(null);
                              loadDestinations(piece.id);
                            })
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        Publish now
                      </button>
                      <button
                        type="button"
                        className="disconnect"
                        onClick={() => loadDestinations(piece.id)}
                      >
                        Refresh
                      </button>
                    </td>
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
