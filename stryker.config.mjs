/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: ['lib/**/*.ts', 'drivers/**/*.ts', '!**/__tests__/**', '!**/__mocks__/**'],
  testRunner: 'jest',
  jest: {
    configFile: 'jest.config.js',
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation-report.json',
  },
  thresholds: {
    high: 90,
    low: 75,
    break: 70,
  },
  timeoutMS: 30000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  concurrency: 2,
};

export default config;
