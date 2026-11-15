import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from './AuthProvider';

export const testUser = { id: 'user-1', username: 'jose', displayName: 'José' };

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

export function renderAuth(children: ReactNode, initialPath = '/hoy') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
