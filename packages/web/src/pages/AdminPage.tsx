import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface Method {
  id: string;
  name: string;
  description: string | null;
  required_material: string | null;
  is_active: boolean;
}

interface Lab {
  id: string;
  name: string;
  region: string;
  contact_info: string | null;
  is_active: boolean;
  methods: Method[];
}

type Tab = 'labs' | 'methods';

export default function AdminPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('labs');

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Admin Panel</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setTab('labs')}
          style={{
            padding: '0.5rem 1.25rem',
            background: tab === 'labs' ? '#333' : '#eee',
            color: tab === 'labs' ? '#fff' : '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Labs
        </button>
        <button
          onClick={() => setTab('methods')}
          style={{
            padding: '0.5rem 1.25rem',
            background: tab === 'methods' ? '#333' : '#eee',
            color: tab === 'methods' ? '#fff' : '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Methods
        </button>
      </div>
      {tab === 'labs' ? <LabsTab /> : <MethodsTab />}
    </div>
  );
}

function LabsTab(): React.ReactElement {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', region: '', contact_info: '', method_ids: [] as string[] });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const [labsRes, methodsRes] = await Promise.all([
        apiFetch('/admin/labs'),
        apiFetch('/admin/methods'),
      ]);
      if (!labsRes.ok) throw new Error('Failed to load labs');
      if (!methodsRes.ok) throw new Error('Failed to load methods');
      const labsData = await labsRes.json() as { labs: Lab[] };
      const methodsData = await methodsRes.json() as { methods: Method[] };
      setLabs(labsData.labs);
      setMethods(methodsData.methods.filter((m) => m.is_active));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/admin/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          region: form.region,
          contact_info: form.contact_info || undefined,
          method_ids: form.method_ids.length > 0 ? form.method_ids : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to create lab');
      }
      setForm({ name: '', region: '', contact_info: '', method_ids: [] });
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate this lab?')) return;
    try {
      const res = await apiFetch(`/admin/labs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate lab');
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function toggleMethod(id: string) {
    setForm((f) => ({
      ...f,
      method_ids: f.method_ids.includes(id)
        ? f.method_ids.filter((m) => m !== id)
        : [...f.method_ids, id],
    }));
  }

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h3>Labs</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={th}>Name</th>
            <th style={th}>Region</th>
            <th style={th}>Status</th>
            <th style={th}>Supported Methods</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {labs.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '0.75rem', textAlign: 'center', color: '#888' }}>No labs found.</td></tr>
          )}
          {labs.map((lab) => (
            <tr key={lab.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{lab.name}</td>
              <td style={td}>{lab.region}</td>
              <td style={td}>
                <span style={{ color: lab.is_active ? 'green' : '#999' }}>
                  {lab.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={td}>
                {lab.methods && lab.methods.length > 0
                  ? lab.methods.map((m) => m.name).join(', ')
                  : <span style={{ color: '#aaa' }}>None</span>}
              </td>
              <td style={td}>
                {lab.is_active && (
                  <button
                    onClick={() => handleDeactivate(lab.id)}
                    style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', color: '#c00', border: '1px solid #c00', background: 'transparent', borderRadius: '3px' }}
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Create Lab</h3>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '480px' }}>
        {formError && <p style={{ color: 'red', margin: 0 }}>{formError}</p>}
        <label>
          Name *
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </label>
        <label>
          Region *
          <input
            required
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            style={inputStyle}
          />
        </label>
        <label>
          Contact Info
          <input
            value={form.contact_info}
            onChange={(e) => setForm((f) => ({ ...f, contact_info: e.target.value }))}
            style={inputStyle}
          />
        </label>
        {methods.length > 0 && (
          <fieldset style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0.5rem 1rem' }}>
            <legend>Supported Methods</legend>
            {methods.map((m) => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={form.method_ids.includes(m.id)}
                  onChange={() => toggleMethod(m.id)}
                />
                {m.name}
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" disabled={submitting} style={btnStyle}>
          {submitting ? 'Creating…' : 'Create Lab'}
        </button>
      </form>
    </div>
  );
}

function MethodsTab(): React.ReactElement {
  const [methods, setMethods] = useState<Method[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', required_material: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch('/admin/methods');
      if (!res.ok) throw new Error('Failed to load methods');
      const data = await res.json() as { methods: Method[] };
      setMethods(data.methods);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/admin/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          required_material: form.required_material || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to create method');
      }
      setForm({ name: '', description: '', required_material: '' });
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate this method?')) return;
    try {
      const res = await apiFetch(`/admin/methods/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate method');
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h3>Methods</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={th}>Name</th>
            <th style={th}>Description</th>
            <th style={th}>Required Material</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {methods.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '0.75rem', textAlign: 'center', color: '#888' }}>No methods found.</td></tr>
          )}
          {methods.map((m) => (
            <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{m.name}</td>
              <td style={td}>{m.description ?? <span style={{ color: '#aaa' }}>—</span>}</td>
              <td style={td}>{m.required_material ?? <span style={{ color: '#aaa' }}>—</span>}</td>
              <td style={td}>
                <span style={{ color: m.is_active ? 'green' : '#999' }}>
                  {m.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={td}>
                {m.is_active && (
                  <button
                    onClick={() => handleDeactivate(m.id)}
                    style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', color: '#c00', border: '1px solid #c00', background: 'transparent', borderRadius: '3px' }}
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Create Method</h3>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '480px' }}>
        {formError && <p style={{ color: 'red', margin: 0 }}>{formError}</p>}
        <label>
          Name *
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
        <label>
          Required Material
          <input
            value={form.required_material}
            onChange={(e) => setForm((f) => ({ ...f, required_material: e.target.value }))}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={submitting} style={btnStyle}>
          {submitting ? 'Creating…' : 'Create Method'}
        </button>
      </form>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  verticalAlign: 'top',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem 0.6rem',
  marginTop: '0.25rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
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
