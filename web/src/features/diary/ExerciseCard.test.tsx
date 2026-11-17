// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExerciseLog } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { ExerciseCard } from './ExerciseCard';
import { exerciseKey } from './activityApi';
import { summaryKey } from './api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const date = '2026-11-14';
const log: ExerciseLog = { id: 'exercise', date, activity: 'Caminata', minutes: 30, kcal: 150 };
function setup(logs: ExerciseLog[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(exerciseKey(date), { logs });
  vi.spyOn(api, 'get').mockImplementation(
    async () => client.getQueryData(exerciseKey(date)) as never,
  );
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ExerciseCard date={date} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, invalidate };
}
it('permite alta, edición y baja confirmada sin recargar', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue(log);
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ ...log, minutes: 45, kcal: 0 });
  const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
  const { client, invalidate } = setup();
  expect(screen.getByText('Todavía no registraste ejercicio hoy')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }));
  fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Caminata' } });
  fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Calorías (opcional)'), { target: { value: '150' } });
  fireEvent.click(screen.getByText('Guardar'));
  await screen.findByRole('button', { name: 'Caminata · 30 min · 150 kcal' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(post).toHaveBeenCalledWith('/api/exercise', {
    date,
    activity: 'Caminata',
    minutes: 30,
    kcal: 150,
  });
  expect(screen.getByText('Total: 150 kcal')).toBeTruthy();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: summaryKey(date) });
  fireEvent.click(screen.getByRole('button', { name: 'Caminata · 30 min · 150 kcal' }));
  fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '45' } });
  fireEvent.change(screen.getByLabelText('Calorías (opcional)'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Guardar'));
  fireEvent.click(await screen.findByRole('button', { name: 'Caminata · 45 min' }));
  expect(patch).toHaveBeenCalledWith('/api/exercise/exercise', {
    activity: 'Caminata',
    minutes: 45,
    kcal: 0,
  });
  fireEvent.click(screen.getByText('Eliminar'));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancelar'));
  expect(screen.queryByText('¿Querés eliminar este ejercicio?')).toBeNull();
  fireEvent.click(screen.getByText('Eliminar'));
  fireEvent.click(screen.getByText('Confirmar eliminación'));
  await screen.findByText('Todavía no registraste ejercicio hoy');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(remove).toHaveBeenCalledWith('/api/exercise/exercise');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: exerciseKey(date) });
  expect(invalidate).toHaveBeenCalledTimes(6);
  client.clear();
});
it.each(['add', 'edit', 'delete'])(
  'muestra toast al fallar %s y conserva la lista y hoja',
  async (kind) => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
    vi.spyOn(api, 'patch').mockRejectedValue(new Error('offline'));
    vi.spyOn(api, 'delete').mockRejectedValue(new Error('offline'));
    const { client } = setup(kind === 'add' ? [] : [log]);
    fireEvent.click(
      screen.getByRole('button', {
        name: kind === 'add' ? 'Agregar ejercicio' : 'Caminata · 30 min · 150 kcal',
      }),
    );
    if (kind === 'delete') {
      fireEvent.click(screen.getByText('Eliminar'));
      fireEvent.click(screen.getByText('Confirmar eliminación'));
    } else {
      fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Caminata' } });
      fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30' } });
      fireEvent.click(screen.getByText('Guardar'));
    }
    expect(await screen.findByText('No se pudo guardar el ejercicio. offline')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() =>
      expect(client.getQueryData(exerciseKey(date))).toEqual({ logs: kind === 'add' ? [] : [log] }),
    );
    client.clear();
  },
);

it('avisa si falla la recarga con caché y reintenta conservando el valor', async () => {
  const { client } = setup([log]);
  vi.mocked(api.get).mockRejectedValue(new Error('offline'));
  await client.invalidateQueries({ queryKey: exerciseKey(date) });
  expect(await screen.findByText('No se pudo actualizar')).toBeTruthy();
  expect(screen.getByText('Total: 150 kcal')).toBeTruthy();
  vi.mocked(api.get).mockResolvedValue({ logs: [{ ...log, kcal: 1234, minutes: 30.5 }] });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Total: 1.234 kcal')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Caminata · 30,5 min · 1.234 kcal' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('No se pudo actualizar')).toBeNull());
  client.clear();
});

it.each([
  ['success', 'button'],
  ['error', 'button'],
  ['success', 'escape'],
  ['error', 'escape'],
])(
  'permite cerrar durante el guardado e informa %s por toast usando %s',
  async (outcome, closeMethod) => {
    let resolve!: (value: ExerciseLog) => void;
    let reject!: (error: Error) => void;
    vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise<ExerciseLog>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const { client } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }));
    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Caminata' } });
    fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    if (closeMethod === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    if (outcome === 'success') resolve(log);
    else reject(new Error('Mensaje del servidor'));
    expect(
      await screen.findByText(
        outcome === 'success'
          ? 'Guardaste el ejercicio'
          : 'No se pudo guardar el ejercicio. Mensaje del servidor',
      ),
    ).toBeTruthy();
    client.clear();
  },
);
