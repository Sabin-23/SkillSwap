import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageLoader } from '../ui/index.jsx';

/** Requires a signed-in user. Admins are sent to the admin area. */
export function RequireUser() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (!user.profile.onboardingCompleted && location.pathname !== '/app/onboarding') {
    return <Navigate to="/app/onboarding" replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== 'ADMIN') return <Navigate to="/app" replace />;
  return <Outlet />;
}

/** Sends signed-in visitors away from login/register pages. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/app'} replace />;
  return <Outlet />;
}
