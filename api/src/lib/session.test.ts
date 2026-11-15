import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from './session';

describe('session crypto', () => {
  it('generates distinct 32-byte base64url tokens without padding', () => {
    const tokens = Array.from({ length: 100 }, generateToken);
    expect(new Set(tokens).size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('hashes tokens as SHA-256 hex using a known vector', async () => {
    const hash = await hashToken('abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
