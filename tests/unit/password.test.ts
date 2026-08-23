import { describe, expect, it } from 'vitest';
import { comparePasswords, hashPassword } from '../../src/shared/utils/password';

describe('password utilities', () => {
  it('hashes a password and verifies it', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await comparePasswords(password, hash)).toBe(true);
    expect(await comparePasswords('wrong-password', hash)).toBe(false);
  });
});
