import { expect, it } from 'vitest';
import { checkin } from './testFixtures';
import {
  checkinMessage,
  checkinTitle,
  checkinStatusLabel,
  checkinDecisionLabel,
  formatKcal,
  formatKg,
} from './messages';
it('formatea miles de cuatro cifras y decimales locales', () => {
  expect(formatKcal(2000)).toBe('2.000');
  expect(formatKcal(1850)).toBe('1.850');
  expect(formatKg(-0.2)).toBe('0,2');
});
it('produce los tres textos de referencia', () => {
  expect(checkinMessage(checkin)).toBe(
    'Bajaste 0,2 kg esta semana; el plan era 0,5. Te proponemos pasar de 2.000 a 1.850 kcal por día.',
  );
  expect(checkinMessage({ ...checkin, status: 'on_track', actualWeeklyChangeKg: -0.5 })).toBe(
    'Vas según el plan: 0,5 kg esta semana.',
  );
  expect(checkinMessage({ ...checkin, status: 'insufficient_data', loggedDays: 6 })).toBe(
    'Registraste 6 de 14 días. Con 10 días y 4 pesajes podemos ajustar tu plan.',
  );
});
it.each([
  [0.04, 'Tu peso se mantuvo esta semana.', 'tu peso se mantuvo esta semana.'],
  [-0.04, 'Tu peso se mantuvo esta semana.', 'tu peso se mantuvo esta semana.'],
  [0.05, 'Subiste 0,1 kg esta semana.', 'subiste 0,1 kg esta semana.'],
  [-0.05, 'Bajaste 0,1 kg esta semana.', '0,1 kg esta semana.'],
])('redondea el cambio real %s antes de elegir el verbo', (actual, adjust, onTrack) => {
  const c = {
    ...checkin,
    actualWeeklyChangeKg: actual,
    expectedWeeklyChangeKg: null,
    proposed: null,
  };
  expect(checkinMessage(c)).toBe(adjust);
  expect(checkinMessage({ ...c, status: 'on_track' })).toBe(`Vas según el plan: ${onTrack}`);
});
it.each([
  [0.04, 0.04, 'Tu peso se mantuvo esta semana; el plan era mantenerlo.'],
  [-0.04, -0.04, 'Tu peso se mantuvo esta semana; el plan era mantenerlo.'],
  [0.05, 0.05, 'Subiste 0,1 kg esta semana; el plan era 0,1.'],
  [-0.05, -0.05, 'Bajaste 0,1 kg esta semana; el plan era 0,1.'],
  [0.04, 0.05, 'Tu peso se mantuvo esta semana; el plan era subir 0,1.'],
  [-0.04, -0.05, 'Tu peso se mantuvo esta semana; el plan era bajar 0,1.'],
  [0.05, 0.04, 'Subiste 0,1 kg esta semana; el plan era mantenerlo.'],
  [-0.05, -0.04, 'Bajaste 0,1 kg esta semana; el plan era mantenerlo.'],
])('compara real %s y plan %s a la precisión visible', (actual, expected, text) => {
  expect(
    checkinMessage({
      ...checkin,
      actualWeeklyChangeKg: actual,
      expectedWeeklyChangeKg: expected,
      proposed: null,
    }),
  ).toBe(text);
});
it.each([
  [0.2, 0.5, 'Subiste 0,2 kg esta semana; el plan era 0,5.'],
  [0.2, -0.5, 'Subiste 0,2 kg esta semana; el plan era bajar 0,5.'],
  [-0.2, 0.5, 'Bajaste 0,2 kg esta semana; el plan era subir 0,5.'],
  [0, 0, 'Tu peso se mantuvo esta semana; el plan era mantenerlo.'],
  [null, null, 'Revisamos tu semana.'],
])('describe real %s y esperado %s', (actualWeeklyChangeKg, expectedWeeklyChangeKg, text) => {
  expect(
    checkinMessage({ ...checkin, actualWeeklyChangeKg, expectedWeeklyChangeKg, proposed: null }),
  ).toBe(text);
});
it('propone subir calorías y admite subir o mantener en camino', () => {
  expect(checkinMessage({ ...checkin, proposed: { ...checkin.current, kcal: 2150 } })).toContain(
    'de 2.000 a 2.150 kcal por día.',
  );
  expect(checkinMessage({ ...checkin, status: 'on_track', actualWeeklyChangeKg: 0.5 })).toContain(
    'subiste 0,5 kg',
  );
  expect(checkinMessage({ ...checkin, status: 'on_track', actualWeeklyChangeKg: 0 })).toContain(
    'tu peso se mantuvo',
  );
  expect(checkinMessage({ ...checkin, status: 'on_track', actualWeeklyChangeKg: null })).toContain(
    'Vas según el plan',
  );
});
it.each([
  [1, 1, '1 día de 14 y 1 pesaje.'],
  [6, 3, '6 de 14 días y 3 pesajes.'],
  [12, 2, '12 de 14 días y 2 pesajes.'],
])('días y pesajes: %s, %s', (loggedDays, weighIns, text) => {
  expect(
    checkinMessage({ ...checkin, status: 'insufficient_data', loggedDays, weighIns }),
  ).toContain(text);
});
it('etiqueta resultados y decisiones', () => {
  const resolvedAt = '2026-11-16T12:00:00Z';
  expect(checkinDecisionLabel(checkin)).toBe('Pendiente');
  expect(checkinDecisionLabel({ ...checkin, resolvedAt, accepted: true })).toBe('Aceptado');
  expect(checkinDecisionLabel({ ...checkin, resolvedAt, accepted: false })).toBe('Mantenido');
  expect(checkinDecisionLabel({ ...checkin, resolvedAt, status: 'on_track' })).toBe('Visto');
  expect(checkinDecisionLabel({ ...checkin, resolvedAt, status: 'insufficient_data' })).toBe(
    'Descartado',
  );
  for (const status of ['adjust', 'on_track', 'insufficient_data'] as const) {
    expect(checkinTitle({ ...checkin, status })).toBeTruthy();
    expect(checkinStatusLabel({ ...checkin, status })).toBeTruthy();
  }
});
