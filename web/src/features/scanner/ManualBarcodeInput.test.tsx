// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ManualBarcodeInput, normalizeBarcode } from './ManualBarcodeInput';
afterEach(cleanup);
it.each([
  [' 779-0001 000012 ', '7790001000012'],
  ['1234567', null],
  ['123456789012345', null],
  ['abcdefgh', null],
  ['12345678', '12345678'],
  ['12345678901234', '12345678901234'],
])('normaliza %s como %s', (input, expected) => {
  expect(normalizeBarcode(input!)).toBe(expected);
});
it('muestra error sin enviar códigos inválidos y envía el normalizado', () => {
  const onSubmit = vi.fn();
  render(<ManualBarcodeInput onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: 'abc' } });
  fireEvent.click(screen.getByText('Buscar'));
  expect(screen.getByText('Ingresá entre 8 y 14 dígitos.')).toBeTruthy();
  expect(screen.getByLabelText('Código de barras').getAttribute('aria-invalid')).toBe('true');
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Código de barras'), {
    target: { value: '779-0001 000012' },
  });
  fireEvent.click(screen.getByText('Buscar'));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith('7790001000012');
});
it('deshabilita campo y envío mientras busca', () => {
  const onSubmit = vi.fn();
  render(<ManualBarcodeInput busy onSubmit={onSubmit} />);
  expect((screen.getByLabelText('Código de barras') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByText('Buscar') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByText('Buscar').closest('form')!);
  expect(onSubmit).not.toHaveBeenCalled();
});
