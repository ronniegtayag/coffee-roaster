import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts', '!generated/**', '!main.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // Prisma's generated client uses .js extensions in relative imports (nodenext); resolve them to .ts.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};

export default config;
