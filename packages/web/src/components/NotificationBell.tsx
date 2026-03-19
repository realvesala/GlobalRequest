import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';

type Notification = {
  id: string;
  request_id: string | null;
  event_type: string;
  message: string;
  is_read: number;
  created_at: string;
};

export default function NotificationBell(): React.ReactElement {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  async function loadNotifications() {
    const res = await apiFetch('/notifications');
    if (!res.ok) return;
    const data = (await res.json()) as { notifications?: Notification[] };
    setItems(data.notifications ?? []);
  }

  useEffect(() => {
    void loadNotifications();
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  async function markRead(id: string) {
    const res = await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
    if (!res.ok) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          border: '1px solid #ccc',
          borderRadius: '18px',
          padding: '0.35rem 0.7rem',
          background: '#fff',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '2.25rem',
            right: 0,
            width: '360px',
            maxHeight: '320px',
            overflow: 'auto',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 1000,
          }}
        >
          {items.length === 0 && <p style={{ margin: '0.75rem', color: '#888' }}>No notifications.</p>}
          {items.slice(0, 20).map((n) => (
            <div key={n.id} style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>{n.event_type}</strong>
                {!n.is_read && (
                  <button
                    onClick={() => void markRead(n.id)}
                    style={{
                      fontSize: '0.75rem',
                      border: '1px solid #aaa',
                      background: 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Mark read
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#333', marginTop: '0.2rem' }}>{n.message}</div>
              <div style={{ fontSize: '0.75rem', color: '#777', marginTop: '0.2rem' }}>{n.created_at}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
