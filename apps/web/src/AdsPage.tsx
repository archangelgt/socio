import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function AdsPage({
  organizationId,
  clientId,
  setError,
}: {
  organizationId: string;
  clientId: string;
  setError: (value: string | null) => void;
}) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.queue>>["items"]
  >([]);
  const [channels, setChannels] = useState<
    Awaited<ReturnType<typeof api.channels>>["channels"]
  >([]);
  const [body, setBody] = useState("Esta oferta de pauta es un engaño.");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void Promise.all([
      api.queue(organizationId, undefined, clientId, "paid"),
      api.channels(organizationId, clientId),
    ])
      .then(([queueData, channelData]) => {
        setItems(queueData.items);
        setChannels(channelData.channels);
      })
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  const mockChannel = channels.find((item) => item.provider === "mock");

  return (
    <>
      <header>
        <h1>Ads bandeja</h1>
        <p className="muted">
          Paid and boosted comments in the same moderation queue (RF-14). Live
          Meta pull needs Marketing API{" "}
          <code>effective_instagram_media_id</code> + <code>ads_read</code>/
          <code>ads_management</code> — until then, mock webhooks with{" "}
          <code>origin=ad</code>.
        </p>
      </header>

      {mockChannel ? (
        <section className="panel team-panel">
          <h2>Simulate ad comment</h2>
          <form
            className="team-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void api
                .simulate({
                  externalEventId: crypto.randomUUID(),
                  accountId: mockChannel.externalAccountId,
                  comment: {
                    externalCommentId: crypto.randomUUID(),
                    externalPostId: "demo-ad-media",
                    authorExternalId: "ad-commenter-1",
                    authorDisplayName: "Pauta User",
                    body,
                    origin: "ad",
                    adExternalId: "ad_demo_1",
                    creativeExternalId: "creative_demo_1",
                    campaignExternalId: "campaign_demo_1",
                  },
                  post: { body: "Boosted creative (demo)." },
                })
                .then(() => {
                  setError(null);
                  reload();
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Comment body
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              Ingest as ad comment
            </button>
          </form>
        </section>
      ) : (
        <p className="muted">
          Connect a mock channel to ingest demo ad comments without Marketing
          API tokens.
        </p>
      )}

      <section className="panel team-panel">
        <h2>Paid / boosted in queue</h2>
        {items.length === 0 ? (
          <p className="muted">No ad-origin comments in the queue yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Comment</th>
                  <th>Origin</th>
                  <th>Ad refs</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.decisionId}>
                    <td>
                      <strong>{item.authorDisplayName ?? "Unknown"}</strong>
                      <div>{item.body}</div>
                    </td>
                    <td>{item.origin ?? "ad"}</td>
                    <td className="muted">
                      {[item.adExternalId, item.creativeExternalId]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td>{item.moderationStatus}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          void api
                            .hide(organizationId, item.decisionId)
                            .then(reload)
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        Hide
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => {
                          void api
                            .allow(organizationId, item.decisionId)
                            .then(reload)
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        Allow
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
