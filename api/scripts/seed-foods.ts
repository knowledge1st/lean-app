import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

export type SeedFood = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  servingGrams: number | null;
  servingLabel: string | null;
};

export const CALORIE_CHECK_EXCEPTIONS: Record<string, string> = Object.fromEntries([
  ...['Cerveza', 'Vino tinto', 'Vino blanco', 'Fernet', 'Whisky', 'Vodka', 'Gin', 'Ron'].map(
    (name) => [name, 'Bebida alcohólica: el alcohol aporta 7 kcal/g'],
  ),
  ...[
    'Espinaca cruda',
    'Espinaca hervida',
    'Acelga hervida',
    'Brócoli crudo',
    'Champiñones crudos',
    'Champiñones hervidos',
  ].map((name) => [
    name,
    'Verdura con mucha fibra y agua: USDA calcula la energía con factores de Atwater específicos, menores que 4/4/9',
  ]),
  [
    'Limón sin cáscara crudo',
    'Fruta ácida: ácidos orgánicos y fibra; USDA usa factores de Atwater específicos',
  ],
]);

const HEADER = 'name,kcal_100g,protein_100g,carbs_100g,fat_100g,serving_g,serving_label';

export function normalizeFoodName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/gu, ' ');
}

/** Parse records without splitting quoted commas, escaped quotes, or quoted newlines. */
export function parseFoodsCsv(text: string): SeedFood[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const fail = (message: string): never => {
    throw new Error(`Fila ${records.length + 1}: ${message}`);
  };
  const finishField = () => {
    record.push(field.trim());
    field = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ',') {
      finishField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishField();
      records.push(record);
      record = [];
    } else if (char === '"') {
      if (closed || field.trim()) fail('comillas inesperadas');
      field = '';
      quoted = true;
    } else {
      if (closed && char.trim()) fail('texto después de cerrar comillas');
      field += char;
    }
  }
  if (quoted) fail('comillas sin cerrar');
  if (field || closed || record.length) {
    finishField();
    records.push(record);
  }
  const header = records.shift();
  if (header?.length !== 7 || header.some((cell, index) => cell !== HEADER.split(',')[index])) {
    throw new Error('Fila 1: encabezado incorrecto');
  }
  return records.map((cells, index) => {
    const row = index + 2;
    if (cells.length !== 7) throw new Error(`Fila ${row}: se esperaban 7 columnas`);
    const numeric = (column: number, decimals: number): number => {
      const value = cells[column]!;
      // Check the original spelling before Number() loses precision/trailing zeros.
      const pattern =
        decimals === 0 ? /^-?\d+$/u : new RegExp(`^-?\\d+(?:\\.\\d{1,${decimals}})?$`, 'u');
      if (!pattern.test(value)) {
        throw new Error(
          `Fila ${row}: ${HEADER.split(',')[column]} debe ser numérico con hasta ${decimals} decimales`,
        );
      }
      return Number(value);
    };
    return {
      name: cells[0]!,
      kcal: numeric(1, 0),
      protein: numeric(2, 2),
      carbs: numeric(3, 2),
      fat: numeric(4, 2),
      servingGrams: cells[5] === '' ? null : numeric(5, 1),
      servingLabel: cells[6] || null,
    };
  });
}

export function validateFoods(foods: SeedFood[]): string[] {
  const errors: string[] = [];
  if (foods.length < 280 || foods.length > 350) {
    errors.push(`Filas de datos: se esperaban entre 280 y 350; se recibieron ${foods.length}`);
  }
  const names = new Map<string, number>();
  foods.forEach((food, index) => {
    const row = index + 2;
    const error = (message: string) => errors.push(`Fila ${row}: ${message}`);
    const name = normalizeFoodName(food.name);
    if (!name) error('nombre vacío');
    if (names.has(name)) error(`nombre duplicado (fila ${names.get(name)})`);
    else names.set(name, row);
    const numbers: [string, number, number][] = [
      ['kcal', food.kcal, 0],
      ['proteínas', food.protein, 2],
      ['carbohidratos', food.carbs, 2],
      ['grasas', food.fat, 2],
    ];
    if (food.servingGrams !== null) numbers.push(['porción en gramos', food.servingGrams, 1]);
    for (const [label, value, decimals] of numbers) {
      if (!Number.isFinite(value) || value < 0) error(`${label}: valor no numérico o negativo`);
      else if (
        !new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, decimals)}})?$`, 'u').test(String(value)) ||
        (decimals === 0 && !Number.isInteger(value))
      )
        error(`${label}: demasiados decimales`);
    }
    if (food.servingGrams !== null && food.servingGrams <= 0)
      error('la porción debe ser mayor que cero');
    const hasLabel = Boolean(food.servingLabel?.trim());
    if ((food.servingGrams !== null) !== hasLabel)
      error('porción incompleta: gramos y etiqueta deben estar ambos presentes');
    if (food.protein + food.carbs + food.fat > 100) error('la suma de macros supera 100 g');
    const calculated = 4 * food.protein + 4 * food.carbs + 9 * food.fat;
    // Por decisión del orquestador, se mantienen ±5 kcal para alimentos de menos de 20 kcal.
    const tolerance = food.kcal < 20 ? 5 : food.kcal * 0.2;
    if (
      !Object.hasOwn(CALORIE_CHECK_EXCEPTIONS, food.name) &&
      Math.abs(calculated - food.kcal) > tolerance + 1e-9
    ) {
      error(
        `incoherencia calórica: ${food.kcal} kcal declaradas, ${calculated.toFixed(2)} calculadas`,
      );
    }
  });
  return errors;
}

export async function main(): Promise<void> {
  const csvFile = new URL('../seed/foods.csv', import.meta.url);
  if (!existsSync(csvFile)) throw new Error('No existe api/seed/foods.csv');
  const foods = parseFoodsCsv(readFileSync(csvFile, 'utf8'));
  const errors = validateFoods(foods);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`CSV validado: ${foods.length} alimentos`);
  const envFile = new URL('../.dev.vars', import.meta.url);
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  console.log(`Base de datos: ${new URL(url).hostname}`);
  const sql = neon(url);
  const params = [
    foods.map((f) => f.name),
    foods.map((f) => f.kcal),
    foods.map((f) => f.protein),
    foods.map((f) => f.carbs),
    foods.map((f) => f.fat),
    foods.map((f) => f.servingGrams),
    foods.map((f) => f.servingLabel),
  ];
  const incoming = `unnest($1::text[], $2::int[], $3::numeric[], $4::numeric[],
    $5::numeric[], $6::numeric[], $7::text[])
    AS v(name, kcal, protein, carbs, fat, serving_grams, serving_label)`;
  // Every query runs in the same transaction; the lock serializes concurrent seeds.
  // Only static SQL is interpolated. All CSV values are bound parameters.
  try {
    const results = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('seed:foods'))`,
      sql.query(
        `UPDATE foods SET kcal_per_100g = v.kcal, protein_per_100g = v.protein,
        carbs_per_100g = v.carbs, fat_per_100g = v.fat, serving_grams = v.serving_grams,
        serving_label = v.serving_label, updated_at = now()
        FROM ${incoming} WHERE foods.source = 'seed' AND foods.name = v.name
        AND ROW(foods.kcal_per_100g, foods.protein_per_100g, foods.carbs_per_100g,
          foods.fat_per_100g, foods.serving_grams, foods.serving_label)
          IS DISTINCT FROM ROW(v.kcal, v.protein, v.carbs, v.fat, v.serving_grams, v.serving_label)
        RETURNING foods.name`,
        params,
      ),
      sql.query(
        `INSERT INTO foods (source, name, kcal_per_100g, protein_per_100g,
        carbs_per_100g, fat_per_100g, serving_grams, serving_label)
        SELECT 'seed', v.name, v.kcal, v.protein, v.carbs, v.fat, v.serving_grams, v.serving_label
        FROM ${incoming} WHERE NOT EXISTS
          (SELECT 1 FROM foods f WHERE f.source = 'seed' AND f.name = v.name)
        RETURNING name`,
        params,
      ),
      sql.query(`SELECT name FROM foods WHERE source = 'seed' ORDER BY name`),
    ]);
    const updated = results[1]!;
    const inserted = results[2]!;
    const all = results[3]!;
    const incomingNames = new Set(foods.map((f) => f.name));
    const missing = all.filter((f) => !incomingNames.has(String(f.name)));
    if (missing.length)
      console.warn(`En la base pero no en el CSV: ${missing.map((f) => f.name).join(', ')}`);
    const changedNames = new Set([...updated, ...inserted].map((f) => String(f.name)));
    console.log(
      `Insertados ${inserted.length}, actualizados ${updated.length}, sin cambios ${foods.length - changedNames.size}, total seed en la base ${all.length}`,
    );
  } catch {
    // Driver errors can contain credentials and parameters.
    throw new Error('No se pudieron guardar los alimentos. Revisá la configuración y la conexión.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'No se pudo ejecutar la semilla de alimentos',
    );
    process.exitCode = 1;
  });
}
