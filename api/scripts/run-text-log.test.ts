import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test.each([
  { databaseUrl: undefined, exists: true, loads: true },
  { databaseUrl: undefined, exists: false, loads: false },
  { databaseUrl: '', exists: true, loads: false },
  { databaseUrl: 'configured', exists: true, loads: false },
])('loads local env only when DATABASE_URL is undefined ($databaseUrl, $exists)', async ({
  databaseUrl, exists, loads,
}) => {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.mocked(existsSync).mockReturnValue(exists);
  const loadEnvFile = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [process.execPath, 'run-text-log.mjs', 'text-log-models'];
  try {
    const runner = './run-text-log.mjs';
    await import(runner);
    if (loads) {
      expect(loadEnvFile).toHaveBeenCalledExactlyOnceWith(new URL('../.dev.vars', import.meta.url));
    } else expect(loadEnvFile).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(['--silent=false', '--reporter=verbose']),
      expect.objectContaining({ stdio: 'inherit', env: expect.objectContaining({
        TEXT_LOG_SCRIPT: 'text-log-models',
      }) }),
    );
    expect(process.exitCode).toBe(0);
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
});
