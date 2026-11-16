// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileCard } from './ProfileForm';
import { api, ApiError } from '../../lib/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileCard />
    </QueryClientProvider>,
  );
}

it('invita a completar un perfil ausente, valida sin enviar y permite crearlo', async () => {
  vi.spyOn(api, 'get').mockRejectedValueOnce(new ApiError(404, 'profile_not_found', 'Sin perfil'));
  const put = vi.spyOn(api, 'put').mockImplementation(async (_path, body) => body);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Completar mis datos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(put).not.toHaveBeenCalled();
  expect(screen.getAllByText('Elegí una opción')).toHaveLength(2);
  expect(screen.getByText('Indicá tu fecha de nacimiento')).toBeTruthy();
  expect(screen.getByText('Indicá tu altura')).toBeTruthy();
  expect(screen.getByLabelText('Altura').getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(screen.getByLabelText('Mujer'));
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: '1992-08-10' },
  });
  fireEvent.change(screen.getByLabelText('Altura'), { target: { value: '168' } });
  fireEvent.click(screen.getByLabelText('Poco movimiento'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('168 cm')).toBeTruthy();
  expect(put).toHaveBeenCalledWith('/api/profile', {
    sex: 'female',
    birthDate: '1992-08-10',
    heightCm: 168,
    activityLevel: 'sedentary',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

it('muestra carga y error de lectura con reintento', async () => {
  vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
  setup();
  expect(screen.getByRole('status').textContent).toBe('Cargando tus datos…');
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('button', { name: 'Completar mis datos' })).toBeTruthy();
});
