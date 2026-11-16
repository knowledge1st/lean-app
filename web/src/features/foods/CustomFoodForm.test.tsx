// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { jsonResponse } from '../../auth/testUtils';
import { AddFoodSheet } from './AddFoodSheet';
import { CustomFoodForm } from './CustomFoodForm';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(sheet = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  });
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
    Promise.resolve(
      jsonResponse(
        init?.method === 'POST'
          ? {
              ...JSON.parse(String(init.body)),
              id: 'food',
              source: 'custom',
              barcode: null,
              brand: null,
            }
          : [],
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const onCreated = vi.fn();
  function Harness() {
    const [mode, setMode] = useState<'serving' | 'per100g'>('serving');
    return (
      <CustomFoodForm mode={mode} onModeChange={setMode} onBack={vi.fn()} onCreated={onCreated} />
    );
  }
  render(
    <QueryClientProvider client={client}>
      {sheet ? (
        <AddFoodSheet date="2026-11-15" meal="breakfast" onClose={vi.fn()} onAdd={vi.fn()} />
      ) : (
        <Harness />
      )}
    </QueryClientProvider>,
  );
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  return { client, onCreated, posts };
}
function fill(serving = true, values = { kcal: '100', protein: '3', carbs: '12,5', fat: '4' }) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mi alimento' } });
  for (const [key, label] of [
    ['kcal', 'Calorías'],
    ['protein', 'Proteína'],
    ['carbs', 'Carbohidratos'],
    ['fat', 'Grasa'],
  ] as const) {
    fireEvent.change(screen.getByLabelText(serving ? `${label} por porción` : label), {
      target: { value: values[key] },
    });
  }
}
function grams(value: string) {
  fireEvent.change(screen.getByLabelText('Gramos por porción'), { target: { value } });
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar alimento' }));
}
it('convierte por porción, muestra lo enviado y permite cargar 75 g con 300 kcal', async () => {
  const { client, posts } = setup(true);
  fireEvent.click(screen.getByRole('button', { name: 'Crear alimento' }));
  expect(screen.getByRole('button', { name: 'Por porción' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  fill();
  grams('25');
  expect(
    screen.getByText('Se guarda como 400 kcal · P 12 g · C 50 g · G 16 g cada 100 g'),
  ).toBeTruthy();
  submit();
  await screen.findByLabelText('Gramos');
  expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({
    name: 'Mi alimento',
    kcal: 400,
    protein: 12,
    carbs: 50,
    fat: 16,
    servingG: 25,
    servingLabel: '1 porción',
  });
  expect((screen.getByLabelText('Gramos') as HTMLInputElement).value).toBe('25');
  expect(screen.getByRole('button', { name: '1 porción (25 g)' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Gramos'), { target: { value: '75' } });
  expect(screen.getByText('300 kcal')).toBeTruthy();
  client.clear();
});
it('usa el mismo redondeo de dos decimales en la vista previa y el envío', async () => {
  const { client, posts, onCreated } = setup();
  fill(true, { kcal: '100', protein: '1', carbs: '2', fat: '3' });
  grams('30');
  expect(
    screen.getByText('Se guarda como 333 kcal · P 3,33 g · C 6,67 g · G 10 g cada 100 g'),
  ).toBeTruthy();
  submit();
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(JSON.parse(String(posts()[0]?.[1]?.body))).toMatchObject({
    kcal: 333,
    protein: 3.33,
    carbs: 6.67,
    fat: 10,
  });
  client.clear();
});
it('conserva el body por 100 g y exige gramos y descripción juntos', async () => {
  const { client, posts, onCreated } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Por 100 g' }));
  fill(false);
  fireEvent.change(screen.getByLabelText('Gramos por porción (opcional)'), {
    target: { value: '25' },
  });
  submit();
  expect(screen.getByText('Indicá los gramos y la descripción de la porción juntos')).toBeTruthy();
  expect(posts()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Descripción de la porción (opcional)'), {
    target: { value: '1 unidad' },
  });
  submit();
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({
    name: 'Mi alimento',
    kcal: 100,
    protein: 3,
    carbs: 12.5,
    fat: 4,
    servingG: 25,
    servingLabel: '1 unidad',
  });
  client.clear();
});
it.each(['', '0', '-5', 'abc', '5001', '25,55'])(
  'rechaza gramos inválidos %s sin enviar',
  (value) => {
    const { client, posts } = setup();
    fill();
    grams(value);
    submit();
    expect(screen.getByLabelText('Gramos por porción').getAttribute('aria-invalid')).toBe('true');
    expect(posts()).toHaveLength(0);
    client.clear();
  },
);
it.each([
  ['kcal', 'Calorías', '46', 'más de 900 kcal'],
  ['protein', 'Proteína', '6', 'más de 100 g de proteína'],
  ['carbs', 'Carbohidratos', '6', 'más de 100 g de carbohidratos'],
  ['fat', 'Grasa', '6', 'más de 100 g de grasa'],
] as const)('explica el límite convertido de %s y marca el campo', (key, label, value, message) => {
  const { client, posts } = setup();
  fill(true, { kcal: '0', protein: '0', carbs: '0', fat: '0', [key]: value });
  grams('5');
  submit();
  expect(
    screen.getByText(
      `Con una porción de 5 g, eso da ${message} cada 100 g. Revisá los gramos de la porción o los valores.`,
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText(`${label} por porción`).getAttribute('aria-invalid')).toBe('true');
  expect(posts()).toHaveLength(0);
  client.clear();
});
it('explica la suma convertida de macros y marca los tres campos', () => {
  const { client, posts } = setup();
  fill(true, { kcal: '10', protein: '2', carbs: '2', fat: '2' });
  grams('5');
  submit();
  expect(
    screen.getAllByText(/Con una porción de 5 g, eso da más de 100 g de macros en total/),
  ).toHaveLength(3);
  for (const label of ['Proteína', 'Carbohidratos', 'Grasa']) {
    expect(screen.getByLabelText(`${label} por porción`).getAttribute('aria-invalid')).toBe('true');
  }
  expect(posts()).toHaveLength(0);
  client.clear();
});
it('reinterpreta lo escrito al cambiar de modo sin convertir los campos', () => {
  const { client } = setup();
  fill();
  grams('25');
  fireEvent.click(screen.getByRole('button', { name: 'Por 100 g' }));
  expect((screen.getByLabelText('Calorías') as HTMLInputElement).value).toBe('100');
  expect(
    screen.getByText('Se guarda como 100 kcal · P 3 g · C 12,5 g · G 4 g cada 100 g'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Por porción' }));
  expect((screen.getByLabelText('Carbohidratos por porción') as HTMLInputElement).value).toBe(
    '12,5',
  );
  expect(
    screen.getByText('Se guarda como 400 kcal · P 12 g · C 50 g · G 16 g cada 100 g'),
  ).toBeTruthy();
  client.clear();
});
it('recuerda el modo al volver a crear dentro de la misma hoja', () => {
  const { client } = setup(true);
  fireEvent.click(screen.getByRole('button', { name: 'Crear alimento' }));
  fireEvent.click(screen.getByRole('button', { name: 'Por 100 g' }));
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear alimento' }));
  expect(screen.getByRole('button', { name: 'Por 100 g' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  client.clear();
});
it('acepta valores por porción superiores a los límites por 100 g y una descripción propia', async () => {
  const { client, posts, onCreated } = setup();
  fill(true, { kcal: '1000,5', protein: '120', carbs: '40', fat: '20' });
  grams('250');
  fireEvent.change(screen.getByLabelText('Descripción de la porción (opcional)'), {
    target: { value: '  1 paquete  ' },
  });
  submit();
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(JSON.parse(String(posts()[0]?.[1]?.body))).toMatchObject({
    kcal: 400,
    protein: 48,
    carbs: 16,
    fat: 8,
    servingG: 250,
    servingLabel: '1 paquete',
  });
  client.clear();
});
it.each(['', '-1', 'abc'])('rechaza valores por porción inválidos %s sin enviar', (value) => {
  const { client, posts } = setup();
  fill(true, { kcal: '100', protein: value, carbs: '1', fat: '1' });
  grams('25');
  submit();
  expect(screen.getByLabelText('Proteína por porción').getAttribute('aria-invalid')).toBe('true');
  expect(posts()).toHaveLength(0);
  client.clear();
});
