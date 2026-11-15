import { barcodeSchema } from '@lean/shared';

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';
export const OFF_USER_AGENT = 'LeanApp/0.1 (personal nutrition app)';
export const OFF_TIMEOUT_MS = 4000;
export const OFF_FIELDS =
  'code,product_name,product_name_es,brands,nutriments,serving_quantity,serving_size';
export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingG: number | null;
  servingLabel: string | null;
}
export class OffUnavailableError extends Error {
  constructor() {
    super('No se pudo consultar Open Food Facts');
    this.name = 'OffUnavailableError';
  }
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
export function normalizeProduct(raw: unknown): OffProduct | null {
  const p = record(raw);
  const barcode = barcodeSchema.safeParse(p.code);
  const name = trimmed(p.product_name_es) || trimmed(p.product_name);
  const n = record(p.nutriments);
  let kcal = numeric(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = numeric(n['energy-kj_100g']) ?? numeric(n.energy_100g);
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = numeric(n.proteins_100g),
    carbs = numeric(n.carbohydrates_100g),
    fat = numeric(n.fat_100g);
  if (
    !barcode.success ||
    !name ||
    kcal === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    Math.min(kcal, protein, carbs, fat) < 0 ||
    kcal > 900 ||
    protein + carbs + fat > 100 + 1e-8 ||
    round(protein, 2) + round(carbs, 2) + round(fat, 2) > 100 + 1e-8
  )
    return null;
  const quantity = numeric(p.serving_quantity);
  const servingG = quantity !== null && quantity > 0 ? round(quantity, 1) : null;
  return {
    barcode: barcode.data,
    name,
    brand: trimmed(p.brands).split(',')[0]?.trim() || null,
    kcal: Math.round(kcal),
    protein: round(protein, 2),
    carbs: round(carbs, 2),
    fat: round(fat, 2),
    servingG,
    servingLabel: servingG === null ? null : trimmed(p.serving_size).slice(0, 40) || '1 porción',
  };
}
async function request(url: URL): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new OffUnavailableError();
    return record(await response.json());
  } catch {
    throw new OffUnavailableError();
  }
}
export async function fetchProduct(barcode: string): Promise<OffProduct | null> {
  const url = new URL(`/api/v2/product/${encodeURIComponent(barcode)}`, OFF_BASE_URL);
  url.searchParams.set('fields', OFF_FIELDS);
  const body = await request(url);
  return body?.status === 1 ? normalizeProduct(body.product) : null;
}
export async function searchProducts(query: string, limit: number): Promise<OffProduct[]> {
  const url = new URL('/cgi/search.pl', OFF_BASE_URL);
  url.search = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(limit),
    fields: OFF_FIELDS,
    lc: 'es',
  }).toString();
  const body = await request(url);
  return Array.isArray(body?.products)
    ? body.products.map(normalizeProduct).filter((p): p is OffProduct => p !== null)
    : [];
}
