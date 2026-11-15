import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { queryClient } from './lib/queryClient';
import { AppRoutes } from './routes';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </QueryClientProvider>
  );
}
