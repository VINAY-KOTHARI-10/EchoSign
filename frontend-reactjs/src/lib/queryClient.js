import { QueryClient } from '@tanstack/react-query';

// Server state (data that lives on the backend) is handled by React Query: it caches each answer, shows the cached
// copy straight away, and refreshes it in the background (when the window regains focus or the connection returns).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,                   // cached answers show at once, and are always re-checked in the background
      gcTime: 5 * 60 * 1000,          // unused answers are kept for 5 minutes
      refetchOnWindowFocus: true,     // background synchronisation when the person comes back to the tab
      refetchOnReconnect: true,
      retry: (count, error) => count < 2 && !(error && error.status >= 400 && error.status < 500),
    },
  },
});
