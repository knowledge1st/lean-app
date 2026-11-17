// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sheet } from './Sheet';

function Example({ autoFocus = false }: { autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <button onClick={() => setOpen(true)}>Abrir desde otro botón</button>
      <Sheet open={open} onOpenChange={setOpen} title="Editar">
        <input aria-label="Nombre" autoFocus={autoFocus} />
      </Sheet>
    </>
  );
}

function ConditionalExample({ autoFocus = false }: { autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <main tabIndex={-1}>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <button>Otro control</button>
      {open && (
        <Sheet open onOpenChange={setOpen} title="Editar">
          <input aria-label="Nombre" autoFocus={autoFocus} />
          <button onClick={() => setOpen(false)}>Desmontar</button>
        </Sheet>
      )}
    </main>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(['Desmontar', 'Escape'])(
  'devuelve el foco tras autoFocus y desmontaje mediante %s',
  async (action) => {
    vi.useFakeTimers();
    render(<ConditionalExample autoFocus />);
    const opener = screen.getByText('Abrir');
    opener.focus();
    fireEvent.click(opener);
    const input = screen.getByLabelText('Nombre');
    expect(document.activeElement).toBe(input);

    if (action === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Desmontar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(document.activeElement).toBe(opener);
  },
);

it('devuelve el foco al cerrar con Escape una hoja montada condicionalmente', async () => {
  render(<ConditionalExample />);
  const opener = screen.getByText('Abrir');
  for (let attempt = 0; attempt < 2; attempt++) {
    opener.focus();
    fireEvent.click(opener);
    const input = screen.getByLabelText('Nombre');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  }
});

it.each(['main', 'other', 'removed'])(
  'respeta el destino del foco y la conexión del botón al desmontar: %s',
  async (target) => {
    vi.useFakeTimers();
    render(<ConditionalExample />);
    const opener = screen.getByText('Abrir');
    opener.focus();
    fireEvent.click(opener);
    const other = screen.getByText('Otro control');
    const focus = vi.spyOn(opener, 'focus');
    fireEvent.keyDown(screen.getByLabelText('Nombre'), { key: 'Escape' });
    if (target === 'main') screen.getByRole('main').focus();
    if (target === 'other') other.focus();
    if (target === 'removed') opener.remove();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    if (target === 'main') expect(document.activeElement).toBe(opener);
    else {
      expect(focus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(target === 'other' ? other : document.body);
    }
  },
);

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

it('captura el botón de cada apertura sin desmontar Sheet aunque el input tenga autoFocus', async () => {
  vi.useFakeTimers();
  render(<Example autoFocus />);
  for (const label of ['Abrir', 'Abrir desde otro botón']) {
    const opener = screen.getByText(label);
    opener.focus();
    fireEvent.click(opener);
    const input = screen.getByLabelText('Nombre');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(document.activeElement).toBe(opener);
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
