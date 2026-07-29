import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Authenticating
      </span>
    </div>
  );

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

export const RoleRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

export const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    const paths = {
      super_admin: '/superadmin/dashboard',
      admin: '/admin/dashboard',
      dealer: '/dealer/dashboard',
      user: '/user/dashboard',
    };
    return <Navigate to={paths[user.role] || '/login'} replace />;
  }
  return children;
};
