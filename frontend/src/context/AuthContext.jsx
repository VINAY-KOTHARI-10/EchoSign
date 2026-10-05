import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import { refreshAccessToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const res = await api.users.me();
    setUser(res.data.user);
    setActivity(res.data.activity || null);
    return res.data.user;
  }, []);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    (async () => {
      try {
        if (await refreshAccessToken()) await loadMe();
      } catch { /* not signed in */ }
      setLoading(false);
    })();
  }, [loadMe]);

  // Login/OTP/OAuth set cookies; exchange them for an in-memory token, then load the profile.
  const establishSession = useCallback(async () => {
    await refreshAccessToken();
    return loadMe();
  }, [loadMe]);

  // Access tokens last 15 minutes. Renew quietly so live captions and chat keep working on a page left open.
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(() => { refreshAccessToken(); }, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [user]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    setActivity(null);
  }, []);

  const value = useMemo(
    () => ({
      user, activity, loading, isAdmin: user?.role === 'ADMIN',
      isTeacher: user?.role === 'TEACHER' || user?.role === 'ADMIN', // may start classes
      establishSession, refresh: loadMe, logout,
    }),
    [user, activity, loading, establishSession, loadMe, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
