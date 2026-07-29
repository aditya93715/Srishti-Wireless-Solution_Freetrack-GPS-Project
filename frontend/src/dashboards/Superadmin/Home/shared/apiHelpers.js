// ─────────────────────────────────────────────────────────────────────────────
// apiHelpers.js
// Authentication helpers and generic fetch wrapper shared between all dashboards
// Place at: frontend/src/dashboards/Admin/Home/shared/apiHelpers.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ────────────────────────────────────────────────────────────────────
function buildApiBase() {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  if (/\/api\/?$/.test(raw)) return raw.replace(/\/$/, '');
  return raw.replace(/\/$/, '') + '/api';
}

export const API_BASE   = buildApiBase();
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5001');

export const POLL_MS = 30_000;

// ── Token helpers ─────────────────────────────────────────────────────────────
export const getAuthToken = () =>
  localStorage.getItem('fleet_token')   ||
  localStorage.getItem('token')         ||
  localStorage.getItem('accessToken')   ||
  localStorage.getItem('authToken')     ||
  sessionStorage.getItem('fleet_token') ||
  sessionStorage.getItem('token')       ||
  null;

export const createAuthHeaders = () => {
  const token = getAuthToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

export const redirectToLogin = () => {
  ['fleet_token', 'token', 'accessToken', 'authToken'].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.location.href = '/login';
};

// ── Generic fetch wrapper ─────────────────────────────────────────────────────
// Returns { ok, status, data, timedOut?, unauthorized?, error? }
export async function apiFetch(url, options = {}) {
  const ctrl   = options.signal ? null : new AbortController();
  const signal = options.signal || ctrl?.signal;
  const t      = ctrl ? setTimeout(() => ctrl.abort(), 15_000) : null;
  try {
    const res = await fetch(url, {
      method:      'GET',
      credentials: 'include',
      headers:     createAuthHeaders(),
      signal,
      ...options,
    });
    if (t) clearTimeout(t);
    if (res.status === 401) {
      setTimeout(redirectToLogin, 1_500);
      return { ok: false, status: 401, data: null, unauthorized: true };
    }
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    if (t) clearTimeout(t);
    if (err.name === 'AbortError') return { ok: false, status: 0, data: null, timedOut: true };
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

// ── Misc formatting helpers ───────────────────────────────────────────────────
export const safeNum = (v, fb = 0) => { const n = Number(v); return isNaN(n) ? fb : n; };

export function formatLU(raw) {
  if (!raw || raw === '--') return '--';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return raw; }
}