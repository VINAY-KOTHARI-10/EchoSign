import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import { refreshAccessToken, refreshFailedOffline, setToken } from '../api/client';
import { queryClient } from '../lib/queryClient';
import { purgeUserOutbox } from '../lib/outboxStore';

const LAST_USER = 'echosign_last_user';
const readLastUser = () => { try { return JSON.parse(localStorage.getItem(LAST_USER)); } catch { return null; } };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false); // signed in earlier, but the network is down
  const [perms, setPerms] = useState(() => new Set()); // what this account may do (from the server's permission table)

  const loadMe = useCallback(async () => {
    const permsRequest = api.users.permissions(); // asked at the same time as the profile, not after it
    permsRequest.catch(() => {});
    const res = await api.users.me();
    setUser(res.data.user);
    setOfflineMode(false);
    try { const u = res.data.user; localStorage.setItem(LAST_USER, JSON.stringify({ id: u.id, username: u.username, email: u.email, role: u.role })); } catch { /* storage unavailable */ }
    setActivity(res.data.activity || null);
    permsRequest.then((p) => setPerms(new Set(p.data.permissions))).catch(() => setPerms(new Set()));
    return res.data.user;
  }, []);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    (async () => {
      try {
        if (await refreshAccessToken()) await loadMe();
        else if (refreshFailedOffline()) {
          // No network at all: open in read-only offline mode so saved lecture notes can still be read.
          const last = readLastUser();
          if (last) { setUser(last); setOfflineMode(true); }
        }
      } catch { /* not signed in */ }
      setLoading(false);
    })();
  }, [loadMe]);

  // Login/OTP/OAuth set cookies; exchange them for an in-memory token, then load the profile.
  const establishSession = useCallback(async () => {
    await refreshAccessToken();
    return loadMe();
  }, [loadMe]);

  // Leave offline mode as soon as the connection returns.
  useEffect(() => {
    if (!offlineMode) return undefined;
    const back = async () => { if (await refreshAccessToken()) await loadMe().catch(() => {}); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offlineMode, loadMe]);

  // Access tokens last 15 minutes. Renew quietly so live captions and chat keep working on a page left open.
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(() => { refreshAccessToken(); }, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [user]);

  const logout = useCallback(async () => {
    // Captions this person had not sent yet are theirs: remove them from this device before the next person uses it.
    try { await purgeUserOutbox(user?.id); } catch { /* best effort */ }
    try { await api.auth.logout(); } catch { /* ignore */ }
    setToken(null);
    queryClient.clear(); // cached server data belongs to the person who just signed out
    setUser(null);
    setActivity(null);
    setPerms(new Set());
    try { localStorage.removeItem(LAST_USER); } catch { /* ignore */ }
    // Saved offline notes belong to the person who signed out; remove them from this device.
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE' }); } catch { /* no service worker */ }
  }, [user]);

  const can = useCallback((permission) => perms.has(permission), [perms]);

  const value = useMemo(
    () => ({
      user, activity, loading, isAdmin: user?.role === 'ADMIN',
      isTeacher: user?.role === 'TEACHER' || user?.role === 'ADMIN', // may start classes
      can, permsLoaded: perms.size > 0 || offlineMode, offlineMode,
      establishSession, refresh: loadMe, logout,
    }),
    [user, activity, loading, can, perms, offlineMode, establishSession, loadMe, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
