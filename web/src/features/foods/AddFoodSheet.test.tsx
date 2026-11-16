// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { Food } from '@lean/shared';
import { jsonResponse } from '../../auth/testUtils';
import { AddFoodSheet } from './AddFoodSheet';
vi.mock('../scanner/ScannerCamera', () => ({
  default: () => <div>Cámara</div>,
}));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const food: Food = {
  id: 'food',
  source: 'seed',
  name: 'Pan',
  brand: 'Marca',
  barcode: '12345678',
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  servingG: 30,
  servingLabel: '1 rebanada',
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onAdd = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Abrir hoja</button>
        {open && (
          <AddFoodSheet
            date="2026-11-14"
            meal="breakfast"
            onClose={() => setOpen(false)}
            onAdd={(selected, grams) => {
              onAdd(selected, grams);
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { client, onAdd };
}
it('completa la carga con la porción inicial y reinicia la hoja al reabrir', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([food])));
  const { client, onAdd } = setup();
  fireEvent.click(await screen.findByText('Pan'));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  expect(onAdd).toHaveBeenCalledWith(food, 30);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByText('Abrir hoja'));
  expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
  expect(screen.queryByLabelText('Gramos')).toBeNull();
  client.clear();
});
it('espera 300 ms, recorta la búsqueda y muestra aviso OFF y creación sin resultados', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((input) =>
      Promise.resolve(
        jsonResponse(String(input).includes('/search') ? { items: [], offAvailable: false } : []),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  await screen.findByText('Todavía no hay alimentos recientes.');
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: '   ' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: '  arroz  ' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(299);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  vi.useRealTimers();
  expect(await screen.findByText('No encontramos “arroz”.')).toBeTruthy();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost/api/foods/search?q=arroz&limit=20');
  expect(screen.getByText('Open Food Facts no está disponible en este momento.')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Escanear código de barras' }).hasAttribute('disabled'),
  ).toBe(false);
  fireEvent.click(screen.getByText('Crear alimento'));
  expect(screen.getByLabelText('Nombre')).toBeTruthy();
  client.clear();
});
it('importa un resultado OFF antes de pedir cantidad', async () => {
  const off = { ...food, id: null, source: 'off' as const };
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((_input, init) =>
      init?.method === 'POST' ? pending : Promise.resolve(jsonResponse([off])),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  fireEvent.click(await screen.findByText('Pan'));
  expect(await screen.findByText('Importando alimento…')).toBeTruthy();
  expect(screen.queryByLabelText('Gramos')).toBeNull();
  await act(async () => {
    resolve(jsonResponse({ ...food, source: 'off' }));
  });
  expect(await screen.findByLabelText('Gramos')).toBeTruthy();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost/api/foods/import');
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ barcode: '12345678' });
  client.clear();
});
it('si importar falla mantiene la búsqueda y permite volver a intentar', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((_input, init) =>
      Promise.resolve(
        init?.method === 'POST'
          ? jsonResponse({ error: { code: 'off_unavailable', message: 'OFF no responde.' } }, 503)
          : jsonResponse([{ ...food, id: null, source: 'off' }]),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  fireEvent.click(await screen.findByText('Pan'));
  expect(await screen.findByText('OFF no responde.')).toBeTruthy();
  expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
  expect(screen.queryByLabelText('Gramos')).toBeNull();
  await waitFor(() => expect(screen.getByText('Pan').closest('button')?.disabled).toBe(false));
  client.clear();
});
it('valida la creación, conserva lo escrito ante error y pasa a cantidad al guardar', async () => {
  let attempts = 0;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    if (init?.method !== 'POST') return Promise.resolve(jsonResponse([]));
    attempts += 1;
    return Promise.resolve(
      attempts === 1
        ? jsonResponse({ error: { code: 'validation_error', message: 'Revisá los datos.' } }, 400)
        : jsonResponse({ ...food, source: 'custom' }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  fireEvent.click(screen.getByText('Crear alimento'));
  fireEvent.click(screen.getByRole('button', { name: 'Por 100 g' }));
  fireEvent.click(screen.getByText('Guardar alimento'));
  expect(screen.getByText('Nombre requerido')).toBeTruthy();
  for (const [label, value] of [
    ['Nombre', 'Mi pan'],
    ['Calorías', '200'],
    ['Proteína', '10,25'],
    ['Carbohidratos', '20'],
    ['Grasa', '5'],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByText('Guardar alimento'));
  expect(await screen.findByText('Revisá los datos.')).toBeTruthy();
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Mi pan');
  fireEvent.click(screen.getByText('Guardar alimento'));
  expect(await screen.findByLabelText('Gramos')).toBeTruthy();
  const call = fetchMock.mock.calls.find(
    ([input, init]) => String(input) === 'http://localhost/api/foods' && init?.method === 'POST',
  );
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ name: 'Mi pan', protein: 10.25 });
  client.clear();
});

async function openScanner() {
  fireEvent.click(screen.getByRole('button', { name: 'Escanear código de barras' }));
  expect(screen.getByRole('dialog', { name: 'Escanear código' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Código de barras'), {
    target: { value: '7790001000012' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}
it('busca el código detectado y pasa a cantidad con el alimento', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input) =>
      Promise.resolve(jsonResponse(String(input).includes('/barcode/') ? food : [])),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  await openScanner();
  expect(await screen.findByLabelText('Gramos')).toBeTruthy();
  expect(screen.getByText('Pan')).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).endsWith('/api/foods/barcode/7790001000012'),
    ),
  ).toBe(true);
  fireEvent.click(screen.getByText('Volver'));
  expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
  client.clear();
});
it('404 abre creación con el código y lo incluye en el POST', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input, init) =>
      Promise.resolve(
        init?.method === 'POST'
          ? jsonResponse(food)
          : String(input).includes('/barcode/')
            ? jsonResponse({ error: { code: 'not_found', message: 'No existe.' } }, 404)
            : jsonResponse([]),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  await openScanner();
  await screen.findByRole('heading', { name: 'Crear alimento' });
  const barcode = screen.getByLabelText('Código de barras') as HTMLInputElement;
  expect(barcode.value).toBe('7790001000012');
  expect(barcode.readOnly).toBe(true);
  expect(screen.getByRole('heading', { name: 'Crear alimento' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Por 100 g' }));
  for (const [label, value] of [
    ['Nombre', 'Mi producto'],
    ['Calorías', '200'],
    ['Proteína', '10'],
    ['Carbohidratos', '20'],
    ['Grasa', '5'],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByText('Guardar alimento'));
  await screen.findByLabelText('Gramos');
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ barcode: '7790001000012' });
  client.clear();
});
it('503 OFF conserva el escáner y permite crear con ese código', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        Promise.resolve(
          String(input).includes('/barcode/')
            ? jsonResponse({ error: { code: 'off_unavailable', message: 'OFF' } }, 503)
            : jsonResponse([]),
        ),
      ),
  );
  const { client } = setup();
  await openScanner();
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Open Food Facts no responde. Probá de nuevo en un rato o creá el alimento a mano.',
  );
  expect(screen.getByLabelText('Código de barras')).toBeTruthy();
  fireEvent.click(screen.getByText('Crear alimento con este código'));
  expect((screen.getByLabelText('Código de barras') as HTMLInputElement).value).toBe(
    '7790001000012',
  );
  fireEvent.click(screen.getByText('Volver'));
  expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
  client.clear();
});
it('importa una respuesta de código sin id antes de cantidad', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input, init) =>
      Promise.resolve(
        init?.method === 'POST'
          ? jsonResponse(food)
          : String(input).includes('/barcode/')
            ? jsonResponse({ ...food, id: null })
            : jsonResponse([]),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  await openScanner();
  await screen.findByLabelText('Gramos');
  expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/api/foods/import'))).toBe(
    true,
  );
  client.clear();
});
it('muestra errores de red en el escáner y cerrar vuelve a búsqueda', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        String(input).includes('/barcode/')
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(jsonResponse([])),
      ),
  );
  const { client } = setup();
  await openScanner();
  expect((await screen.findByRole('alert')).textContent).toBe(
    'No se pudo conectar con el servidor.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }));
  expect(screen.getByLabelText('Buscar alimento')).toBeTruthy();
  client.clear();
});

it.each([
  ['lookup', 'resolve'],
  ['lookup', 'reject'],
  ['import', 'resolve'],
  ['import', 'reject'],
])('reabre de inmediato durante %s y descarta su resultado tardío (%s)', async (phase, outcome) => {
  let resolveOld!: (response: Response) => void;
  let rejectOld!: (error: Error) => void;
  let resolveNew!: (response: Response) => void;
  const oldPending = new Promise<Response>((resolve, reject) => {
    resolveOld = resolve;
    rejectOld = reject;
  });
  const newPending = new Promise<Response>((resolve) => {
    resolveNew = resolve;
  });
  let oldSignal: AbortSignal | undefined;
  let lookupCalls = 0;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    if (String(input).includes('/barcode/')) {
      lookupCalls += 1;
      if (lookupCalls > 1) return newPending;
      oldSignal = init?.signal ?? undefined;
      return phase === 'lookup' ? oldPending : Promise.resolve(jsonResponse({ ...food, id: null }));
    }
    if (init?.method === 'POST') return oldPending;
    return Promise.resolve(jsonResponse([]));
  });
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  await openScanner();
  await waitFor(() => expect(lookupCalls).toBe(1));
  if (phase === 'import') {
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
  }
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }));
  if (phase === 'lookup') expect(oldSignal?.aborted).toBe(true);
  fireEvent.click(screen.getByLabelText('Escanear código de barras'));
  expect((screen.getByRole('button', { name: 'Buscar' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.change(screen.getByLabelText('Código de barras'), {
    target: { value: '7790001000012' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  await waitFor(() => expect(lookupCalls).toBe(2));
  await act(async () => {
    if (outcome === 'resolve') resolveOld(jsonResponse(food));
    else rejectOld(new DOMException('cancelado', 'AbortError'));
  });
  expect((screen.getByRole('button', { name: 'Buscar' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByLabelText('Gramos')).toBeNull();
  await act(async () => resolveNew(jsonResponse(food)));
  expect(await screen.findByLabelText('Gramos')).toBeTruthy();
  client.clear();
});
it('desmontar la hoja aborta la búsqueda pendiente sin mostrar errores', async () => {
  let signal: AbortSignal | undefined;
  let reject!: (error: Error) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((input, init) => {
      if (!String(input).includes('/barcode/')) return Promise.resolve(jsonResponse([]));
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_, fail) => {
        reject = fail;
      });
    }),
  );
  const { client } = setup();
  await openScanner();
  await waitFor(() => expect(signal).toBeDefined());
  cleanup();
  expect(signal?.aborted).toBe(true);
  await act(async () => reject(new DOMException('cancelado', 'AbortError')));
  expect(screen.queryByRole('alert')).toBeNull();
  client.clear();
});
