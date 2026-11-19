import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  // Compile to CommonJS so Prisma's dynamic import() of its query compiler becomes require()
  // (otherwise Jest needs --experimental-vm-modules).
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testTimeout: 60_000,
};

export default config;
