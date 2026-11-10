// Guards - auth route guards with Google redirect fix
import { useAuth } from '../context/AuthContext';

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

// Signed-in users skip login/register; admins land on the admin panel.
export function GuestOnly() {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname;
  if (user) return <Navigate to={from || (isAdmin ? '/admin' : '/dashboard')} replace />;
  return <Outlet />;
}

