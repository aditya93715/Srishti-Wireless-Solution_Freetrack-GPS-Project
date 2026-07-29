// src/api/vehicleApi.js
//
// Uses the same axios instance as users.js (axiosConfig) so the
// auth token is injected automatically via interceptor.
//
// HIERARCHY cascade (super_admin form):
//   fetchAdmins()
//     └─ fetchDealers(adminId)
//          └─ fetchUsers(dealerId)
//          └─ fetchDevicesByDealer(dealerId)  ← reads dealer's IMEI_No list

import api from './axiosConfig';

// ─────────────────────────────────────────────────────────────────────────────
//  HIERARCHY CASCADE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * super_admin only.
 * Returns all User_Master docs where role = 'admin'
 * GET /api/vehicles/hierarchy/admins
 */
export const fetchAdmins = async () => {
  const res = await api.get('/vehicles/hierarchy/admins');
  return res.data.admins || [];
};

/**
 * Returns User_Master docs where role = 'dealer' AND adminId = adminId
 * GET /api/vehicles/hierarchy/dealers?adminId=X
 */
export const fetchDealers = async (adminId) => {
  const res = await api.get('/vehicles/hierarchy/dealers', { params: { adminId } });
  return res.data.dealers || [];
};

/**
 * Returns User_Master docs where role = 'user' AND dealerId = dealerId
 * GET /api/vehicles/hierarchy/users?dealerId=X
 */
export const fetchUsers = async (dealerId) => {
  const res = await api.get('/vehicles/hierarchy/users', { params: { dealerId } });
  return res.data.users || [];
};

/**
 * Returns Device_Master docs from dealer's devices[] array in User_Master.
 * Backend reads dealer.devices[] → extracts IMEI_No values
 * → queries Device_Master by IMEI_No → returns tagged free/assigned.
 * GET /api/vehicles/hierarchy/devices-by-dealer/:dealerId
 */
export const fetchDevicesByDealer = async (dealerId) => {
  const res = await api.get(`/vehicles/hierarchy/devices-by-dealer/${dealerId}`);
  return res.data.devices || [];
};

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLE NUMBER DUPLICATE CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if vehicleNo already exists in Device_Master.vehicleInfo.vehicleNo
 * GET /api/vehicles/check-no/:vehicleNo
 */
export const checkVehicleNoExists = async (vehicleNo) => {
  try {
    const vno = encodeURIComponent(vehicleNo.toUpperCase().trim());
    const res = await api.get(`/vehicles/check-no/${vno}`);
    return !!res.data.exists;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLE CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Create vehicle — stamps vehicleInfo into Device_Master by IMEI_No */
export const createVehicle = async (payload) => {
  const res = await api.post('/vehicles', payload);
  return res.data;
};

/** List vehicles — role-filtered by server */
export const listVehicles = async ({ page = 1, limit = 200, search = '' } = {}) => {
  const res = await api.get('/vehicles', { params: { page, limit, search } });
  return res.data;
};

/** Get single vehicle by Device _id */
export const getVehicleById = async (id) => {
  const res = await api.get(`/vehicles/${id}`);
  return res.data.vehicle;
};

/** Update vehicleInfo fields */
export const updateVehicle = async (id, payload) => {
  const res = await api.put(`/vehicles/${id}`, payload);
  return res.data;
};

/** Unassign / delete a vehicle (frees the device) */
export const deleteVehicle = async (id) => {
  const res = await api.delete(`/vehicles/${id}`);
  return res.data;
};