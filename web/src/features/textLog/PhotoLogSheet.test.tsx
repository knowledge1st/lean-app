// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ParseMealTextResponse } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { todayLocal } from '../../lib/date';
import { api } from '../../lib/api';
import { PhotoLogSheet } from './PhotoLogSheet';
import { preparePhoto } from './photo';
vi.hoisted(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
});
vi.mock('./photo', () => ({ preparePhoto: vi.fn() }));
const image = 'data:image/jpeg;base64,cGhvdG8=';
const response: ParseMealTextResponse = {
  interpreter: 'ai',
  remainingToday: 9,
  warnings: [],
  items: [
    {
      key: 'rice',
      meal: 'lunch',
      mealSource: 'default',
      said: 'arroz',
      grams: 150,
      gramsEstimated: true,
      match: 'exact',
      searchQuery: 'arroz',
      alternatives: [],
      food: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Arroz',
        source: 'seed',
        createdByMe: false,
        brand: null,
        barcode: null,
        kcal: 100,
        protein: 5,
        carbs: 10,
        fat: 2,
        servingG: null,
        servingLabel: null,
      },
    },
  ],
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function setup() {
  vi.mocked(preparePhoto).mockResolvedValue(image);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const onClose = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PhotoLogSheet date={todayLocal()} defaultMeal="lunch" onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, onClose };
}
async function choose() {
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('Elegir de la galería'), { target: { files: [file] } });
  await screen.findByAltText('Foto elegida');
  expect(preparePhoto).toHaveBeenCalledWith(file);
}
function mockFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) =>
      String(url).endsWith('/parse-photo') ? json(response) : json([{ id: 'created' }], 201),
    );
}
async function interpret() {
  await choose();
  fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
  await screen.findByRole('heading', { name: 'Revisá los alimentos' });
}
it('prepares a photo, previews a data URL, reviews estimates and saves only on confirmation', async () => {
  const fetchMock = mockFetch();
  const post = vi.spyOn(api, 'post');
  const { onClose } = setup();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sacar foto' }));
  expect(screen.getByLabelText('Sacar foto').getAttribute('capture')).toBe('environment');
  expect(screen.getByLabelText('Elegir de la galería').hasAttribute('capture')).toBe(false);
  expect(
    screen.getByText(
      'La foto se envía a un servicio de IA gratuito para interpretarla. La app no la guarda.',
    ),
  ).toBeTruthy();
  await choose();
  expect(screen.getByAltText('Foto elegida').getAttribute('src')).toBe(image);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
  await screen.findByRole('heading', { name: 'Revisá los alimentos' });
  expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe(
    'Las cantidades son estimadas a partir de la foto. Revisalas.',
  );
  expect(screen.getByText('Te quedan 9 fotos hoy')).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'Revisá los alimentos' }),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(
    '/api/entries/parse-photo',
    { image, date: todayLocal(), defaultMeal: 'lunch' },
    expect.objectContaining({ timeoutMs: 65000, signal: expect.any(AbortSignal) }),
  );
  expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
    image,
    date: todayLocal(),
    defaultMeal: 'lunch',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar 1 alimento' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  const batch = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/batch'))!;
  expect(JSON.parse(batch[1]!.body as string)).toEqual({
    date: todayLocal(),
    status: 'eaten',
    items: [{ meal: 'lunch', foodId: response.items[0]!.food!.id, grams: 150 }],
  });
});
it.each([
  [429, 'photo_log_quota', 'No te quedan fotos hoy.'],
  [422, 'photo_not_understood', 'No pude interpretar la foto.'],
] as const)('keeps the photo and server message on %i', async (status, code, message) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code, message } }, status));
  const { onClose } = setup();
  await choose();
  fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', message);
  expect(screen.getByAltText('Foto elegida').getAttribute('src')).toBe(image);
  expect(onClose).not.toHaveBeenCalled();
});
it.each(['Cancelar', 'Cerrar', 'unmount'])(
  'aborts on %s and ignores late interpretation',
  async (action) => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount, onClose } = setup();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
    await screen.findByText('Interpretando… Puede tardar hasta un minuto.');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    if (action === 'unmount') unmount();
    else fireEvent.click(screen.getByRole('button', { name: action }));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(json(response)));
    expect(screen.queryByRole('heading', { name: 'Revisá los alimentos' })).toBeNull();
    if (action === 'Cancelar') expect(screen.getByAltText('Foto elegida')).toBeTruthy();
    if (action === 'Cerrar') expect(onClose).toHaveBeenCalledOnce();
  },
);
it('preserves edits and the photo when returning to input, and confirms discarding', async () => {
  mockFetch();
  const { onClose } = setup();
  await interpret();
  fireEvent.change(screen.getByLabelText('Gramos de arroz'), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar foto' }));
  expect(screen.getByAltText('Foto elegida').getAttribute('src')).toBe(image);
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
  expect(screen.getByLabelText('Gramos de arroz')).toHaveProperty('value', '90');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(screen.getByText('¿Descartar lo interpretado?')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Seguir revisando' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seguir revisando' }));
  expect(screen.getByLabelText('Gramos de arroz')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
  expect(onClose).toHaveBeenCalledOnce();
});
it('shows preparation progress and decoding errors without sending a request', async () => {
  const fetchMock = mockFetch();
  setup();
  let reject!: (error: Error) => void;
  vi.mocked(preparePhoto).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  fireEvent.change(screen.getByLabelText('Sacar foto'), {
    target: { files: [new File([''], 'photo.heic')] },
  });
  expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe(
    'Preparando la foto…',
  );
  await act(async () => reject(new Error('No pude leer la foto. Probá con otra.')));
  expect(screen.getByRole('alert').textContent).toBe('No pude leer la foto. Probá con otra.');
  expect(fetchMock).not.toHaveBeenCalled();
});
