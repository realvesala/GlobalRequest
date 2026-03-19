import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface Method {
  id: string;
  name: string;
  is_active: boolean;
}

interface FieldErrors {
  method_id?: string;
  material_description?: string;
  purpose_description?: string;
  desired_completion?: string;
  [key: string]: string | undefined;
}

interface FormState {
  method_id: string;
  material_description: string;
  purpose_description: string;
  desired_completion: string;
}

export default function SubmitRequestPage(): React.ReactElement {
  const [methods, setMethods] = useState<Method[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    method_id: '',
    material_description: '',
    purpose_description: '',
    desired_completion: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/admin/methods')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load methods'))))
      .then((data: { methods: Method[] }) => {
        setMethods(data.methods.filter((m) => m.is_active));
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSubmitError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      const res = await apiFetch('/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method_id: form.method_id,
          material_description: form.material_description,
          purpose_description: form.purpose_description,
          desired_completion: form.desired_completion,
        }),
      });

      if (res.status === 201) {
        setSuccess(true);
        setForm({ method_id: '', material_description: '', purpose_description: '', desired_completion: '' });
        return;
      }

      const data = await res.json() as { errors?: FieldErrors; error?: string };

      if (res.status === 400 && data.errors) {
        setFieldErrors(data.errors);
        return;
      }

      setSubmitError(data.error ?? `Submission failed (${res.status})`);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p style={{ color: 'red' }}>{loadError}</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Submit Measurement Request</h2>

      {success && (
        <p style={{ color: 'green', padding: '0.75rem', background: '#f0fff0', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
          Request submitted successfully.
        </p>
      )}

      {submitError && (
        <p style={{ color: 'red', margin: '0 0 1rem' }}>{submitError}</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px' }}>
        <div>
          <label htmlFor="method_id" style={labelStyle}>
            Method *
          </label>
          <select
            id="method_id"
            value={form.method_id}
            onChange={(e) => setForm((f) => ({ ...f, method_id: e.target.value }))}
            style={{ ...inputStyle, borderColor: fieldErrors.method_id ? '#c00' : '#ccc' }}
          >
            <option value="">— Select a method —</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {fieldErrors.method_id && <span style={errorStyle}>{fieldErrors.method_id}</span>}
        </div>

        <div>
          <label htmlFor="material_description" style={labelStyle}>
            Material Description *
          </label>
          <textarea
            id="material_description"
            value={form.material_description}
            onChange={(e) => setForm((f) => ({ ...f, material_description: e.target.value }))}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', borderColor: fieldErrors.material_description ? '#c00' : '#ccc' }}
          />
          {fieldErrors.material_description && <span style={errorStyle}>{fieldErrors.material_description}</span>}
        </div>

        <div>
          <label htmlFor="purpose_description" style={labelStyle}>
            Purpose Description *
          </label>
          <textarea
            id="purpose_description"
            value={form.purpose_description}
            onChange={(e) => setForm((f) => ({ ...f, purpose_description: e.target.value }))}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', borderColor: fieldErrors.purpose_description ? '#c00' : '#ccc' }}
          />
          {fieldErrors.purpose_description && <span style={errorStyle}>{fieldErrors.purpose_description}</span>}
        </div>

        <div>
          <label htmlFor="desired_completion" style={labelStyle}>
            Desired Completion Date *
          </label>
          <input
            id="desired_completion"
            type="date"
            value={form.desired_completion}
            onChange={(e) => setForm((f) => ({ ...f, desired_completion: e.target.value }))}
            style={{ ...inputStyle, borderColor: fieldErrors.desired_completion ? '#c00' : '#ccc' }}
          />
          {fieldErrors.desired_completion && <span style={errorStyle}>{fieldErrors.desired_completion}</span>}
        </div>

        <button type="submit" disabled={submitting} style={btnStyle}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: '0.25rem',
  fontSize: '0.95rem',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem 0.6rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  display: 'block',
  color: '#c00',
  fontSize: '0.85rem',
  marginTop: '0.25rem',
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  background: '#333',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  alignSelf: 'flex-start',
};
