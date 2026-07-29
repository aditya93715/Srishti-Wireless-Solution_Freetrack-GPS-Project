import React from 'react';
import Icon from '../../components/Icon';

const DeleteConfirmModal = ({ user, roleName = 'User', onConfirm, onCancel, loading }) => {
  if (!user) return null;
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header" style={{ borderLeft: '3px solid var(--accent-red)' }}>
          <span className="modal-title" style={{ color: 'var(--accent-red)' }}>Confirm Delete {roleName}</span>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ padding: '0 6px', minWidth: 0 }}><Icon name="close" size={13} /></button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '12px 14px', background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.3)', borderLeft: '3px solid var(--accent-red)', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--accent-red)', fontWeight: 600, marginBottom: 3 }}>This action cannot be undone</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>The account will be permanently removed from the database.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {[
              { l: 'Username',  v: user.username },
              { l: 'Full Name', v: user.fullName || user.name || '—' },
              { l: 'Role',      v: user.role?.replace('_', ' ') },
              { l: 'Status',    v: user.status },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>{item.l}</div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{item.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn" onClick={onConfirm} disabled={loading} style={{ background: 'var(--accent-red)', color: '#fff', borderColor: 'var(--accent-red)' }}>
            {loading ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5, borderTopColor: '#fff' }} /> Deleting…</> : <><Icon name="trash" size={13} /> Delete Permanently</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;