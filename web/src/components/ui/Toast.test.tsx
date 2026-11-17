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

it('encola avisos del mismo turno, conserva acciones y temporizadores independientes', () => {
  vi.useFakeTimers();
  const onAction = vi.fn();
  function Triggers() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast('Primero', { label: 'Deshacer primero', onAction })}>
          Primero
        </button>
        <button onClick={() => toast('Segundo')}>Segundo</button>
        <button onClick={() => toast('Tercero', { label: 'Deshacer tercero', onAction })}>
          Tercero
        </button>
        <button onClick={() => toast('Cuarto')}>Cuarto</button>
      </>
    );
  }
  render(
    <ToastProvider>
      <Triggers />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Primero' }));
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.click(screen.getByRole('button', { name: 'Segundo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tercero' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cuarto' }));
  const status = screen.getByRole('status');
  expect(status.querySelectorAll('p')).toHaveLength(3);
  expect(status.textContent).not.toContain('Cuarto');
  act(() => vi.advanceTimersByTime(4000));
  expect(status.textContent).not.toContain('Segundo');
  expect(screen.getByRole('button', { name: 'Deshacer primero' })).toBeTruthy();
  expect(status.textContent).toContain('Cuarto');
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole('button', { name: 'Deshacer primero' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer tercero' }));
  expect(onAction).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(2999));
  expect(status.textContent).toContain('Cuarto');
  act(() => vi.advanceTimersByTime(1));
  expect(status.textContent).toBe('');
});
