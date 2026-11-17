import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, useLocation } from 'react-router';
import { queryClient } from './lib/queryClient';
import { AppRoutes } from './routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './auth/AuthProvider';

import { ErrorBoundary } from './components/ui/ErrorBoundary';

function AppContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
