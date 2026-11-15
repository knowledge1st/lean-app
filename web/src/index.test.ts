import { describe, expect, it } from 'vitest';
import { title } from './index';

describe('web', () => {
  it('builds the title from the shared app name', () => {
    expect(title()).toBe('Lean · web');
  });
});
