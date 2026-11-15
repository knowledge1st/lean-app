import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProduct,
  normalizeProduct,
  OFF_FIELDS,
  OFF_TIMEOUT_MS,
  OFF_USER_AGENT,
  OffUnavailableError,
  searchProducts,
} from './openFoodFacts';

const raw = {
  code: '2900000000011',
  product_name: ' English ',
  product_name_es: ' Español ',
  brands: ' Marca, Otra ',
  nutriments: {
    'energy-kcal_100g': '120',
    proteins_100g: '1.234',
    carbohydrates_100g: '20',
    fat_100g: '3.456',
  },
  serving_quantity: '30.12',
  serving_size: ' Una porción ',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('normalizeProduct', () => {
  it('normalizes Spanish names, numeric strings, brand and serving', () => {
    expect(normalizeProduct(raw)).toEqual({
      barcode: raw.code,
      name: 'Español',
      brand: 'Marca',
      kcal: 120,
      protein: 1.23,
      carbs: 20,
      fat: 3.46,
      servingG: 30.1,
      servingLabel: 'Una porción',
    });
  });
  it('falls back to product_name, converts kJ and handles serving defaults', () => {
    for (const key of ['energy-kj_100g', 'energy_100g']) {
      expect(
        normalizeProduct({
          ...raw,
          product_name_es: ' ',
          brands: '',
          serving_size: '',
          nutriments: { ...raw.nutriments, 'energy-kcal_100g': undefined, [key]: '418.4' },
        }),
      ).toMatchObject({ name: 'English', kcal: 100, brand: null, servingLabel: '1 porción' });
    }
    expect(normalizeProduct({ ...raw, serving_quantity: 0 })).toMatchObject({
      servingG: null,
      servingLabel: null,
    });
    expect(normalizeProduct({ ...raw, serving_size: 'a'.repeat(50) })?.servingLabel).toHaveLength(
      40,
    );
  });
  it.each(['energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g'])(
    'rejects missing %s',
    (key) => {
      expect(
        normalizeProduct({ ...raw, nutriments: { ...raw.nutriments, [key]: undefined } }),
      ).toBeNull();
    },
  );
  it.each([
    { code: 'abc' },
    { product_name_es: '', product_name: '' },
    { nutriments: { ...raw.nutriments, 'energy-kcal_100g': 901 } },
    { nutriments: { ...raw.nutriments, proteins_100g: -1 } },
    { nutriments: { ...raw.nutriments, proteins_100g: 90 } },
    {
      nutriments: {
        ...raw.nutriments,
        proteins_100g: 33.335,
        carbohydrates_100g: 33.335,
        fat_100g: 33.33,
      },
    },
    { nutriments: { ...raw.nutriments, fat_100g: 'NaN' } },
  ])('rejects invalid products: %j', (patch) => {
    expect(normalizeProduct({ ...raw, ...patch })).toBeNull();
  });
});
describe('Open Food Facts requests', () => {
  it('sends identification, fields and timeout for product and search', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 1, product: raw }))
      .mockResolvedValueOnce(Response.json({ products: [raw, {}] }));
    vi.stubGlobal('fetch', stub);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    expect(await fetchProduct(raw.code)).toMatchObject({ barcode: raw.code });
    expect(await searchProducts('limón & sal', 7)).toHaveLength(1);
    for (const [url, init] of stub.mock.calls as [URL, RequestInit][]) {
      expect(url.searchParams.get('fields')).toBe(OFF_FIELDS);
      expect(init.headers).toEqual({ 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(timeout).toHaveBeenCalledWith(OFF_TIMEOUT_MS);
    const url = stub.mock.calls[1]?.[0] as URL;
    expect(url.searchParams.get('search_terms')).toBe('limón & sal');
    expect(url.searchParams.get('page_size')).toBe('7');
    expect(url.searchParams.get('lc')).toBe('es');
  });
  it('returns null for status 0 and HTTP 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ status: 0 }))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    expect(await fetchProduct(raw.code)).toBeNull();
    expect(await fetchProduct(raw.code)).toBeNull();
  });
  it.each([new Error('network'), new DOMException('timeout', 'TimeoutError'), 500, 503])(
    'wraps outages: %s',
    async (failure) => {
      const stub = vi.fn();
      if (typeof failure === 'number')
        stub.mockImplementation(async () => new Response(null, { status: failure }));
      else stub.mockRejectedValue(failure);
      vi.stubGlobal('fetch', stub);
      await expect(fetchProduct(raw.code)).rejects.toBeInstanceOf(OffUnavailableError);
      await expect(searchProducts('food', 10)).rejects.toBeInstanceOf(OffUnavailableError);
    },
  );
});
