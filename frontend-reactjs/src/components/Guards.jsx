// Guards - auth route guards with Google redirect fix
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../features/auth/pages/Forbidden';

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

// Shows a clear "not allowed" page (not a silent redirect) when the account lacks a permission.
// Pass `role` and `need` so the page can say what is required. Permissions come from the server's table.
export function RequirePermission({ permission, need }) {
  const { user, can, permsLoaded } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!permsLoaded) return <div className="splash"><div className="spinner" /></div>;
  if (!can(permission)) return <Forbidden need={need} />;
  return <Outlet />;
}

export function RequireAdmin() {
  return <RequirePermission permission="admin.panel" need="Admin" />;
}

// Signed-in users skip login/register; admins land on the admin panel.
export function GuestOnly() {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname;
  if (user) return <Navigate to={from || (isAdmin ? '/admin' : '/classroom')} replace />;
  return <Outlet />;
}

