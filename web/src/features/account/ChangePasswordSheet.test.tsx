// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { jsonResponse, renderAuth, testUser } from '../../auth/testUtils';
import { getToken, setToken } from '../../lib/session';
import { ChangePasswordSheet } from './ChangePasswordSheet';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
  setToken('token');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(jsonResponse(testUser));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Account() {
  const { status } = useAuth();
  const [open, setOpen] = useState(true);
  const [updated, setUpdated] = useState(false);
  return (
    <>
      <p>{status}</p>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {updated && <p role="status">Actualizada</p>}
      <ChangePasswordSheet open={open} onOpenChange={setOpen} onSuccess={() => setUpdated(true)} />
    </>
  );
}
async function setup() {
  renderAuth(<Account />);
  await screen.findByText('authenticated');
}
function fill(repeat = 'nueva-segura') {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), {
    target: { value: 'actual-segura' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
    target: { value: 'nueva-segura' },
  });
  fireEvent.change(screen.getByLabelText('Repetir contraseña nueva'), {
    target: { value: repeat },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
}

it('las contraseñas que no coinciden no se envían', async () => {
  await setup();
  fill('otra-segura');
  expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('401 invalid_credentials marca la contraseña actual y mantiene la sesión', async () => {
  await setup();
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ error: { code: 'invalid_credentials', message: 'No' } }, 401),
  );
  fill();
  expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
  expect(screen.getByLabelText('Contraseña actual').getAttribute('aria-invalid')).toBe('true');
  expect(getToken()).toBe('token');
  expect(screen.getByText('authenticated')).toBeTruthy();
});

it('al guardar cierra la hoja, avisa y limpia los campos al reabrir', async () => {
  await setup();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  fill();
  expect(await screen.findByRole('status')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByText('Abrir'));
  expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Contraseña nueva') as HTMLInputElement).value).toBe('');
  expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost/api/auth/password');
});

it('cerrar sin guardar limpia campos y errores', async () => {
  await setup();
  fill('diferente');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  fireEvent.click(screen.getByText('Abrir'));
  expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText('Las contraseñas no coinciden.')).toBeNull();
});

it.each(['corta', 'ñ'.repeat(37)])(
  'valida los límites del esquema antes de enviar: %s',
  async (password) => {
    await setup();
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'actual-segura' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Repetir contraseña nueva'), {
      target: { value: password },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
