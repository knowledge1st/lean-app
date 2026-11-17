import type { ProposedItem } from '@lean/shared';

export interface TextLogFixture {
  text: string;
  expected: { meal: ProposedItem['meal'] | null; food: string }[];
}
export const textLogFixtures: TextLogFixture[] = [
  {
    text: 'una pechuga con tomate y arroz de cena, café con leche y una medialuna de desayuno, almorcé una ensalada de lechuga, tomate, cebolla, queso dambo y atún',
    expected: [
      { meal: 'dinner', food: 'Pechuga de pollo sin piel cocida' },
      { meal: 'dinner', food: 'Tomate redondo crudo' },
      { meal: 'dinner', food: 'Arroz blanco largo cocido' },
      { meal: 'breakfast', food: 'Café negro preparado sin azúcar' },
      { meal: 'breakfast', food: 'Leche entera' },
      { meal: 'breakfast', food: 'ninguno' },
      { meal: 'lunch', food: 'Lechuga mantecosa cruda' },
      { meal: 'lunch', food: 'Tomate redondo crudo' },
      { meal: 'lunch', food: 'Cebolla cruda' },
      { meal: 'lunch', food: 'Queso cremoso' },
      { meal: 'lunch', food: 'Atún al natural escurrido' },
    ],
  },
  {
    text: 'arroz, pollo, tomate',
    expected: [
      { meal: null, food: 'Arroz blanco largo cocido' },
      { meal: null, food: 'Pechuga de pollo sin piel cocida' },
      { meal: null, food: 'Tomate redondo crudo' },
    ],
  },
  {
    text: 'almorcé 200 g de arroz',
    expected: [{ meal: 'lunch', food: 'Arroz blanco largo cocido' }],
  },
  {
    text: 'ayer cené atún con tomate',
    expected: [
      { meal: 'dinner', food: 'Atún al natural escurrido' },
      { meal: 'dinner', food: 'Tomate redondo crudo' },
    ],
  },
  { text: 'desayuné 2 huevos', expected: [{ meal: 'breakfast', food: 'Huevo entero crudo' }] },
  {
    text: 'una manzana de merienda',
    expected: [{ meal: 'afternoon_snack', food: 'Manzana con cáscara cruda' }],
  },
  {
    text: 'para el desayuno café con leche',
    expected: [
      { meal: 'breakfast', food: 'Café negro preparado sin azúcar' },
      { meal: 'breakfast', food: 'Leche entera' },
    ],
  },
  {
    text: 'de cena pechuga con arroz',
    expected: [
      { meal: 'dinner', food: 'Pechuga de pollo sin piel cocida' },
      { meal: 'dinner', food: 'Arroz blanco largo cocido' },
    ],
  },
  { text: 'merendé una banana', expected: [{ meal: 'afternoon_snack', food: 'Banana cruda' }] },
  { text: 'snack de queso cremoso', expected: [{ meal: 'snack', food: 'Queso cremoso' }] },
  { text: 'comí un zorbifláun', expected: [{ meal: null, food: 'ninguno' }] },
  {
    text: 'almuerzo ensalada de lechuga con cebolla',
    expected: [
      { meal: 'lunch', food: 'Lechuga mantecosa cruda' },
      { meal: 'lunch', food: 'Cebolla cruda' },
    ],
  },
  {
    text: 'tomé 200 gramos de leche descremada en el desayuno',
    expected: [{ meal: 'breakfast', food: 'Leche descremada' }],
  },
];
