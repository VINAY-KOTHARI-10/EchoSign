'use client';

// Runs the copied EchoSign React screens inside Next.js. It provides what the React app's main.jsx and App.jsx provided:
// data cache (React Query), Redux store, accessibility preferences, toasts, confirm dialogs, the signed-in person, and the
// frame (sidebar). The page being shown arrives as `children` and is handed to the frame's <Outlet />.
import { Suspense, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { OutletProvider, useNavigate } from 'react-router-dom';
import { queryClient } from '@/react-app/lib/queryClient';
import { store } from '@/react-app/store';
import { UiPrefsProvider } from '@/react-app/hooks/useUiPrefs';
import { ToastProvider } from '@/react-app/context/ToastContext';
import { ConfirmProvider } from '@/react-app/components/ui';
import { AuthProvider, useAuth } from '@/react-app/context/AuthContext';
import * as api from '@/react-app/api';
import { setLanguages } from '@/react-app/lib/languages';
import AppShell from '@/react-app/components/AppShell';
import AdminShell from '@/react-app/features/admin/components/AdminShell';

const Splash = () => <div className="splash"><div className="spinner" /></div>;

// Wait for the sign-in check, load the language list, and send signed-out people to the sign-in page
// (the server already refuses them; this covers an expired session in an open tab).
function Gate({ children }) {
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { api.languages.list().then((r) => setLanguages(r.data.languages)).catch(() => { /* built-in list stays */ }); }, []);
  useEffect(() => { if (!loading && !user) navigate('/login', { replace: true }); }, [loading, user, navigate]);
  if (loading || !user) return <Splash />;
  return <Suspense fallback={<Splash />}>{children}</Suspense>;
}

function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ReduxProvider store={store}>
        <UiPrefsProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>{children}</AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </UiPrefsProvider>
      </ReduxProvider>
    </QueryClientProvider>
  );
}

// The member area: sidebar frame + the page.
export function MemberFrame({ children }) {
  return (
    <Providers>
      <Gate><OutletProvider element={children}><AppShell /></OutletProvider></Gate>
    </Providers>
  );
}

// The admin area: admin frame + the page.
export function AdminFrame({ children }) {
  return (
    <Providers>
      <Gate><OutletProvider element={children}><AdminShell /></OutletProvider></Gate>
    </Providers>
  );
}
