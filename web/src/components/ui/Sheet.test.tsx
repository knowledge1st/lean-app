// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sheet } from './Sheet';

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Sheet open={open} onOpenChange={setOpen} title="Editar">
        <input aria-label="Nombre" />
      </Sheet>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('devuelve el foco al botón externo en cada apertura', async () => {
  render(<Example />);
  const opener = screen.getByText('Abrir');
  for (let attempt = 0; attempt < 2; attempt++) {
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  }
});

it('ajusta la hoja al viewport visual y limpia los listeners al cerrar', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 30 });
  vi.stubGlobal('visualViewport', viewport);
  const remove = vi.spyOn(viewport, 'removeEventListener');
  const scrollIntoView = vi.fn();
  render(<Example />);
  fireEvent.click(screen.getByText('Abrir'));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.style.maxHeight).toBe('360px');
  expect(dialog.style.bottom).toBe(`${window.innerHeight - 430}px`);
  act(() => {
    viewport.height = 300;
    viewport.dispatchEvent(new Event('resize'));
  });
  expect(dialog.style.maxHeight).toBe('270px');
  act(() => {
    viewport.offsetTop = 60;
    viewport.dispatchEvent(new Event('scroll'));
  });
  expect(dialog.style.bottom).toBe(`${window.innerHeight - 360}px`);
  const input = screen.getByLabelText('Nombre');
  input.scrollIntoView = scrollIntoView;
  fireEvent.focus(input);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
});

it('usa el límite CSS cuando visualViewport no existe', () => {
  vi.stubGlobal('visualViewport', undefined);
  render(<Example />);
  fireEvent.click(screen.getByText('Abrir'));
  expect(screen.getByRole('dialog').style.maxHeight).toBe('');
});
