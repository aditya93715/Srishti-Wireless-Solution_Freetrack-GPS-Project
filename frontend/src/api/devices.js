// src/api/devices.js

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ─── Protocol Master ──────────────────────────────────────────────────────────
export const getProtocolMasterApi = () => api.get('/devices/protocol-master');

export const getSimOperatorsApi = () =>
  getProtocolMasterApi().then(res => ({
    ...res,
    data: { operators: res.data?.data?.sim_operator || [] },
  }));

export const getDeviceTypesApi = () =>
  getProtocolMasterApi().then(res => ({
    ...res,
    data: { deviceTypes: res.data?.data?.protocol_type || [] },
  }));

export const getServicePortsApi = () =>
  getProtocolMasterApi().then(res => ({
    ...res,
    data: { servicePorts: res.data?.data?.service_port || [] },
  }));

// ─── Clients ──────────────────────────────────────────────────────────────────
export const getClientsApi = ({ role, userId } = {}) => {
  const p = new URLSearchParams();
  if (role)   p.set('role',   role);
  if (userId) p.set('userId', userId);
  return api.get(`/devices/clients?${p}`).then(res => {
    const clients = (res.data?.clients || []).map(c => ({
      user_id:  c.user_id,
      username: c.username,
      label:    c.label || c.username,
      value:    c.value || c.username,
      status:   c.status || 'Active',
      active:   c.active !== false,
    }));
    return { ...res, data: { clients } };
  });
};

export const getClientOptionsApi = getClientsApi;

// ─── Devices list ─────────────────────────────────────────────────────────────
export const getDevicesApi = ({
  role = '', userId = null, limit = 500, page = 1,
  search = '', status = '',
} = {}) => {
  const p = new URLSearchParams();
  if (role)   p.set('role',   role);
  if (userId) p.set('userId', userId);
  if (limit)  p.set('limit',  limit);
  if (page)   p.set('page',   page);
  if (search) p.set('search', search);
  if (status) p.set('status', status);
  return api.get(`/devices?${p}`);
};

export const getDeviceByIdApi = (id) => api.get(`/devices/${id}`);

// ─── Create single device ─────────────────────────────────────────────────────
export const createDeviceApi = (formData, currentUser, sensors = []) => {
  const { active, status, ...rest } = formData;
  return api.post('/devices', {
    ...rest,
    sensors,
    creatorUserId:   currentUser?.user_id  || null,
    creatorRole:     currentUser?.role     || '',
    creatorUsername: currentUser?.username || '',
  });
};

// ─── Assign multiple devices ──────────────────────────────────────────────────
export const assignMultipleDevicesApi = (payload, currentUser) => {
  const { active, status, _isMulti, ...rest } = payload;
  return api.post('/devices/assign-multiple', {
    ...rest,
    creatorUserId:   currentUser?.user_id  || null,
    creatorRole:     currentUser?.role     || '',
    creatorUsername: currentUser?.username || '',
  });
};

// ─── Assign device to user ────────────────────────────────────────────────────
export const assignDeviceToUserApi = (payload) =>
  api.post('/devices/assign-to-user', payload);

// ─── Update ───────────────────────────────────────────────────────────────────
export const updateDeviceApi = (id, formData, currentUser = null) => {
  const { active, status, ...rest } = formData;
  return api.put(`/devices/${id}`, {
    ...rest,
    creatorUserId:   currentUser?.user_id  || null,
    creatorRole:     currentUser?.role     || '',
    creatorUsername: currentUser?.username || '',
  });
};

// ─── Delete ───────────────────────────────────────────────────────────────────
export const deleteDeviceApi = (id, currentUser) =>
  api.delete(`/devices/${id}`, {
    data: { deletedByUserId: currentUser?.user_id || null },
  });

// ─── Sensors ──────────────────────────────────────────────────────────────────
export const updateDeviceSensorsApi = (deviceId, sensors) =>
  api.put(`/devices/${deviceId}/sensors`, { sensors });

// ─── Import Excel (bulk) ──────────────────────────────────────────────────────
export const importDevicesFromExcelApi = (payload) =>
  api.post('/devices/import-excel', payload);