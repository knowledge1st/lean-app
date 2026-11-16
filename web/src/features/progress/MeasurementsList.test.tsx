// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MeasurementsList } from './MeasurementsList';
import { log } from './testFixtures';
vi.mock('./MeasurementChart', () => ({ default: () => <p>Gráfico de medida</p> }));
afterEach(cleanup);
it('invita a cargar medidas si no hay valores', () => {
  render(<MeasurementsList logs={[log('2026-01-01', 80)]} />);
  expect(screen.getByText(/Cargá tus medidas desde «Registrar peso»/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
it('muestra el último valor y el cambio por campo; permite expandir y cerrar su gráfico', async () => {
  render(
    <MeasurementsList
      logs={[
        { ...log('2026-01-01', 80), waistCm: 81.5 },
        { ...log('2026-01-02', 79), waistCm: 78, bodyFatPct: 20 },
        log('2026-01-03', 79),
      ]}
    />,
  );
  expect(screen.getByText('78 cm · −3,5 cm desde el inicio')).toBeTruthy();
  expect(screen.getByText('20 % · 0 % desde el inicio')).toBeTruthy();
  const button = screen.getByRole('button', { name: /Cintura/ });
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(await screen.findByText('Gráfico de medida')).toBeTruthy();
  fireEvent.click(button);
  expect(screen.queryByText('Gráfico de medida')).toBeNull();
});
