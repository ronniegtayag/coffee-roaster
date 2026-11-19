import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces the documented scrypt format with a unique salt', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    const parts = a.split('$');
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(['scrypt', String(2 ** 15), '8', '1']);
    expect(Buffer.from(parts[4], 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5], 'base64')).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects wrong, case-changed and padded ones', async () => {
    const hash = await hashPassword('Correct Horse');
    expect(await verifyPassword('Correct Horse', hash)).toBe(true);
    expect(await verifyPassword('correct horse', hash)).toBe(false);
    expect(await verifyPassword('Correct Horse ', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it.each(['', 'plain', 'bcrypt$1$2$3$4$5', 'scrypt$x$8$1$AAAA$AAAA', 'scrypt$1$2$3'])(
    'returns false for malformed stored hash %j',
    async (stored) => {
      expect(await verifyPassword('anything', stored)).toBe(false);
    },
  );
});
