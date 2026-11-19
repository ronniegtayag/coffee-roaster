describe('dev seed production guard', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  async function runSeedDev(env: Record<string, string>) {
    Object.assign(process.env, env);
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.doMock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
    jest.doMock('./generated/prisma/client', () => ({
      PrismaClient: jest.fn().mockImplementation(() => {
        throw new Error('PrismaClient must not be constructed in production');
      }),
    }));
    await new Promise<void>((resolve) => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./seed-dev');
      });
      // The seed runs from a promise at import time; let it settle.
      setTimeout(resolve, 50);
    });
    return { exit, error };
  }

  it('refuses to run when NODE_ENV=production, exits 1 and never touches the database', async () => {
    const { exit, error } = await runSeedDev({
      NODE_ENV: 'production',
      DEV_SEED_PASSWORD: 'dummy-not-a-real-password',
      DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/none',
    });
    expect(error).toHaveBeenCalledWith('Refusing to run the dev seed when NODE_ENV=production.');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('refuses in production even without a password set', async () => {
    delete process.env.DEV_SEED_PASSWORD;
    const { exit, error } = await runSeedDev({ NODE_ENV: 'production' });
    expect(error).toHaveBeenCalledWith('Refusing to run the dev seed when NODE_ENV=production.');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
