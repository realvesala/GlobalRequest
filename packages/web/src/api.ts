const API_BASE = 'http://localhost:3001';
const STORAGE_KEY = 'mockUserId';

export function getMockUserId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setMockUserId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const userId = getMockUserId();
  const headers = new Headers(init.headers);
  if (userId) {
    headers.set('X-Mock-User-Id', userId);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
