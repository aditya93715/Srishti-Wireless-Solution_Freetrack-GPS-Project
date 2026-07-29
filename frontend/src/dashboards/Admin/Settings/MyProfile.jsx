import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { updateUserApi } from '../api/users';
import Icon from '../components/Icon';

const ROLE_ACCENTS = {
  super_admin: 'var(--accent-blue)',
  admin: 'var(--accent-green)',
  dealer: 'var(--accent-amber)',
  user: 'var(--accent-purple)',
};

const MyProfile = () => {
  const { user } = useAuth();
  const toast = useToast();
  const accent = ROLE_ACCENTS[user?.role] || 'var(--accent-blue)';
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    company: user?.company || '',
    address: user?.address || '',
    newPassword: '',
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { fullName: form.fullName, email: form.email, phone: form.phone, company: form.company, address: form.address };
      if (form.newPassword) payload.password = form.newPassword;
      await updateUserApi(user._id, payload);
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">
          <div style={{ width: 3, height: 18, background: accent }} />
          Profile
        </div>
        <div className="page-subtitle">Manage your account information</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left - Identity */}
        <div>
          <div className="card mb-12">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px 0 16px',
                borderBottom: '1px solid var(--border)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: `${accent}22`,
                  border: `2px solid ${accent}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 24,
                  fontWeight: 700,
                  color: accent,
                  marginBottom: 12,
                }}
              >
                {(user?.fullName || user?.username || 'U')[0].toUpperCase()}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                {user?.fullName || user?.name || user?.username}
              </div>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, fontWeight: 600 }}>
                {user?.role?.replace('_', ' ')}
              </div>
            </div>

            {[
              { label: 'User ID', value: user?.user_id ?? user?._id?.slice(-6), mono: true },
              { label: 'Username', value: user?.username, mono: true },
              { label: 'Status', value: user?.status },
              { label: 'Devices', value: user?.deviceCount ?? 0, mono: true },
              { label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 12, fontFamily: item.mono ? 'var(--font-mono)' : 'inherit', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* Allowed features */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Allowed Features</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: accent }}>
                {user?.allowedFeatures?.length ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(user?.allowedFeatures || []).map((f) => (
                <span key={f} className="badge badge-muted" style={{ fontSize: 9 }}>
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
              {(!user?.allowedFeatures || user.allowedFeatures.length === 0) && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No features assigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Right - Edit form */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Edit Profile</span>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="input-label">Full Name</label>
              <input className="input" name="fullName" value={form.fullName} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="input-label">Email</label>
              <input className="input" type="email" name="email" value={form.email} onChange={handleChange} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="input-label">Phone</label>
                <input className="input" name="phone" value={form.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="input-label">Company</label>
                <input className="input" name="company" value={form.company} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Address</label>
              <input className="input" name="address" value={form.address} onChange={handleChange} />
            </div>

            <div className="divider" />

            <div className="form-group mb-0">
              <label className="input-label">New Password (optional)</label>
              <input className="input" type="password" name="newPassword" value={form.newPassword} onChange={handleChange} placeholder="Leave blank to keep current" />
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setForm({ ...form, newPassword: '' })}>
                Reset
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
