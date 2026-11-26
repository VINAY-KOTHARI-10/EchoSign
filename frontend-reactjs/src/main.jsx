import React, { Profiler } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { queryClient } from './lib/queryClient';
import { store } from './store';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './components/ui';
import { UiPrefsProvider } from './hooks/useUiPrefs';
import './styles/global.css';
import './styles/design.css';
import './styles/pages.css';
import './styles/theme.css';
import './styles/premium.css';
import './styles/tailwind.css';

// React Profiler (debugging): in development, report any render of the app that takes longer than 50 ms.
// In a production build the Profiler does nothing. The React Developer Tools show the same data as a flame graph.
const onRender = (id, phase, actualDuration) => {
  if (import.meta.env.DEV && actualDuration > 50) console.debug(`[Profiler] ${id} ${phase}: ${actualDuration.toFixed(1)} ms`);
};

// Offline support: the service worker keeps the app shell and saved lecture notes (never live classroom data).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* optional feature */ }); });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <ReduxProvider store={store}>
    <BrowserRouter>
      <UiPrefsProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <Profiler id="App" onRender={onRender}><App /></Profiler>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </UiPrefsProvider>
    </BrowserRouter>
    </ReduxProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
