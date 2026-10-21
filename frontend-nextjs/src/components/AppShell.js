'use client';

// The frame of the signed-in area: the same sidebar layout, classes and behaviour as the EchoSign React app
// (a Client Component because it highlights the active link and opens the phone menu).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutDashboard, LogOut, Menu, NotebookPen, Shield, X } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { logoutAction } from '@/features/auth/actions';

const ICONS = { dashboard: LayoutDashboard, library: BookOpen, notes: NotebookPen, admin: Shield };
const ROLE_LABEL = { USER: 'Member', TEACHER: 'Teacher', ADMIN: 'Admin', MODERATOR: 'Moderator' };

export default function AppShell({ locale, user, nav, labels, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the phone menu when the page changes, and with Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="shell">
      <a className="skip-link" href="#content">Skip to main content</a>
      <div className="mobile-bar">
        <Logo href={`/${locale}/dashboard`} />
        <ThemeToggle />
        <button className="btn btn-ghost btn-icon" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="sidebar">
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      <aside id="sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-row"><Logo href={`/${locale}/dashboard`} subtitle="Next.js companion" /></div>
        <nav aria-label="Main" className="stack" style={{ gap: 4 }}>
          {nav.map(({ key, label }) => {
            const Icon = ICONS[key];
            const href = `/${locale}/${key}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={key} href={href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon size={19} aria-hidden="true" /> {label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: 16 }}><LocaleSwitcher locale={locale} label={labels.language} /></div>
        <div className="sidebar-foot">
          <div className="user-pill">
            <div className="avatar" aria-hidden="true">{(user.username || 'U')[0].toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</div>
              <span className={`role-badge role-${(user.role || 'USER').toLowerCase()}`}>{ROLE_LABEL[user.role] || user.role}</span>
            </div>
          </div>
          <form action={logoutAction} className="row" style={{ gap: 8 }}>
            <input type="hidden" name="locale" value={locale} />
            <ThemeToggle />
            <button className="btn btn-danger-soft btn-sm logout-btn" style={{ flex: 1 }}><LogOut size={16} aria-hidden="true" /> {labels.logout}</button>
          </form>
        </div>
      </aside>
      {open && <button className="drawer-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <main id="content" tabIndex={-1} className="main">{children}</main>
    </div>
  );
}
