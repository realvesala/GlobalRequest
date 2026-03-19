import React, { useEffect, useState } from 'react';
import RoleSwitcher from './components/RoleSwitcher';
import NotificationBell from './components/NotificationBell';
import AdminPage from './pages/AdminPage';
import SubmitRequestPage from './pages/SubmitRequestPage';
import LabManagerQueuePage from './pages/LabManagerQueuePage';
import TechnicianQueuePage from './pages/TechnicianQueuePage';
import RequestListPage from './pages/RequestListPage';
import RequestDetailPage from './pages/RequestDetailPage';
import { apiFetch } from './api';

interface CurrentUser {
  id: string;
  display_name: string;
  role: string;
  region: string;
}

type Page = 'home' | 'admin' | 'submit' | 'lab-queue' | 'tech-queue' | 'requests' | 'request-detail';

function App(): React.ReactElement {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');

  useEffect(() => {
    apiFetch('/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CurrentUser | null) => setCurrentUser(data))
      .catch(() => setCurrentUser(null));
  }, []);

  const isAdmin = currentUser?.role === 'Admin';
  const isRequestor = currentUser?.role === 'Requestor';
  const isLabManager = currentUser?.role === 'Lab_Manager';
  const isTechnician = currentUser?.role === 'Lab_Technician';

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 2rem',
          borderBottom: '1px solid #ddd',
          background: '#f8f8f8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <strong>Lab Measurement Request System</strong>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setPage('home')}
              style={navBtn(page === 'home')}
            >
              Home
            </button>
            {isAdmin && (
              <button
                onClick={() => setPage('admin')}
                style={navBtn(page === 'admin')}
              >
                Admin
              </button>
            )}
            {isRequestor && (
              <button
                onClick={() => setPage('submit')}
                style={navBtn(page === 'submit')}
              >
                Submit Request
              </button>
            )}
            {isLabManager && (
              <button
                onClick={() => setPage('lab-queue')}
                style={navBtn(page === 'lab-queue')}
              >
                Lab Queue
              </button>
            )}
            {isTechnician && (
              <button
                onClick={() => setPage('tech-queue')}
                style={navBtn(page === 'tech-queue')}
              >
                My Work Queue
              </button>
            )}
            <button
              onClick={() => setPage('requests')}
              style={navBtn(page === 'requests' || page === 'request-detail')}
            >
              Requests
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <NotificationBell />
          <RoleSwitcher />
        </div>
      </header>
      <main style={{ padding: '2rem' }}>
        {page === 'home' && (
          <p>PoC scaffold — ready for feature development.</p>
        )}
        {page === 'admin' && isAdmin && <AdminPage />}
        {page === 'admin' && !isAdmin && (
          <p style={{ color: 'red' }}>Access denied. Admin role required.</p>
        )}
        {page === 'submit' && isRequestor && <SubmitRequestPage />}
        {page === 'submit' && !isRequestor && (
          <p style={{ color: 'red' }}>Access denied. Requestor role required.</p>
        )}
        {page === 'lab-queue' && isLabManager && <LabManagerQueuePage />}
        {page === 'lab-queue' && !isLabManager && (
          <p style={{ color: 'red' }}>Access denied. Lab_Manager role required.</p>
        )}
        {page === 'tech-queue' && isTechnician && <TechnicianQueuePage />}
        {page === 'tech-queue' && !isTechnician && (
          <p style={{ color: 'red' }}>Access denied. Lab_Technician role required.</p>
        )}
        {page === 'requests' && (
          <RequestListPage
            onOpenRequest={(id) => {
              setSelectedRequestId(id);
              setPage('request-detail');
            }}
          />
        )}
        {page === 'request-detail' && selectedRequestId && (
          <RequestDetailPage
            requestId={selectedRequestId}
            onBack={() => setPage('requests')}
          />
        )}
      </main>
    </div>
  );
}

function navBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.95rem',
    padding: '0.25rem 0.5rem',
    borderBottom: active ? '2px solid #333' : '2px solid transparent',
    fontWeight: active ? 600 : 400,
    color: '#333',
  };
}

export default App;
