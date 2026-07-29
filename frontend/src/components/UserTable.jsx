import React from 'react';
import Icon from './Icon';

const ROLE_BADGE = {
  super_admin: 'badge-blue',
  admin: 'badge-green',
  dealer: 'badge-amber',
  user: 'badge-purple',
};

const STATUS_BADGE = {
  Active: 'badge-green',
  Inactive: 'badge-muted',
  Suspended: 'badge-red',
};

const UserTable = ({ users, onEdit, onDelete, onView, loading }) => {
  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◻</div>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No records found</div>
        <div>Try adjusting your search or create a new entry</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Username</th>
            <th>Full Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Role</th>
            <th>Status</th>
            <th>Devices</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u._id}>
              <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11 }}>
                {String(i + 1).padStart(2, '0')}
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{u.username}</td>
              <td style={{ fontWeight: 500 }}>{u.fullName || u.name || '—'}</td>
              <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{u.email || '—'}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.phone || '—'}</td>
              <td>
                <span className={`badge ${ROLE_BADGE[u.role] || 'badge-muted'}`}>
                  {u.role?.replace('_', ' ')}
                </span>
              </td>
              <td>
                <span className={`badge ${STATUS_BADGE[u.status] || 'badge-muted'}`}>
                  {u.status}
                </span>
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {u.deviceCount ?? 0}
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  {onView && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onView(u)}
                      title="View"
                      style={{ padding: '0 8px', minWidth: 0 }}
                    >
                      <Icon name="eye" size={13} />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onEdit(u)}
                      title="Edit"
                      style={{ padding: '0 8px', minWidth: 0 }}
                    >
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onDelete(u)}
                      title="Delete"
                      style={{ padding: '0 8px', minWidth: 0, color: 'var(--accent-red)' }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
