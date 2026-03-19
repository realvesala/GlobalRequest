import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface Request {
  id: string;
  request_code?: string;
  title: string;
  status: string;
  region: string;
  requestor_name?: string;
  assigned_lab_id?: string;
  assigned_technician_id?: string;
}

export default function TechnicianQueuePage(): React.ReactElement {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestsUnavailable, setRequestsUnavailable] = useState(false);

  // Per-request note form state
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [noteSubmitting, setNoteSubmitting] = useState<Record<string, boolean>>({});
  const [noteError, setNoteError] = useState<Record<string, string>>({});
  const [noteSuccess, setNoteSuccess] = useState<Record<string, string>>({});

  // Per-request result upload state
  const [selectedFile, setSelectedFile] = useState<Record<string, File | null>>({});
  const [uploadSubmitting, setUploadSubmitting] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch('/requests')
      .then(async (res) => {
        if (res.status === 404 || res.status === 501) {
          setRequestsUnavailable(true);
          return;
        }
        if (!res.ok) {
          setLoadError('Failed to load requests.');
          return;
        }
        const data = await res.json() as { requests?: Request[] } | Request[];
        const list = Array.isArray(data) ? data : (data.requests ?? []);
        // Assigned = Lab vom Manager zugewiesen, Techniker-Zuweisung steht noch aus; In_Progress = aktiv bearbeiten
        const active = list.filter((r) => r.status === 'Assigned' || r.status === 'In_Progress');
        active.sort((a, b) => {
          if (a.status === 'In_Progress' && b.status !== 'In_Progress') return -1;
          if (a.status !== 'In_Progress' && b.status === 'In_Progress') return 1;
          return 0;
        });
        setRequests(active);
      })
      .catch(() => {
        setRequestsUnavailable(true);
      });
  }, []);

  async function handleNoteSubmit(e: React.FormEvent, requestId: string) {
    e.preventDefault();
    const note = noteText[requestId]?.trim();
    if (!note) return;

    setNoteError((prev) => ({ ...prev, [requestId]: '' }));
    setNoteSuccess((prev) => ({ ...prev, [requestId]: '' }));
    setNoteSubmitting((prev) => ({ ...prev, [requestId]: true }));

    try {
      const res = await apiFetch(`/requests/${requestId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to add note.');
      }
      setNoteSuccess((prev) => ({ ...prev, [requestId]: 'Note added successfully.' }));
      setNoteText((prev) => ({ ...prev, [requestId]: '' }));
    } catch (err) {
      setNoteError((prev) => ({ ...prev, [requestId]: (err as Error).message }));
    } finally {
      setNoteSubmitting((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  async function handleResultUpload(requestId: string) {
    const file = selectedFile[requestId];
    if (!file) {
      setUploadError((prev) => ({ ...prev, [requestId]: 'Please select a result file first.' }));
      return;
    }

    setUploadSubmitting((prev) => ({ ...prev, [requestId]: true }));
    setUploadError((prev) => ({ ...prev, [requestId]: '' }));
    setUploadSuccess((prev) => ({ ...prev, [requestId]: '' }));

    try {
      const form = new FormData();
      // Backend expects field name `file`
      form.append('file', file, file.name);

      const res = await apiFetch(`/requests/${requestId}/results`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Result upload failed.');
      }

      setUploadSuccess((prev) => ({ ...prev, [requestId]: 'Result uploaded; status updated.' }));
      // Request leaves In_Progress queue after transition to Results_Ready
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      setUploadError((prev) => ({ ...prev, [requestId]: (e as Error).message }));
    } finally {
      setUploadSubmitting((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>My Work Queue</h2>

      {loadError && <p style={{ color: 'red' }}>{loadError}</p>}

      {requestsUnavailable && (
        <p style={{ color: '#888', fontStyle: 'italic' }}>
          Request list coming in task 12 — endpoint not yet available.
        </p>
      )}

      {!requestsUnavailable && !loadError && requests.length === 0 && (
        <p style={{ color: '#888' }}>
          Keine Aufträge für Ihr Lab (Region) oder für Sie persönlich zugewiesen — weder „Assigned“ noch „In_Progress“.
        </p>
      )}

      {requests.map((req) => (
        <div
          key={req.id}
          style={{
            border: '1px solid #ddd',
            borderRadius: '6px',
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            background: '#fafafa',
          }}
        >
          {/* Request header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong>{req.title ?? req.id}</strong>
              {req.region && (
                <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
                  Region: {req.region}
                </span>
              )}
              {req.requestor_name && (
                <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
                  By: {req.requestor_name}
                </span>
              )}
              <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: '#888' }}>
                ID: {req.request_code ?? req.id}
              </span>
            </div>
            <span
              style={{
                background: req.status === 'Assigned' ? '#e7f3ff' : '#fff3cd',
                color: req.status === 'Assigned' ? '#004085' : '#856404',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              {req.status}
            </span>
          </div>

          {req.status === 'Assigned' && (
            <p style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: '#e7f3ff', borderRadius: '6px', fontSize: '0.9rem' }}>
              Dieser Auftrag ist Ihrem Lab zugewiesen. Der Lab-Manager muss Sie noch unter <strong>Assign technician</strong> zuordnen —
              danach wird der Status <strong>In_Progress</strong> und Sie können Notizen und Ergebnisse erfassen.
            </p>
          )}

          {/* Progress note form — nur nach persönlicher Zuweisung (In_Progress) */}
          {req.status === 'In_Progress' && (
            <form
              onSubmit={(e) => handleNoteSubmit(e, req.id)}
              style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '480px' }}
            >
              <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Add Progress Note</label>
              {noteError[req.id] && (
                <p style={{ color: 'red', margin: 0, fontSize: '0.85rem' }}>{noteError[req.id]}</p>
              )}
              {noteSuccess[req.id] && (
                <p style={{ color: 'green', margin: 0, fontSize: '0.85rem' }}>{noteSuccess[req.id]}</p>
              )}
              <textarea
                rows={3}
                required
                value={noteText[req.id] ?? ''}
                onChange={(e) =>
                  setNoteText((prev) => ({ ...prev, [req.id]: e.target.value }))
                }
                placeholder="Describe progress or findings…"
                style={textareaStyle}
              />
              <button
                type="submit"
                disabled={noteSubmitting[req.id] || !noteText[req.id]?.trim()}
                style={{ ...primaryBtn, alignSelf: 'flex-start' }}
              >
                {noteSubmitting[req.id] ? 'Saving…' : 'Add Note'}
              </button>
            </form>
          )}

          {/* Mark complete — nur In_Progress */}
          {req.status === 'In_Progress' && (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 500 }}>
                Upload Result File
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setSelectedFile((prev) => ({ ...prev, [req.id]: f }));
                  }}
                  style={{ display: 'block', marginTop: '0.35rem' }}
                />
              </label>
              {uploadError[req.id] && <p style={{ color: 'red', margin: '0.35rem 0 0.2rem' }}>{uploadError[req.id]}</p>}
              {uploadSuccess[req.id] && <p style={{ color: 'green', margin: '0.35rem 0 0.2rem' }}>{uploadSuccess[req.id]}</p>}
              <button
                onClick={() => void handleResultUpload(req.id)}
                disabled={uploadSubmitting[req.id]}
                style={{ ...primaryBtn, marginTop: '0.5rem' }}
              >
                {uploadSubmitting[req.id] ? 'Uploading…' : 'Upload & Mark Complete'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem 0.6rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  resize: 'vertical',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.3rem 0.9rem',
  background: '#333',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.875rem',
};

// (Mark complete button removed; now result upload drives status transition)
