// AdminShell - admin navigation shell
import { ArrowLeft, Captions, Globe, LayoutDashboard, Mic, Users } from 'lucide-react';
import { Frame } from './AppShell';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/sessions', label: 'Sessions', icon: Mic },
  { to: '/admin/classrooms', label: 'Classrooms', icon: Captions },
  { to: '/admin/languages', label: 'Languages', icon: Globe },
];

export default function AdminShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Frame
      brandTo="/admin" nav={links} adminClass="admin"
      badge={<span className="admin-badge">ADMIN</span>}
      extra={<NavLink to="/classroom" className="nav-item"><ArrowLeft size={19} aria-hidden="true" /> Back to app</NavLink>}
      onLogout={async () => { await logout(); navigate('/'); }}
    >
      <Outlet />
    </Frame>
  );
}

