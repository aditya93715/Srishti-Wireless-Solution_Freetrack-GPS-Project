import api from './axiosConfig';

export const getUsersApi = (params) =>
  api.get('/users', { params });

export const getUserByIdApi = (id) =>
  api.get(`/users/${id}`);

export const createUserApi = (data) =>
  api.post('/users', data);

export const updateUserApi = (id, data) =>
  api.put(`/users/${id}`, data);

export const deleteUserApi = (id) =>
  api.delete(`/users/${id}`);

export const getDashboardStatsApi = () =>
  api.get('/users/stats');

export const getInventoryDevicesApi = () =>
  api.get('/users/inventory-devices');

// ── Role-specific fetch helpers (used by UserManagement fetchAll) ─────────────

/**
 * Fetch all admins (super_admin only).
 * Uses ?filterRole=admin which the controller handles.
 */
export const getAdminsApi = (params = {}) =>
  api.get('/users', { params: { ...params, filterRole: 'admin', limit: 2000 } });

/**
 * Fetch dealers under a specific admin.
 * super_admin: pass filterAdminId
 * admin: filterAdminId not needed (controller uses token's user_id)
 */
export const getDealersByAdminApi = (filterAdminId, params = {}) =>
  api.get('/users', {
    params: {
      ...params,
      filterRole: 'dealer',
      ...(filterAdminId ? { filterAdminId } : {}),
      limit: 2000,
    },
  });

/**
 * Fetch users under a specific admin (all dealers' users).
 * super_admin: pass filterAdminId
 * admin: filterAdminId not needed
 */
export const getUsersByAdminApi = (filterAdminId, params = {}) =>
  api.get('/users', {
    params: {
      ...params,
      filterRole: 'user',
      ...(filterAdminId ? { filterAdminId } : {}),
      limit: 5000,
    },
  });

/**
 * Fetch users under a specific dealer.
 * super_admin / admin: pass filterDealerId
 * dealer: not needed (controller uses token)
 */
export const getUsersByDealerApi = (filterDealerId, params = {}) =>
  api.get('/users', {
    params: {
      ...params,
      filterRole: 'user',
      ...(filterDealerId ? { filterDealerId } : {}),
      limit: 2000,
    },
  });