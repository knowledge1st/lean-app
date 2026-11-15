import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { queryClient } from './lib/queryClient';
import { AppRoutes } from './routes';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './auth/AuthProvider';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
