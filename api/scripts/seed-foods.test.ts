import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALORIE_CHECK_EXCEPTIONS, main, parseFoodsCsv, validateFoods } from './seed-foods';
import type { SeedFood } from './seed-foods';

const header = 'name,kcal_100g,protein_100g,carbs_100g,fat_100g,serving_g,serving_label';
const validFood: SeedFood = {
  name: 'Alimento',
  kcal: 100,
  protein: 10,
  carbs: 15,
  fat: 0,
  servingGrams: null,
  servingLabel: null,
};
function fixture(first: Partial<SeedFood> = {}): SeedFood[] {
  return Array.from({ length: 300 }, (_, index) => ({
    ...validFood,
    name: `Alimento ${index}`,
    ...(index === 0 ? first : {}),
  }));
}

describe('parseFoodsCsv', () => {
  it('lee comas y comillas escapadas, CRLF y porciones vacías', () => {
    expect(parseFoodsCsv(`${header}\r\n" Pollo, corte ""especial"" ",100,10,15,0,,\r\n`)).toEqual([
      { ...validFood, name: 'Pollo, corte "especial"' },
    ]);
  });
  it('recorta campos y lee porciones presentes y saltos dentro de comillas', () => {
    expect(parseFoodsCsv(`${header}\n Huevo ,100,10,15,0, 50.0 ," Una\nunidad "`)).toEqual([
      { ...validFood, name: 'Huevo', servingGrams: 50, servingLabel: 'Una\nunidad' },
    ]);
  });
  it('rechaza encabezados incorrectos', () => {
    expect(() => parseFoodsCsv('nombre,kcal\nPollo,100')).toThrow('Fila 1: encabezado incorrecto');
    expect(() => parseFoodsCsv(`"${header}"\nPollo,100,10,15,0,,`)).toThrow(
      'Fila 1: encabezado incorrecto',
    );
  });
  it.each(['Alimento,100,10,15,0,', 'Alimento,100,10,15,0,,,extra'])(
    'rechaza columnas de más o menos: %s',
    (row) => {
      expect(() => parseFoodsCsv(`${header}\n${row}`)).toThrow('Fila 2: se esperaban 7 columnas');
    },
  );
  it.each(['"Alimento,100,10,15,0,,', '"Alimento"x,100,10,15,0,,', 'Ali"mento,100,10,15,0,,'])(
    'rechaza comillas mal formadas: %s',
    (row) => {
      expect(() => parseFoodsCsv(`${header}\n${row}`)).toThrow('Fila 2:');
    },
  );
  it.each([
    'Alimento,,10,15,0,,',
    'Alimento,100,1.000,15,0,,',
    'Alimento,100,10,15,0,50.00,unidad',
    'Alimento,1e2,10,15,0,,',
  ])('rechaza números con formato inválido antes de convertirlos: %s', (row) => {
    expect(() => parseFoodsCsv(`${header}\n${row}`)).toThrow('Fila 2:');
  });
});

describe('validateFoods', () => {
  it('acepta un conjunto válido', () => expect(validateFoods(fixture())).toEqual([]));
  it('detecta nombres duplicados por mayúsculas, tildes y espacios', () => {
    const foods = fixture({ name: '  ÁRROZ   blanco ' });
    foods[1] = { ...validFood, name: 'arroz blanco' };
    expect(validateFoods(foods)).toContain('Fila 3: nombre duplicado (fila 2)');
  });
  it.each([
    [{ name: ' ' }, 'nombre vacío'],
    [{ kcal: -1 }, 'negativo'],
    [{ protein: Number.NaN }, 'no numérico'],
    [{ fat: Number.POSITIVE_INFINITY }, 'no numérico'],
    [{ protein: 1.234 }, 'demasiados decimales'],
    [{ kcal: 100.5 }, 'demasiados decimales'],
    [{ servingGrams: 20.12, servingLabel: 'unidad' }, 'demasiados decimales'],
    [{ protein: 60, carbs: 50 }, 'supera 100 g'],
    [{ servingGrams: 50 }, 'porción incompleta'],
    [{ servingLabel: 'unidad' }, 'porción incompleta'],
    [{ servingGrams: 0, servingLabel: 'unidad' }, 'mayor que cero'],
    [{ kcal: 200 }, 'incoherencia calórica'],
  ] satisfies [Partial<SeedFood>, string][])('detecta %j', (patch, message) => {
    expect(
      validateFoods(fixture(patch)).some(
        (error) => error.startsWith('Fila 2:') && error.includes(message),
      ),
    ).toBe(true);
  });
  it('usa tolerancia absoluta de 5 kcal para kcal < 20', () => {
    expect(validateFoods(fixture({ kcal: 10, protein: 0, carbs: 1.25, fat: 0 }))).toEqual([]);
    expect(validateFoods(fixture({ kcal: 10, protein: 0, carbs: 1, fat: 0 })).join()).toContain(
      'incoherencia calórica',
    );
  });
  it('acepta los límites de la tolerancia porcentual', () => {
    expect(validateFoods(fixture({ kcal: 100, protein: 20, carbs: 0, fat: 0 }))).toEqual([]);
    expect(validateFoods(fixture({ kcal: 100, protein: 30, carbs: 0, fat: 0 }))).toEqual([]);
  });
  it('acepta la excepción explícita de alcohol', () => {
    expect(
      validateFoods(fixture({ name: 'Vodka', kcal: 230, protein: 0, carbs: 0, fat: 0 })),
    ).toEqual([]);
    expect(
      validateFoods(fixture({ name: 'Agua', kcal: 230, protein: 0, carbs: 0, fat: 0 })).join(),
    ).toContain('incoherencia calórica');
  });
  it.each([0, 279, 351])('rechaza %i filas', (count) => {
    const foods = Array.from({ length: count }, (_, index) => ({
      ...validFood,
      name: `Alimento ${index}`,
    }));
    expect(validateFoods(foods).join()).toContain('entre 280 y 350');
  });
  it.each([280, 350])('acepta %i filas', (count) => {
    const foods = Array.from({ length: count }, (_, index) => ({
      ...validFood,
      name: `Alimento ${index}`,
    }));
    expect(validateFoods(foods)).toEqual([]);
  });
});

// Importing main above must never connect to the database or run the script.
it('exporta main sin ejecutarlo al importar', () => expect(typeof main).toBe('function'));

it('exige las excepciones no alcohólicas en el CSV real y permite que falten las alcohólicas', () => {
  const foods = parseFoodsCsv(readFileSync(new URL('../seed/foods.csv', import.meta.url), 'utf8'));
  const names = new Set(foods.map((food) => food.name));
  const alcoholicNames = [
    'Cerveza',
    'Vino tinto',
    'Vino blanco',
    'Fernet',
    'Whisky',
    'Vodka',
    'Gin',
    'Ron',
  ];
  for (const name of Object.keys(CALORIE_CHECK_EXCEPTIONS)) {
    if (!alcoholicNames.includes(name)) expect(names.has(name), name).toBe(true);
  }
  expect(validateFoods(foods.filter((food) => !alcoholicNames.includes(food.name)))).toEqual([]);
});

it('valida el CSV real y la cobertura de alimentos básicos', () => {
  const foods = parseFoodsCsv(readFileSync(new URL('../seed/foods.csv', import.meta.url), 'utf8'));
  expect(validateFoods(foods)).toEqual([]);
  const names = foods.map((food) =>
    food.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
  );
  for (const alternatives of [
    ['pollo'],
    ['carne vacuna', 'vacuna', 'bife', 'carne picada'],
    ['huevo'],
    ['arroz'],
    ['fideos'],
    ['papa'],
    ['banana'],
    ['manzana'],
    ['leche'],
    ['yogur'],
    ['queso'],
    ['pan'],
    ['avena'],
    ['lentejas'],
    ['aceite de oliva'],
    ['tomate'],
  ]) {
    expect(
      names.some((name) => alternatives.some((term) => name.includes(term))),
      alternatives.join(' / '),
    ).toBe(true);
  }
});
