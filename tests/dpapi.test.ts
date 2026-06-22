import { describe, expect, test } from 'vitest';
import { DpapiVault } from '../src/node/dpapiVault';

describe.skipIf(process.platform !== 'win32')('Windows DPAPI vault', () => {
  test('encrypts for the current user and decrypts the same value', async () => {
    const vault = new DpapiVault();
    const encrypted = await vault.protect('sk-private-value');
    expect(encrypted).not.toContain('sk-private-value');
    await expect(vault.unprotect(encrypted)).resolves.toBe('sk-private-value');
  });
});
