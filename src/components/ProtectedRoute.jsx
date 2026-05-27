import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userData } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
    // If user does not have the required role, redirect them
    // to their appropriate dashboard or a fallback page
    return <Navigate to="/" replace />;
  }

  return children;
}
