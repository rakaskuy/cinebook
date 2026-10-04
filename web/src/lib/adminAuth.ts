import { AdminRole } from './types';

export interface AdminSession {
  id: string;
  nama: string;
  role: AdminRole;
  email: string;
  loginAt: string;
}

const ADMIN_STORAGE_KEY = 'cinebook_web_admin_session_v1';

export function getStoredAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_STORAGE_KEY);
}
