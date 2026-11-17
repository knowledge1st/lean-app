import { describe, expect, it } from 'vitest';
import { pendingMigrations } from './check-migrations';

const journal = [
  { tag: '0000_init', when: 1794712091219 },
  { tag: '0001_foods_serving_label', when: 1794762576916 },
  { tag: '0002_foods_barcode_scope', when: 1794765182993 },
];

describe('pendingMigrations', () => {
  it('no devuelve pendientes si están todas aplicadas, sin importar el orden', () => {
    expect(pendingMigrations(journal, journal.map((entry) => entry.when).reverse())).toEqual([]);
  });

  it('devuelve la última cuando falta aplicar esa migración', () => {
    expect(
      pendingMigrations(
        journal,
        journal.slice(0, -1).map((entry) => entry.when),
      ),
    ).toEqual([journal[2]]);
  });

  it('devuelve todo el journal para una base vacía', () => {
    expect(pendingMigrations(journal, [])).toEqual(journal);
  });

  it('compara created_at como string por su valor numérico', () => {
    expect(
      pendingMigrations(
        journal,
        journal.map((entry) => String(entry.when)),
      ),
    ).toEqual([]);
  });

  it('ignora migraciones aplicadas que no están en el journal', () => {
    expect(
      pendingMigrations(journal, [...journal.map((entry) => entry.when), 1799999999999]),
    ).toEqual([]);
  });
});
