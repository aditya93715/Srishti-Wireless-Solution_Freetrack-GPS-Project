import React, { useState, useEffect } from 'react';
import Icon from './Icon';

const ALL_FEATURES_LABELS = {
  dashboard: 'Dashboard',
  live_tracking: 'Live Tracking',
  vehicle_list: 'Vehicle List',
  reports: 'Reports',
  history: 'History',
  analytics: 'Analytics',
  user_management: 'User Management',
  device_management: 'Device Management',
  notifications: 'Notifications',
  dealer_management: 'Dealer Management',
  geofence: 'Geofence',
  alerts: 'Alerts',
  maintenance: 'Maintenance',
  fuel_monitoring: 'Fuel Monitoring',
  playback: 'Playback',
  drivers: 'Drivers',
  billing: 'Billing',
  subscription_plans: 'Subscription Plans',
  admin_management: 'Admin Management',
  ticket_raise: 'Ticket Raise',
  ticket_manage: 'Ticket Manage',
};

const UserModal = ({ open, onClose, onSubmit, editUser, targetRole, parentFeatures, loading }) => {
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    status: 'Active',
    allowedFeatures: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (editUser) {
      setForm({
        username: editUser.username || '',
        password: '',
        fullName: editUser.fullName || editUser.name || '',
        email: editUser.email || '',
        phone: editUser.phone || '',
        company: editUser.company || '',
        address: editUser.address || '',
        status: editUser.status || 'Active',
        allowedFeatures: editUser.allowedFeatures || [],
      });
    } else {
      setForm({ username: '', password: '', fullName: '', email: '', phone: '', company: '', address: '', status: 'Active', allowedFeatures: [] });
    }
    setError('');
  }, [editUser, open]);

  if (!open) return null;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFeature = (feat) => {
    setForm((prev) => ({
      ...prev,
      allowedFeatures: prev.allowedFeatures.includes(feat)
        ? prev.allowedFeatures.filter((f) => f !== feat)
        : [...prev.allowedFeatures, feat],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) return setError('Full name is required');
    if (!editUser && !form.username.trim()) return setError('Username is required');
    if (!editUser && !form.password.trim()) return setError('Password is required');
    onSubmit(form);
  };

  const availableFeatures = parentFeatures
    ? Object.keys(ALL_FEATURES_LABELS).filter((f) => parentFeatures.includes(f))
    : Object.keys(ALL_FEATURES_LABELS);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">
            {editUser ? 'Edit User' : `Create ${targetRole?.replace('_', ' ') || 'User'}`}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ padding: '0 6px', minWidth: 0 }}
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error mb-16">{error}</div>}

            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Full Name *</label>
                <input className="input" name="fullName" value={form.fullName} onChange={handleChange} placeholder="John Doe" />
              </div>
              <div className="form-group">
                <label className="input-label">Username {!editUser && '*'}</label>
                <input className="input" name="username" value={form.username} onChange={handleChange} placeholder="johndoe" disabled={!!editUser} />
              </div>
            </div>

            {!editUser && (
              <div className="form-group">
                <label className="input-label">Password *</label>
                <input className="input" type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
            )}
            {editUser && (
              <div className="form-group">
                <label className="input-label">New Password (leave blank to keep)</label>
                <input className="input" type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Email</label>
                <input className="input" type="email" name="email" value={form.email} onChange={handleChange} placeholder="john@example.com" />
              </div>
              <div className="form-group">
                <label className="input-label">Phone</label>
                <input className="input" name="phone" value={form.phone} onChange={handleChange} placeholder="+91 9999999999" />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Company</label>
                <input className="input" name="company" value={form.company} onChange={handleChange} placeholder="Company Name" />
              </div>
              <div className="form-group">
                <label className="input-label">Status</label>
                <select className="select" name="status" value={form.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="input-label" style={{ marginBottom: 8 }}>Allowed Features</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 6,
                  maxHeight: 160,
                  overflowY: 'auto',
                  padding: 10,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                }}
              >
                {availableFeatures.map((feat) => (
                  <label
                    key={feat}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      cursor: 'pointer',
                      fontSize: 11,
                      color: form.allowedFeatures.includes(feat) ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedFeatures.includes(feat)}
                      onChange={() => toggleFeature(feat)}
                      style={{ accentColor: 'var(--accent-blue)', width: 12, height: 12 }}
                    />
                    {ALL_FEATURES_LABELS[feat]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Saving…</> : editUser ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserModal;
