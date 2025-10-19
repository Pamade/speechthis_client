import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useUser } from '../../context/UserContext';
import { useEffect } from 'react';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

export const PublicOnlyRoute = ({ children }: PublicOnlyRouteProps) => {
  const { user, loading } = useUser();

  // Check for token
  const hasToken = !!localStorage.getItem('token');

  if (loading) {
    return <div>Loading...</div>;
  }

  // Redirect if either user is set or token exists
  if (user || hasToken) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}; 