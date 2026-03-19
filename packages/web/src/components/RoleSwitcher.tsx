import React, { useEffect, useState } from 'react';
import { getMockUserId, setMockUserId } from '../api';

interface DemoUser {
  id: string;
  display_name: string;
  role: string;
  region: string;
}

export default function RoleSwitcher(): React.ReactElement {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selected, setSelected] = useState<string>(getMockUserId() ?? '');

  useEffect(() => {
    let alive = true;

    async function loadUsers(): Promise<void> {
      try {
        const r = await fetch('http://localhost:3001/users');
        const data = (await r.json()) as DemoUser[];
        if (!alive) return;
        setUsers(data);

        // Auto-select first user if nothing stored yet
        if (!getMockUserId() && data.length > 0) {
          setMockUserId(data[0].id);
          setSelected(data[0].id);
        }
      } catch {
        // API not reachable — silently ignore
      }
    }

    void loadUsers();
    const interval = window.setInterval(() => {
      void loadUsers();
    }, 5000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const id = e.target.value;
    setMockUserId(id);
    setSelected(id);
    window.location.reload();
  }

  if (users.length === 0) return <span style={{ color: '#888' }}>Loading users…</span>;

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
      <span>Acting as:</span>
      <select value={selected} onChange={handleChange} style={{ padding: '0.25rem 0.5rem' }}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
