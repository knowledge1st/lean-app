import { afterEach, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from './api';
import { queryClient } from './queryClient';

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

it.each([
  [new ApiError(0, 'network_error', 'Sin conexión'), 1],
  [new ApiError(0, 'timeout_error', 'Tiempo agotado'), 1],
  [new ApiError(500, 'http_error', 'Error'), 2],
  [new ApiError(503, 'http_error', 'Error'), 2],
  [new ApiError(400, 'validation_error', 'Error'), 0],
  [new ApiError(401, 'unauthorized', 'Error'), 0],
  [new ApiError(404, 'not_found', 'Error'), 0],
])('limita los reintentos de %s a %s', (error, retries) => {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('Falta política de reintentos');
  for (let count = 0; count <= 3; count++) {
    expect(retry(count, error)).toBe(count < retries);
  }
});

it('ejecuta consultas y mutaciones sin conexión y permite revertir el optimismo', async () => {
  onlineManager.setOnline(false);
  const error = new ApiError(0, 'network_error', 'Sin conexión');
  const queryFn = vi.fn().mockRejectedValue(error);
  await expect(
    queryClient.fetchQuery({ queryKey: ['offline'], queryFn, retry: false }),
  ).rejects.toBe(error);
  expect(queryFn).toHaveBeenCalledOnce();
  const onError = vi.fn();
  const mutationFn = vi.fn().mockRejectedValue(error);
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn,
    onMutate: () => 'rollback',
    onError,
  });
  await expect(mutation.execute(undefined)).rejects.toBe(error);
  expect(mutationFn).toHaveBeenCalledOnce();
  expect(onError.mock.calls[0]?.[2]).toBe('rollback');
  expect(queryClient.getDefaultOptions().queries).toMatchObject({
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
});
