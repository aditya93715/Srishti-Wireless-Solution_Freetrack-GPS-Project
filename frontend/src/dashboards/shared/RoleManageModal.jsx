import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';

const ALL_FEATURES_LABELS = {
  dashboard: 'Dashboard', live_tracking: 'Live Tracking', vehicle_list: 'Vehicle List',
  reports: 'Reports', history: 'History', analytics: 'Analytics',
  user_management: 'User Management', device_management: 'Device Management',
  notifications: 'Notifications', dealer_management: 'Dealer Management',
  geofence: 'Geofence', alerts: 'Alerts', maintenance: 'Maintenance',
  fuel_monitoring: 'Fuel Monitoring', playback: 'Playback', drivers: 'Drivers',
};

const EMPTY = {
  username: '', password: '', fullName: '', email: '',
  phone: '', company: '', address: '', allowedFeatures: [],
};

const RoleManageModal = ({ open, onClose, onSubmit, editUser, targetRole, parentFeatures = [], loading, accent = 'var(--accent-blue)' }) => {
  const [form,  setForm]  = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(editUser ? {
      username:        editUser.username || '',
      password:        '',
      fullName:        editUser.fullName || editUser.name || '',
      email:           editUser.email || '',
      phone:           editUser.phone || '',
      company:         editUser.company || '',
      address:         editUser.address || '',
      allowedFeatures: editUser.allowedFeatures || [],
    } : EMPTY);
  }, [editUser, open]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFeature = feat => setForm(f => ({
    ...f,
    allowedFeatures: f.allowedFeatures.includes(feat)
      ? f.allowedFeatures.filter(x => x !== feat)
      : [...f.allowedFeatures, feat],
  }));

  const available = Object.keys(ALL_FEATURES_LABELS).filter(f =>
    parentFeatures.length === 0 || parentFeatures.includes(f)
  );

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.fullName.trim()) return setError('Full name is required');
    if (!editUser && !form.username.trim()) return setError('Username is required');
    if (!editUser && !form.password.trim()) return setError('Password is required');
    onSubmit(form);
  };

  const roleName = targetRole?.replace('_', ' ');

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header" style={{ borderLeft: `3px solid ${accent}` }}>
          <span className="modal-title">{editUser ? `Edit ${roleName} — ${editUser.username}` : `Create ${roleName}`}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: '0 6px', minWidth: 0 }}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Full Name *</label>
                <input className="input" value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label className="input-label">Username {!editUser && '*'}</label>
                <input className="input" value={form.username} onChange={e => set('username', e.target.value)} placeholder="username" disabled={!!editUser} />
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">{editUser ? 'New Password (blank = no change)' : 'Password *'}</label>
              <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label className="input-label">Phone</label>
                <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 9999999999" />
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Company</label>
              <input className="input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company name" />
            </div>

            <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Allowed Features</div>
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)', padding: 10, background: 'var(--bg-input)' }}>
              {available.map(feat => (
                <label key={feat} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: form.allowedFeatures.includes(feat) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={form.allowedFeatures.includes(feat)} onChange={() => toggleFeature(feat)} style={{ accentColor: accent, width: 12, height: 12 }} />
                  {ALL_FEATURES_LABELS[feat]}
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: accent, borderColor: accent }}>
              {loading ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Saving…</> : editUser ? 'Save Changes' : `Create ${roleName}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RoleManageModal;