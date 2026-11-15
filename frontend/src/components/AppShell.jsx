// AppShell - scrolling sidebar, compact footer, admin nav
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bot, Captions, ChevronDown, Download, Hand, History, LibraryBig, LogOut, Menu, Mic, Presentation, Shield, Sparkles, Trophy, User, Users, WifiOff, X } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import useOnline from '../hooks/useOnline';
import usePwaInstall from '../hooks/usePwaInstall';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib';

// Everyone sees these. Teachers and admins also get the Teacher dashboard (see AppShell below).
const links = [
  { to: '/classroom', label: 'Classroom', icon: Captions },
  { to: '/library', label: 'My lectures', icon: LibraryBig },
  { to: '/signs', label: 'Sign Lab', icon: Hand },
  { to: '/dashboard', label: 'Practice', icon: Mic },
  { to: '/conversation', label: 'AI Partner', icon: Bot },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/history', label: 'History', icon: History },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
];


function InstallButton() {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;
  return <button type="button" className="btn btn-outline btn-sm btn-block" style={{ margin: '0 0 10px' }} onClick={install}><Download size={15} aria-hidden="true" /> Install EchoSign</button>;
}

export function SidebarFooter({ onLogout }) {
  const { user } = useAuth();
  return (
    <div className="sidebar-foot">
      <div className="user-pill">
        <div className="avatar" aria-hidden="true">{(user?.username || 'U')[0].toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username}</div>
          <span className={`role-badge role-${(user?.role || 'USER').toLowerCase()}`}>{roleLabel(user?.role)}</span>
        </div>
        <ChevronDown size={16} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
      </div>
      <div className="row" style={{ gap: 8 }}><ThemeToggle /><button className="btn btn-danger-soft btn-sm logout-btn" style={{ flex: 1 }} onClick={onLogout}><LogOut size={16} aria-hidden="true" /> Log out</button></div>
    </div>
  );
}

// Shared frame for the learner and admin apps: skip link, landmark navigation, mobile drawer.
export function Frame({ brandTo, badge, nav, extra, promo, subtitle, adminClass, children, onLogout }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const main = useRef(null);

  // On navigation, close the drawer and move focus to the new page's content so keyboard and screen-reader
  // users start at the top of it. Not on the first load, where focus should begin at the skip link.
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    setOpen(false);
    if (lastPath.current === location.pathname) return; // first load (or a StrictMode re-run): leave focus alone
    lastPath.current = location.pathname;
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const online = useOnline();
  return (
    <div className={`shell ${adminClass || ''}`}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="mobile-bar">
        <Logo to={brandTo} />
        <ThemeToggle />
        <button className="btn btn-ghost btn-icon" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="sidebar">
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      <aside id="sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-row"><Logo to={brandTo} subtitle={subtitle} />{badge}</div>
        <nav aria-label="Main" className="stack" style={{ gap: 4 }}>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} aria-hidden="true" /> {label}
            </NavLink>
          ))}
          {extra}
        </nav>
        {promo}
        <InstallButton />
        <SidebarFooter onLogout={onLogout} />
      </aside>
      {open && <button className="drawer-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <main id="main" ref={main} tabIndex={-1} className="main">
        {!online && <p className="conn-banner" role="status"><WifiOff size={18} aria-hidden="true" /> You are offline. Live classes need a connection; saved lecture notes are in <Link to="/library" className="link">My lectures</Link>.</p>}
        {children}
      </main>
    </div>
  );
}

export default function AppShell() {
  const { isAdmin, can, logout } = useAuth();
  const navigate = useNavigate();
  // The menu follows the account's permissions: teachers get a dashboard, students do not.
  const nav = can('analytics.class') ? [links[0], { to: '/teacher', label: 'Teacher dashboard', icon: Presentation }, ...links.slice(1)] : links;
  return (
    <Frame
      brandTo="/classroom" nav={nav} subtitle="Accessible Classroom Assistant"
      promo={(
        <Link to="/signs" className="promo">
          <b>Make learning inclusive for all</b>
          <span>Speech + Sign → Text</span>
          <span className="promo-art" aria-hidden="true"><Sparkles size={22} /></span>
        </Link>
      )}
      extra={isAdmin && <NavLink to="/admin" className="nav-item"><Shield size={19} aria-hidden="true" /> Admin panel</NavLink>}
      onLogout={async () => { await logout(); navigate('/'); }}
    >
      <Outlet />
    </Frame>
  );
}

