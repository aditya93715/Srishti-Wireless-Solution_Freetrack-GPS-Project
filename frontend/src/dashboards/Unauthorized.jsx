import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_HOME = {
  super_admin: '/superadmin/dashboard',
  admin: '/admin/dashboard',
  dealer: '/dealer/dashboard',
  user: '/user/dashboard',
};

const Unauthorized = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 80,
          fontWeight: 700,
          color: 'var(--border-strong)',
          lineHeight: 1,
        }}
      >
        403
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Access Denied
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
        You do not have permission to access this resource. Your role level is insufficient.
      </div>
      <div
        style={{
          padding: '8px 16px',
          border: '1px solid var(--accent-red)',
          background: 'rgba(255,59,48,0.06)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--accent-red)',
          letterSpacing: '0.08em',
        }}
      >
        ROLE: {user?.role?.toUpperCase() || 'UNKNOWN'}
      </div>
      <button
        className="btn btn-outline"
        onClick={() => navigate(ROLE_HOME[user?.role] || '/login')}
      >
        Return to Dashboard
      </button>
    </div>
  );
};

export default Unauthorized;
