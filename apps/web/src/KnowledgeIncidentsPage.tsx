import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function KnowledgePage({
  organizationId,
  clientId,
  setError,
}: {
  organizationId: string;
  clientId: string;
  setError: (value: string | null) => void;
}) {
  const [docs, setDocs] = useState<
    {
      id: string;
      title: string;
      kind: string;
      body: string;
      status: string;
      authoritative: boolean;
    }[]
  >([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("faq");
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    void api
      .knowledge(organizationId, clientId)
      .then((data) => setDocs(data.documents))
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <header>
        <h1>Knowledge</h1>
        <p className="muted">
          FAQs, tone, and protocols for this client folder (Brand Brain light).
        </p>
      </header>
      <section className="panel team-panel">
        <h2>Add document</h2>
        <form
          className="team-form"
          onSubmit={(event) => {
            event.preventDefault();
            void api
              .createKnowledge(organizationId, {
                clientId,
                title,
                kind,
                body,
                authoritative: kind === "policy" || kind === "tone",
              })
              .then(() => {
                setTitle("");
                setBody("");
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
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="faq">faq</option>
              <option value="tone">tone</option>
              <option value="protocol">protocol</option>
              <option value="policy">policy</option>
              <option value="url">url</option>
              <option value="note">note</option>
            </select>
          </label>
          <label>
            Body
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button type="submit">Save</button>
        </form>
      </section>
      <section className="panel team-panel">
        <h2>Documents</h2>
        {docs.length === 0 ? (
          <p className="muted">No knowledge yet.</p>
        ) : (
          <ul className="account-list">
            {docs.map((doc) => (
              <li key={doc.id} className="account-card">
                <div className="account-copy">
                  <strong>
                    {doc.title}{" "}
                    <span className="muted">
                      ({doc.kind}
                      {doc.authoritative ? " · authoritative" : ""})
                    </span>
                  </strong>
                  <p className="muted">{doc.body.slice(0, 180)}</p>
                </div>
                <select
                  value={doc.status}
                  onChange={(e) => {
                    void api
                      .updateKnowledge(organizationId, doc.id, {
                        status: e.target.value,
                      })
                      .then(reload)
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function IncidentsPage({
  organizationId,
  clientId,
  crisisMode,
  setError,
  onCrisisChanged,
}: {
  organizationId: string;
  clientId: string;
  crisisMode: boolean;
  setError: (value: string | null) => void;
  onCrisisChanged: () => void;
}) {
  const [items, setItems] = useState<
    {
      id: string;
      title: string;
      summary: string;
      status: string;
      severity: string;
      crisisEnabled: boolean;
    }[]
  >([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [enableCrisis, setEnableCrisis] = useState(false);

  const reload = useCallback(() => {
    void api
      .incidents(organizationId, clientId)
      .then((data) => setItems(data.incidents))
      .catch((err: Error) => setError(err.message));
  }, [organizationId, clientId, setError]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <header className="page-header-row">
        <div>
          <h1>Incidents</h1>
          <p className="muted">
            Open crises, attach evidence, export a redacted dossier. Crisis mode
            pauses auto-hide for this client.
          </p>
        </div>
        <label className="scope-option">
          <input
            type="checkbox"
            checked={crisisMode}
            onChange={(e) => {
              void api
                .setCrisisMode(organizationId, clientId, e.target.checked)
                .then(() => {
                  setError(null);
                  onCrisisChanged();
                })
                .catch((err: Error) => setError(err.message));
            }}
          />
          Crisis mode {crisisMode ? "ON" : "OFF"}
        </label>
      </header>

      <section className="panel team-panel">
        <h2>Open incident</h2>
        <form
          className="team-form"
          onSubmit={(event) => {
            event.preventDefault();
            void api
              .createIncident(organizationId, {
                clientId,
                title,
                summary,
                enableCrisis,
                evidenceObserved: true,
              })
              .then(() => {
                setTitle("");
                setSummary("");
                setEnableCrisis(false);
                setError(null);
                reload();
                onCrisisChanged();
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          <label>
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Summary
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className="scope-option">
            <input
              type="checkbox"
              checked={enableCrisis}
              onChange={(e) => setEnableCrisis(e.target.checked)}
            />
            Enable crisis mode (ADMIN)
          </label>
          <button type="submit">Open</button>
        </form>
      </section>

      <section className="panel team-panel">
        <h2>Open & recent</h2>
        {items.length === 0 ? (
          <p className="muted">No incidents.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="muted">{item.summary}</div>
                    </td>
                    <td>{item.severity}</td>
                    <td>
                      <select
                        value={item.status}
                        onChange={(e) => {
                          void api
                            .updateIncident(
                              organizationId,
                              item.id,
                              e.target.value,
                            )
                            .then(() => {
                              reload();
                              onCrisisChanged();
                            })
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        <option value="open">open</option>
                        <option value="monitoring">monitoring</option>
                        <option value="resolved">resolved</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          void api
                            .incidentDossier(organizationId, item.id)
                            .then((dossier) => {
                              window.prompt(
                                "Dossier JSON (sensitive redacted)",
                                JSON.stringify(dossier, null, 2),
                              );
                            })
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        Dossier
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

export function SimulatePage({
  organizationId,
  clientId,
  setError,
}: {
  organizationId: string;
  clientId: string;
  setError: (value: string | null) => void;
}) {
  const [samples, setSamples] = useState(
    "Este producto es terrible.\nTe voy a matar.\nCompra ya bitcoins gratis!!!",
  );
  const [threshold, setThreshold] = useState("0.8");
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof api.simulatePolicy>
  > | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <header>
        <h1>Policy simulation</h1>
        <p className="muted">
          Compare current vs proposed confidence threshold on sample comments —
          no actions on the network.
        </p>
      </header>
      <section className="panel team-panel">
        <form
          className="team-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            const list = samples
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            void api
              .simulatePolicy(organizationId, {
                clientId,
                samples: list,
                proposedThreshold: Number(threshold),
              })
              .then((data) => {
                setResult(data);
                setError(null);
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Samples (one per line)
            <textarea
              rows={6}
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
            />
          </label>
          <label>
            Proposed threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Run simulation
          </button>
        </form>
      </section>
      {result ? (
        <section className="panel team-panel">
          <h2>
            Results · current {result.currentThreshold} vs proposed{" "}
            {result.proposedThreshold} · {result.changedCount} changed
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Current</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr key={row.text}>
                    <td>
                      {row.text}
                      <div className="muted">
                        {row.severity} · {Math.round(row.confidence * 100)}%
                      </div>
                    </td>
                    <td>{row.current.queueState}</td>
                    <td>
                      {row.proposed.queueState}
                      {row.changed ? " *" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
