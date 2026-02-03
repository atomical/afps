import { describe, expect, it } from 'vitest';
import { validateNickname } from '../../src/profile/validation';

describe('profile validation', () => {
  it('rejects nicknames that are too short or too long', () => {
    expect(validateNickname('ab')).toMatchObject({ ok: false });
    expect(validateNickname('a'.repeat(17))).toMatchObject({ ok: false });
  });

  it('rejects nicknames with invalid characters', () => {
    const result = validateNickname('bad!');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Use letters/);
  });

  it('accepts valid nicknames and trims whitespace', () => {
    const result = validateNickname('  Ace-1 ');
    expect(result).toEqual({ ok: true, value: 'Ace-1' });
  });
});
