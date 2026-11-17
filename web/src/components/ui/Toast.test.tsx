// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Trigger({ action }: { action?: { label: string; onAction: () => void } }) {
  const toast = useToast();
  return <button onClick={() => toast('Copiaste 2 alimentos', action)}>Mostrar</button>;
}
it('keeps the four second duration without an action and includes the safe area', () => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText('Mostrar'));
  expect(screen.getByRole('status').className).toContain(
    'bottom-[calc(6rem+env(safe-area-inset-bottom))]',
  );
  act(() => {
    vi.advanceTimersByTime(3999);
  });
  expect(screen.getByText('Copiaste 2 alimentos')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Copiaste 2 alimentos')).toBeNull();
});
it('keeps an accessible action for six seconds and invokes it once', () => {
  vi.useFakeTimers();
  const onAction = vi.fn();
  render(
    <ToastProvider>
      <Trigger action={{ label: 'Deshacer', onAction }} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText('Mostrar'));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(screen.getByRole('button', { name: 'Deshacer' }).className).toContain('min-h-11');
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Copiaste 2 alimentos')).toBeNull();
  fireEvent.click(screen.getByText('Mostrar'));
  act(() => {
    vi.advanceTimersByTime(5999);
  });
  expect(screen.getByText('Deshacer')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Deshacer')).toBeNull();
});
