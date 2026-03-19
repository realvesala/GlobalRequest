import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

type RequestRow = {
  id: string;
  request_code?: string;
  method_name?: string;
  status: string;
  submitted_at: string;
  assigned_lab_id: string | null;
  title?: string;
};

type Props = {
  onOpenRequest: (id: string) => void;
};

export default function RequestListPage({ onOpenRequest }: Props): React.ReactElement {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/requests')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load requests');
        const data = (await res.json()) as { requests: RequestRow[] };
        setItems(data.requests);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Requests</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={th}>ID</th>
            <th style={th}>Method</th>
            <th style={th}>Status</th>
            <th style={th}>Submitted</th>
            <th style={th}>Assigned Lab</th>
            <th style={th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '0.8rem', color: '#888', textAlign: 'center' }}>
                No requests found.
              </td>
            </tr>
          )}
          {items.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{r.request_code ?? r.id}</td>
              <td style={td}>{r.method_name ?? r.title ?? '—'}</td>
              <td style={td}>{r.status}</td>
              <td style={td}>{r.submitted_at}</td>
              <td style={td}>{r.assigned_lab_id ?? '—'}</td>
              <td style={td}>
                <button style={btn} onClick={() => onOpenRequest(r.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem',
  borderBottom: '2px solid #ddd',
};
const td: React.CSSProperties = { padding: '0.6rem', verticalAlign: 'top' };
const btn: React.CSSProperties = {
  border: '1px solid #333',
  background: '#333',
  color: '#fff',
  borderRadius: '4px',
  padding: '0.25rem 0.65rem',
  cursor: 'pointer',
};
