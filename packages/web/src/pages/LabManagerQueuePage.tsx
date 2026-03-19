import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface Request {
  id: string;
  title: string;
  status: string;
  region: string;
  requestor_name?: string;
  created_at?: string;
  assigned_lab_id?: string;
  assigned_lab_name?: string;
  assigned_lab_region?: string;
}

interface TechnicianOption {
  id: string;
  display_name: string;
  email: string;
  region: string | null;
}

interface Candidate {
  id: string;
  name: string;
  region: string;
  open_request_count: number;
}

interface OverrideForm {
  lab_id: string;
  reason: string;
}

export default function LabManagerQueuePage(): React.ReactElement {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestsUnavailable, setRequestsUnavailable] = useState(false);

  // Per-request state
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [candidateLoading, setCandidateLoading] = useState<Record<string, boolean>>({});
  const [candidateError, setCandidateError] = useState<Record<string, string>>({});
  const [assignSuccess, setAssignSuccess] = useState<Record<string, string>>({});
  const [assignError, setAssignError] = useState<Record<string, string>>({});
  const [overrideForms, setOverrideForms] = useState<Record<string, OverrideForm>>({});
  const [overrideVisible, setOverrideVisible] = useState<Record<string, boolean>>({});
  const [overrideSubmitting, setOverrideSubmitting] = useState<Record<string, boolean>>({});
  const [overrideError, setOverrideError] = useState<Record<string, string>>({});
  const [overrideSuccess, setOverrideSuccess] = useState<Record<string, string>>({});

  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState<string | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<Record<string, string>>({});
  const [assignTechSubmitting, setAssignTechSubmitting] = useState<Record<string, boolean>>({});
  const [assignTechError, setAssignTechError] = useState<Record<string, string>>({});
  const [assignTechSuccess, setAssignTechSuccess] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch('/requests/technicians')
      .then(async (res) => {
        if (!res.ok) {
          setTechniciansError('Technikerliste konnte nicht geladen werden.');
          return;
        }
        const data = await res.json() as { technicians?: TechnicianOption[] };
        setTechnicians(data.technicians ?? []);
      })
      .catch(() => setTechniciansError('Technikerliste konnte nicht geladen werden.'));
  }, []);

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
        const queue = list.filter((r) => r.status === 'Submitted' || r.status === 'Assigned');
        queue.sort((a, b) => {
          if (a.status === 'Submitted' && b.status !== 'Submitted') return -1;
          if (a.status !== 'Submitted' && b.status === 'Submitted') return 1;
          return 0;
        });
        setRequests(queue);
      })
      .catch(() => {
        setRequestsUnavailable(true);
      });
  }, []);

  async function loadCandidates(requestId: string) {
    setCandidateLoading((prev) => ({ ...prev, [requestId]: true }));
    setCandidateError((prev) => ({ ...prev, [requestId]: '' }));
    try {
      const res = await apiFetch(`/requests/${requestId}/candidates`);
      if (!res.ok) throw new Error('Failed to load candidates.');
      const data = await res.json() as { candidates: Candidate[] };
      setCandidates((prev) => ({ ...prev, [requestId]: data.candidates }));
    } catch (e) {
      setCandidateError((prev) => ({ ...prev, [requestId]: (e as Error).message }));
    } finally {
      setCandidateLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  function toggleCandidates(requestId: string) {
    if (candidates[requestId] !== undefined) {
      // Toggle off by removing
      setCandidates((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } else {
      void loadCandidates(requestId);
    }
  }

  async function handleAssign(requestId: string, labId: string) {
    setAssignError((prev) => ({ ...prev, [requestId]: '' }));
    setAssignSuccess((prev) => ({ ...prev, [requestId]: '' }));
    try {
      const res = await apiFetch(`/requests/${requestId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lab_id: labId }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Assignment failed.');
      }
      setAssignSuccess((prev) => ({ ...prev, [requestId]: 'Request assigned successfully.' }));
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      setAssignError((prev) => ({ ...prev, [requestId]: (e as Error).message }));
    }
  }

  async function handleAssignTechnician(requestId: string) {
    const technicianId = selectedTechnicianId[requestId]?.trim();
    if (!technicianId) {
      setAssignTechError((prev) => ({ ...prev, [requestId]: 'Bitte einen Techniker auswählen.' }));
      return;
    }
    setAssignTechError((prev) => ({ ...prev, [requestId]: '' }));
    setAssignTechSuccess((prev) => ({ ...prev, [requestId]: '' }));
    setAssignTechSubmitting((prev) => ({ ...prev, [requestId]: true }));
    try {
      const res = await apiFetch(`/requests/${requestId}/assign-technician`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technician_id: technicianId }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Techniker-Zuweisung fehlgeschlagen.');
      }
      setAssignTechSuccess((prev) => ({ ...prev, [requestId]: 'Techniker zugewiesen — Auftrag ist jetzt In_Progress.' }));
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      setAssignTechError((prev) => ({ ...prev, [requestId]: (e as Error).message }));
    } finally {
      setAssignTechSubmitting((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  function toggleOverride(requestId: string) {
    setOverrideVisible((prev) => ({ ...prev, [requestId]: !prev[requestId] }));
    if (!overrideForms[requestId]) {
      setOverrideForms((prev) => ({ ...prev, [requestId]: { lab_id: '', reason: '' } }));
    }
  }

  async function handleOverride(e: React.FormEvent, requestId: string) {
    e.preventDefault();
    const form = overrideForms[requestId];
    if (!form) return;
    setOverrideError((prev) => ({ ...prev, [requestId]: '' }));
    setOverrideSuccess((prev) => ({ ...prev, [requestId]: '' }));
    setOverrideSubmitting((prev) => ({ ...prev, [requestId]: true }));
    try {
      const res = await apiFetch(`/requests/${requestId}/override-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lab_id: form.lab_id, reason: form.reason }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Override failed.');
      }
      setOverrideSuccess((prev) => ({ ...prev, [requestId]: 'Override applied successfully.' }));
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      setOverrideError((prev) => ({ ...prev, [requestId]: (e as Error).message }));
    } finally {
      setOverrideSubmitting((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Lab Manager Queue</h2>

      {loadError && <p style={{ color: 'red' }}>{loadError}</p>}

      {requestsUnavailable && (
        <p style={{ color: '#888', fontStyle: 'italic' }}>
          Request list coming in task 12 — endpoint not yet available.
        </p>
      )}

      {!requestsUnavailable && !loadError && requests.length === 0 && (
        <p style={{ color: '#888' }}>Keine eingereichten oder lab-zugewiesenen Aufträge in Ihrer Region.</p>
      )}

      {techniciansError && (
        <p style={{ color: '#b45309', marginBottom: '0.75rem' }}>{techniciansError}</p>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong>{req.title ?? req.id}</strong>
              {req.region && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>Region: {req.region}</span>}
              {req.requestor_name && <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.9rem' }}>By: {req.requestor_name}</span>}
              <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: '#888' }}>ID: {req.id}</span>
            </div>
            <span style={{ background: '#e8f4fd', color: '#1a6fa8', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
              {req.status}
            </span>
          </div>

          {req.status === 'Submitted' && (
            <>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggleCandidates(req.id)}
                  style={secondaryBtn}
                >
                  {candidates[req.id] !== undefined ? 'Hide Candidates' : 'View Candidates'}
                </button>
                <button
                  onClick={() => toggleOverride(req.id)}
                  style={secondaryBtn}
                >
                  {overrideVisible[req.id] ? 'Hide Override' : 'Manual Override'}
                </button>
              </div>

              {candidateLoading[req.id] && <p style={{ color: '#888', marginTop: '0.5rem' }}>Loading candidates…</p>}
              {candidateError[req.id] && <p style={{ color: 'red', marginTop: '0.5rem' }}>{candidateError[req.id]}</p>}
              {assignError[req.id] && <p style={{ color: 'red', marginTop: '0.5rem' }}>{assignError[req.id]}</p>}
              {assignSuccess[req.id] && <p style={{ color: 'green', marginTop: '0.5rem' }}>{assignSuccess[req.id]}</p>}

              {candidates[req.id] !== undefined && !candidateLoading[req.id] && (
                <div style={{ marginTop: '0.75rem' }}>
                  {candidates[req.id].length === 0 ? (
                    <p style={{ color: '#888' }}>No candidate labs found for this request.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={th}>Lab Name</th>
                          <th style={th}>Region</th>
                          <th style={th}>Open Requests</th>
                          <th style={th}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates[req.id].map((c) => (
                          <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={td}>{c.name}</td>
                            <td style={td}>{c.region}</td>
                            <td style={td}>{c.open_request_count}</td>
                            <td style={td}>
                              <button
                                onClick={() => handleAssign(req.id, c.id)}
                                style={primaryBtn}
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {overrideVisible[req.id] && (
                <form
                  onSubmit={(e) => handleOverride(e, req.id)}
                  style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '420px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '0.75rem 1rem' }}
                >
                  <strong style={{ fontSize: '0.9rem' }}>Manual Override</strong>
                  {overrideError[req.id] && <p style={{ color: 'red', margin: 0, fontSize: '0.85rem' }}>{overrideError[req.id]}</p>}
                  {overrideSuccess[req.id] && <p style={{ color: 'green', margin: 0, fontSize: '0.85rem' }}>{overrideSuccess[req.id]}</p>}
                  <label style={{ fontSize: '0.9rem' }}>
                    Lab ID *
                    <input
                      required
                      value={overrideForms[req.id]?.lab_id ?? ''}
                      onChange={(e) =>
                        setOverrideForms((prev) => ({
                          ...prev,
                          [req.id]: { ...prev[req.id], lab_id: e.target.value },
                        }))
                      }
                      placeholder="Enter lab ID"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ fontSize: '0.9rem' }}>
                    Reason *
                    <textarea
                      required
                      rows={3}
                      value={overrideForms[req.id]?.reason ?? ''}
                      onChange={(e) =>
                        setOverrideForms((prev) => ({
                          ...prev,
                          [req.id]: { ...prev[req.id], reason: e.target.value },
                        }))
                      }
                      placeholder="Reason for override"
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={overrideSubmitting[req.id]}
                    style={{ ...primaryBtn, alignSelf: 'flex-start' }}
                  >
                    {overrideSubmitting[req.id] ? 'Submitting…' : 'Submit Override'}
                  </button>
                </form>
              )}
            </>
          )}

          {req.status === 'Assigned' && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #cce5ff', borderRadius: '6px', maxWidth: '480px' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                <strong>Lab zugewiesen:</strong>{' '}
                {req.assigned_lab_name ?? req.assigned_lab_id ?? '—'}
                {req.assigned_lab_region != null && req.assigned_lab_region !== '' && (
                  <span style={{ color: '#666' }}> ({req.assigned_lab_region})</span>
                )}
              </p>
              <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#555' }}>
                Wählen Sie einen Techniker — der Auftrag wechselt zu <strong>In_Progress</strong> und erscheint in dessen Arbeitsliste.
              </p>
              {assignTechError[req.id] && <p style={{ color: 'red', margin: '0 0 0.35rem', fontSize: '0.85rem' }}>{assignTechError[req.id]}</p>}
              {assignTechSuccess[req.id] && <p style={{ color: 'green', margin: '0 0 0.35rem', fontSize: '0.85rem' }}>{assignTechSuccess[req.id]}</p>}
              <label style={{ fontSize: '0.9rem', display: 'block' }}>
                Techniker
                <select
                  value={selectedTechnicianId[req.id] ?? ''}
                  onChange={(e) =>
                    setSelectedTechnicianId((prev) => ({ ...prev, [req.id]: e.target.value }))
                  }
                  style={{ ...inputStyle, marginTop: '0.25rem' }}
                >
                  <option value="">— bitte wählen —</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display_name} ({t.email})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleAssignTechnician(req.id)}
                disabled={assignTechSubmitting[req.id] || technicians.length === 0}
                style={{ ...primaryBtn, marginTop: '0.65rem' }}
              >
                {assignTechSubmitting[req.id] ? 'Wird zugewiesen…' : 'Techniker zuweisen'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem 0.6rem',
  marginTop: '0.2rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
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

const secondaryBtn: React.CSSProperties = {
  padding: '0.3rem 0.9rem',
  background: 'transparent',
  color: '#333',
  border: '1px solid #999',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.875rem',
};
