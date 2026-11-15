import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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

// Offline support: the service worker keeps the app shell and saved lecture notes (never live classroom data).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* optional feature */ }); });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UiPrefsProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </UiPrefsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
