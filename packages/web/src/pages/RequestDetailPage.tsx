import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, getMockUserId } from '../api';

type RequestDetail = {
  id: string;
  request_code?: string;
  status: string;
  material_description: string;
  purpose_description: string;
  desired_completion: string;
  requestor_id: string;
};

type HistoryEntry = {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by_name?: string;
  changed_at: string;
};

type ResultEntry = {
  id: string;
  file_name: string;
  uploaded_at: string;
};

type Props = {
  requestId: string;
  onBack: () => void;
};

export default function RequestDetailPage({ requestId, onBack }: Props): React.ReactElement {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string>('');
  const [saveErr, setSaveErr] = useState<string>('');
  const [draft, setDraft] = useState({
    material_description: '',
    purpose_description: '',
    desired_completion: '',
  });

  async function load() {
    const res = await apiFetch(`/requests/${requestId}`);
    if (!res.ok) throw new Error(`Failed to load request (${res.status})`);
    const data = (await res.json()) as { request: RequestDetail; history: HistoryEntry[]; results?: ResultEntry[] };
    setDetail(data.request);
    setHistory(data.history ?? []);
    setResults(data.results ?? []);
    setDraft({
      material_description: data.request.material_description,
      purpose_description: data.request.purpose_description,
      desired_completion: data.request.desired_completion,
    });
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [requestId]);

  const myId = getMockUserId();
  const canEdit = useMemo(
    () => detail && detail.requestor_id === myId && detail.status === 'Submitted',
    [detail, myId]
  );
  const canAcknowledge = useMemo(
    () => detail && detail.requestor_id === myId && detail.status === 'Results_Ready',
    [detail, myId]
  );

  async function saveEdits() {
    setSaveMsg('');
    setSaveErr('');
    const res = await apiFetch(`/requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveErr(data.error ?? 'Save failed');
      return;
    }
    setSaveMsg('Saved');
    await load();
  }

  async function acknowledge() {
    setSaveMsg('');
    setSaveErr('');
    const res = await apiFetch(`/requests/${requestId}/acknowledge`, { method: 'POST' });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveErr(data.error ?? 'Acknowledge failed');
      return;
    }
    setSaveMsg('Acknowledged');
    await load();
  }

  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!detail) return <p>Loading…</p>;

  return (
    <div>
      <button onClick={onBack} style={btnSecondary}>Back</button>
      <h2>Request Detail</h2>
      <p>
        <strong>ID:</strong> {detail.request_code ?? detail.id}
      </p>
      <p><strong>Status:</strong> {detail.status}</p>

      <h3>Request Data</h3>
      <label style={label}>
        Material Description
        <textarea
          disabled={!canEdit}
          value={draft.material_description}
          onChange={(e) => setDraft((d) => ({ ...d, material_description: e.target.value }))}
          style={input}
          rows={3}
        />
      </label>
      <label style={label}>
        Purpose Description
        <textarea
          disabled={!canEdit}
          value={draft.purpose_description}
          onChange={(e) => setDraft((d) => ({ ...d, purpose_description: e.target.value }))}
          style={input}
          rows={3}
        />
      </label>
      <label style={label}>
        Desired Completion
        <input
          disabled={!canEdit}
          type="date"
          value={draft.desired_completion}
          onChange={(e) => setDraft((d) => ({ ...d, desired_completion: e.target.value }))}
          style={input}
        />
      </label>
      {canEdit && (
        <button onClick={() => void saveEdits()} style={btnPrimary}>
          Save Changes
        </button>
      )}

      <h3 style={{ marginTop: '1.25rem' }}>Results</h3>
      {results.length === 0 && <p style={{ color: '#888' }}>No results uploaded yet.</p>}
      {results.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.35rem' }}>
          <span>{r.file_name}</span>
          <a href={`http://localhost:3001/requests/${requestId}/results/${r.id}`} target="_blank" rel="noreferrer">
            Download
          </a>
          <span style={{ color: '#777', fontSize: '0.8rem' }}>{r.uploaded_at}</span>
        </div>
      ))}

      {canAcknowledge && (
        <button onClick={() => void acknowledge()} style={{ ...btnPrimary, marginTop: '0.5rem' }}>
          Acknowledge Receipt
        </button>
      )}

      {saveMsg && <p style={{ color: 'green' }}>{saveMsg}</p>}
      {saveErr && <p style={{ color: 'red' }}>{saveErr}</p>}

      <h3 style={{ marginTop: '1.25rem' }}>Status History</h3>
      <ul>
        {history.map((h) => (
          <li key={h.id}>
            {h.previous_status ?? '—'} {'->'} {h.new_status} by {h.changed_by_name ?? 'unknown'} at {h.changed_at}
          </li>
        ))}
      </ul>
    </div>
  );
}

const label: React.CSSProperties = { display: 'block', marginBottom: '0.6rem' };
const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '620px',
  marginTop: '0.25rem',
  padding: '0.45rem 0.55rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
};
const btnPrimary: React.CSSProperties = {
  background: '#333',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: '#333',
  border: '1px solid #999',
  borderRadius: '4px',
  padding: '0.35rem 0.8rem',
  cursor: 'pointer',
};
