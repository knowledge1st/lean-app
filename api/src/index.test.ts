import { describe, expect, it } from 'vitest';
import { serviceName } from './index';

describe('api', () => {
  it('builds the service name from the shared app name', () => {
    expect(serviceName()).toBe('Lean · api');
  });
});
