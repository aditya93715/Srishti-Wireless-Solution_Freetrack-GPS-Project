import api from './axiosConfig';

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const loginApi = (credentials) => api.post('/auth/login', credentials);
export const getMeApi = () => api.get('/auth/me');
export const logoutApi = () => api.post('/auth/logout');

// ── COINS ──────────────────────────────────────────────────────────────────────
// ✅ Database se real-time coins fetch karne ke liye
export const getMyCoinsApi = () => api.get('/users/my-coins');

export default api;