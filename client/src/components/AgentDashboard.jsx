import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAgentSessions() {
  return useQuery({
    queryKey: ['agent-sessions'],
    queryFn: async () => {
      const { data } = await axios.get('/api/agent');
      return data;
    },
    refetchInterval: 5000,
  });
}

function useAgentSession(id) {
  return useQuery({
    queryKey: ['agent', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await axios.get(`/api/agent/${id}`);
      return data;
    },
    // Poll while running
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 3000 : false,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  running: 'bg-warning text-dark',
  completed: 'bg-success',
  failed: 'bg-danger',
  stopped: 'bg-secondary',
};

function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_BADGE[status] ?? 'bg-secondary'}`}>
      {status}
    </span>
  );
}

function Spinner({ label }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <div className="spinner-border spinner-border-sm" role="status" />
      <span className="text-muted small">{label}</span>
    </div>
  );
}

function SessionDetail({ sessionId, onBack }) {
  const qc = useQueryClient();
  const { data: session, isLoading } = useAgentSession(sessionId);

  const stopMutation = useMutation({
    mutationFn: () => axios.post(`/api/agent/${sessionId}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', sessionId] }),
  });

  if (isLoading) return <Spinner label="Loading session…" />;
  if (!session) return null;

  const progress =
    session.maxUrls > 0
      ? Math.round((session.visited?.length ?? 0) / session.maxUrls * 100)
      : 0;

  return (
    <div>
      <button className="btn btn-sm btn-outline-secondary mb-3" onClick={onBack}>
        ← Back
      </button>

      <div className="d-flex align-items-center gap-2 mb-1">
        <h5 className="mb-0">{session.goal}</h5>
        <StatusBadge status={session.status} />
      </div>
      <p className="text-muted small mb-3">
        Seed: <code>{session.seedUrl}</code>
      </p>

      {session.status === 'running' && (
        <>
          <Spinner label={`Iteration ${session.iterations} / ${session.maxIterations}`} />
          <button
            className="btn btn-sm btn-danger mt-2"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
          >
            Stop agent
          </button>
        </>
      )}

      <div className="my-3">
        <div className="d-flex justify-content-between small text-muted mb-1">
          <span>URLs visited: {session.visited?.length ?? 0} / {session.maxUrls}</span>
          <span>{progress}%</span>
        </div>
        <div className="progress" style={{ height: 6 }}>
          <div
            className="progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {session.summary && (
        <div
          className={`alert ${
            session.status === 'completed' ? 'alert-success' : 'alert-warning'
          } py-2`}
        >
          {session.summary}
        </div>
      )}

      {session.collectedItems?.length > 0 && (
        <details open className="mb-3">
          <summary className="fw-semibold mb-2">
            Collected items ({session.collectedItems.length})
          </summary>
          <pre
            className="bg-light rounded p-2 small"
            style={{ maxHeight: 300, overflow: 'auto' }}
          >
            {JSON.stringify(session.collectedItems, null, 2)}
          </pre>
        </details>
      )}

      {session.log?.length > 0 && (
        <details className="mb-3">
          <summary className="fw-semibold mb-2">
            Agent log ({session.log.length} entries)
          </summary>
          <ul className="list-unstyled small" style={{ maxHeight: 250, overflow: 'auto' }}>
            {[...session.log].reverse().map((entry, i) => (
              <li
                key={i}
                className={`mb-1 ${
                  entry.level === 'error'
                    ? 'text-danger'
                    : entry.level === 'warn'
                    ? 'text-warning'
                    : 'text-muted'
                }`}
              >
                <span className="me-2 text-secondary">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                {entry.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentDashboard() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useAgentSessions();
  const [selectedId, setSelectedId] = useState(null);

  const [goal, setGoal] = useState('');
  const [seedUrl, setSeedUrl] = useState('');
  const [maxIterations, setMaxIterations] = useState(20);
  const [maxUrls, setMaxUrls] = useState(100);

  const startMutation = useMutation({
    mutationFn: () =>
      axios.post('/api/agent', { goal, seedUrl, maxIterations, maxUrls }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['agent-sessions'] });
      setSelectedId(data.sessionId);
      setGoal('');
      setSeedUrl('');
    },
  });

  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      {/* ── New agent form ── */}
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title">New agent session</h6>

          <div className="mb-2">
            <label className="form-label small fw-semibold">Goal (natural language)</label>
            <input
              className="form-control form-control-sm"
              placeholder='e.g. "Collect 30 laptop listings from HackerNews with price and title"'
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div className="mb-2">
            <label className="form-label small fw-semibold">Seed URL</label>
            <input
              className="form-control form-control-sm"
              placeholder="https://news.ycombinator.com"
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
            />
          </div>

          <div className="row g-2 mb-3">
            <div className="col">
              <label className="form-label small fw-semibold">Max iterations</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={maxIterations}
                min={1}
                max={100}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
              />
            </div>
            <div className="col">
              <label className="form-label small fw-semibold">Max URLs</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={maxUrls}
                min={1}
                max={500}
                onChange={(e) => setMaxUrls(Number(e.target.value))}
              />
            </div>
          </div>

          <button
            className="btn btn-sm btn-primary"
            disabled={!goal || !seedUrl || startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? 'Starting…' : 'Start agent'}
          </button>

          {startMutation.isError && (
            <div className="alert alert-danger mt-2 py-1 small">
              {String(startMutation.error)}
            </div>
          )}
        </div>
      </div>

      {/* ── Session list ── */}
      <h6 className="text-muted mb-2">Recent sessions</h6>
      {isLoading && <Spinner label="Loading…" />}
      {sessions.length === 0 && !isLoading && (
        <p className="text-muted small">No sessions yet.</p>
      )}
      <ul className="list-group">
        {sessions.map((s) => (
          <li
            key={s._id}
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-start"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelectedId(s._id)}
          >
            <div>
              <div className="fw-semibold">{s.goal}</div>
              <div className="text-muted small">
                {new Date(s.createdAt).toLocaleString()} ·{' '}
                {s.collectedItems?.length ?? 0} items · iter {s.iterations}
              </div>
            </div>
            <StatusBadge status={s.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
