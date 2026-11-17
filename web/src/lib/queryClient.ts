import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      networkMode: 'always',
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < (error instanceof ApiError && error.status >= 500 ? 2 : 1);
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { networkMode: 'always', retry: false },
  },
});
